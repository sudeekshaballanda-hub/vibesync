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
    
    const [isConnected, setIsConnected] = useState(false);
    const [isSynced, setIsSynced] = useState(false);
    const [syncStatus, setSyncStatus] = useState('Not Connected');
    const [roomMembers, setRoomMembers] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [isConnecting, setIsConnecting] = useState(false);
    
    const [syncPhase, setSyncPhase] = useState('idle');
    const [preloadProgress, setPreloadProgress] = useState(0);
    const [completeCount, setCompleteCount] = useState(0);
    const [totalDevices, setTotalDevices] = useState(1);
    const [countdownNumber, setCountdownNumber] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Synchronization engine
    const [clockOffset, setClockOffset] = useState(0);
    const [rtt, setRtt] = useState(0);
    const [playbackStartTime, setPlaybackStartTime] = useState(null);
    const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
    const [drift, setDrift] = useState(0);
    const [hostPlaybackTime, setHostPlaybackTime] = useState(0);
    const [showDriftDebug, setShowDriftDebug] = useState(true);
    
    const socketRef = useRef(null);
    const iframeRef = useRef(null);
    const hiddenIframeRef = useRef(null);
    const mountedRef = useRef(true);
    const isConnectingRef = useRef(false);
    const roomJoinedRef = useRef(false);
    const broadcastIntervalRef = useRef(null);
    const driftCheckIntervalRef = useRef(null);

    const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || 'AIzaSyDv-8EXonJfRu-b2kYnPm2eiJYggp5e1Ew';

    // ============================================
    // NTP CLOCK SYNCHRONIZATION
    // ============================================
    const syncDeviceClock = useCallback(async () => {
        if (!socketRef.current) return 0;
        
        return new Promise((resolve) => {
            const samples = [];
            let completed = 0;
            
            const takeSample = () => {
                const t1 = performance.timeOrigin + performance.now();
                socketRef.current.emit('sync', { t1 }, (response) => {
                    const t4 = performance.timeOrigin + performance.now();
                    const { t1: t1resp, t2, t3 } = response;
                    const rtt = t4 - t1;
                    const offset = (t2 + t3) / 2 - (t1 + rtt / 2);
                    samples.push(offset);
                    completed++;
                    
                    if (completed >= 5) {
                        samples.sort((a, b) => a - b);
                        const trimmed = samples.slice(1, -1);
                        const avgOffset = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
                        setClockOffset(avgOffset);
                        setRtt(rtt);
                        console.log(`[CLIENT] Clock offset: ${Math.round(avgOffset)}ms`);
                        resolve(avgOffset);
                    }
                });
            };
            
            for (let i = 0; i < 5; i++) {
                setTimeout(takeSample, i * 200);
            }
        });
    }, []);

    const getSyncedTime = useCallback(() => {
        return (performance.timeOrigin + performance.now()) + clockOffset;
    }, [clockOffset]);

    const getCurrentPlaybackPosition = useCallback(() => {
        if (!isPlaying || !playbackStartTime) return 0;
        const elapsed = (getSyncedTime() - playbackStartTime) / 1000;
        return Math.max(0, elapsed);
    }, [isPlaying, playbackStartTime, getSyncedTime]);

    // Update UI playback time
    useEffect(() => {
        if (syncPhase === 'playing' && isPlaying) {
            const interval = setInterval(() => {
                setCurrentPlaybackTime(getCurrentPlaybackPosition());
            }, 50);
            return () => clearInterval(interval);
        }
    }, [syncPhase, isPlaying, getCurrentPlaybackPosition]);

    // Host broadcast every 2 seconds
    useEffect(() => {
        if (isHost && syncPhase === 'playing' && isPlaying && socketRef.current?.connected) {
            if (broadcastIntervalRef.current) clearInterval(broadcastIntervalRef.current);
            
            broadcastIntervalRef.current = setInterval(() => {
                const currentTime = getCurrentPlaybackPosition();
                socketRef.current.emit('host-broadcast', {
                    roomCode,
                    currentTime: currentTime,
                    isPlaying: isPlaying
                });
            }, 2000);
            
            return () => {
                if (broadcastIntervalRef.current) clearInterval(broadcastIntervalRef.current);
            };
        }
    }, [isHost, syncPhase, isPlaying, roomCode, getCurrentPlaybackPosition]);

    // Drift detection and correction
    const adjustPlaybackRate = useCallback((rate, duration) => {
        iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [rate] }),
            '*'
        );
        setTimeout(() => {
            iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [1.0] }),
                '*'
            );
        }, duration);
    }, []);

    useEffect(() => {
        if (!isHost && syncPhase === 'playing' && isPlaying && socketRef.current?.connected) {
            if (driftCheckIntervalRef.current) clearInterval(driftCheckIntervalRef.current);
            
            driftCheckIntervalRef.current = setInterval(() => {
                const myTime = getCurrentPlaybackPosition();
                const hostTime = hostPlaybackTime;
                const currentDrift = myTime - hostTime;
                const driftMs = currentDrift * 1000;
                
                setDrift(driftMs);
                
                if (Math.abs(driftMs) < 10) {
                    // Within deadzone - ignore
                } else if (Math.abs(driftMs) < 200) {
                    const rate = driftMs > 0 ? 0.99 : 1.01;
                    console.log(`[DRIFT] Soft correction: ${driftMs.toFixed(0)}ms`);
                    adjustPlaybackRate(rate, 2000);
                } else if (Math.abs(driftMs) >= 200) {
                    console.log(`[DRIFT] Hard correction: ${driftMs.toFixed(0)}ms, seeking`);
                    iframeRef.current?.contentWindow?.postMessage(
                        JSON.stringify({ event: 'command', func: 'seekTo', args: [hostTime, true] }),
                        '*'
                    );
                    setPlaybackStartTime(getSyncedTime() - (hostTime * 1000));
                }
            }, 2000);
            
            return () => {
                if (driftCheckIntervalRef.current) clearInterval(driftCheckIntervalRef.current);
            };
        }
    }, [isHost, syncPhase, isPlaying, hostPlaybackTime, getCurrentPlaybackPosition, getSyncedTime, adjustPlaybackRate]);

    // ============================================
    // WEBSOCKET CONNECTION
    // ============================================
    const cleanupSocket = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.off();
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        isConnectingRef.current = false;
        roomJoinedRef.current = false;
    }, []);

    const connectWebSocket = useCallback(() => {
        if (socketRef.current && socketRef.current.connected) return Promise.resolve(socketRef.current);
        if (isConnectingRef.current) {
            return new Promise((resolve) => {
                const check = setInterval(() => {
                    if (socketRef.current?.connected) {
                        clearInterval(check);
                        resolve(socketRef.current);
                    }
                }, 100);
            });
        }
        
        isConnectingRef.current = true;
        const BACKEND_URL = 'https://vibesync-o3j5.onrender.com';
        
        return new Promise((resolve, reject) => {
            const socket = io(BACKEND_URL, {
                transports: ['websocket', 'polling'],
                reconnection: false,
                timeout: 10000
            });
            socketRef.current = socket;
            
            const timeout = setTimeout(() => {
                socket.disconnect();
                isConnectingRef.current = false;
                reject(new Error('Connection timeout'));
            }, 10000);
            
            socket.on('connect', async () => {
                clearTimeout(timeout);
                setIsConnected(true);
                setSyncStatus('Connected');
                isConnectingRef.current = false;
                await syncDeviceClock();
                resolve(socket);
            });
            
            socket.on('connect_error', (err) => {
                clearTimeout(timeout);
                isConnectingRef.current = false;
                reject(err);
            });
            
            socket.on('disconnect', () => {
                setIsConnected(false);
                setSyncStatus('Disconnected');
                setIsSynced(false);
                roomJoinedRef.current = false;
            });
        });
    }, [syncDeviceClock]);

    useEffect(() => {
        mountedRef.current = true;
        connectWebSocket().catch(err => console.error('Connection error:', err.message));
        return () => {
            mountedRef.current = false;
            if (broadcastIntervalRef.current) clearInterval(broadcastIntervalRef.current);
            if (driftCheckIntervalRef.current) clearInterval(driftCheckIntervalRef.current);
            cleanupSocket();
        };
    }, [connectWebSocket, cleanupSocket]);

    // ============================================
    // SOCKET EVENT HANDLERS
    // ============================================
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;
        
        socket.on('room-created', () => {
            setIsSynced(true);
            setSyncStatus('Host Ready');
            roomJoinedRef.current = true;
            setIsConnecting(false);
        });
        
        socket.on('room-joined', () => {
            setIsSynced(true);
            setSyncStatus('Connected');
            roomJoinedRef.current = true;
            setIsConnecting(false);
        });
        
        // Playback state for new listeners
        socket.on('playback-state', ({ isPlaying: playing, currentTime }) => {
            if (!isHost) {
                setIsPlaying(playing);
                if (playing && currentTime > 0) {
                    setPlaybackStartTime(getSyncedTime() - (currentTime * 1000));
                }
            }
        });
        
        socket.on('members-update', ({ members }) => {
            setRoomMembers(members.filter(m => !m.isHost));
        });
        
        socket.on('new-chat-message', (msg) => setChatMessages(prev => [...prev, msg]));
        socket.on('host-left', () => { alert('Host left'); onLeave(); });
        
        // Host broadcast for listeners
        socket.on('host-broadcast', ({ currentTime, isPlaying: hostPlaying }) => {
            if (!isHost) {
                setHostPlaybackTime(currentTime);
                if (hostPlaying !== isPlaying) {
                    setIsPlaying(hostPlaying);
                }
            }
        });
        
        // ============================================
        // CRITICAL FIX: PAUSE/RESUME HANDLERS
        // ============================================
        socket.on('force-pause', () => {
            if (!isHost && syncPhase === 'playing') {
                console.log('[CLIENT] 📱 FORCE PAUSE received - pausing playback');
                setIsPlaying(false);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            }
        });
        
        socket.on('force-resume', () => {
            if (!isHost && syncPhase === 'playing') {
                console.log('[CLIENT] 📱 FORCE RESUME received - resuming playback');
                setIsPlaying(true);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            }
        });
        
        socket.on('force-play', () => {
            if (!isHost && syncPhase === 'playing') {
                setIsPlaying(true);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            }
        });
        
        socket.on('force-seek', ({ position }) => {
            if (!isHost && syncPhase === 'playing') {
                setPlaybackStartTime(getSyncedTime() - (position * 1000));
                iframeRef.current?.contentWindow?.postMessage(
                    JSON.stringify({ event: 'command', func: 'seekTo', args: [position, true] }),
                    '*'
                );
            }
        });
        
        socket.on('force-stop', () => {
            if (!isHost) {
                setIsPlaying(false);
                setSyncPhase('idle');
                setSelectedSong(null);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            }
        });
        
        // Preload events
        socket.on('preload-song', async ({ song }) => {
            console.log('[CLIENT] 📢 Preload song received');
            setSelectedSong(song);
            setSyncPhase('preloading');
            setPreloadProgress(0);
            
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
            
            let resolved = false;
            const complete = () => {
                if (!resolved) {
                    resolved = true;
                    setPreloadProgress(100);
                    if (socket.connected) socket.emit('preload-complete', { roomCode });
                }
            };
            
            audio.addEventListener('canplaythrough', complete);
            hiddenIframe.addEventListener('load', complete);
            setTimeout(complete, 10000);
            audio.load();
        });
        
        socket.on('preload-progress', ({ completeCount, totalDevices }) => {
            setCompleteCount(completeCount);
            setTotalDevices(totalDevices);
        });
        
        socket.on('verify-playback-ready', () => {
            if (socket.connected) socket.emit('playback-ready', { roomCode });
        });
        
        socket.on('countdown-start', ({ number }) => {
            setSyncPhase('countdown');
            setCountdownNumber(number);
        });
        
        socket.on('countdown-tick', ({ number }) => {
            setCountdownNumber(number);
            if (number === 0) setCountdownNumber(null);
        });
        
        // Schedule play with future timestamp
        socket.on('schedule-play', ({ song, scheduleTime, hostStartTime }) => {
            console.log(`[CLIENT] 🎬 Schedule play at ${scheduleTime}`);
            setSyncPhase('playing');
            setSelectedSong(song);
            setIsPlaying(true);
            setPlaybackStartTime(hostStartTime);
            setDrift(0);
            
            const now = getSyncedTime();
            const delay = Math.max(0, scheduleTime - now);
            
            setTimeout(() => {
                if (iframeRef.current) {
                    iframeRef.current.src = `https://www.youtube.com/embed/${song.id.videoId}?autoplay=1&enablejsapi=1`;
                    console.log('[CLIENT] ✅ Playback started');
                }
            }, delay);
            
            if (hiddenIframeRef.current) {
                hiddenIframeRef.current.remove();
                hiddenIframeRef.current = null;
            }
        });
        
        return () => {
            socket.off('room-created');
            socket.off('room-joined');
            socket.off('playback-state');
            socket.off('members-update');
            socket.off('new-chat-message');
            socket.off('host-left');
            socket.off('host-broadcast');
            socket.off('force-pause');
            socket.off('force-resume');
            socket.off('force-play');
            socket.off('force-seek');
            socket.off('force-stop');
            socket.off('preload-song');
            socket.off('preload-progress');
            socket.off('verify-playback-ready');
            socket.off('countdown-start');
            socket.off('countdown-tick');
            socket.off('schedule-play');
        };
    }, [roomCode, isHost, onLeave, getSyncedTime]);

    // ============================================
    // START SYNC
    // ============================================
    const startSync = useCallback(async () => {
        if (isSynced || isConnecting || roomJoinedRef.current) return;
        
        setIsConnecting(true);
        
        try {
            let socket = socketRef.current;
            if (!socket || !socket.connected) {
                socket = await connectWebSocket();
            }
            
            if (isHost) {
                socket.emit('create-room', { roomCode, hostName });
            } else {
                socket.emit('join-room', { roomCode, listenerName: hostName });
            }
            
            setTimeout(() => {
                if (!roomJoinedRef.current && mountedRef.current) {
                    setIsConnecting(false);
                    setSyncStatus('Connection failed');
                    alert('Failed to join/create room. Please try again.');
                }
            }, 15000);
            
        } catch (error) {
            setIsConnecting(false);
            setSyncStatus('Connection failed');
            alert(`Connection failed: ${error.message}`);
        }
    }, [isSynced, isConnecting, connectWebSocket, isHost, roomCode, hostName]);

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

    // ============================================
    // HOST PLAYS SONG
    // ============================================
    const playSong = (video) => {
        if (!isHost) { alert('Only host can play'); return; }
        if (!socketRef.current?.connected) { alert('Not connected'); return; }
        if (!isSynced) { alert('Click "Start Sync" first'); return; }
        if (syncPhase !== 'idle') { alert('Song already preparing'); return; }
        
        console.log('[CLIENT] 🎤 Host playing:', video.snippet.title);
        setSelectedSong(video);
        setSyncPhase('preloading');
        
        const hiddenIframe = document.createElement('iframe');
        hiddenIframe.style.position = 'absolute';
        hiddenIframe.style.top = '-9999px';
        hiddenIframe.style.left = '-9999px';
        hiddenIframe.style.width = '1px';
        hiddenIframe.style.height = '1px';
        hiddenIframe.style.opacity = '0';
        hiddenIframe.src = `https://www.youtube.com/embed/${video.id.videoId}?enablejsapi=1`;
        document.body.appendChild(hiddenIframe);
        hiddenIframeRef.current = hiddenIframe;
        
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = `https://www.youtube.com/embed/${video.id.videoId}`;
        
        let resolved = false;
        const complete = () => {
            if (!resolved) {
                resolved = true;
                if (socketRef.current?.connected) {
                    socketRef.current.emit('preload-complete', { roomCode });
                }
            }
        };
        
        audio.addEventListener('canplaythrough', complete);
        hiddenIframe.addEventListener('load', complete);
        setTimeout(complete, 10000);
        audio.load();
        
        socketRef.current.emit('prepare-song', { roomCode, song: video });
    };
    
    // ============================================
    // HOST CONTROLS - These MUST broadcast to ALL listeners
    // ============================================
    const handlePause = () => {
        if (isHost && socketRef.current?.connected && syncPhase === 'playing' && isPlaying) {
            console.log('[CLIENT] 👑 HOST PAUSE pressed');
            setIsPlaying(false);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            socketRef.current.emit('host-pause', { roomCode });
        }
    };
    
    const handleResume = () => {
        if (isHost && socketRef.current?.connected && syncPhase === 'playing' && selectedSong && !isPlaying) {
            console.log('[CLIENT] 👑 HOST RESUME pressed');
            setIsPlaying(true);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            socketRef.current.emit('host-resume', { roomCode });
        }
    };
    
    const handleSeek = (position) => {
        if (isHost && socketRef.current?.connected && syncPhase === 'playing') {
            setPlaybackStartTime(getSyncedTime() - (position * 1000));
            iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'seekTo', args: [position, true] }),
                '*'
            );
            socketRef.current.emit('host-seek', { roomCode, position });
        }
    };
    
    const handleStop = () => {
        if (isHost && socketRef.current?.connected && syncPhase !== 'idle') {
            console.log('[CLIENT] 👑 HOST STOP pressed');
            setIsPlaying(false);
            setSyncPhase('idle');
            setSelectedSong(null);
            setCountdownNumber(null);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            socketRef.current.emit('host-stop', { roomCode });
        }
    };

    const sendChatMessageHandler = () => {
        if (chatInput.trim() && socketRef.current?.connected) {
            socketRef.current.emit('chat-message', { roomCode, text: chatInput.trim(), sender: isHost ? hostName : 'Listener' });
            setChatInput('');
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    // ============================================
    // PLAYING VIEW
    // ============================================
    if (syncPhase === 'playing' && selectedSong) {
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
                
                {/* Drift Debug Display */}
                {showDriftDebug && !isHost && (
                    <div className={`drift-debug ${Math.abs(drift) > 100 ? 'warning' : Math.abs(drift) > 30 ? 'notice' : 'ok'}`}>
                        <span>🎯 Host: {formatTime(hostPlaybackTime)}</span>
                        <span>📱 You: {formatTime(currentPlaybackTime)}</span>
                        <span className={drift > 0 ? 'ahead' : 'behind'}>
                            {drift > 0 ? `🔸 Ahead by ${Math.abs(drift).toFixed(0)}ms` : `🔹 Behind by ${Math.abs(drift).toFixed(0)}ms`}
                        </span>
                        <button onClick={() => setShowDriftDebug(false)} className="close-debug">×</button>
                    </div>
                )}
                
                {showDriftDebug && isHost && (
                    <div className="drift-debug host">
                        <span>👑 Host: {formatTime(currentPlaybackTime)}</span>
                        <span>📍 Source of truth</span>
                        <button onClick={() => setShowDriftDebug(false)} className="close-debug">×</button>
                    </div>
                )}
                
                {/* Progress Bar for Host */}
                {isHost && (
                    <div className="progress-container">
                        <span className="time-current">{formatTime(currentPlaybackTime)}</span>
                        <input 
                            type="range" 
                            className="progress-bar"
                            min="0" 
                            max={selectedSong.duration ? selectedSong.duration / 1000 : 300}
                            step="0.01"
                            value={currentPlaybackTime}
                            onChange={(e) => handleSeek(parseFloat(e.target.value))}
                        />
                        <span className="time-total">{formatTime(selectedSong.duration ? selectedSong.duration / 1000 : 300)}</span>
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
                        {Math.abs(drift) > 100 && <span className="sync-warning"> 🔄 Syncing...</span>}
                    </div>
                )}
            </div>
        );
    }
    
    // ============================================
    // PRELOADING / COUNTDOWN VIEW
    // ============================================
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

    // ============================================
    // MAIN ROOM VIEW
    // ============================================
    const allMembers = [...roomMembers];

    return (
        <div className="room">
            <div className="room-header">
                <div className="logo-section">
                    <h1>🎵 VibeSync</h1>
                    <span className="room-badge">Room: {roomCode}</span>
                </div>
                <div className="header-buttons">
                    <button 
                        onClick={startSync} 
                        disabled={isSynced || isConnecting} 
                        className={`sync-btn ${isSynced ? 'synced' : ''}`}
                    >
                        {isConnecting ? '⏳ Connecting...' : (isSynced ? '✅ Synced' : '🔗 Start Sync')}
                    </button>
                    <button onClick={onLeave} className="leave-btn">🚪 Leave Room</button>
                </div>
            </div>
            <div className="sync-status-bar">
                📡 Status: {syncStatus} {isSynced ? '✅' : '⏳'}
            </div>
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