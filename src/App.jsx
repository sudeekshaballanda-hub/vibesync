import React, { useState, useEffect } from 'react';
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
                <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                />
                <button onClick={handleCreate}>Create Room</button>
                <button className="back" onClick={() => setMode(null)}>Back</button>
            </div>
        );
    }

    if (mode === 'join') {
        return (
            <div className="container">
                <h1>🎵 Join Room</h1>
                <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Room code"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    maxLength={6}
                />
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

// RoomScreen Component with 3 columns and sync
function RoomScreen({ roomCode, isHost, onLeave }) {
    const { hostName, members, setMembers, messages, sendChatMessage } = useRoom();
    const [chatInput, setChatInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedSource, setSelectedSource] = useState('youtube');
    const [selectedSong, setSelectedSong] = useState(null);
    const [scheduledPlayTimerId, setScheduledPlayTimerId] = useState(null);

    // Sync related states
    const [syncSocket, setSyncSocket] = useState(null);
    const [isSynced, setIsSynced] = useState(false);
    const [syncStatus, setSyncStatus] = useState('Not Connected');
    const [roomMembers, setRoomMembers] = useState([]);

    // Ready-state barrier states
    const [isPreparing, setIsPreparing] = useState(false);
    const [readyCount, setReadyCount] = useState(0);
    const [totalDevices, setTotalDevices] = useState(1);
    const [bufferingProgress, setBufferingProgress] = useState(0);
    const [isDeviceReady, setIsDeviceReady] = useState(false);

    const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || 'AIzaSyDv-8EXonJfRu-b2kYnPm2eiJYggp5e1Ew';

    // ============================================
    // STEP 4: preloadSong FUNCTION
    // ============================================
    const preloadSong = async (song) => {
        console.log(`📥 Preloading song: ${song.snippet.title}`);
        setIsPreparing(true);
        setBufferingProgress(0);
        
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = `https://www.youtube.com/embed/${song.id.videoId}`;
            
            audio.addEventListener('progress', () => {
                if (audio.buffered.length > 0) {
                    const buffered = audio.buffered.end(0);
                    const duration = audio.duration;
                    const percent = (buffered / duration) * 100;
                    setBufferingProgress(Math.min(100, percent));
                }
            });
            
            audio.addEventListener('canplay', () => {
                console.log('✅ Song buffered, ready to play');
                setBufferingProgress(100);
                resolve();
            });
            
            // Timeout fallback after 5 seconds
            setTimeout(() => {
                console.log('⚠️ Buffer timeout, proceeding anyway');
                setBufferingProgress(100);
                resolve();
            }, 5000);
            
            audio.load();
        });
    };

    // ============================================
    // Connect to backend server
    // ============================================
    useEffect(() => {
        const BACKEND_URL = 'https://vibesync-o3j5.onrender.com';

        console.log('🔌 Connecting to backend:', BACKEND_URL);

        const socket = io(BACKEND_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 10,
            timeout: 30000,
            forceNew: true
        });

        setSyncSocket(socket);

        let pendingTimer = null;

        socket.on('connect', () => {
            console.log('✅ Socket connected! Transport:', socket.io.engine.transport.name);
            setSyncStatus('Connected');
        });

        socket.on('disconnect', (reason) => {
            console.log('❌ Socket disconnected:', reason);
            setSyncStatus('Disconnected - Reconnecting...');
        });

        socket.on('connect_error', (error) => {
            console.error('❌ Connection error:', error.message);
            setSyncStatus('Connection failed - Retrying...');
        });

        socket.on('reconnect_attempt', (attempt) => {
            console.log('🔄 Reconnect attempt:', attempt);
        });

        socket.on('reconnect', () => {
            console.log('✅ Reconnected!');
            setSyncStatus('Connected');
        });

        // Room events
        socket.on('room-created', () => {
            console.log('Room created event received');
            setSyncStatus('Ready - You are Host');
            setIsSynced(true);
        });

        socket.on('room-joined', () => {
            console.log('Room joined event received');
            setSyncStatus('Connected - Waiting for Host');
            setIsSynced(true);
        });

        socket.on('listener-joined', ({ name }) => {
            console.log(`${name} joined the room`);
            setRoomMembers(prev => [...prev, { id: Date.now(), name }]);
        });

        socket.on('members-update', ({ hostName, listeners }) => {
            console.log('Members update:', { hostName, listeners });
            setRoomMembers(listeners || []);
            if (setMembers) setMembers(listeners || []);
        });

        // ============================================
        // STEP 5: NEW EVENT HANDLERS for Ready-State Barrier
        // ============================================
        
        // 1. Prepare song - all devices start buffering
        socket.on('prepare-song', async ({ song, message }) => {
            console.log(`📢 Host is preparing: ${song.snippet.title}`);
            setSelectedSong(song);
            setIsPreparing(true);
            setReadyCount(0);
            setIsDeviceReady(false);
            
            alert(`🎵 Host is preparing: ${song.snippet.title}. Buffering...`);
            
            // Preload the song
            await preloadSong(song);
            
            // Once preloaded, send ready signal to server
            console.log('🎯 Device ready, sending ready signal');
            setIsDeviceReady(true);
            socket.emit('device-ready', { roomCode });
        });
        
        // 2. Ready update - shows how many devices are ready
        socket.on('ready-update', ({ readyCount, totalDevices }) => {
            setReadyCount(readyCount);
            setTotalDevices(totalDevices);
            console.log(`📊 Ready: ${readyCount}/${totalDevices} devices`);
        });
        
        // 3. Play now - all devices play together
        socket.on('play-now', ({ song, playAt }) => {
            console.log(`🎬 PLAY NOW at ${playAt}`);
            
            const now = Date.now();
            const delay = Math.max(0, playAt - now);
            
            console.log(`⏰ Starting playback in ${delay}ms`);
            
            setTimeout(() => {
                setIsPreparing(false);
                setSelectedSong(song);
                alert(`🎵 Now playing: ${song.snippet.title} (SYNCED!)`);
            }, delay);
        });

        socket.on('host-left', () => {
            alert('Host left. Returning home...');
            onLeave();
        });

        socket.on('error', (msg) => {
            console.error('Server error:', msg);
            alert(msg);
        });

        return () => {
            if (pendingTimer) {
                clearTimeout(pendingTimer);
            }
            if (socket) socket.disconnect();
        };
    }, [isHost, onLeave, setMembers]);

    // Timer cleanup on unmount
    useEffect(() => {
        return () => {
            if (scheduledPlayTimerId) {
                clearTimeout(scheduledPlayTimerId);
            }
        };
    }, [scheduledPlayTimerId]);

    // Start sync function
    const startSync = () => {
        if (!syncSocket || !syncSocket.connected) {
            alert('Connecting to server... Please wait a moment.');
            console.log('Socket status:', syncSocket?.connected);
            return;
        }

        if (isHost) {
            console.log('Emitting create-room for:', roomCode, hostName);
            syncSocket.emit('create-room', { roomCode, hostName });
            setIsSynced(true);
            setSyncStatus('Host - Sync Active');
        } else {
            console.log('Emitting join-room for:', roomCode, hostName);
            syncSocket.emit('join-room', { roomCode, listenerName: hostName });
            setIsSynced(true);
            setSyncStatus('Listener - Connected');
        }
    };

    const searchYouTube = async () => {
        if (!searchQuery.trim()) {
            alert('Please enter a search term');
            return;
        }

        setSearchLoading(true);

        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(searchQuery)}&type=video&key=${YOUTUBE_API_KEY}`;

            const response = await fetch(url);
            const data = await response.json();

            if (response.status === 200 && data.items) {
                setSearchResults(data.items);
                if (data.items.length === 0) {
                    alert('No results found. Try different keywords.');
                }
            } else {
                console.error('API Error:', data.error);
                alert('Search failed. Check console for details.');
                setSearchResults([]);
            }
        } catch (err) {
            console.error('Network error:', err);
            alert('Network error. Check console for details.');
        }
        setSearchLoading(false);
    };

    // ============================================
    // STEP 6: UPDATED playSong FUNCTION with Ready-State Barrier
    // ============================================
    const playSong = (video) => {
        if (isHost && syncSocket && syncSocket.connected && isSynced) {
            console.log(`🎤 Host requesting to play: ${video.snippet.title}`);
            
            alert(`Preparing "${video.snippet.title}" for sync...`);
            
            // Tell server to prepare ALL devices
            syncSocket.emit('prepare-play', { roomCode, song: video });
            
            // Host also preloads locally
            preloadSong(video).then(() => {
                console.log('✅ Host ready, sending ready signal');
                syncSocket.emit('device-ready', { roomCode });
            });
            
        } else if (isHost && !isSynced) {
            alert('Please click "Start Sync" first before playing songs.');
        } else if (!isHost) {
            alert('Only the host can play songs');
        }
    };

    const sendMessage = () => {
        if (chatInput.trim()) {
            sendChatMessage(chatInput.trim());
            setChatInput('');
        }
    };

    // If a song is selected, show player
    if (selectedSong) {
        return (
            <div className="player-view">
                <div className="player-header">
                    <h2>🎵 Now Playing</h2>
                    <button onClick={() => setSelectedSong(null)}>← Back to Room</button>
                </div>
                <div className="player-container">
                    <h3>{selectedSong.snippet.title}</h3>
                    <iframe
                        title={selectedSong.snippet.title}
                        width="100%"
                        height="400"
                        src={`https://www.youtube.com/embed/${selectedSong.id.videoId}?autoplay=1`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                        allowFullScreen
                    />
                </div>
            </div>
        );
    }

    // Combine host + listeners for display
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
                    <button
                        onClick={startSync}
                        disabled={isSynced}
                        className={`sync-btn ${isSynced ? 'synced' : ''}`}
                        style={{
                            background: isSynced ? '#4CAF50' : '#2196F3',
                            padding: '8px 20px',
                            borderRadius: '25px',
                            border: 'none',
                            color: 'white',
                            cursor: isSynced ? 'default' : 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        {isSynced ? '✅ Synced' : '🔗 Start Sync'}
                    </button>
                    <button onClick={onLeave} className="leave-btn">🚪 Leave Room</button>
                </div>
            </div>

            {/* Connection Status */}
            <div style={{
                fontSize: '12px',
                padding: '4px 20px',
                background: '#1a1a1a',
                borderBottom: '1px solid #2a2a2a',
                color: syncSocket?.connected ? '#4CAF50' : '#ff9800',
                textAlign: 'center'
            }}>
                📡 Socket: {syncSocket?.connected ? '🟢 Connected' : '🟡 Connecting...'} |
                Transport: {syncSocket?.io?.engine?.transport?.name || 'N/A'}
            </div>

            <div className="sync-status-bar" style={{
                background: '#1a1a1a',
                padding: '8px 20px',
                fontSize: '12px',
                color: isSynced ? '#4CAF50' : '#B0B0B0',
                borderBottom: '1px solid #2a2a2a'
            }}>
                {isSynced ? '✅ ' : '⏳ '} Status: {syncStatus}
            </div>

            {/* ============================================ */}
            {/* STEP 7: READY STATE UI - Shows buffering progress */}
            {/* ============================================ */}
            {isPreparing && (
                <div style={{
                    background: '#1a1a1a',
                    padding: '15px 20px',
                    borderBottom: '1px solid #2a2a2a',
                    textAlign: 'center'
                }}>
                    <div style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                        🎵 Preparing to sync...
                    </div>
                    <div style={{ fontSize: '14px', marginTop: '5px' }}>
                        {!isDeviceReady ? (
                            `Buffering: ${Math.round(bufferingProgress)}%`
                        ) : (
                            `✅ Ready! Waiting for ${totalDevices - readyCount} more device${totalDevices - readyCount !== 1 ? 's' : ''}...`
                        )}
                    </div>
                    <div style={{
                        width: '100%',
                        height: '4px',
                        background: '#2a2a2a',
                        borderRadius: '2px',
                        marginTop: '10px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${bufferingProgress}%`,
                            height: '100%',
                            background: '#4CAF50',
                            transition: 'width 0.3s'
                        }} />
                    </div>
                </div>
            )}

            <div className="three-columns">

                {/* COLUMN 1: SEARCH */}
                <div className="column search-column">
                    <div className="column-header">
                        <h3>🔍 Search Music</h3>
                    </div>

                    <div className="source-tabs">
                        <button
                            className={`source-tab ${selectedSource === 'youtube' ? 'active' : ''}`}
                            onClick={() => setSelectedSource('youtube')}
                        >
                            🎬 YouTube
                        </button>
                        <button className="source-tab disabled" disabled>🎵 Spotify (Soon)</button>
                    </div>

                    <div className="search-bar">
                        <input
                            type="text"
                            placeholder="Search for a song..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && searchYouTube()}
                        />
                        <button onClick={searchYouTube} disabled={searchLoading}>
                            {searchLoading ? '...' : '🔍'}
                        </button>
                    </div>

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
                    {isHost && (
                        <div className="host-tip">
                            ✨ Share code: <strong>{roomCode}</strong>
                        </div>
                    )}
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
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
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