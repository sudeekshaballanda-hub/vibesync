// Spotify API Configuration
const CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID'; // Get from Spotify Developer Dashboard
const REDIRECT_URI = window.location.origin + '/callback';
const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'playlist-read-private',
    'playlist-read-collaborative'
].join(' ');

// Store token in localStorage
export const getAccessToken = () => localStorage.getItem('spotify_access_token');
export const setAccessToken = (token) => localStorage.setItem('spotify_access_token', token);
export const clearAccessToken = () => localStorage.removeItem('spotify_access_token');

// Check if token is valid
export const isTokenValid = () => {
    const expiry = localStorage.getItem('spotify_token_expiry');
    return expiry && Date.now() < parseInt(expiry);
};

// Redirect to Spotify login
export const loginToSpotify = () => {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}`;
    window.location.href = authUrl;
};

// Parse token from URL hash (for callback page)
export const handleAuthCallback = () => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    
    if (accessToken) {
        setAccessToken(accessToken);
        const expiry = Date.now() + (parseInt(expiresIn) * 1000);
        localStorage.setItem('spotify_token_expiry', expiry);
        window.location.hash = '';
        return true;
    }
    return false;
};

// Search Spotify
export const searchSpotify = async (query, type = 'track') => {
    const token = getAccessToken();
    if (!token) return [];
    
    try {
        const response = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=20`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const data = await response.json();
        return data.tracks?.items || [];
    } catch (error) {
        console.error('Spotify search error:', error);
        return [];
    }
};

// Get user playlists
export const getUserPlaylists = async () => {
    const token = getAccessToken();
    if (!token) return [];
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/playlists', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        return data.items || [];
    } catch (error) {
        console.error('Get playlists error:', error);
        return [];
    }
};

// Get playlist tracks
export const getPlaylistTracks = async (playlistId) => {
    const token = getAccessToken();
    if (!token) return [];
    
    try {
        const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        return data.items?.map(item => item.track) || [];
    } catch (error) {
        console.error('Get playlist tracks error:', error);
        return [];
    }
};