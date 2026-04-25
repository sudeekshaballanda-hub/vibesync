import React, { useState } from 'react';
import YouTubeSearch from './YouTubeSearch';
import { useRoom } from '../context/RoomContext';

export default function MusicPlayer() {
    const { isHost, loadTrack } = useRoom();
    const [source, setSource] = useState(null);

    const handleTrackSelect = (track) => {
        if (isHost) {
            console.log('Loading track:', track);
            loadTrack(track);
        }
    };

    // Always show YouTube for demonstration
    if (!source) {
        return (
            <div className="music-source-selector" style={{ padding: '20px', textAlign: 'center' }}>
                <h3 style={{ color: 'white', marginBottom: '20px' }}>Select Music Source</h3>
                <div className="source-buttons">
                    <button
                        className="source-btn youtube"
                        onClick={() => setSource('youtube')}
                        style={{
                            background: '#FF0000',
                            color: 'white',
                            padding: '15px 30px',
                            fontSize: '16px',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            margin: '10px'
                        }}
                    >
                        🎬 YouTube
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="music-player-container" style={{ padding: '20px' }}>
            <button
                className="back-to-source"
                onClick={() => setSource(null)}
                style={{
                    background: '#333',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    color: 'white',
                    cursor: 'pointer',
                    marginBottom: '20px'
                }}
            >
                ← Change Source
            </button>
            {source === 'youtube' && (
                <YouTubeSearch onSelectTrack={handleTrackSelect} isHost={isHost} />
            )}
        </div>
    );
}