import React, { useState } from 'react';
import YouTubeSearch from './YouTubeSearch';
import { useRoom } from '../context/RoomContext';

export default function MusicPlayer() {
    const { isHost, loadTrack } = useRoom();
    const [source, setSource] = useState(null);

    const handleTrackSelect = (track) => {
        if (isHost) {
            loadTrack(track);
        }
    };

    // If not host, show "Waiting for Host" message
    if (!isHost) {
        return (
            <div className="listener-music-view">
                <div className="waiting-host">
                    <span className="host-icon">🎧</span>
                    <h3>Waiting for Host</h3>
                    <p>The host will choose and play music for everyone</p>
                </div>
            </div>
        );
    }

    if (!source) {
        return (
            <div className="music-source-selector">
                <h3>Select Music Source</h3>
                <div className="source-buttons">
                    <button className="source-btn youtube" onClick={() => setSource('youtube')}>
                        🎬 YouTube
                    </button>
                    <button className="source-btn spotify disabled" disabled>
                        🎵 Spotify (Coming Soon)
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="music-player-container">
            <button className="back-to-source" onClick={() => setSource(null)}>
                ← Change Source
            </button>
            {source === 'youtube' && (
                <YouTubeSearch onSelectTrack={handleTrackSelect} isHost={isHost} />
            )}
        </div>
    );
}