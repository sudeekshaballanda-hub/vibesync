const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling']
});

const rooms = new Map();
const NETWORK_BUFFER = 500; // milliseconds buffer for network delay

io.on('connection', (socket) => {
    console.log('✅ Connected:', socket.id);

    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: [],
            currentSong: null
        });
        socket.emit('room-created', { roomCode });
        console.log(`📢 Room ${roomCode} by ${hostName}`);
    });

    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.listeners.push({ id: socket.id, name: listenerName });
            io.to(room.hostId).emit('listener-joined', { name: listenerName });
            socket.emit('room-joined', { roomCode });
            console.log(`👤 ${listenerName} joined ${roomCode}`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('play-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentSong = song;

            // CRITICAL: Calculate exact play time with buffer
            const playAt = Date.now() + NETWORK_BUFFER;

            // Broadcast to ALL clients (including host via room broadcast)
            io.to(roomCode).emit('song-playing', {
                song,
                playAt: playAt,
                playedBy: room.hostName
            });

            console.log(`▶️ Playing in ${roomCode} at ${playAt} (buffer: ${NETWORK_BUFFER}ms)`);
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected:', socket.id);
        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id) {
                io.to(code).emit('host-left');
                rooms.delete(code);
                break;
            }
            const idx = room.listeners.findIndex(l => l.id === socket.id);
            if (idx !== -1) room.listeners.splice(idx, 1);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));