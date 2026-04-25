import React from 'react';

const RoomContext = React.createContext();

export const useRoom = () => React.useContext(RoomContext);

export const RoomProvider = ({ children }) => {
  const [roomCode, setRoomCode] = React.useState(null);
  const [members, setMembers] = React.useState([]);
  const [currentTrack, setCurrentTrack] = React.useState(null);
  const [isHost, setIsHost] = React.useState(false);
  const [messages, setMessages] = React.useState([]);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  const createRoom = async () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
    setIsHost(true);
    setMembers([{ id: 'host', name: 'Host', isMe: true }]);
    return code;
  };

  const joinRoom = async (code) => {
    setRoomCode(code);
    setIsHost(false);
    setMembers([{ id: 'listener', name: 'Listener', isMe: true }]);
  };

  const leaveRoom = () => {
    setRoomCode(null);
    setIsHost(false);
    setMembers([]);
    setCurrentTrack(null);
  };

  const loadTrack = (track) => {
    setCurrentTrack(track);
    setDuration(track.duration || 180);
  };

  const play = () => setIsPlaying(true);
  const pause = () => setIsPlaying(false);
  const seek = (position) => setCurrentTime(position);
  const sendMessage = (text) => {
    const message = { text, sender: isHost ? 'Host' : 'You', timestamp: Date.now() };
    setMessages(prev => [...prev, message]);
  };

  const value = {
    roomCode, members, currentTrack, isHost, messages,
    isPlaying, currentTime, duration, isSynced: true, offset: 0,
    createRoom, joinRoom, leaveRoom, loadTrack, play, pause, seek, sendMessage,
  };

  return React.createElement(RoomContext.Provider, { value }, children);
};
