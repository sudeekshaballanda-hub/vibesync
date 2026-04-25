import React, { useState } from 'react';
import axios from 'axios';

const YouTubeSearch = ({ onSelectTrack, isHost }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedVideo, setSelectedVideo] = useState(null);

    // USE THE API KEY THAT WORKED IN CONSOLE TEST
    const YOUTUBE_API_KEY = 'AIzaSyBtpAFBcBI9l6h_Py6_XspGMyX-5napnBY';

    const searchYouTube = async () => {
        if (!searchQuery.trim()) {
            alert('Please enter a search term');
            return;
        }

        setLoading(true);
        console.log('Searching for:', searchQuery);

        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(searchQuery)}&type=video&key=${YOUTUBE_API_KEY}`;
            console.log('Request URL:', url);

            const response = await axios.get(url);
            console.log('Response:', response.data);

            if (response.data.items) {
                setResults(response.data.items);
            } else {
                setResults([]);
                alert('No results found');
            }
        } catch (error) {
            console.error('Full error:', error);
            console.error('Error response:', error.response?.data);
            const errorMessage = error.response?.data?.error?.message || 'Unknown error';
            alert(`Search failed: ${errorMessage}`);
        }
        setLoading(false);
    };

    const playVideo = (video) => {
        console.log('Playing video:', video.snippet.title);
        const videoUrl = `https://www.youtube.com/embed/${video.id.videoId}?autoplay=1&mute=1`;
        setSelectedVideo({ ...video, embedUrl: videoUrl });

        if (isHost && onSelectTrack) {
            onSelectTrack({
                source: 'youtube',
                id: video.id.videoId,
                title: video.snippet.title,
                artist: video.snippet.channelTitle,
                thumbnail: video.snippet.thumbnails?.medium?.url,
                url: videoUrl
            });
        }
    };

    return (
        <div className="youtube-search">
            {!selectedVideo ? (
                <>
                    <div className="search-bar">
                        <input
                            type="text"
                            placeholder="Search YouTube for songs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && searchYouTube()}
                        />
                        <button onClick={searchYouTube} disabled={loading}>
                            {loading ? '🔍 Searching...' : '🎵 Search'}
                        </button>
                    </div>

                    <div className="search-results">
                        {results.map((item) => (
                            <div key={item.id.videoId} className="track-card" onClick={() => playVideo(item)}>
                                <img
                                    src={item.snippet.thumbnails?.medium?.url || 'https://via.placeholder.com/80'}
                                    alt={item.snippet.title}
                                    className="track-thumb"
                                />
                                <div className="track-details">
                                    <div className="track-title">{item.snippet.title.substring(0, 50)}</div>
                                    <div className="track-artist">{item.snippet.channelTitle}</div>
                                </div>
                                {isHost && <button className="play-btn">▶ Play</button>}
                            </div>
                        ))}
                    </div>

                    {results.length === 0 && !loading && (
                        <p className="no-results">Search for a song to get started!</p>
                    )}
                </>
            ) : (
                <div className="video-player">
                    <button className="back-btn" onClick={() => setSelectedVideo(null)}>
                        ← Search More Songs
                    </button>
                    <div className="video-container">
                        <iframe
                            title={selectedVideo.snippet.title}
                            width="100%"
                            height="315"
                            src={selectedVideo.embedUrl}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                    <div className="now-playing">
                        🎵 Now Playing: <strong>{selectedVideo.snippet.title}</strong>
                    </div>
                </div>
            )}
        </div>
    );
};

export default YouTubeSearch;