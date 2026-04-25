import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
    const [roomCode, setRoomCode] = useState(null);
    const [members, setMembers] = useState([]);
    const [hostName, setHostName] = useState(null);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [messages, setMessages] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef(null);

    // Connect to backend
    useEffect(() => {
        // Use your actual Render backend URL here
        // For testing locally: 'ws://localhost:8080'
        const wsUrl = 'https://vibesync-o3j5.onrender.com';

        console.log('Connecting to WebSocket:', wsUrl);

        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
            console.log('✅ WebSocket connected');
            setConnected(true);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Received:', data.type, data);

                switch (data.type) {
                    case 'room-created':
                        setRoomCode(data.roomCode);
                        setIsHost(true);
                        setHostName(data.hostName);
                        break;

                    case 'room-joined':
                        setRoomCode(data.roomCode);
                        setIsHost(false);
                        setHostName(data.hostName);
                        setMembers(data.members || []);
                        setMessages(data.messages || []);
                        break;

                    case 'members-update':
                        setMembers(data.members || []);
                        break;

                    case 'new-message':
                        setMessages(prev => [...prev, data]);
                        break;

                    case 'track-loaded':
                        setCurrentTrack(data.track);
                        break;

                    case 'play-sync':
                        setIsPlaying(true);
                        break;

                    case 'pause-sync':
                        setIsPlaying(false);
                        break;

                    default:
                        console.log('Unknown message type:', data.type);
                }
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        };

        socket.onclose = () => {
            console.log('🔌 WebSocket disconnected');
            setConnected(false);
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            setConnected(false);
        };

        return () => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        };
    }, []);

    const sendMessage = (type, data = {}) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type, ...data }));
            console.log('📤 Sent:', type);
        } else {
            console.warn('⚠️ WebSocket not connected, cannot send:', type);
        }
    };

    const createRoom = async (name) => {
        if (!connected) {
            alert('Connecting to server... Please wait.');
            return null;
        }
        sendMessage('create-room', { name });
        return 'waiting';
    };

    const joinRoom = async (code, name) => {
        if (!connected) {
            alert('Connecting to server... Please wait.');
            return;
        }
        sendMessage('join-room', { code, name });
    };

    const leaveRoom = () => {
        sendMessage('leave-room', {});
        setRoomCode(null);
        setIsHost(false);
        setMembers([]);
        setCurrentTrack(null);
        setMessages([]);
    };

    const loadTrack = (track) => {
        sendMessage('load-track', { track, roomCode });
    };

    const play = () => {
        setIsPlaying(true);
        sendMessage('play', { roomCode });
    };

    const pause = () => {
        setIsPlaying(false);
        sendMessage('pause', { roomCode });
    };

    const seek = (position) => {
        sendMessage('seek', { roomCode, position });
    };

    const sendChatMessage = (text) => {
        sendMessage('chat-message', { roomCode, text, sender: isHost ? 'Host' : 'Listener' });
    };

    const value = {
        roomCode,
        members,
        hostName,
        currentTrack,
        isHost,
        messages,
        isPlaying,
        connected,
        createRoom,
        joinRoom,
        leaveRoom,
        loadTrack,
        play,
        pause,
        seek,
        sendChatMessage,
    };

    return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};