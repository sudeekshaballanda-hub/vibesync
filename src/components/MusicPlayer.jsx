import React, { useState } from 'react';
import YouTubeSearch from './YouTubeSearch';
import SpotifyPlayer from './SpotifyPlayer';
import { useRoom } from '../context/RoomContext';
import { getAccessToken, loginToSpotify } from '../services/SpotifyAuth';

export default function MusicPlayer() {
    const { isHost, loadTrack, syncSocket, roomCode } = useRoom();
    const [source, setSource] = useState(null);
    const [isSpotifyConnected, setIsSpotifyConnected] = useState(!!getAccessToken());

    const handleTrackSelect = (track) => {
        if (isHost) {
            loadTrack(track);
        }
    };

    const handleSpotifyConnect = () => {
        loginToSpotify();
    };

    if (!source) {
        return (
            <div className="music-source-selector">
                <h3>Select Music Source</h3>
                <div className="source-buttons">
                    <button className="source-btn youtube" onClick={() => setSource('youtube')}>
                        🎬 YouTube
                    </button>
                    <button className="source-btn spotify" onClick={() => {
                        if (!isSpotifyConnected) {
                            handleSpotifyConnect();
                        } else {
                            setSource('spotify');
                        }
                    }}>
                        🎵 Spotify
                    </button>
                </div>
                {!isSpotifyConnected && (
                    <p className="spotify-note">Click Spotify to connect your account (Premium required)</p>
                )}
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
            {source === 'spotify' && (
                <SpotifyPlayer 
                    onTrackSelect={handleTrackSelect} 
                    isHost={isHost}
                    syncSocket={syncSocket}
                    roomCode={roomCode}
                />
            )}
        </div>
    );
}