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

io.on('connection', (socket) => {
    console.log('✅ Connected:', socket.id);

    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: new Map(),
            currentSong: null,
            isPlaying: false,
            currentTime: 0,
            playbackState: 'stopped',
            readyCount: 0,
            totalDevices: 1,
            hostReady: false
        });
        socket.emit('room-created', { roomCode });
        console.log(`📢 Room ${roomCode} by ${hostName}`);
    });

    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.listeners.set(socket.id, { name: listenerName, ready: false });
            room.totalDevices = room.listeners.size + 1;
            
            io.to(room.hostId).emit('listener-joined', { 
                name: listenerName, 
                totalDevices: room.totalDevices 
            });
            
            socket.emit('room-state', {
                currentSong: room.currentSong,
                isPlaying: room.isPlaying,
                currentTime: room.currentTime
            });
            
            socket.emit('room-joined', { roomCode });
            console.log(`👤 ${listenerName} joined ${roomCode}`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('prepare-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentSong = song;
            room.playbackState = 'preparing';
            room.readyCount = 0;
            room.hostReady = false;
            room.isPlaying = false;
            
            for (let [id, listener] of room.listeners) {
                listener.ready = false;
            }
            
            console.log(`📢 Preparing: ${song.snippet.title} for ${room.listeners.size + 1} devices`);
            io.to(roomCode).emit('prepare-song', { song });
        }
    });

    socket.on('device-ready', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            if (socket.id === room.hostId) {
                room.hostReady = true;
            } else {
                const listener = room.listeners.get(socket.id);
                if (listener) listener.ready = true;
            }
            
            let readyCount = room.hostReady ? 1 : 0;
            for (let [id, listener] of room.listeners) {
                if (listener.ready) readyCount++;
            }
            room.readyCount = readyCount;
            
            console.log(`📊 Ready: ${room.readyCount}/${room.totalDevices}`);
            
            io.to(room.hostId).emit('ready-progress', {
                readyCount: room.readyCount,
                totalDevices: room.totalDevices
            });
            
            // ONLY when ALL devices are ready, start playback
            if (room.readyCount >= room.totalDevices && room.playbackState === 'preparing') {
                console.log(`🎯 ALL READY! Playing at same time...`);
                room.playbackState = 'playing';
                room.isPlaying = true;
                room.currentTime = 0;
                
                // Send play command with EXACT timestamp
                const playAt = Date.now() + 500;
                io.to(roomCode).emit('play-now', { 
                    song: room.currentSong,
                    playAt: playAt,
                    startTime: 0
                });
            }
        }
    });

    // HOST CONTROLS - Only host can send these
    socket.on('host-pause', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.isPlaying) {
            room.isPlaying = false;
            room.playbackState = 'paused';
            // Get current playback position from host (will be sent separately)
            console.log(`⏸️ Host PAUSED in ${roomCode}`);
            io.to(roomCode).emit('sync-pause');
        }
    });

    socket.on('host-resume', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && !room.isPlaying) {
            room.isPlaying = true;
            room.playbackState = 'playing';
            const resumeAt = Date.now() + 100;
            console.log(`▶️ Host RESUMED in ${roomCode}`);
            io.to(roomCode).emit('sync-resume', { resumeAt });
        }
    });

    socket.on('host-stop', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            room.playbackState = 'stopped';
            room.currentSong = null;
            console.log(`⏹️ Host STOPPED in ${roomCode}`);
            io.to(roomCode).emit('sync-stop');
        }
    });

    socket.on('host-seek', ({ roomCode, position }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentTime = position;
            io.to(roomCode).emit('sync-seek', { position });
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected:', socket.id);
        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id) {
                io.to(code).emit('host-left');
                rooms.delete(code);
                console.log(`🔒 Room ${code} closed`);
                break;
            }
            if (room.listeners.has(socket.id)) {
                room.listeners.delete(socket.id);
                room.totalDevices = room.listeners.size + 1;
                console.log(`👋 Listener left ${code}`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));