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

    // Create room (Host)
    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: new Map(), // Map of socketId -> { name, ready }
            currentSong: null,
            isPlaying: false,
            currentTime: 0,
            playbackState: 'stopped', // stopped, preparing, countdown, playing, paused
            readyCount: 0,
            totalDevices: 1,
            countdownTimer: null
        });
        socket.emit('room-created', { roomCode });
        console.log(`📢 Room ${roomCode} by ${hostName}`);
    });

    // Join room (Listener)
    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.listeners.set(socket.id, { name: listenerName, ready: false });
            room.totalDevices = room.listeners.size + 1;
            
            // Notify host
            io.to(room.hostId).emit('listener-joined', { 
                name: listenerName, 
                totalDevices: room.totalDevices 
            });
            
            // Send current state to new listener
            socket.emit('room-state', {
                currentSong: room.currentSong,
                isPlaying: room.isPlaying,
                playbackState: room.playbackState,
                currentTime: room.currentTime
            });
            
            socket.emit('room-joined', { roomCode });
            console.log(`👤 ${listenerName} joined ${roomCode} (${room.totalDevices} total devices)`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Host prepares a song (starts preload phase)
    socket.on('prepare-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentSong = song;
            room.playbackState = 'preparing';
            room.readyCount = 0;
            
            // Reset all listener ready states
            for (let [id, listener] of room.listeners) {
                listener.ready = false;
            }
            
            console.log(`📢 Host preparing: ${song.snippet.title} in ${roomCode}`);
            
            // Tell EVERYONE to prepare (including host)
            io.to(roomCode).emit('prepare-song', { 
                song, 
                message: 'Buffering song... Please wait.'
            });
        }
    });

    // Device reports ready after buffering
    socket.on('device-ready', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            // Mark this device as ready
            if (socket.id === room.hostId) {
                room.hostReady = true;
            } else {
                const listener = room.listeners.get(socket.id);
                if (listener) listener.ready = true;
            }
            
            // Count ready devices
            let readyCount = (room.hostReady ? 1 : 0);
            for (let [id, listener] of room.listeners) {
                if (listener.ready) readyCount++;
            }
            room.readyCount = readyCount;
            
            console.log(`✅ Device ready (${room.readyCount}/${room.totalDevices})`);
            
            // Notify host about progress
            io.to(room.hostId).emit('ready-progress', {
                readyCount: room.readyCount,
                totalDevices: room.totalDevices
            });
            
            // Check if ALL devices are ready
            if (room.readyCount >= room.totalDevices && room.playbackState === 'preparing') {
                console.log(`🎯 ALL DEVICES READY! Starting countdown...`);
                room.playbackState = 'countdown';
                
                // Start 5-second countdown for everyone
                for (let i = 5; i >= 0; i--) {
                    setTimeout(() => {
                        io.to(roomCode).emit('countdown', { number: i });
                        if (i === 0) {
                            // Playback starts!
                            const playAt = Date.now();
                            room.playbackState = 'playing';
                            room.isPlaying = true;
                            room.currentTime = 0;
                            io.to(roomCode).emit('play-now', { 
                                song: room.currentSong,
                                playAt: playAt,
                                startTime: 0
                            });
                            console.log(`▶️ Playback started at ${playAt}`);
                        }
                    }, i * 1000);
                }
            }
        }
    });

    // Host controls (only host can send these)
    socket.on('host-pause', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.isPlaying) {
            room.isPlaying = false;
            room.playbackState = 'paused';
            io.to(roomCode).emit('sync-pause', { currentTime: room.currentTime });
            console.log(`⏸️ Host paused in ${roomCode}`);
        }
    });

    socket.on('host-resume', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && !room.isPlaying) {
            room.isPlaying = true;
            room.playbackState = 'playing';
            io.to(roomCode).emit('sync-resume', { currentTime: room.currentTime });
            console.log(`▶️ Host resumed in ${roomCode}`);
        }
    });

    socket.on('host-seek', ({ roomCode, position }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentTime = position;
            io.to(roomCode).emit('sync-seek', { position });
            console.log(`⏩ Host seek to ${position}ms in ${roomCode}`);
        }
    });

    socket.on('host-stop', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            room.playbackState = 'stopped';
            room.currentSong = null;
            io.to(roomCode).emit('sync-stop');
            console.log(`⏹️ Host stopped playback in ${roomCode}`);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('❌ Disconnected:', socket.id);
        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id) {
                io.to(code).emit('host-left');
                rooms.delete(code);
                console.log(`🔒 Room ${code} closed (host left)`);
                break;
            }
            if (room.listeners.has(socket.id)) {
                room.listeners.delete(socket.id);
                room.totalDevices = room.listeners.size + 1;
                console.log(`👋 Listener left ${code} (${room.totalDevices} devices remain)`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));