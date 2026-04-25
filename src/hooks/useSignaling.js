import React from 'react';

export const useSignaling = () => {
  const [socket, setSocket] = React.useState(null);

  React.useEffect(() => {
    const mockSocket = { on: () => {}, emit: () => {}, off: () => {} };
    setSocket(mockSocket);
  }, []);

  const send = (event, data) => console.log(`Sending ${event}:`, data);
  const joinRoom = async (code) => { console.log(`Joining ${code}`); return code; };
  const createRoom = async () => { const code = Math.random().toString(36).substring(2, 8).toUpperCase(); console.log(`Created ${code}`); return code; };
  const leaveRoom = () => console.log('Leaving room');

  return { socket, send, joinRoom, createRoom, leaveRoom };
};
