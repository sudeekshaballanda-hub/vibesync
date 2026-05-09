const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);

    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: []
        });
        socket.emit('room-created', { roomCode });
        console.log(`📢 Room created: ${roomCode} by ${hostName}`);
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
            io.to(roomCode).emit('song-playing', { song });
            console.log(`▶️ Playing song in ${roomCode}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id) {
                io.to(code).emit('host-left');
                rooms.delete(code);
                console.log(`🔒 Room ${code} closed`);
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Sync Server running on port ${PORT}`);
});