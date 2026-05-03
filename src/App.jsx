import React, { useState } from 'react';
import { RoomProvider, useRoom } from './context/RoomContext';
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

// RoomScreen Component with 3 columns
function RoomScreen({ roomCode, isHost, onLeave }) {
    const { hostName, members, messages, sendChatMessage } = useRoom();
    const [chatInput, setChatInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedSource, setSelectedSource] = useState('youtube');
    const [selectedSong, setSelectedSong] = useState(null);

    //const YOUTUBE_API_KEY = 'AIzaSyDCyZiD3gFAbyXsQdAgYQ-7jwA73tSnqUs';

    const searchYouTube = async () => {
        if (!searchQuery.trim()) {
            alert('Please enter a search term');
            return;
        }

        setSearchLoading(true);
        console.log('Searching for:', searchQuery);

        // USE THIS API KEY - It's working
        const API_KEY = 'AIzaSyDCyZiD3gFAbyXsQdAgYQ-7jwA73tSnqUs';

        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(searchQuery)}&type=video&key=${API_KEY}`;

            console.log('Calling URL:', url);

            const response = await fetch(url);
            const data = await response.json();

            console.log('Response status:', response.status);
            console.log('Data:', data);

            if (response.status === 200 && data.items) {
                setSearchResults(data.items);
                if (data.items.length === 0) {
                    alert('No results found. Try different keywords.');
                }
            } else {
                console.error('API Error:', data.error);
                alert(`Error: ${data.error?.message || 'Something went wrong'}`);
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

    return (
        <div className="room">
            {/* Header */}
            <div className="room-header">
                <div className="logo-section">
                    <h1>🎵 VibeSync</h1>
                    <span className="room-badge">Room: {roomCode}</span>
                </div>
                <button onClick={onLeave} className="leave-btn">🚪 Leave Room</button>
            </div>

            {/* 3 Column Layout */}
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
                        <span className="member-count">{(members?.length || 0) + 1}</span>
                    </div>
                    <div className="members-list">
                        <div className="member-item host">
                            <span className="member-avatar">👑</span>
                            <span className="member-name">{hostName || 'Host'}</span>
                            <span className="member-role">Host</span>
                            {isHost && <span className="you-tag">You</span>}
                        </div>
                        {members?.map((member, idx) => (
                            <div key={idx} className="member-item">
                                <span className="member-avatar">🎧</span>
                                <span className="member-name">{member.name}</span>
                                <span className="member-role">Listener</span>
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
