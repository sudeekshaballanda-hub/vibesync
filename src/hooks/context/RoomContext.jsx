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
    const [currentTime, setCurrentTime] = useState(0);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef(null);
    const audioRef = useRef(null);

    // Connect to backend
    useEffect(() => {
        const wsUrl = 'wss://vibesync-backend.onrender.com'; // Replace with your Render URL
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
            console.log('WebSocket connected');
            setConnected(true);
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleSocketMessage(data);
        };

        socket.onclose = () => {
            console.log('WebSocket disconnected');
            setConnected(false);
        };

        return () => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        };
    }, []);

    const handleSocketMessage = (data) => {
        switch (data.type) {
            case 'room-state':
                setCurrentTrack(data.currentTrack);
                setIsPlaying(data.isPlaying);
                setCurrentTime(data.currentTime);
                setMessages(data.messages || []);
                setHostName(data.hostName);
                setMembers(data.listeners || []);
                break;

            case 'listener-joined':
                setMembers(prev => [...prev, { id: data.id, name: data.name }]);
                break;

            case 'members-update':
                setHostName(data.hostName);
                setMembers(data.listeners || []);
                break;

            case 'track-loaded':
                setCurrentTrack(data);
                if (!isHost && audioRef.current) {
                    audioRef.current.src = data.url;
                }
                break;

            case 'sync-play':
                if (!isHost) {
                    setIsPlaying(true);
                    if (audioRef.current) {
                        audioRef.current.currentTime = 0;
                        audioRef.current.play();
                    }
                }
                break;

            case 'sync-pause':
                if (!isHost) {
                    setIsPlaying(false);
                    if (audioRef.current) {
                        audioRef.current.pause();
                    }
                }
                break;

            case 'sync-seek':
                if (!isHost && audioRef.current) {
                    audioRef.current.currentTime = data.position / 1000;
                    setCurrentTime(data.position);
                }
                break;

            case 'new-message':
                setMessages(prev => [...prev, data]);
                break;

            case 'host-disconnected':
                alert('Host has left the room. You will be redirected.');
                setRoomCode(null);
                setIsHost(false);
                setMembers([]);
                break;

            default:
                console.log('Unknown message type:', data.type);
        }
    };

    const sendMessage = (type, data = {}) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type, ...data }));
        }
    };

    const createRoom = async (name) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        sendMessage('create-room', { code: roomCode, name });
        setRoomCode(roomCode);
        setIsHost(true);
        setHostName(name);
        setMembers([]);
        return roomCode;
    };

    const joinRoom = async (code, name) => {
        sendMessage('join-room', { code, name });
        setRoomCode(code);
        setIsHost(false);
    };

    const leaveRoom = () => {
        sendMessage('leave-room', {});
        setRoomCode(null);
        setIsHost(false);
        setMembers([]);
        setCurrentTrack(null);
    };

    const loadTrack = (track) => {
        setCurrentTrack(track);
        sendMessage('load-track', track);
    };

    const play = () => {
        setIsPlaying(true);
        sendMessage('play-command', {});
    };

    const pause = () => {
        setIsPlaying(false);
        sendMessage('pause-command', { position: currentTime });
    };

    const seek = (position) => {
        setCurrentTime(position);
        sendMessage('seek-command', { position });
    };

    const sendChatMessage = (text) => {
        sendMessage('chat-message', { text, sender: null });
    };

    const value = {
        roomCode,
        members,
        hostName,
        currentTrack,
        isHost,
        messages,
        isPlaying,
        currentTime,
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