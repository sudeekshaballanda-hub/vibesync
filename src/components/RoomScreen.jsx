import React, { useState } from 'react';
import { useRoom } from '../context/RoomContext';
import './RoomScreen.css';

export default function RoomScreen() {
    const {
        roomCode,
        members,
        hostName,
        isHost,
        messages,
        sendChatMessage,
        leaveRoom
    } = useRoom();

    const [chatInput, setChatInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedSource, setSelectedSource] = useState('youtube');
    const [selectedVideo, setSelectedVideo] = useState(null);

    const YOUTUBE_API_KEY = 'AIzaSyBtpAFBcBI916h_Py6_XspGMYx-5napnBY';

    const searchYouTube = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        try {
            const res = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(searchQuery)}&type=video&key=${YOUTUBE_API_KEY}`
            );
            const data = await res.json();
            setSearchResults(data.items || []);
        } catch (err) {
            console.error(err);
        }
        setSearchLoading(false);
    };

    const playSong = (video) => {
        setSelectedVideo(video);
    };

    const sendMessage = () => {
        if (chatInput.trim()) {
            sendChatMessage(chatInput.trim());
            setChatInput('');
        }
    };

    // If a song is selected, show player
    if (selectedVideo) {
        return (
            <div className="room">
                <div className="room-header">
                    <h2>🎵 Now Playing</h2>
                    <button onClick={() => setSelectedVideo(null)} className="back-btn">← Back to Room</button>
                </div>
                <div className="player-container">
                    <h3>{selectedVideo.snippet.title}</h3>
                    <iframe
                        width="100%"
                        height="400"
                        src={`https://www.youtube.com/embed/${selectedVideo.id.videoId}?autoplay=1`}
                        title={selectedVideo.snippet.title}
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
                <button onClick={leaveRoom} className="leave-btn">🚪 Leave Room</button>
            </div>

            {/* Three Column Layout */}
            <div className="three-columns">

                {/* LEFT COLUMN - SEARCH */}
                <div className="column search-column">
                    <div className="column-header">
                        <h3>🔍 Search Music</h3>
                    </div>

                    {/* Source Selection */}
                    <div className="source-tabs">
                        <button
                            className={`source-tab ${selectedSource === 'youtube' ? 'active' : ''}`}
                            onClick={() => setSelectedSource('youtube')}
                        >
                            🎬 YouTube
                        </button>
                        <button
                            className={`source-tab ${selectedSource === 'spotify' ? 'active' : ''} disabled`}
                            disabled
                        >
                            🎵 Spotify (Soon)
                        </button>
                    </div>

                    {/* Search Bar */}
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

                    {/* Search Results */}
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

                {/* MIDDLE COLUMN - MEMBERS */}
                <div className="column members-column">
                    <div className="column-header">
                        <h3>👥 Room Members</h3>
                        <span className="member-count">{(members?.length || 0) + 1}</span>
                    </div>
                    <div className="members-list">
                        <div className="member-item host">
                            <span className="member-avatar">👑</span>
                            <span className="member-name">{hostName || 'Host'}</span>
                            <span className="member-role">Host</span>
                            {isHost && <span className="you-tag">You</span>}
                        </div>
                        {members?.map((member) => (
                            <div key={member.id} className="member-item">
                                <span className="member-avatar">🎧</span>
                                <span className="member-name">{member.name}</span>
                                <span className="member-role">Listener</span>
                            </div>
                        ))}
                    </div>
                    {isHost && (
                        <div className="host-tip">
                            ✨ Share this code: <strong>{roomCode}</strong>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN - CHAT */}
                <div className="column chat-column">
                    <div className="column-header">
                        <h3>💬 Group Chat</h3>
                    </div>
                    <div className="chat-messages">
                        {messages?.length === 0 ? (
                            <div className="empty-state">💭 No messages yet. Start the conversation!</div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={msg.id || idx} className="chat-message">
                                    <div className="chat-sender">{msg.sender || 'Anonymous'}</div>
                                    <div className="chat-text">{msg.text}</div>
                                    <div className="chat-time">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="chat-input-area">
                        <input
                            type="text"
                            placeholder={isHost ? "Broadcast to everyone..." : "Type your message..."}
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