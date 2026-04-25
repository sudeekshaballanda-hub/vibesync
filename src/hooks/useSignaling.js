import React from 'react';

export const useSignaling = () => {
  const [socket, setSocket] = React.useState(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    // Connect to live backend on Render
    // IMPORTANT: Replace with your actual Render backend URL
    const wsUrl = 'https://vibesync-o3j5.onrender.com';

    console.log('Connecting to WebSocket:', wsUrl);

    // Create WebSocket connection
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✅ WebSocket connected to server');
      setConnected(true);
      setSocket(ws);
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      setConnected(false);
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected');
      setConnected(false);
    };

    // Cleanup on component unmount
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  const send = (event, data) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: event, data }));
      console.log(`📤 Sent ${event}:`, data);
    } else {
      console.warn(`⚠️ Cannot send ${event}: WebSocket not connected`);
    }
  };

  const joinRoom = async (code, name) => {
    return new Promise((resolve) => {
      send('join-room', { code, name });
      console.log(`🎧 Joining room: ${code} as ${name}`);
      resolve(code);
    });
  };

  const createRoom = async (name) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    send('create-room', { code, name });
    console.log(`🎤 Created room: ${code} as ${name}`);
    return code;
  };

  const leaveRoom = () => {
    send('leave-room', {});
    console.log(`🚪 Leaving room`);
  };

  return {
    socket,
    send,
    joinRoom,
    createRoom,
    leaveRoom,
    connected
  };
};