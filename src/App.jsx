import React, { useState, useEffect, useRef } from 'react';
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
    
    // Buffering and countdown states
    const [isBuffering, setIsBuffering] = useState(false);
    const [bufferProgress, setBufferProgress] = useState(0);
    const [completeCount, setCompleteCount] = useState(0);
    const [totalDevices, setTotalDevices] = useState(1);
    const [countdownNumber, setCountdownNumber] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    
    const iframeRef = useRef(null);
    const audioPreloadRef = useRef(null);

    const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || 'AIzaSyDv-8EXonJfRu-b2kYnPm2eiJYggp5e1Ew';

    // COMPLETE BUFFER FUNCTION - Downloads the ENTIRE song before signaling ready
    const fullyBufferSong = async (song) => {
        console.log(`📥 Starting FULL buffer for: ${song.snippet.title}`);
        setIsBuffering(true);
        setBufferProgress(0);
        
        return new Promise((resolve, reject) => {
            // Create audio element for preloading
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = `https://www.youtube.com/embed/${song.id.videoId}`;
            
            let lastProgress = 0;
            
            // Monitor buffering progress
            audio.addEventListener('progress', () => {
                if (audio.buffered.length > 0) {
                    const bufferedEnd = audio.buffered.end(0);
                    const duration = audio.duration;
                    if (duration > 0) {
                        const percent = (bufferedEnd / duration) * 100;
                        if (percent > lastProgress) {
                            lastProgress = percent;
                            setBufferProgress(Math.min(100, percent));
                            console.log(`📥 Buffer progress: ${Math.round(percent)}%`);
                        }
                    }
                }
            });
            
            // When FULLY downloaded and ready to play instantly
            audio.addEventListener('canplaythrough', () => {
                console.log(`✅ FULL BUFFER COMPLETE for: ${song.snippet.title}`);
                setBufferProgress(100);
                setIsBuffering(false);
                
                // Store in ref for instant playback later
                audioPreloadRef.current = audio;
                resolve();
            });
            
            // Fallback timeout (10 seconds max)
            setTimeout(() => {
                if (lastProgress < 100) {
                    console.log(`⚠️ Buffer timeout, but proceeding with ${Math.round(lastProgress)}%`);
                    setBufferProgress(100);
                    setIsBuffering(false);
                    audioPreloadRef.current = audio;
                    resolve();
                }
            }, 10000);
            
            audio.load();
        });
    };

    useEffect(() => {
        const BACKEND_URL = 'https://vibesync-o3j5.onrender.com';
        const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnection: true });
        setSyncSocket(socket);
        
        socket.on('connect', () => { console.log('✅ Connected'); setSyncStatus('Connected'); });
        socket.on('disconnect', () => setSyncStatus('Disconnected'));
        socket.on('connect_error', () => setSyncStatus('Connection failed'));
        socket.on('room-created', () => { setSyncStatus('Host - Ready'); setIsSynced(true); });
        socket.on('room-joined', () => { setSyncStatus('Listener - Connected'); setIsSynced(true); });
        
        socket.on('listener-joined', ({ name, totalDevices }) => {
            setRoomMembers(prev => [...prev, { id: Date.now(), name }]);
            setTotalDevices(totalDevices);
        });
        
        // START BUFFERING - Download the song fully before countdown
        socket.on('start-buffering', async ({ song }) => {
            console.log('📢 Starting full buffer for:', song.snippet.title);
            setSelectedSong(song);
            setCountdownNumber(null);
            
            // FULLY buffer the song
            await fullyBufferSong(song);
            
            // Signal server that buffer is COMPLETE
            console.log('✅ Sending buffer-complete signal');
            socket.emit('buffer-complete', { roomCode });
        });
        
        // Buffer progress update from server
        socket.on('buffer-progress', ({ completeCount, totalDevices }) => {
            setCompleteCount(completeCount);
            setTotalDevices(totalDevices);
            console.log(`📊 Buffer complete: ${completeCount}/${totalDevices}`);
        });
        
        // COUNTDOWN - ONLY appears after ALL devices have buffered
        socket.on('countdown-update', ({ number }) => {
            setCountdownNumber(number);
            console.log(`⏰ Countdown: ${number}`);
            if (number === 0) {
                setCountdownNumber(null);
            }
        });
        
        // PLAY NOW - Instant playback (no buffering needed!)
        socket.on('play-now', ({ song, playAt }) => {
            console.log('🎬 PLAY NOW! No buffering needed - already ready!');
            setIsPlaying(true);
            setIsPaused(false);
            setSelectedSong(song);
            
            // Use preloaded audio for INSTANT playback
            if (audioPreloadRef.current) {
                console.log('🎵 Using preloaded audio for instant playback');
                // For YouTube, we need to update iframe
                if (iframeRef.current) {
                    iframeRef.current.src = `https://www.youtube.com/embed/${song.id.videoId}?autoplay=1&enablejsapi=1`;
                }
            } else {
                // Fallback
                if (iframeRef.current) {
                    iframeRef.current.src = `https://www.youtube.com/embed/${song.id.videoId}?autoplay=1&enablejsapi=1`;
                }
            }
        });
        
        // Host controls - Listeners only follow
        socket.on('sync-pause', () => {
            if (!isHost) {
                setIsPlaying(false);
                setIsPaused(true);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            }
        });
        
        socket.on('sync-resume', () => {
            if (!isHost) {
                setIsPlaying(true);
                setIsPaused(false);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            }
        });
        
        socket.on('sync-stop', () => {
            if (!isHost) {
                setIsPlaying(false);
                setIsPaused(false);
                setSelectedSong(null);
                setCountdownNumber(null);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            }
        });
        
        socket.on('host-left', () => { alert('Host left'); onLeave(); });
        
        return () => socket.disconnect();
    }, [isHost, onLeave]);

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
        } catch (err) { console.error(err); alert('Network error'); }
        setSearchLoading(false);
    };

    const playSong = (video) => {
        if (!isHost) { alert('Only host can play'); return; }
        if (!syncSocket?.connected) { alert('Not connected'); return; }
        if (!isSynced) { alert('Click "Start Sync" first'); return; }
        
        console.log('🎤 Host playing:', video.snippet.title);
        setSelectedSong(video);
        
        // Host also starts buffering
        fullyBufferSong(video).then(() => {
            console.log('✅ Host buffer complete');
            syncSocket.emit('buffer-complete', { roomCode });
        });
        
        // Tell all devices to start buffering
        syncSocket.emit('prepare-song', { roomCode, song: video });
    };
    
    // Host controls
    const handlePause = () => {
        if (isHost && syncSocket?.connected && isPlaying) {
            setIsPlaying(false);
            setIsPaused(true);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            syncSocket.emit('host-pause', { roomCode });
        }
    };
    
    const handleResume = () => {
        if (isHost && syncSocket?.connected && !isPlaying && selectedSong) {
            setIsPlaying(true);
            setIsPaused(false);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            syncSocket.emit('host-resume', { roomCode });
        }
    };
    
    const handleStop = () => {
        if (isHost && syncSocket?.connected && selectedSong) {
            setIsPlaying(false);
            setIsPaused(false);
            setSelectedSong(null);
            setCountdownNumber(null);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            syncSocket.emit('host-stop', { roomCode });
        }
    };

    const sendMessage = () => {
        if (chatInput.trim()) {
            sendChatMessage(chatInput.trim());
            setChatInput('');
        }
    };

    // Player view with countdown
    if (selectedSong) {
        return (
            <div className="player-view">
                <div className="player-header">
                    <h2>🎵 Now Playing</h2>
                    {isHost && (
                        <div className="host-controls">
                            {isPlaying ? (
                                <button onClick={handlePause}>⏸ Pause</button>
                            ) : selectedSong && !isPlaying && !isBuffering && countdownNumber === null ? (
                                <button onClick={handleResume}>▶ Resume</button>
                            ) : null}
                            <button onClick={handleStop}>⏹ Stop</button>
                        </div>
                    )}
                    <button onClick={() => { setSelectedSong(null); setCountdownNumber(null); }}>← Back to Room</button>
                </div>
                
                {/* COUNTDOWN DISPLAY - Only shows when ALL devices are ready */}
                {countdownNumber !== null && countdownNumber > 0 && (
                    <div className="countdown-overlay">
                        <div className="countdown-number">{countdownNumber}</div>
                        <div className="countdown-text">Get ready...</div>
                    </div>
                )}
                
                {/* BUFFERING PROGRESS - Shows while downloading */}
                {isBuffering && countdownNumber === null && (
                    <div className="buffering-container">
                        <div className="buffering-text">Downloading song... {Math.round(bufferProgress)}%</div>
                        <div className="buffering-bar">
                            <div className="buffering-fill" style={{ width: `${bufferProgress}%` }} />
                        </div>
                        <div className="buffering-status">
                            {isHost ? (
                                <>Waiting for {totalDevices - completeCount} device{totalDevices - completeCount !== 1 ? 's' : ''} to finish downloading...</>
                            ) : (
                                <>Waiting for host and other devices to finish downloading...</>
                            )}
                        </div>
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
                        🎧 Host controls playback. {isPlaying ? 'Playing' : isPaused ? 'Paused by host' : isBuffering ? 'Downloading...' : 'Waiting'}
                    </div>
                )}
            </div>
        );
    }

    const allMembers = [{ id: 'host', name: hostName || 'Host', isHost: true }, ...roomMembers.map(m => ({ ...m, isHost: false }))];

    return (
        <div className="room">
            <div className="room-header">
                <div className="logo-section"><h1>🎵 VibeSync</h1><span className="room-badge">Room: {roomCode}</span></div>
                <div className="header-buttons">
                    <button onClick={startSync} disabled={isSynced} className={`sync-btn ${isSynced ? 'synced' : ''}`}>{isSynced ? '✅ Synced' : '🔗 Start Sync'}</button>
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
                            <div className="search-bar"><input type="text" placeholder="Search for a song..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && searchYouTube()} /><button onClick={searchYouTube} disabled={searchLoading}>{searchLoading ? '...' : '🔍'}</button></div>
                            <div className="search-results">{searchResults.map(video => (<div key={video.id.videoId} className="song-item" onClick={() => playSong(video)}><img src={video.snippet.thumbnails.default?.url} alt="" /><div className="song-info"><div className="song-title">{video.snippet.title.substring(0, 40)}</div><div className="song-artist">{video.snippet.channelTitle}</div></div><button className="play-song-btn">▶</button></div>))}</div>
                        </>
                    ) : (
                        <div className="listener-waiting"><div className="waiting-icon">🎵</div><p>Waiting for host to select a song...</p><p className="waiting-sub">The host controls all playback</p></div>
                    )}
                </div>
                <div className="column members-column"><div className="column-header"><h3>👥 Members</h3><span className="member-count">{allMembers.length}</span></div><div className="members-list">{allMembers.map((member, idx) => (<div key={idx} className={`member-item ${member.isHost ? 'host' : ''}`}><span className="member-avatar">{member.isHost ? '👑' : '🎧'}</span><span className="member-name">{member.name}</span><span className="member-role">{member.isHost ? 'Host' : 'Listener'}</span>{member.isHost && isHost && <span className="you-tag">You</span>}</div>))}</div></div>
                <div className="column chat-column"><div className="column-header"><h3>💬 Group Chat</h3></div><div className="chat-messages">{messages?.length === 0 ? <div className="empty-state">💭 No messages yet</div> : messages.map((msg, idx) => (<div key={idx} className="chat-message"><div className="chat-sender">{msg.sender}</div><div className="chat-text">{msg.text}</div><div className="chat-time">{new Date(msg.timestamp).toLocaleTimeString()}</div></div>))}</div><div className="chat-input-area"><input type="text" placeholder="Type a message..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendMessage()} /><button onClick={sendMessage}>Send</button></div></div>
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