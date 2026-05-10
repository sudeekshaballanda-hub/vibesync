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

    // Sync related states
    const [syncSocket, setSyncSocket] = useState(null);
    const [isSynced, setIsSynced] = useState(false);
    const [syncStatus, setSyncStatus] = useState('Not Connected');
    const [roomMembers, setRoomMembers] = useState([]);

    const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || 'AIzaSyDv-8EXonJfRu-b2kYnPm2eiJYggp5e1Ew';

    // Connect to backend server
    useEffect(() => {
        // Use wss:// for secure WebSocket
        const BACKEND_URL = 'wss://vibesync-backend.onrender.com';

        console.log('Connecting to:', BACKEND_URL);

        const socket = io(BACKEND_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 30000,
            path: '/socket.io'
        });

        setSyncSocket(socket);

        socket.on('connect', () => {
            console.log('✅ Connected to sync server');
            setSyncStatus('Connected');
        });

        socket.on('disconnect', () => {
            console.log('❌ Disconnected');
            setSyncStatus('Disconnected');
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error.message);
            setSyncStatus('Connection failed');
        });

        socket.on('room-created', (data) => {
            console.log('Room created:', data);
            setSyncStatus('Room Ready - You are Host');
            setIsSynced(true);
        });

        socket.on('room-joined', (data) => {
            console.log('Room joined:', data);
            setSyncStatus('Joined Room - Waiting for Host');
            setIsSynced(true);
        });

        socket.on('listener-joined', ({ name, count }) => {
            console.log(`${name} joined`);
            setSyncStatus(`${count} listener${count !== 1 ? 's' : ''} in room`);
            // Add to members list
            setRoomMembers(prev => [...prev, { id: Date.now(), name }]);
        });

        socket.on('members-update', ({ hostName, listeners }) => {
            console.log('Members update:', { hostName, listeners });
            setRoomMembers(listeners || []);
            // Update context members if needed
            if (setMembers) setMembers(listeners || []);
        });

        socket.on('song-playing', ({ song, playedBy }) => {
            console.log(`Song playing from ${playedBy}:`, song);
            if (!isHost) {
                setSelectedSong(song);
                alert(`${playedBy} is playing: ${song.snippet?.title || song.title}`);
            }
        });

        socket.on('host-left', () => {
            alert('Host has left the room. Returning to home...');
            onLeave();
        });

        socket.on('error', (msg) => {
            console.error('Server error:', msg);
            alert(msg);
        });

        return () => {
            if (socket) socket.disconnect();
        };
    }, [isHost, onLeave, setMembers]);

    // Start sync function
    const startSync = () => {
        if (!syncSocket || !syncSocket.connected) {
            alert('Connecting to server... Please wait.');
            return;
        }

        if (isHost) {
            syncSocket.emit('create-room', { roomCode, hostName }, (response) => {
                if (response && response.success) {
                    setIsSynced(true);
                    setSyncStatus('Host - Sync Active');
                    alert('Sync started! Share the room code with friends.');
                } else {
                    alert('Failed to create room. Try again.');
                }
            });
        } else {
            syncSocket.emit('join-room', { roomCode, listenerName: hostName }, (response) => {
                if (response && response.success) {
                    setIsSynced(true);
                    setSyncStatus('Listener - Connected');
                    alert('Connected to host! Waiting for them to play music.');
                } else if (response && response.error) {
                    alert(response.error);
                } else {
                    alert('Failed to join room. Make sure the room code is correct.');
                }
            });
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

    const playSong = (video) => {
        setSelectedSong(video);
        if (isSynced && isHost && syncSocket && syncSocket.connected) {
            syncSocket.emit('play-song', { roomCode, song: video });
            alert(`Playing: ${video.snippet.title} - Broadcasting to all listeners!`);
        } else if (isHost && !isSynced) {
            alert('Please click "Start Sync" first before playing songs.');
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
                        width="100%"
                        height="400"
                        src={`https://www.youtube.com/embed/${selectedSong.id.videoId}?autoplay=1`}
                        title={selectedSong.snippet.title}
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

            <div className="sync-status-bar" style={{
                background: '#1a1a1a',
                padding: '8px 20px',
                fontSize: '12px',
                color: isSynced ? '#4CAF50' : '#B0B0B0',
                borderBottom: '1px solid #2a2a2a'
            }}>
                {isSynced ? '✅ ' : '⏳ '} Status: {syncStatus}
            </div>

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