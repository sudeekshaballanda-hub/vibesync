import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RoomProvider, useRoom } from './context/RoomContext';
import io from 'socket.io-client';
import './index.css';

function Landing({ onEnterRoom }) {
    const { createRoom, joinRoom } = useRoom();
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [mode, setMode] = useState(null);

    const handleCreate = () => {
        if (!name.trim()) return;
        const roomCode = createRoom(name);
        onEnterRoom(roomCode, true);
    };

    const handleJoin = () => {
        if (!name.trim() || !code.trim()) return;
        joinRoom(code.toUpperCase(), name);
        onEnterRoom(code.toUpperCase(), false);
    };

    if (mode === 'create') {
        return (
            <div className="container">
                <h1>🎵 Create Room</h1>
                <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
                <button onClick={handleCreate}>Create Room</button>
                <button className="back" onClick={() => setMode(null)}>Back</button>
            </div>
        );
    }

    if (mode === 'join') {
        return (
            <div className="container">
                <h1>🎵 Join Room</h1>
                <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
                <input type="text" placeholder="Room code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} />
                <button onClick={handleJoin}>Join Room</button>
                <button className="back" onClick={() => setMode(null)}>Back</button>
            </div>
        );
    }

    return (
        <div className="container">
            <h1>🎵 VibeSync</h1>
            <p>Synchronized listening with friends</p>
            <button className="primary" onClick={() => setMode('create')}>Create Room</button>
            <button className="secondary" onClick={() => setMode('join')}>Join Room</button>
        </div>
    );
}

