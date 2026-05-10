const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();

// Enable CORS for all origins
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["Content-Type"]
    },
    transports: ['websocket', 'polling']
});

// Simple test route
app.get('/', (req, res) => {
    res.json({ message: 'VibeSync Backend is running!' });
});

// Store rooms and their data
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('✅ New client connected:', socket.id);

    // Create room (Host)
    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: [],
            currentSong: null,
            isPlaying: false
        });
        socket.data.roomCode = roomCode;
        socket.data.isHost = true;

        console.log(`📢 Room created: ${roomCode} by ${hostName}`);
        socket.emit('room-created', { roomCode });
    });

    // Join room (Listener)
    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);

        if (room) {
            socket.join(roomCode);
            room.listeners.push({ id: socket.id, name: listenerName });
            socket.data.roomCode = roomCode;
            socket.data.isHost = false;
            socket.data.name = listenerName;

            // Notify host
            io.to(room.hostId).emit('listener-joined', {
                name: listenerName,
                count: room.listeners.length
            });

            // Notify all listeners about updated member list
            io.to(roomCode).emit('members-update', {
                hostName: room.hostName,
                listeners: room.listeners
            });

            console.log(`👤 ${listenerName} joined room ${roomCode}`);
            socket.emit('room-joined', { roomCode });
        } else {
            console.log(`❌ Room not found: ${roomCode}`);
            socket.emit('error', 'Room not found');
        }
    });

    // Host plays a song
    socket.on('play-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentSong = song;
            room.isPlaying = true;

            // Broadcast to ALL clients in room (including host)
            io.to(roomCode).emit('song-playing', {
                song,
                startTime: Date.now(),
                playedBy: room.hostName
            });

            console.log(`▶️ Host playing: ${song.snippet?.title || song.title} in room ${roomCode}`);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);

        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id) {
                io.to(code).emit('host-left', { message: 'Host has left the room' });
                rooms.delete(code);
                console.log(`🔒 Room ${code} closed (host left)`);
                break;
            }

            const listenerIndex = room.listeners.findIndex(l => l.id === socket.id);
            if (listenerIndex !== -1) {
                const removedListener = room.listeners.splice(listenerIndex, 1);
                console.log(`👋 ${removedListener[0]?.name} left room ${code}`);
                io.to(code).emit('members-update', {
                    hostName: room.hostName,
                    listeners: room.listeners
                });
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 VibeSync Sync Server running on port ${PORT}`);
    console.log(`📍 WebSocket endpoint: ws://0.0.0.0:${PORT}`);
});