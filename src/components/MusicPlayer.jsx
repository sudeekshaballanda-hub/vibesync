import React, { useState } from 'react';
import YouTubeSearch from './YouTubeSearch';
import { useRoom } from '../context/RoomContext';

export default function MusicPlayer() {
    const { isHost, loadTrack } = useRoom();
    const [source, setSource] = useState(null);

    const handleTrackSelect = (track) => {
        if (isHost) {
            loadTrack(track);
            console.log('Track loaded:', track);
        }
    };

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