function RoomScreen({ roomCode, isHost, onLeave }) {
    const { hostName, members, setMembers, messages, sendChatMessage } = useRoom();
    const [chatInput, setChatInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedSource, setSelectedSource] = useState('youtube');
    const [selectedSong, setSelectedSong] = useState(null);
    
    const [syncSocket, setSyncSocket] = useState(null);
    const [isSynced, setIsSynced] = useState(false);
    const [syncStatus, setSyncStatus] = useState('Not Connected');
    const [roomMembers, setRoomMembers] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    
    const [syncPhase, setSyncPhase] = useState('idle');
    const [preloadProgress, setPreloadProgress] = useState(0);
    const [completeCount, setCompleteCount] = useState(0);
    const [totalDevices, setTotalDevices] = useState(1);
    const [countdownNumber, setCountdownNumber] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Clock synchronization and playback tracking
    const [clockOffset, setClockOffset] = useState(0);
    const [serverReferenceTime, setServerReferenceTime] = useState(null);
    const [playbackStartTime, setPlaybackStartTime] = useState(null);
    const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
    const [drift, setDrift] = useState(0);
    
    const iframeRef = useRef(null);
    const hiddenIframeRef = useRef(null);
    const animationFrameRef = useRef(null);
    const lastReportedTimeRef = useRef(0);

    const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || 'AIzaSyDv-8EXonJfRu-b2kYnPm2eiJYggp5e1Ew';

    // ============================================
    // CLOCK SYNCHRONIZATION (NTP-style)
    // ============================================
    
    const syncDeviceClock = useCallback(async () => {
        if (!syncSocket) return;
        
        return new Promise((resolve) => {
            const samples = [];
            let completedSamples = 0;
            
            const takeSample = () => {
                const clientSend = Date.now();
                syncSocket.emit('sync-clock', clientSend, (response) => {
                    const clientReceive = Date.now();
                    const { serverTime } = response;
                    
                    const rtt = clientReceive - clientSend;
                    const oneWayDelay = rtt / 2;
                    const offset = serverTime - (clientSend + oneWayDelay);
                    
                    samples.push(offset);
                    completedSamples++;
                    
                    if (completedSamples >= 5) {
                        // Remove outliers and average
                        samples.sort((a, b) => a - b);
                        const trimmed = samples.slice(1, -1);
                        const avgOffset = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
                        setClockOffset(avgOffset);
                        console.log(`[CLIENT] Clock offset: ${Math.round(avgOffset)}ms`);
                        resolve(avgOffset);
                    }
                });
            };
            
            for (let i = 0; i < 5; i++) {
                setTimeout(takeSample, i * 200);
            }
        });
    }, [syncSocket]);
    
    // Get synchronized current time
    const getSyncedTime = useCallback(() => {
        return Date.now() + clockOffset;
    }, [clockOffset]);
    
    // Get current playback position (for host)
    const getCurrentPlaybackPosition = useCallback(() => {
        if (!isPlaying || !playbackStartTime) return 0;
        const elapsed = getSyncedTime() - playbackStartTime;
        return Math.max(0, elapsed);
    }, [isPlaying, playbackStartTime, getSyncedTime]);

    // ============================================
    // PLAYBACK POSITION REPORTING (for drift correction)
    // ============================================
    
    const reportPlaybackPosition = useCallback(() => {
        if (!isHost && isPlaying && syncSocket && selectedSong) {
            const currentPos = getCurrentPlaybackPosition();
            const now = getSyncedTime();
            
            // Report every 5 seconds
            if (now - lastReportedTimeRef.current > 5000) {
                lastReportedTimeRef.current = now;
                syncSocket.emit('listener-playback-report', {
                    roomCode,
                    currentTime: currentPos,
                    localTime: now
                });
            }
        }
    }, [isHost, isPlaying, syncSocket, selectedSong, roomCode, getCurrentPlaybackPosition, getSyncedTime]);
    
    // Host broadcasts playback position
    const broadcastHostPosition = useCallback(() => {
        if (isHost && isPlaying && syncSocket && selectedSong) {
            const currentPos = getCurrentPlaybackPosition();
            syncSocket.emit('host-playback-update', {
                roomCode,
                currentTime: currentPos,
                isPlaying: isPlaying
            });
        }
    }, [isHost, isPlaying, syncSocket, selectedSong, roomCode, getCurrentPlaybackPosition]);
    
    // Continuous playback position updates
    useEffect(() => {
        if (syncPhase === 'playing') {
            const interval = setInterval(() => {
                if (isHost) {
                    broadcastHostPosition();
                } else {
                    reportPlaybackPosition();
                }
                // Update UI current time
                if (playbackStartTime) {
                    setCurrentPlaybackTime(getCurrentPlaybackPosition());
                }
            }, 1000);
            
            return () => clearInterval(interval);
        }
    }, [syncPhase, isHost, broadcastHostPosition, reportPlaybackPosition, playbackStartTime, getCurrentPlaybackPosition]);

    // ============================================
    // DRIFT CORRECTION
    // ============================================
    
    const applyDriftCorrection = useCallback((targetTime, driftAmount) => {
        console.log(`[CLIENT] 🎯 Applying drift correction: ${driftAmount}ms`);
        setDrift(driftAmount);
        
        if (iframeRef.current) {
            // Smooth seek to correct position
            const currentTime = getCurrentPlaybackPosition();
            const newTime = targetTime;
            
            if (Math.abs(currentTime - newTime) > 100) {
                // Large drift - immediate seek
                iframeRef.current.contentWindow?.postMessage(
                    JSON.stringify({ event: 'command', func: 'seekTo', args: [newTime, true] }),
                    '*'
                );
            } else {
                // Small drift - can be ignored or gradually corrected
                console.log(`[CLIENT] Small drift: ${driftAmount}ms - ignoring`);
            }
        }
        
        // Reset drift display after 3 seconds
        setTimeout(() => setDrift(0), 3000);
    }, [getCurrentPlaybackPosition]);

    // ============================================
    // PRELOAD FUNCTION
    // ============================================
    
    const fullPreload = async (song) => {
        console.log(`[CLIENT] 📥 Preloading: ${song.snippet.title}`);
        setPreloadProgress(0);
        
        return new Promise((resolve) => {
            let resolved = false;
            
            const hiddenIframe = document.createElement('iframe');
            hiddenIframe.style.position = 'absolute';
            hiddenIframe.style.top = '-9999px';
            hiddenIframe.style.left = '-9999px';
            hiddenIframe.style.width = '1px';
            hiddenIframe.style.height = '1px';
            hiddenIframe.style.opacity = '0';
            hiddenIframe.src = `https://www.youtube.com/embed/${song.id.videoId}?enablejsapi=1`;
            document.body.appendChild(hiddenIframe);
            hiddenIframeRef.current = hiddenIframe;
            
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = `https://www.youtube.com/embed/${song.id.videoId}`;
            
            const complete = () => {
                if (!resolved) {
                    resolved = true;
                    console.log(`[CLIENT] ✅ Preload complete: ${song.snippet.title}`);
                    setPreloadProgress(100);
                    resolve();
                }
            };
            
            audio.addEventListener('canplaythrough', complete);
            hiddenIframe.addEventListener('load', complete);
            setTimeout(complete, 10000);
            audio.load();
        });
    };

    // ============================================
    // SOCKET EVENT HANDLERS
    // ============================================
    
    useEffect(() => {
        const BACKEND_URL = 'https://vibesync-o3j5.onrender.com';
        const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
        setSyncSocket(socket);
        
        socket.on('connect', async () => {
            setSyncStatus('Connected');
            await syncDeviceClock();
        });
        
        socket.on('disconnect', () => setSyncStatus('Disconnected'));
        socket.on('room-created', () => { setSyncStatus('Host Ready'); setIsSynced(true); });
        socket.on('room-joined', () => { setSyncStatus('Connected'); setIsSynced(true); });
        
        socket.on('preload-song', async ({ song }) => {
            setSelectedSong(song);
            setSyncPhase('preloading');
            await fullPreload(song);
            socket.emit('preload-complete', { roomCode });
        });
        
        socket.on('preload-progress', ({ completeCount, totalDevices }) => {
            setCompleteCount(completeCount);
            setTotalDevices(totalDevices);
        });
        
        socket.on('verify-playback-ready', () => {
            socket.emit('playback-ready', { roomCode });
        });
        
        socket.on('countdown-start', ({ number }) => {
            setSyncPhase('countdown');
            setCountdownNumber(number);
        });
        
        socket.on('countdown-tick', ({ number }) => {
            setCountdownNumber(number);
            if (number === 0) setCountdownNumber(null);
        });
        
        // AUTO-PLAY with timestamp synchronization
        socket.on('auto-play', ({ song, startTime, hostStartTime }) => {
            console.log(`[CLIENT] 🎬 AUTO-PLAY at timestamp ${startTime}`);
            setSyncPhase('playing');
            setSelectedSong(song);
            setIsPlaying(true);
            
            const now = getSyncedTime();
            const delay = Math.max(0, startTime - now);
            
            // Schedule playback at exact timestamp
            setTimeout(() => {
                if (iframeRef.current) {
                    const videoId = song.id.videoId;
                    iframeRef.current.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
                    setPlaybackStartTime(hostStartTime);
                }
            }, delay);
            
            if (hiddenIframeRef.current) {
                hiddenIframeRef.current.remove();
                hiddenIframeRef.current = null;
            }
        });
        
        // Playback reference from host (for drift correction)
        socket.on('playback-reference', ({ hostTime, serverTimestamp, isPlaying: hostIsPlaying }) => {
            if (!isHost && syncPhase === 'playing') {
                const expectedTime = hostTime;
                const actualTime = getCurrentPlaybackPosition();
                const driftAmount = actualTime - expectedTime;
                
                if (Math.abs(driftAmount) > 100) {
                    console.log(`[CLIENT] Drift detected: ${Math.round(driftAmount)}ms`);
                    applyDriftCorrection(expectedTime, driftAmount);
                }
            }
        });
        
        // Drift correction from server
        socket.on('drift-correction', ({ targetTime, drift }) => {
            if (!isHost && syncPhase === 'playing') {
                applyDriftCorrection(targetTime, drift);
            }
        });
        
        // Force play with timestamp
        socket.on('force-play', ({ playTime, targetTime, hostStartTime }) => {
            if (!isHost && syncPhase === 'playing') {
                console.log(`[CLIENT] 📱 FORCE PLAY to time ${targetTime}ms`);
                setIsPlaying(true);
                setPlaybackStartTime(hostStartTime);
                
                const now = getSyncedTime();
                const delay = Math.max(0, playTime - now);
                
                setTimeout(() => {
                    iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                }, delay);
            }
        });
        
        // Force pause
        socket.on('force-pause', ({ pauseTime }) => {
            if (!isHost && syncPhase === 'playing') {
                console.log(`[CLIENT] 📱 FORCE PAUSE at time ${pauseTime}ms`);
                setIsPlaying(false);
                setPlaybackStartTime(null);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            }
        });
        
        // Force resume with timestamp
        socket.on('force-resume', ({ resumeTime, targetTime, hostStartTime }) => {
            if (!isHost && syncPhase === 'playing') {
                console.log(`[CLIENT] 📱 FORCE RESUME to time ${targetTime}ms`);
                setIsPlaying(true);
                setPlaybackStartTime(hostStartTime);
                
                const now = getSyncedTime();
                const delay = Math.max(0, resumeTime - now);
                
                setTimeout(() => {
                    iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                }, delay);
            }
        });
        
        // Force seek
        socket.on('force-seek', ({ position, hostStartTime }) => {
            if (!isHost && syncPhase === 'playing') {
                console.log(`[CLIENT] 📱 FORCE SEEK to ${position}ms`);
                setPlaybackStartTime(hostStartTime);
                iframeRef.current?.contentWindow?.postMessage(
                    JSON.stringify({ event: 'command', func: 'seekTo', args: [position / 1000, true] }),
                    '*'
                );
            }
        });
        
        // Force stop
        socket.on('force-stop', () => {
            if (!isHost) {
                console.log(`[CLIENT] 📱 FORCE STOP`);
                setIsPlaying(false);
                setSyncPhase('idle');
                setSelectedSong(null);
                setPlaybackStartTime(null);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            }
        });
        
        socket.on('members-update', ({ members }) => {
            setRoomMembers(members.filter(m => !m.isHost));
        });
        
        socket.on('new-chat-message', (msg) => setChatMessages(prev => [...prev, msg]));
        socket.on('host-left', () => { alert('Host left'); onLeave(); });
        
        return () => socket.disconnect();
    }, [isHost, onLeave, syncDeviceClock, getSyncedTime, getCurrentPlaybackPosition, applyDriftCorrection]);

    const startSync = () => {
        if (!syncSocket?.connected) { alert('Connecting...'); return; }
        if (isHost) {
            syncSocket.emit('create-room', { roomCode, hostName });
            setIsSynced(true);
        } else {
            syncSocket.emit('join-room', { roomCode, listenerName: hostName });
            setIsSynced(true);
        }
    };

    const searchYouTube = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(searchQuery)}&type=video&key=${YOUTUBE_API_KEY}`;
            const res = await fetch(url);
            const data = await res.json();
            if (res.status === 200 && data.items) setSearchResults(data.items);
            else alert('Search failed');
        } catch (err) { console.error(err); }
        setSearchLoading(false);
    };

    const playSong = (video) => {
        if (!isHost) { alert('Only host can play'); return; }
        if (!syncSocket?.connected) { alert('Not connected'); return; }
        if (!isSynced) { alert('Click "Start Sync" first'); return; }
        if (syncPhase !== 'idle') { alert('Song already preparing'); return; }
        
        setSelectedSong(video);
        fullPreload(video).then(() => syncSocket.emit('preload-complete', { roomCode }));
        syncSocket.emit('prepare-song', { roomCode, song: video });
    };
    
    // Host controls with timestamp
    const handlePause = () => {
        if (isHost && syncSocket?.connected && syncPhase === 'playing' && isPlaying) {
            const currentTime = getCurrentPlaybackPosition();
            console.log(`[CLIENT] 👑 HOST PAUSE at ${currentTime}ms`);
            setIsPlaying(false);
            setPlaybackStartTime(null);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            syncSocket.emit('host-pause', { roomCode, currentTime });
        }
    };
    
    const handleResume = () => {
        if (isHost && syncSocket?.connected && syncPhase === 'playing' && selectedSong && !isPlaying) {
            const currentTime = getCurrentPlaybackPosition();
            console.log(`[CLIENT] 👑 HOST RESUME at ${currentTime}ms`);
            setIsPlaying(true);
            const newStartTime = getSyncedTime() - currentTime;
            setPlaybackStartTime(newStartTime);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            syncSocket.emit('host-resume', { roomCode, currentTime });
        }
    };
    
    const handleSeek = (position) => {
        if (isHost && syncSocket?.connected && syncPhase === 'playing') {
            console.log(`[CLIENT] 👑 HOST SEEK to ${position}ms`);
            setPlaybackStartTime(getSyncedTime() - position);
            iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'seekTo', args: [position / 1000, true] }),
                '*'
            );
            syncSocket.emit('host-seek', { roomCode, position });
        }
    };
    
    const handleStop = () => {
        if (isHost && syncSocket?.connected && syncPhase !== 'idle') {
            console.log(`[CLIENT] 👑 HOST STOP`);
            setIsPlaying(false);
            setSyncPhase('idle');
            setSelectedSong(null);
            setCountdownNumber(null);
            setPlaybackStartTime(null);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            syncSocket.emit('host-stop', { roomCode });
        }
    };

    const sendChatMessageHandler = () => {
        if (chatInput.trim() && syncSocket?.connected) {
            syncSocket.emit('chat-message', { roomCode, text: chatInput.trim(), sender: isHost ? hostName : 'Listener' });
            setChatInput('');
        }
    };

    // PLAYING VIEW
    if (syncPhase === 'playing' && selectedSong) {
        // Format time for display
        const formatTime = (ms) => {
            const seconds = Math.floor(ms / 1000);
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };
        
        return (
            <div className="player-view">
                <div className="player-header">
                    <h2>🎵 Now Playing</h2>
                    {isHost && (
                        <div className="host-controls">
                            {isPlaying ? (
                                <button onClick={handlePause} className="pause-btn">⏸ Pause</button>
                            ) : (
                                <button onClick={handleResume} className="play-btn">▶ Play</button>
                            )}
                            <button onClick={handleStop} className="stop-btn">⏹ Stop</button>
                        </div>
                    )}
                    <button onClick={handleStop} className="back-btn">← Back to Room</button>
                </div>
                
                {/* Drift indicator */}
                {Math.abs(drift) > 50 && (
                    <div className={`drift-indicator ${drift > 0 ? 'ahead' : 'behind'}`}>
                        {drift > 0 ? '🔸 Ahead by ' : '🔹 Behind by '}{Math.abs(Math.round(drift))}ms
                    </div>
                )}
                
                {/* Progress bar for host */}
                {isHost && (
                    <div className="progress-container">
                        <span className="time-current">{formatTime(currentPlaybackTime)}</span>
                        <input 
                            type="range" 
                            className="progress-bar"
                            min="0" 
                            max={selectedSong.duration || 300000}
                            value={currentPlaybackTime}
                            onChange={(e) => handleSeek(parseInt(e.target.value))}
                        />
                        <span className="time-total">{formatTime(selectedSong.duration || 300000)}</span>
                    </div>
                )}
                
                <div className="player-container">
                    <h3>{selectedSong.snippet.title}</h3>
                    <iframe
                        ref={iframeRef}
                        title={selectedSong.snippet.title}
                        width="100%"
                        height="400"
                        src={`https://www.youtube.com/embed/${selectedSong.id.videoId}?enablejsapi=1`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                        allowFullScreen
                    />
                </div>
                
                {!isHost && (
                    <div className="listener-info">
                        🎧 Host controls playback. {isPlaying ? 'Now Playing' : 'Paused by Host'}
                        {Math.abs(drift) > 50 && <span className="drift-warning"> (Syncing...)</span>}
                    </div>
                )}
            </div>
        );
    }
    
    // PRELOADING / COUNTDOWN VIEW
    if (selectedSong && syncPhase !== 'playing') {
        return (
            <div className="player-view">
                <div className="player-header">
                    <h2>🎵 Preparing to Play</h2>
                    {isHost && <button onClick={handleStop} className="cancel-btn">⏹ Cancel</button>}
                    <button onClick={handleStop} className="back-btn">← Back</button>
                </div>
                
                {countdownNumber !== null && countdownNumber > 0 && (
                    <div className="countdown-overlay">
                        <div className="countdown-number">{countdownNumber}</div>
                        <div className="countdown-text">Get ready...</div>
                    </div>
                )}
                
                {syncPhase === 'preloading' && !countdownNumber && (
                    <div className="buffering-container">
                        <div className="buffering-text">Downloading song... {Math.round(preloadProgress)}%</div>
                        <div className="buffering-bar"><div className="buffering-fill" style={{ width: `${preloadProgress}%` }} /></div>
                        <div className="buffering-status">
                            {completeCount}/{totalDevices} devices ready
                            {completeCount < totalDevices && ' - Waiting for all devices...'}
                        </div>
                    </div>
                )}
                
                <div className="player-container">
                    <h3>{selectedSong.snippet.title}</h3>
                    <p style={{ textAlign: 'center', color: '#B0B0B0' }}>
                        {countdownNumber ? `Starting in ${countdownNumber}...` : 'Preparing synchronized playback...'}
                    </p>
                </div>
                
                {isHost && (
                    <div className="warning-message">
                        ⚠️ Playback will start automatically when ALL devices are ready.
                    </div>
                )}
            </div>
        );
    }

    // MAIN ROOM VIEW
    const allMembers = [...roomMembers];

    return (
        <div className="room">
            <div className="room-header">
                <div className="logo-section">
                    <h1>🎵 VibeSync</h1>
                    <span className="room-badge">Room: {roomCode}</span>
                    <span className="clock-badge" title="Clock synchronized">
                        🕐 {Math.abs(clockOffset) < 50 ? '✓' : '⟳'}
                    </span>
                </div>
                <div className="header-buttons">
                    <button onClick={startSync} disabled={isSynced} className={`sync-btn ${isSynced ? 'synced' : ''}`}>
                        {isSynced ? '✅ Synced' : '🔗 Start Sync'}
                    </button>
                    <button onClick={onLeave} className="leave-btn">🚪 Leave Room</button>
                </div>
            </div>
            <div className="sync-status-bar">📡 Status: {syncStatus} {isSynced ? '✅' : '⏳'}</div>
            <div className="three-columns">
                <div className="column search-column">
                    <div className="column-header"><h3>🔍 Search Music</h3>{!isHost && <span className="host-only-badge">(Host only)</span>}</div>
                    <div className="source-tabs"><button className={`source-tab ${selectedSource === 'youtube' ? 'active' : ''}`} onClick={() => setSelectedSource('youtube')}>🎬 YouTube</button><button className="source-tab disabled" disabled>🎵 Spotify (Soon)</button></div>
                    {isHost ? (
                        <>
                            <div className="search-bar">
                                <input type="text" placeholder="Search for a song..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && searchYouTube()} />
                                <button onClick={searchYouTube} disabled={searchLoading}>{searchLoading ? '...' : '🔍'}</button>
                            </div>
                            <div className="search-results">{searchResults.map(video => (<div key={video.id.videoId} className="song-item" onClick={() => playSong(video)}><img src={video.snippet.thumbnails.default?.url} alt="" /><div className="song-info"><div className="song-title">{video.snippet.title.substring(0, 40)}</div><div className="song-artist">{video.snippet.channelTitle}</div></div><button className="play-song-btn">▶</button></div>))}</div>
                        </>
                    ) : (
                        <div className="listener-waiting"><div className="waiting-icon">🎵</div><p>Waiting for host to select a song...</p><p className="waiting-sub">The host controls all playback</p></div>
                    )}
                </div>
                
                <div className="column members-column">
                    <div className="column-header"><h3>👥 Members</h3><span className="member-count">{allMembers.length + 1}</span></div>
                    <div className="members-list">
                        <div className="member-item host"><span className="member-avatar">👑</span><span className="member-name">{hostName || 'Host'}</span><span className="member-role">Host</span>{isHost && <span className="you-tag">You</span>}</div>
                        {allMembers.map((member, idx) => (<div key={idx} className="member-item"><span className="member-avatar">🎧</span><span className="member-name">{member.name}</span><span className="member-role">Listener</span></div>))}
                    </div>
                </div>
                
                <div className="column chat-column">
                    <div className="column-header"><h3>💬 Group Chat</h3></div>
                    <div className="chat-messages">
                        {chatMessages.length === 0 ? <div className="empty-state">💭 No messages yet</div> : chatMessages.map((msg, idx) => (<div key={idx} className="chat-message"><div className="chat-sender">{msg.sender}</div><div className="chat-text">{msg.text}</div><div className="chat-time">{new Date(msg.timestamp).toLocaleTimeString()}</div></div>))}
                    </div>
                    <div className="chat-input-area">
                        <input type="text" placeholder="Type a message..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendChatMessageHandler()} />
                        <button onClick={sendChatMessageHandler}>Send</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AppContent() {
    const [inRoom, setInRoom] = useState(false);
    const [roomCode, setRoomCode] = useState('');
    const [isHost, setIsHost] = useState(false);
    const handleEnterRoom = (code, host) => { setRoomCode(code); setIsHost(host); setInRoom(true); };
    const handleLeaveRoom = () => { setInRoom(false); setRoomCode(''); };
    return (<RoomProvider>{!inRoom ? <Landing onEnterRoom={handleEnterRoom} /> : <RoomScreen roomCode={roomCode} isHost={isHost} onLeave={handleLeaveRoom} />}</RoomProvider>);
}

export default AppContent;