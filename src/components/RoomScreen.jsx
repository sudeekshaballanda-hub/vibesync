import React from 'react';
import { useRoom } from '../context/RoomContext';
import MusicPlayer from './MusicPlayer';
import MembersPanel from './MembersPanel';
import Chat from './Chat';

export default function RoomScreen() {
    const {
        roomCode,
        members,
        hostName,
        currentTrack,
        isHost,
        messages,
        isPlaying,
        sendChatMessage,
        leaveRoom
    } = useRoom();

    const handleSendMessage = (text) => {
        sendChatMessage(text);
    };

    return (
        <div className="room-container">
            <div className="room-header">
                <div className="room-info">
                    <h2>🎵 VibeSync Room</h2>
                    <p>Room Code: <strong>{roomCode}</strong></p>
                </div>
                <button onClick={leaveRoom} className="leave-btn">
                    🚪 Leave Room
                </button>
            </div>

            <div className="room-content">
                <div className="main-panel">
                    <div className="player-section">
                        <MusicPlayer />
                    </div>
                    <div className="chat-section">
                        <Chat
                            messages={messages}
                            onSendMessage={handleSendMessage}
                            roomCode={roomCode}
                        />
                    </div>
                </div>
                <div className="sidebar">
                    <MembersPanel
                        members={members}
                        hostName={hostName}
                        isHost={isHost}
                        roomCode={roomCode}
                    />
                </div>
            </div>

            {currentTrack && (
                <div className="now-playing-bar">
                    <span>🎵 Now Playing:</span>
                    <span>{currentTrack.title}</span>
                    {isPlaying ? '▶ Playing' : '⏸ Paused'}
                </div>
            )}
        </div>
    );
}