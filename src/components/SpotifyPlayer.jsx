import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WebPlaybackSDK, useSpotifyPlayer, usePlaybackState, useWebPlaybackSDKReady } from 'react-spotify-web-playback-sdk';
import { getAccessToken, searchSpotify, getUserPlaylists, getPlaylistTracks } from '../services/SpotifyAuth';

const SpotifyPlayerComponent = ({ onTrackSelect, isHost, syncSocket, roomCode }) => {
    const [isReady, setIsReady] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [selectedView, setSelectedView] = useState('search'); // 'search', 'playlists'
    const [currentPlaylist, setCurrentPlaylist] = useState(null);
    const [playlistTracks, setPlaylistTracks] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(null);
    
    const player = useSpotifyPlayer();
    const playbackState = usePlaybackState(true, 500);
    const sdkReady = useWebPlaybackSDKReady();
    
    // Sync playback state with host commands
    useEffect(() => {
        if (!syncSocket) return;
        
        // Host broadcast play command
        syncSocket.on('spotify-host-play', () => {
            if (!isHost && player) {
                player.resume();
                setIsPlaying(true);
            }
        });
        
        syncSocket.on('spotify-host-pause', () => {
            if (!isHost && player) {
                player.pause();
                setIsPlaying(false);
            }
        });
        
        syncSocket.on('spotify-host-seek', ({ position }) => {
            if (!isHost && player) {
                player.seek(position);
            }
        });
        
        syncSocket.on('spotify-track-selected', ({ track, playAt }) => {
            if (!isHost && player) {
                const delay = Math.max(0, playAt - Date.now());
                setTimeout(() => {
                    playTrack(track.uri);
                }, delay);
            }
        });
        
        return () => {
            syncSocket.off('spotify-host-play');
            syncSocket.off('spotify-host-pause');
            syncSocket.off('spotify-host-seek');
            syncSocket.off('spotify-track-selected');
        };
    }, [syncSocket, isHost, player]);
    
    // Update playing state from SDK
    useEffect(() => {
        if (playbackState) {
            setIsPlaying(!playbackState.paused);
            if (playbackState.track_window?.current_track) {
                setCurrentTrack(playbackState.track_window.current_track);
            }
        }
    }, [playbackState]);
    
    // Get OAuth token for Spotify SDK
    const getOAuthToken = useCallback((callback) => {
        const token = getAccessToken();
        callback(token);
    }, []);
    
    // Host sends play command to all listeners
    const broadcastPlay = () => {
        if (isHost && syncSocket) {
            syncSocket.emit('spotify-host-play', { roomCode });
        }
    };
    
    // Host sends pause command to all listeners
    const broadcastPause = () => {
        if (isHost && syncSocket) {
            syncSocket.emit('spotify-host-pause', { roomCode });
        }
    };
    
    // Play a track with synchronization
    const playTrack = async (trackUri) => {
        if (!player) return;
        
        if (isHost) {
            // Host: load and play track
            await fetch(`https://api.spotify.com/v1/me/player/play`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${getAccessToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: [trackUri] })
            });
            
            // Calculate synchronized play time (500ms from now)
            const playAt = Date.now() + 500;
            
            // Broadcast track and play time to all listeners
            syncSocket.emit('spotify-track-selected', {
                roomCode,
                track: { uri: trackUri },
                playAt
            });
            
            // Get track details for display
            const trackInfo = searchResults.find(t => t.uri === trackUri) || 
                             playlistTracks.find(t => t.uri === trackUri);
            if (trackInfo && onTrackSelect) {
                onTrackSelect({
                    source: 'spotify',
                    id: trackInfo.id,
                    title: trackInfo.name,
                    artist: trackInfo.artists[0].name,
                    uri: trackUri,
                    duration: trackInfo.duration_ms
                });
            }
        } else {
            // Listener: just play at scheduled time
            // (handled by syncSocket event above)
        }
    };
    
    // Search Spotify
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsLoading(true);
        const results = await searchSpotify(searchQuery);
        setSearchResults(results);
        setIsLoading(false);
    };
    
    // Load playlists
    const loadPlaylists = async () => {
        setIsLoading(true);
        const userPlaylists = await getUserPlaylists();
        setPlaylists(userPlaylists);
        setIsLoading(false);
    };
    
    // Load playlist tracks
    const loadPlaylistTracks = async (playlistId, playlistName) => {
        setIsLoading(true);
        const tracks = await getPlaylistTracks(playlistId);
        setPlaylistTracks(tracks);
        setCurrentPlaylist({ id: playlistId, name: playlistName });
        setSelectedView('playlist-tracks');
        setIsLoading(false);
    };
    
    // Render track item
    const renderTrackItem = (track, index) => (
        <div key={track.id || index} className="track-item" onClick={() => playTrack(track.uri)}>
            {track.album?.images?.[0]?.url && (
                <img src={track.album.images[0].url} alt={track.name} className="track-thumb" />
            )}
            <div className="track-info">
                <div className="track-title">{track.name}</div>
                <div className="track-artist">{track.artists.map(a => a.name).join(', ')}</div>
            </div>
            {isHost && <button className="play-btn">▶ Play</button>}
        </div>
    );
    
    if (!sdkReady) {
        return <div className="spotify-loading">Loading Spotify Player...</div>;
    }
    
    return (
        <WebPlaybackSDK
            initialDeviceName="VibeSync Player"
            getOAuthToken={getOAuthToken}
            initialVolume={0.5}
            connectOnInitialized={true}
        >
            <div className="spotify-player">
                {isHost && (
                    <div className="spotify-controls">
                        {isPlaying ? (
                            <button onClick={broadcastPause} className="control-btn">⏸ Pause</button>
                        ) : (
                            <button onClick={broadcastPlay} className="control-btn">▶ Play</button>
                        )}
                        <span className="now-playing-text">
                            {currentTrack ? `Now Playing: ${currentTrack.name}` : 'Ready to play'}
                        </span>
                    </div>
                )}
                
                <div className="spotify-search-section">
                    <div className="view-tabs">
                        <button 
                            className={`view-tab ${selectedView === 'search' ? 'active' : ''}`}
                            onClick={() => setSelectedView('search')}
                        >
                            🔍 Search
                        </button>
                        <button 
                            className={`view-tab ${selectedView === 'playlists' ? 'active' : ''}`}
                            onClick={() => { setSelectedView('playlists'); loadPlaylists(); }}
                        >
                            📋 Playlists
                        </button>
                    </div>
                    
                    {selectedView === 'search' && (
                        <>
                            <div className="search-bar">
                                <input
                                    type="text"
                                    placeholder="Search Spotify for songs..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                />
                                <button onClick={handleSearch} disabled={isLoading}>
                                    {isLoading ? '...' : '🔍'}
                                </button>
                            </div>
                            <div className="search-results">
                                {searchResults.map(renderTrackItem)}
                                {searchResults.length === 0 && !isLoading && (
                                    <div className="empty-state">🎤 Search for a song to play</div>
                                )}
                            </div>
                        </>
                    )}
                    
                    {selectedView === 'playlists' && !currentPlaylist && (
                        <div className="playlists-list">
                            {playlists.map(playlist => (
                                <div 
                                    key={playlist.id} 
                                    className="playlist-item"
                                    onClick={() => loadPlaylistTracks(playlist.id, playlist.name)}
                                >
                                    {playlist.images?.[0]?.url && (
                                        <img src={playlist.images[0].url} alt={playlist.name} />
                                    )}
                                    <div className="playlist-info">
                                        <div className="playlist-name">{playlist.name}</div>
                                        <div className="playlist-tracks">{playlist.tracks.total} tracks</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {selectedView === 'playlist-tracks' && currentPlaylist && (
                        <>
                            <button className="back-btn" onClick={() => {
                                setSelectedView('playlists');
                                setCurrentPlaylist(null);
                                setPlaylistTracks([]);
                            }}>
                                ← Back to Playlists
                            </button>
                            <div className="search-results">
                                {playlistTracks.map(renderTrackItem)}
                            </div>
                        </>
                    )}
                </div>
                
                <div className="spotify-note">
                    {isHost && '🎧 You are the host. You control playback for everyone.'}
                    {!isHost && '🎧 You are a listener. The host controls all playback.'}
                </div>
            </div>
        </WebPlaybackSDK>
    );
};

export default SpotifyPlayerComponent;