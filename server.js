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
const NETWORK_BUFFER = 500;

io.on('connection', (socket) => {
    console.log('✅ Connected:', socket.id);

    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: [],
            currentSong: null,
            readyCount: 0,           // ← TRACK READY DEVICES
            isPlaying: false,
            pendingPlayRequest: null  // ← STORE PLAY REQUEST
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
            
            // Send current room state to new listener
            socket.emit('room-state', {
                currentSong: room.currentSong,
                isPlaying: room.isPlaying
            });
            
            socket.emit('room-joined', { roomCode });
            console.log(`👤 ${listenerName} joined ${roomCode}`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // NEW: Host requests to play a song
    socket.on('prepare-play', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentSong = song;
            room.readyCount = 0;
            room.isPlaying = false;
            room.pendingPlayRequest = song;
            
            console.log(`📢 Host preparing song in ${roomCode}: ${song.snippet.title}`);
            
            // Tell EVERYONE to prepare (including host)
            io.to(roomCode).emit('prepare-song', { 
                song, 
                message: 'Preparing to play. Please buffer...'
            });
        }
    });

    // NEW: Device reports it's ready
    socket.on('device-ready', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            room.readyCount++;
            console.log(`✅ Device ready! (${room.readyCount}/${room.listeners.length + 1})`);
            
            // Notify host about ready status
            io.to(room.hostId).emit('ready-update', {
                readyCount: room.readyCount,
                totalDevices: room.listeners.length + 1
            });
            
            // Check if ALL devices are ready (including host)
            const totalDevices = room.listeners.length + 1;
            
            if (room.readyCount >= totalDevices && room.pendingPlayRequest) {
                // ALL DEVICES READY! START PLAYBACK!
                const playAt = Date.now() + NETWORK_BUFFER;
                const songToPlay = room.pendingPlayRequest;
                
                console.log(`🎯 ALL DEVICES READY! Playing at ${playAt}`);
                
                // Broadcast play command with timestamp
                io.to(roomCode).emit('play-now', {
                    song: songToPlay,
                    playAt: playAt,
                    message: 'All devices ready! Playing NOW!'
                });
                
                room.isPlaying = true;
                room.pendingPlayRequest = null;
            }
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
                // Adjust ready count if needed
                room.readyCount = Math.max(0, room.readyCount - 1);
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));