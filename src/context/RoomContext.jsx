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
  const [myName, setMyName] = useState('');

  // Connect to backend
  useEffect(() => {
    // Use your Render backend URL or local for testing
    const wsUrl = 'wss://vibesync-backend.onrender.com';
    // For local testing: 'ws://localhost:8080'

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
            console.log('Track loaded:', data);
            setCurrentTrack(data);
            break;

          case 'sync-play':
            console.log('Sync play received');
            setIsPlaying(true);
            break;

          case 'sync-pause':
            console.log('Sync pause received');
            setIsPlaying(false);
            break;

          case 'sync-seek':
            console.log('Sync seek:', data.position);
            setCurrentTime(data.position);
            break;

          case 'new-message':
            console.log('New message:', data);
            setMessages(prev => [...prev, data]);
            break;

          case 'host-disconnected':
            alert('Host has left the room. Redirecting to home...');
            setRoomCode(null);
            setIsHost(false);
            setMembers([]);
            setCurrentTrack(null);
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
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, []);

  const sendMessage = (type, data = {}) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const message = { type, ...data };
      console.log('📤 Sending:', message);
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send:', type);
    }
  };

  const createRoom = async (name) => {
    setMyName(name);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    sendMessage('create-room', { code, name });
    setRoomCode(code);
    setIsHost(true);
    setHostName(name);
    setMembers([]);
    setMessages([]);
    return code;
  };

  const joinRoom = async (code, name) => {
    setMyName(name);
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
    setMessages([]);
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
    const message = {
      text,
      sender: myName || (isHost ? hostName : 'Listener'),
      timestamp: new Date().toISOString()
    };
    sendMessage('chat-message', message);
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
    myName,
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