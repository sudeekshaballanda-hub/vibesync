import React, { useState, useEffect, useRef } from 'react';
import { RoomProvider, useRoom } from './context/RoomContext';
import io from 'socket.io-client';
import './index.css';

// Landing Component
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

// RoomScreen Component
function RoomScreen({ roomCode, isHost, onLeave }) {
    const { hostName, members, setMembers, messages, sendChatMessage } = useRoom();
    const [chatInput, setChatInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedSource, setSelectedSource] = useState('youtube');
    const [selectedSong, setSelectedSong] = useState(null);
    
    // Sync states
    const [syncSocket, setSyncSocket] = useState(null);
    const [isSynced, setIsSynced] = useState(false);
    const [syncStatus, setSyncStatus] = useState('Not Connected');
    const [roomMembers, setRoomMembers] = useState([]);
    
    // Playback states
    const [isPreparing, setIsPreparing] = useState(false);
    const [readyCount, setReadyCount] = useState(0);
    const [totalDevices, setTotalDevices] = useState(1);
    const [bufferingProgress, setBufferingProgress] = useState(0);
    const [countdownNumber, setCountdownNumber] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const iframeRef = useRef(null);

    const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || 'AIzaSyDv-8EXonJfRu-b2kYnPm2eiJYggp5e1Ew';

    // Preload song function
    const preloadSong = async (song) => {
        console.log(`📥 Preloading: ${song.snippet.title}`);
        setBufferingProgress(0);
        
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = `https://www.youtube.com/embed/${song.id.videoId}`;
            
            audio.addEventListener('progress', () => {
                if (audio.buffered.length > 0) {
                    const percent = (audio.buffered.end(0) / audio.duration) * 100;
                    setBufferingProgress(Math.min(100, percent));
                }
            });
            
            audio.addEventListener('canplay', () => {
                console.log('✅ Buffer complete');
                setBufferingProgress(100);
                resolve();
            });
            
            setTimeout(() => {
                console.log('⚠️ Buffer timeout');
                setBufferingProgress(100);
                resolve();
            }, 8000);
            
            audio.load();
        });
    };

    // Connect to backend
    useEffect(() => {
        const BACKEND_URL = 'https://vibesync-o3j5.onrender.com';
        const socket = io(BACKEND_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10
        });
        
        setSyncSocket(socket);
        
        socket.on('connect', () => {
            console.log('✅ Connected');
            setSyncStatus('Connected');
        });
        
        socket.on('disconnect', () => setSyncStatus('Disconnected'));
        socket.on('connect_error', (e) => setSyncStatus('Connection failed'));
        
        socket.on('room-created', () => {
            setSyncStatus('Ready - You are Host');
            setIsSynced(true);
        });
        
        socket.on('room-joined', () => {
            setSyncStatus('Connected - Waiting for Host');
            setIsSynced(true);
        });
        
        socket.on('listener-joined', ({ name, totalDevices }) => {
            setRoomMembers(prev => [...prev, { id: Date.now(), name }]);
            setTotalDevices(totalDevices);
        });
        
        socket.on('room-state', ({ currentSong, isPlaying, playbackState, currentTime }) => {
            if (currentSong) setSelectedSong(currentSong);
            setIsPlaying(isPlaying);
            setCurrentTime(currentTime);
        });
        
        socket.on('prepare-song', async ({ song }) => {
            console.log('📢 Preparing song:', song.snippet.title);
            setSelectedSong(song);
            setIsPreparing(true);
            setCountdownNumber(null);
            
            await preloadSong(song);
            socket.emit('device-ready', { roomCode });
        });
        
        socket.on('ready-progress', ({ readyCount, totalDevices }) => {
            setReadyCount(readyCount);
            setTotalDevices(totalDevices);
        });
        
        socket.on('countdown', ({ number }) => {
            setCountdownNumber(number);
            if (number === 0) {
                setIsPreparing(false);
                setCountdownNumber(null);
            }
        });
        
        socket.on('play-now', ({ song, playAt, startTime }) => {
            console.log('🎬 PLAY NOW!');
            setSelectedSong(song);
            setIsPlaying(true);
            setCurrentTime(startTime);
            setIsPreparing(false);
            setCountdownNumber(null);
            
            setTimeout(() => {
                if (iframeRef.current) {
                    const videoId = song.id.videoId;
                    iframeRef.current.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
                }
            }, 100);
        });
        
        socket.on('sync-pause', () => {
            if (!isHost) {
                setIsPlaying(false);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            }
        });
        
        socket.on('sync-resume', () => {
            if (!isHost) {
                setIsPlaying(true);
                iframeRef.current?.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            }
        });
        
        socket.on('sync-stop', () => {
            if (!isHost) {
                setIsPlaying(false);
                setSelectedSong(null);
            }
        });
        
        socket.on('host-left', () => {
            alert('Host left the room');
            onLeave();
        });
        
        return () => socket.disconnect();
    }, [isHost, onLeave]);

    // Start sync
    const startSync = () => {
        if (!syncSocket?.connected) {
            alert('Connecting to server...');
            return;
        }
        
        if (isHost) {
            syncSocket.emit('create-room', { roomCode, hostName });
            setIsSynced(true);
            setSyncStatus('Host - Sync Active');
        } else {
            syncSocket.emit('join-room', { roomCode, listenerName: hostName });
            setIsSynced(true);
            setSyncStatus('Listener - Connected');
        }
    };

    // Search YouTube
    const searchYouTube = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(searchQuery)}&type=video&key=${YOUTUBE_API_KEY}`;
            const response = await fetch(url);
            const data = await response.json();
            if (response.status === 200 && data.items) {
                setSearchResults(data.items);
            } else {
                alert('Search failed');
            }
        } catch (err) {
            console.error(err);
            alert('Network error');
        }
        setSearchLoading(false);
    };

    // Host plays a song
    const playSong = (video) => {
        console.log('🎤 playSong called. isHost:', isHost, 'isSynced:', isSynced);
        
        if (!isHost) {
            alert('Only the host can play songs');
            return;
        }
        if (!syncSocket?.connected) {
            alert('Not connected to server');
            return;
        }
        if (!isSynced) {
            alert('Please click "Start Sync" first');
            return;
        }
        
        if (!video || !video.id || !video.id.videoId) {
            console.error('Invalid video:', video);
            alert('Invalid song selected');
            return;
        }
        
        console.log('🎤 Host playing:', video.snippet.title);
        setSelectedSong(video);
        syncSocket.emit('prepare-song', { roomCode, song: video });
        
        preloadSong(video).then(() => {
            console.log('✅ Host ready');
            syncSocket.emit('device-ready', { roomCode });
        }).catch(err => {
            console.error('Preload error:', err);
            alert('Failed to load song');
        });
    };
    
    // Host controls
    const handlePause = () => {
        if (isHost && syncSocket?.connected && isPlaying) {
            syncSocket.emit('host-pause', { roomCode });
        }
    };
    
    const handleResume = () => {
        if (isHost && syncSocket?.connected && !isPlaying && selectedSong) {
            syncSocket.emit('host-resume', { roomCode });
        }
    };
    
    const handleStop = () => {
        if (isHost && syncSocket?.connected && selectedSong) {
            syncSocket.emit('host-stop', { roomCode });
            setSelectedSong(null);
            setIsPlaying(false);
        }
    };

    const sendMessage = () => {
        if (chatInput.trim()) {
            sendChatMessage(chatInput.trim());
            setChatInput('');
        }
    };

    // Player view
    if (selectedSong) {
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
                    <button onClick={() => setSelectedSong(null)}>← Back to Room</button>
                </div>
                
                {countdownNumber !== null && countdownNumber > 0 && (
                    <div className="countdown-overlay">
                        <div className="countdown-number">{countdownNumber}</div>
                        <div className="countdown-text">Get ready...</div>
                    </div>
                )}
                
                {isPreparing && countdownNumber === null && (
                    <div className="buffering-container">
                        <div className="buffering-text">Buffering: {Math.round(bufferingProgress)}%</div>
                        <div className="buffering-bar">
                            <div className="buffering-fill" style={{ width: `${bufferingProgress}%` }} />
                        </div>
                        <div className="buffering-status">
                            Waiting for {totalDevices - readyCount} more device{totalDevices - readyCount !== 1 ? 's' : ''}...
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
                        🎧 You are in sync with the host. Host controls playback.
                    </div>
                )}
            </div>
        );
    }

    // Members display
    const allMembers = [
        { id: 'host', name: hostName || 'Host', isHost: true },
        ...roomMembers.map(m => ({ ...m, isHost: false }))
    ];

    return (
        <div className="room">
            <div className="room-header">
                <div className="logo-section">
                    <h1>🎵 VibeSync</h1>
                    <span className="room-badge">Room: {roomCode}</span>
                </div>
                <div className="header-buttons">
                    <button onClick={startSync} disabled={isSynced} className={`sync-btn ${isSynced ? 'synced' : ''}`}>
                        {isSynced ? '✅ Synced' : '🔗 Start Sync'}
                    </button>
                    <button onClick={onLeave} className="leave-btn">🚪 Leave Room</button>
                </div>
            </div>

            <div className="sync-status-bar">
                📡 Status: {syncStatus} {isSynced ? '✅' : '⏳'}
            </div>

            <div className="three-columns">
                
                {/* COLUMN 1: SEARCH - FIXED VERSION (NO DUPLICATES) */}
                <div className="column search-column">
                    <div className="column-header">
                        <h3>🔍 Search Music</h3>
                        {!isHost && <span className="host-only-badge">(Host only)</span>}
                    </div>
                    
                    {/* SOURCE TABS */}
                    <div className="source-tabs">
                        <button
                            className={`source-tab ${selectedSource === 'youtube' ? 'active' : ''}`}
                            onClick={() => setSelectedSource('youtube')}
                        >
                            🎬 YouTube
                        </button>
                        <button className="source-tab disabled" disabled>🎵 Spotify (Soon)</button>
                    </div>
                    
                    {isHost ? (
                        <>
                            {/* SEARCH BAR */}
                            <div className="search-bar">
                                <input 
                                    type="text" 
                                    placeholder="Search for a song..." 
                                    value={searchQuery} 
                                    onChange={e => setSearchQuery(e.target.value)} 
                                    onKeyPress={e => e.key === 'Enter' && searchYouTube()} 
                                />
                                <button onClick={searchYouTube} disabled={searchLoading}>
                                    {searchLoading ? '...' : '🔍'}
                                </button>
                            </div>
                            
                            {/* SEARCH RESULTS */}
                            <div className="search-results">
                                {searchResults.map((video) => (
                                    <div key={video.id.videoId} className="song-item" onClick={() => playSong(video)}>
                                        <img src={video.snippet.thumbnails.default?.url} alt="" />
                                        <div className="song-info">
                                            <div className="song-title">{video.snippet.title.substring(0, 40)}</div>
                                            <div className="song-artist">{video.snippet.channelTitle}</div>
                                        </div>
                                        <button className="play-song-btn">▶</button>
                                    </div>
                                ))}
                                {searchResults.length === 0 && !searchLoading && (
                                    <div className="empty-state">🎤 Search for a song to play</div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="listener-waiting">
                            <div className="waiting-icon">🎵</div>
                            <p>Waiting for host to select a song...</p>
                            <p className="waiting-sub">The host controls all playback</p>
                        </div>
                    )}
                </div>

                {/* COLUMN 2: MEMBERS */}
                <div className="column members-column">
                    <div className="column-header">
                        <h3>👥 Members</h3>
                        <span className="member-count">{allMembers.length}</span>
                    </div>
                    <div className="members-list">
                        {allMembers.map((member, idx) => (
                            <div key={idx} className={`member-item ${member.isHost ? 'host' : ''}`}>
                                <span className="member-avatar">{member.isHost ? '👑' : '🎧'}</span>
                                <span className="member-name">{member.name}</span>
                                <span className="member-role">{member.isHost ? 'Host' : 'Listener'}</span>
                                {member.isHost && isHost && <span className="you-tag">You</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* COLUMN 3: CHAT */}
                <div className="column chat-column">
                    <div className="column-header">
                        <h3>💬 Group Chat</h3>
                    </div>
                    <div className="chat-messages">
                        {messages?.length === 0 ? (
                            <div className="empty-state">💭 No messages yet</div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className="chat-message">
                                    <div className="chat-sender">{msg.sender}</div>
                                    <div className="chat-text">{msg.text}</div>
                                    <div className="chat-time">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="chat-input-area">
                        <input 
                            type="text" 
                            placeholder="Type a message..." 
                            value={chatInput} 
                            onChange={e => setChatInput(e.target.value)} 
                            onKeyPress={e => e.key === 'Enter' && sendMessage()} 
                        />
                        <button onClick={sendMessage}>Send</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Main App
function AppContent() {
    const [inRoom, setInRoom] = useState(false);
    const [roomCode, setRoomCode] = useState('');
    const [isHost, setIsHost] = useState(false);

    const handleEnterRoom = (code, host) => {
        setRoomCode(code);
        setIsHost(host);
        setInRoom(true);
    };

    const handleLeaveRoom = () => {
        setInRoom(false);
        setRoomCode('');
    };

    return (
        <RoomProvider>
            {!inRoom ? (
                <Landing onEnterRoom={handleEnterRoom} />
            ) : (
                <RoomScreen roomCode={roomCode} isHost={isHost} onLeave={handleLeaveRoom} />
            )}
        </RoomProvider>
    );
}

export default AppContent;