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

// Store rooms and participants
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);

    // Create room
    socket.on('create-room', ({ code, name }, callback) => {
        const roomCode = code || Math.random().toString(36).substring(2, 8).toUpperCase();

        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: name,
            listeners: [],
            messages: [],
            currentTrack: null,
            isPlaying: false,
            currentTime: 0
        });

        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.name = name;
        socket.data.isHost = true;

        callback({ success: true, roomCode });
        console.log(`📢 Room created: ${roomCode} by ${name}`);
    });

    // Join room
    socket.on('join-room', ({ code, name }, callback) => {
        const room = rooms.get(code);

        if (room) {
            socket.join(code);
            socket.data.roomCode = code;
            socket.data.name = name;
            socket.data.isHost = false;

            room.listeners.push({ id: socket.id, name: name });

            // Send current room state to new listener
            socket.emit('room-state', {
                currentTrack: room.currentTrack,
                isPlaying: room.isPlaying,
                currentTime: room.currentTime,
                messages: room.messages,
                hostName: room.hostName,
                listeners: room.listeners
            });

            // Notify host about new listener
            io.to(room.hostId).emit('listener-joined', { id: socket.id, name: name });

            // Update all listeners with new member list
            io.to(code).emit('members-update', {
                hostName: room.hostName,
                listeners: room.listeners
            });

            callback({ success: true, roomCode: code });
            console.log(`👤 ${name} joined room ${code}`);
        } else {
            callback({ success: false, error: 'Room not found' });
        }
    });

    // Host loads a track
    socket.on('load-track', (track) => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);

        if (room && socket.data.isHost) {
            room.currentTrack = track;
            io.to(roomCode).emit('track-loaded', track);
            console.log(`🎵 Track loaded in room ${roomCode}: ${track.title}`);
        }
    });

    // Play command
    socket.on('play-command', () => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);

        if (room && socket.data.isHost) {
            room.isPlaying = true;
            room.currentTime = Date.now();
            socket.to(roomCode).emit('sync-play', { timestamp: room.currentTime });
            console.log(`▶️ Play command to room ${roomCode}`);
        }
    });

    // Pause command
    socket.on('pause-command', ({ position }) => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);

        if (room && socket.data.isHost) {
            room.isPlaying = false;
            room.currentTime = position;
            socket.to(roomCode).emit('sync-pause', { position });
            console.log(`⏸️ Pause command to room ${roomCode}`);
        }
    });

    // Seek command
    socket.on('seek-command', ({ position }) => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);

        if (room && socket.data.isHost) {
            room.currentTime = position;
            socket.to(roomCode).emit('sync-seek', { position });
            console.log(`⏩ Seek command to room ${roomCode}`);
        }
    });

    // Chat message
    socket.on('chat-message', ({ text, sender }) => {
        const roomCode = socket.data.roomCode;
        const room = rooms.get(roomCode);

        if (room) {
            const message = {
                id: Date.now(),
                text: text,
                sender: sender || socket.data.name,
                timestamp: new Date().toISOString()
            };
            room.messages.push(message);
            io.to(roomCode).emit('new-message', message);
            console.log(`💬 ${message.sender}: ${text}`);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);

        for (const [code, room] of rooms.entries()) {
            // Check if host disconnected
            if (room.hostId === socket.id) {
                io.to(code).emit('host-disconnected');
                rooms.delete(code);
                console.log(`🔒 Room ${code} closed (host left)`);
                break;
            }

            // Check if listener disconnected
            const listenerIndex = room.listeners.findIndex(l => l.id === socket.id);
            if (listenerIndex !== -1) {
                room.listeners.splice(listenerIndex, 1);
                io.to(code).emit('members-update', {
                    hostName: room.hostName,
                    listeners: room.listeners
                });
                console.log(`👋 Listener left room ${code}`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🚀 VibeSync Sync Server running on port ${PORT}`);
});