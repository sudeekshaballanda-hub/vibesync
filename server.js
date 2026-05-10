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

// Store rooms and their data
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('✅ New client connected:', socket.id);

    // Create room (Host)
    socket.on('create-room', ({ roomCode, hostName }, callback) => {
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
        if (callback) callback({ success: true, roomCode });
        else socket.emit('room-created', { roomCode });
    });

    // Join room (Listener)
    socket.on('join-room', ({ roomCode, listenerName }, callback) => {
        const room = rooms.get(roomCode);

        if (room) {
            socket.join(roomCode);
            room.listeners.push({ id: socket.id, name: listenerName });
            socket.data.roomCode = roomCode;
            socket.data.isHost = false;
            socket.data.name = listenerName;

            // Notify host
            io.to(room.hostId).emit('listener-joined', { name: listenerName, count: room.listeners.length });

            // Notify all listeners about updated member list
            io.to(roomCode).emit('members-update', {
                hostName: room.hostName,
                listeners: room.listeners
            });

            console.log(`👤 ${listenerName} joined room ${roomCode}`);
            if (callback) callback({ success: true, roomCode });
            else socket.emit('room-joined', { roomCode });
        } else {
            console.log(`❌ Room not found: ${roomCode}`);
            if (callback) callback({ success: false, error: 'Room not found' });
            else socket.emit('error', 'Room not found');
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

    // Get current room state
    socket.on('get-room-state', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.emit('room-state', {
                currentSong: room.currentSong,
                isPlaying: room.isPlaying,
                hostName: room.hostName,
                listeners: room.listeners
            });
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);

        // Find and clean up rooms
        for (const [code, room] of rooms.entries()) {
            // If host disconnected
            if (room.hostId === socket.id) {
                io.to(code).emit('host-left', { message: 'Host has left the room' });
                rooms.delete(code);
                console.log(`🔒 Room ${code} closed (host left)`);
                break;
            }

            // If listener disconnected
            const listenerIndex = room.listeners.findIndex(l => l.id === socket.id);
            if (listenerIndex !== -1) {
                const removedListener = room.listeners.splice(listenerIndex, 1);
                console.log(`👋 ${removedListener[0]?.name} left room ${code}`);

                // Notify everyone about updated members
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
server.listen(PORT, () => {
    console.log(`🚀 VibeSync Sync Server running on port ${PORT}`);
    console.log(`📍 WebSocket endpoint: ws://localhost:${PORT}`);
});