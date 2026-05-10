import React, { createContext, useContext, useState } from 'react';

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
  const [roomCode, setRoomCode] = useState(null);
  const [members, setMembers] = useState([]);
  const [hostName, setHostName] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const createRoom = (name) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
    setIsHost(true);
    setHostName(name);
    setMembers([]);
    setMessages([]);
    return code;
  };

  const joinRoom = (code, name) => {
    setRoomCode(code);
    setIsHost(false);
    setHostName(name);
    setMessages([]);
  };

  const sendChatMessage = (text) => {
    const newMsg = {
      text,
      sender: isHost ? hostName : 'Listener',
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMsg]);
  };

  const leaveRoom = () => {
    setRoomCode(null);
    setIsHost(false);
    setMembers([]);
    setMessages([]);
    setCurrentTrack(null);
    setIsPlaying(false);
  };

  const loadTrack = (track) => {
    setCurrentTrack(track);
  };

  const playTrack = () => {
    setIsPlaying(true);
  };

  const pauseTrack = () => {
    setIsPlaying(false);
  };

  const updateMembers = (newMembers) => {
    setMembers(newMembers);
  };

  const addMember = (member) => {
    setMembers(prev => [...prev, member]);
  };

  const removeMember = (memberId) => {
    setMembers(prev => prev.filter(m => m.id !== memberId));
  };

  const value = {
    // State
    roomCode,
    members,
    hostName,
    isHost,
    messages,
    currentTrack,
    isPlaying,

    // Setters
    setMembers,
    setMessages,
    setCurrentTrack,
    setIsPlaying,

    // Actions
    createRoom,
    joinRoom,
    sendChatMessage,
    leaveRoom,
    loadTrack,
    playTrack,
    pauseTrack,
    updateMembers,
    addMember,
    removeMember,
  };

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
};