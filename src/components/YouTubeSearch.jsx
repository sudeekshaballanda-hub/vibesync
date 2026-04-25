import React, { useState } from 'react';

const YouTubeSearch = ({ onSelectTrack, isHost }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedVideo, setSelectedVideo] = useState(null);

    const YOUTUBE_API_KEY = 'AIzaSyBtpAFBcBI916h_Py6_XspGMYx-5napnBY';

    const searchYouTube = async () => {
        if (!searchQuery.trim()) return;

        setLoading(true);
        try {
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(searchQuery)}&type=video&key=${YOUTUBE_API_KEY}`
            );
            const data = await response.json();
            console.log('Search results:', data);
            setResults(data.items || []);
        } catch (error) {
            console.error('Search error:', error);
            alert('Search failed');
        }
        setLoading(false);
    };

    const playVideo = (video) => {
        setSelectedVideo(video);
        if (isHost && onSelectTrack) {
            onSelectTrack({
                source: 'youtube',
                id: video.id.videoId,
                title: video.snippet.title,
                artist: video.snippet.channelTitle,
                url: `https://www.youtube.com/embed/${video.id.videoId}?autoplay=1`
            });
        }
    };

    if (selectedVideo) {
        return (
            <div>
                <button onClick={() => setSelectedVideo(null)}>← Back</button>
                <div>
                    <h3>{selectedVideo.snippet.title}</h3>
                    <iframe
                        width="100%"
                        height="300"
                        src={`https://www.youtube.com/embed/${selectedVideo.id.videoId}?autoplay=1`}
                        title={selectedVideo.snippet.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay;"
                        allowFullScreen
                    />
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="search-bar">
                <input
                    type="text"
                    placeholder="Search YouTube..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchYouTube()}
                    style={{ width: '70%', padding: '10px' }}
                />
                <button onClick={searchYouTube} disabled={loading} style={{ padding: '10px 20px' }}>
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </div>
            <div className="search-results" style={{ marginTop: '20px' }}>
                {results.map((item) => (
                    <div
                        key={item.id.videoId}
                        onClick={() => playVideo(item)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px',
                            borderBottom: '1px solid #333',
                            cursor: 'pointer'
                        }}
                    >
                        <img
                            src={item.snippet.thumbnails?.default?.url}
                            alt={item.snippet.title}
                            style={{ width: '80px' }}
                        />
                        <div>
                            <div style={{ fontWeight: 'bold' }}>{item.snippet.title}</div>
                            <div style={{ fontSize: '12px', color: '#B0B0B0' }}>{item.snippet.channelTitle}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default YouTubeSearch;