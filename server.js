const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();

app.use(cors({
    origin: '*',
    methods: ["GET", "POST", "OPTIONS"],
    credentials: false
}));

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'VibeSync Backend is running!',
        status: 'ok',
        socketIoPath: '/socket.io/',
        connectTo: 'https://vibesync-backend.onrender.com with path /socket.io/'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ["https://vibesync-alpha.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    // Allow WebSocket and polling
    transports: ['websocket', 'polling']
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('✅ Connected:', socket.id, 'Transport:', socket.conn.transport.name);

    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: [],
            currentSong: null
        });
        socket.data.roomCode = roomCode;
        socket.data.isHost = true;
        console.log(`📢 Room ${roomCode} by ${hostName}`);
        socket.emit('room-created', { roomCode });
    });

    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.listeners.push({ id: socket.id, name: listenerName });
            socket.data.roomCode = roomCode;
            socket.data.isHost = false;
            io.to(room.hostId).emit('listener-joined', { name: listenerName });
            io.to(roomCode).emit('members-update', {
                hostName: room.hostName,
                listeners: room.listeners
            });
            console.log(`👤 ${listenerName} joined ${roomCode}`);
            socket.emit('room-joined', { roomCode });
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('play-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentSong = song;
            io.to(roomCode).emit('song-playing', { song, playedBy: room.hostName });
            console.log(`▶️ Playing in ${roomCode}`);
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
            if (idx !== -1) {
                room.listeners.splice(idx, 1);
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
    console.log(`🚀 Server on port ${PORT}`);
    console.log(`📍 Socket.io path: /socket.io/`);
    console.log(`📍 Transports: websocket, polling`);
});