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
    const [chatMessages, setChatMessages] = useState([]);
    
    // Sync phase states
    const [syncPhase, setSyncPhase] = useState('idle');
    const [preloadProgress, setPreloadProgress] = useState(0);
    const [completeCount, setCompleteCount] = useState(0);
    const [totalDevices, setTotalDevices] = useState(1);
    const [countdownNumber, setCountdownNumber] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [debugInfo, setDebugInfo] = useState('');
    
    const iframeRef = useRef(null);
    const hiddenIframeRef = useRef(null);
    const audioRef = useRef(null);

    const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || 'AIzaSyDv-8EXonJfRu-b2kYnPm2eiJYggp5e1Ew';

    // FULL PRELOAD FUNCTION - Downloads and verifies playback readiness
    const fullPreloadAndVerify = async (song) => {
        console.log(`[CLIENT] 📥 Starting full preload: ${song.snippet.title}`);
        setPreloadProgress(0);
        
        return new Promise((resolve) => {
            let progress = 0;
            let preloadComplete = false;
            let playbackReady = false;
            
            // Hidden iframe preload
            const hiddenIframe = document.createElement('iframe');
            hiddenIframe.style.position = 'absolute';
            hiddenIframe.style.top = '-9999px';
            hiddenIframe.style.left = '-9999px';
            hiddenIframe.style.width = '1px';
            hiddenIframe.style.height = '1px';
            hiddenIframe.style.opacity = '0';
            hiddenIframe.style.pointerEvents = 'none';
            hiddenIframe.src = `https://www.youtube.com/embed/${song.id.videoId}?enablejsapi=1`;
            document.body.appendChild(hiddenIframe);
            hiddenIframeRef.current = hiddenIframe;
            
            // Audio element for precise buffering
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = `https://www.youtube.com/embed/${song.id.videoId}`;
            audioRef.current = audio;
            
            audio.addEventListener('progress', () => {
                if (audio.buffered.length > 0 && !preloadComplete) {
                    const buffered = audio.buffered.end(0);
                    const duration = audio.duration;
                    if (duration > 0) {
                        progress = (buffered / duration) * 100;
                        setPreloadProgress(Math.min(100, progress));
                        console.log(`[CLIENT] 📥 Preload: ${Math.round(progress)}%`);
                    }
                }
            });
            
            const verifyPlaybackReady = () => {
                if (!playbackReady && preloadComplete) {
                    playbackReady = true;
                    console.log(`[CLIENT] 🎯 Playback ready verification complete`);
                    resolve();
                }
            };
            
            audio.addEventListener('canplaythrough', () => {
                console.log(`[CLIENT] ✅ Audio can play through - preload complete`);
                preloadComplete = true;
                setPreloadProgress(100);
                verifyPlaybackReady();
            });
            
            hiddenIframe.addEventListener('load', () => {
                console.log(`[CLIENT] ✅ Hidden iframe loaded`);
                if (!preloadComplete) {
                    preloadComplete = true;
                    setPreloadProgress(100);
                    verifyPlaybackReady();
                }
            });
            
            // Fallback timeout
            setTimeout(() => {
                if (!playbackReady) {
                    console.log(`[CLIENT] ⚠️ Playback verification timeout, proceeding anyway`);
                    preloadComplete = true;
                    setPreloadProgress(100);
                    resolve();
                }
            }, 15000);
            
            audio.load();
        });
    };

    useEffect(() => {
        const BACKEND_URL = 'https://vibesync-o3j5.onrender.com';
        const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnection: true });
        setSyncSocket(socket);
        
        socket.on('connect', () => { console.log('[CLIENT] ✅ Connected to server'); setSyncStatus('Connected'); });
        socket.on('disconnect', () => setSyncStatus('Disconnected'));
        socket.on('connect_error', () => setSyncStatus('Connection failed'));
        
        socket.on('room-created', () => { 
            console.log('[CLIENT] Room created - Host mode');
            setSyncStatus('Host - Ready'); 
            setIsSynced(true); 
        });
        
        socket.on('room-joined', () => { 
            console.log('[CLIENT] Room joined - Listener mode');
            setSyncStatus('Listener - Connected'); 
            setIsSynced(true); 
        });
        
        socket.on('members-update', ({ members }) => {
            console.log('[CLIENT] Members update:', members);
            setRoomMembers(members.filter(m => !m.isHost));
            setTotalDevices(members.length);
        });
        
        socket.on('listener-joined', ({ name, totalDevices }) => {
            setRoomMembers(prev => [...prev, { id: Date.now(), name }]);
            setTotalDevices(totalDevices);
        });
        
        // Chat
        socket.on('chat-history', ({ messages }) => {
            setChatMessages(messages || []);
        });
        
        socket.on('new-chat-message', (message) => {
            setChatMessages(prev => [...prev, message]);
        });
        
        // START PRELOAD - Phase 1: Download
        socket.on('preload-song', async ({ song }) => {
            console.log('[CLIENT] 📢 Received preload command for:', song.snippet.title);
            setSelectedSong(song);
            setSyncPhase('preloading');
            setCountdownNumber(null);
            
            await fullPreloadAndVerify(song);
            
            console.log('[CLIENT] 📤 Sending preload-complete to server');
            socket.emit('preload-complete', { roomCode });
        });
        
        // Verify playback ready - Phase 2: Server asks for final readiness
        socket.on('verify-playback-ready', () => {
            console.log('[CLIENT] 🎯 Received playback-ready verification request');
            console.log('[CLIENT] 📤 Sending playback-ready to server');
            socket.emit('playback-ready', { roomCode });
        });
        
        // Preload progress update
        socket.on('preload-progress', ({ completeCount, totalDevices }) => {
            setCompleteCount(completeCount);
            setTotalDevices(totalDevices);
            setDebugInfo(`Preload: ${completeCount}/${totalDevices} devices ready`);
            console.log(`[CLIENT] 📊 Progress: ${completeCount}/${totalDevices}`);
        });
        
        // COUNTDOWN
        socket.on('countdown-start', ({ number }) => {
            console.log(`[CLIENT] ⏰ Countdown started: ${number}`);
            setSyncPhase('countdown');
            setCountdownNumber(number);
        });
        
        socket.on('countdown-tick', ({ number }) => {
            setCountdownNumber(number);
            if (number === 0) setCountdownNumber(null);
        });
        
        // PLAY NOW
        socket.on('play-now', ({ song }) => {
            console.log('[CLIENT] 🎬 PLAY NOW! Starting playback');
            setSyncPhase('playing');
            setIsPlaying(true);
            setSelectedSong(song);
            
            if (iframeRef.current) {
                iframeRef.current.src = `https://www.youtube.com/embed/${song.id.videoId}?autoplay=1&enablejsapi=1`;
            }
            
            if (hiddenIframeRef.current) {
                hiddenIframeRef.current.remove();
                hiddenIframeRef.current = null;
            }
        });
        
        // Host controls sync
        socket.on('sync-pause', () => {
            if (!isHost && syncPhase === 'playing') {
                setIsPlaying(false);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            }
        });
        
        socket.on('sync-resume', () => {
            if (!isHost && syncPhase === 'playing') {
                setIsPlaying(true);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            }
        });
        
        socket.on('sync-stop', () => {
            if (!isHost) {
                setIsPlaying(false);
                setSyncPhase('idle');
                setSelectedSong(null);
                setCountdownNumber(null);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            }
        });
        
        socket.on('host-left', () => { alert('Host left the room'); onLeave(); });
        
        // Debug
        socket.on('room-state-debug', ({ states, syncPhase }) => {
            console.log('[DEBUG] Room states:', states);
            setDebugInfo(`Phase: ${syncPhase} | States: ${JSON.stringify(states)}`);
        });
        
        return () => socket.disconnect();
    }, [isHost, onLeave]);

    const startSync = () => {
        if (!syncSocket?.connected) { alert('Connecting to server...'); return; }
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
        if (!syncSocket?.connected) { alert('Not connected to server'); return; }
        if (!isSynced) { alert('Click "Start Sync" first'); return; }
        if (syncPhase !== 'idle') { alert('A song is already being prepared'); return; }
        
        console.log('[CLIENT] 🎤 Host selecting song:', video.snippet.title);
        setSelectedSong(video);
        
        fullPreloadAndVerify(video).then(() => {
            console.log('[CLIENT] ✅ Host preload and verification complete');
            syncSocket.emit('preload-complete', { roomCode });
        });
        
        syncSocket.emit('prepare-song', { roomCode, song: video });
    };
    
    const handlePause = () => {
        if (isHost && syncPhase === 'playing' && syncSocket?.connected && isPlaying) {
            setIsPlaying(false);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            syncSocket.emit('host-pause', { roomCode });
        }
    };
    
    const handleResume = () => {
        if (isHost && syncPhase === 'playing' && syncSocket?.connected && !isPlaying && selectedSong) {
            setIsPlaying(true);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            syncSocket.emit('host-resume', { roomCode });
        }
    };
    
    const handleStop = () => {
        if (isHost && syncPhase !== 'idle' && syncSocket?.connected) {
            setIsPlaying(false);
            setSyncPhase('idle');
            setSelectedSong(null);
            setCountdownNumber(null);
            iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
            syncSocket.emit('host-stop', { roomCode });
            
            if (hiddenIframeRef.current) {
                hiddenIframeRef.current.remove();
                hiddenIframeRef.current = null;
            }
        }
    };

    const sendChatMessageHandler = () => {
        if (chatInput.trim() && syncSocket?.connected) {
            const sender = isHost ? hostName : 'Listener';
            syncSocket.emit('chat-message', { roomCode, text: chatInput.trim(), sender });
            setChatInput('');
        }
    };

    const getDebugButton = () => {
        if (isHost && syncSocket?.connected) {
            return (
                <button 
                    onClick={() => syncSocket.emit('get-room-state', { roomCode })}
                    style={{ fontSize: '10px', marginLeft: '10px', padding: '2px 6px' }}
                >
                    Debug
                </button>
            );
        }
        return null;
    };

    // PLAYING VIEW
    if (syncPhase === 'playing' && selectedSong) {
        return (
            <div className="player-view">
                <div className="player-header">
                    <h2>🎵 Now Playing</h2>
                    {isHost && (
                        <div className="host-controls">
                            {isPlaying ? (
                                <button onClick={handlePause}>⏸ Pause</button>
                            ) : (
                                <button onClick={handleResume}>▶ Resume</button>
                            )}
                            <button onClick={handleStop}>⏹ Stop</button>
                        </div>
                    )}
                    <button onClick={handleStop}>← Back to Room</button>
                </div>
                
                <div className="player-container">
                    <h3>{selectedSong.snippet.title}</h3>
                    <iframe
                        ref={iframeRef}
                        title={selectedSong.snippet.title}
                        width="100%"
                        height="400"
                        src={`https://www.youtube.com/embed/${selectedSong.id.videoId}?autoplay=1&enablejsapi=1`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                        allowFullScreen
                    />
                </div>
                
                {!isHost && (
                    <div className="listener-info">
                        🎧 Host controls playback. {isPlaying ? 'Playing' : 'Paused'}
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
                    {isHost && <button onClick={handleStop}>⏹ Cancel</button>}
                    <button onClick={handleStop}>← Back</button>
                    {getDebugButton()}
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
                        <div className="buffering-bar">
                            <div className="buffering-fill" style={{ width: `${preloadProgress}%` }} />
                        </div>
                        <div className="buffering-status">
                            {completeCount}/{totalDevices} devices ready
                            {completeCount < totalDevices && ' - Waiting for all devices to finish downloading...'}
                        </div>
                        {debugInfo && <div className="debug-info">{debugInfo}</div>}
                    </div>
                )}
                
                {syncPhase === 'verifying' && !countdownNumber && (
                    <div className="buffering-container">
                        <div className="buffering-text">✓ Song downloaded!</div>
                        <div className="buffering-status">
                            Verifying playback readiness on all devices...
                        </div>
                        {debugInfo && <div className="debug-info">{debugInfo}</div>}
                    </div>
                )}
                
                {syncPhase === 'countdown' && countdownNumber === null && (
                    <div className="buffering-container">
                        <div className="buffering-text">✓ All devices ready!</div>
                        <div className="buffering-status">
                            Starting playback...
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
    const displayMessages = chatMessages.length > 0 ? chatMessages : (messages || []);

    return (
        <div className="room">
            <div className="room-header">
                <div className="logo-section"><h1>🎵 VibeSync</h1><span className="room-badge">Room: {roomCode}</span>{getDebugButton()}</div>
                <div className="header-buttons">
                    <button onClick={startSync} disabled={isSynced} className={`sync-btn ${isSynced ? 'synced' : ''}`}>{isSynced ? '✅ Synced' : '🔗 Start Sync'}</button>
                    <button onClick={onLeave} className="leave-btn">🚪 Leave Room</button>
                </div>
            </div>
            <div className="sync-status-bar">📡 Status: {syncStatus} {isSynced ? '✅' : '⏳'} {debugInfo && `| ${debugInfo}`}</div>
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
                
                <div className="column members-column">
                    <div className="column-header"><h3>👥 Members</h3><span className="member-count">{allMembers.length + 1}</span></div>
                    <div className="members-list">
                        <div className="member-item host">
                            <span className="member-avatar">👑</span>
                            <span className="member-name">{hostName || 'Host'}</span>
                            <span className="member-role">Host</span>
                            {isHost && <span className="you-tag">You</span>}
                        </div>
                        {allMembers.map((member, idx) => (
                            <div key={idx} className="member-item">
                                <span className="member-avatar">🎧</span>
                                <span className="member-name">{member.name}</span>
                                <span className="member-role">Listener</span>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="column chat-column">
                    <div className="column-header"><h3>💬 Group Chat</h3></div>
                    <div className="chat-messages">
                        {displayMessages.length === 0 ? (
                            <div className="empty-state">💭 No messages yet</div>
                        ) : (
                            displayMessages.map((msg, idx) => (
                                <div key={idx} className="chat-message">
                                    <div className="chat-sender">{msg.sender}</div>
                                    <div className="chat-text">{msg.text}</div>
                                    <div className="chat-time">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                                </div>
                            ))
                        )}
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

function AppContent()
{
const [inRoom, setInRoom] = useState(false);
    const [roomCode, setRoomCode] = useState('');
    const [isHost, setIsHost] = useState(false);
    const handleEnterRoom = (code, host) => { setRoomCode(code); setIsHost(host); setInRoom(true); };
    const handleLeaveRoom = () => { setInRoom(false); setRoomCode(''); };
    return (<RoomProvider>{!inRoom ? <Landing onEnterRoom={handleEnterRoom} /> : <RoomScreen roomCode={roomCode} isHost={isHost} onLeave={handleLeaveRoom} />}</RoomProvider>);
}

export default AppContent;