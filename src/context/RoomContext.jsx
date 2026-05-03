import React, { createContext, useContext, useState } from 'react';

const RoomContext = createContext();

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }) => {
  const [roomCode, setRoomCode] = useState(null);
  const [members, setMembers] = useState([]);
  const [hostName, setHostName] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [messages, setMessages] = useState([]);

  const createRoom = (name) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
    setIsHost(true);
    setHostName(name);
    return code;
  };

  const joinRoom = (code, name) => {
    setRoomCode(code);
    setIsHost(false);
    setHostName(name);
    // Add listener to members list
    setMembers(prev => [...prev, { id: Date.now(), name }]);
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
  };

  return (
    <RoomContext.Provider value={{
      roomCode,
      members,
      hostName,
      isHost,
      messages,
      createRoom,
      joinRoom,
      sendChatMessage,
      leaveRoom
    }}>
      {children}
    </RoomContext.Provider>
  );
};