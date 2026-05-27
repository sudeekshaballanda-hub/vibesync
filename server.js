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
            readyCount: 0,
            totalDevices: 1,
            hostReady: false,
            countdownActive: false,
            countdownInterval: null
        });
        socket.emit('room-created', { roomCode });
        console.log(`📢 Room ${roomCode} created by ${hostName}`);
    });

    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.listeners.set(socket.id, { name: listenerName, ready: false, bufferComplete: false });
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
            console.log(`👤 ${listenerName} joined ${roomCode} (Total: ${room.totalDevices} devices)`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Host prepares a song - ALL devices start buffering
    socket.on('prepare-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentSong = song;
            room.readyCount = 0;
            room.hostReady = false;
            room.countdownActive = false;
            
            // Reset all listener ready states
            for (let [id, listener] of room.listeners) {
                listener.ready = false;
                listener.bufferComplete = false;
            }
            
            console.log(`📢 Host preparing: ${song.snippet.title}`);
            console.log(`📢 Broadcasting to ${room.listeners.size + 1} devices to BUFFER first`);
            
            // Tell EVERYONE to start buffering (NOT playing yet)
            io.to(roomCode).emit('start-buffering', { song });
        }
    });

    // Device reports buffer is COMPLETE (fully downloaded, ready to play instantly)
    socket.on('buffer-complete', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            if (socket.id === room.hostId) {
                room.hostReady = true;
                console.log(`✅ Host buffer COMPLETE`);
            } else {
                const listener = room.listeners.get(socket.id);
                if (listener) {
                    listener.bufferComplete = true;
                    console.log(`✅ Listener ${listener.name} buffer COMPLETE`);
                }
            }
            
            // Count how many devices have COMPLETE buffer
            let completeCount = room.hostReady ? 1 : 0;
            for (let [id, listener] of room.listeners) {
                if (listener.bufferComplete) completeCount++;
            }
            
            console.log(`📊 Buffer complete: ${completeCount}/${room.totalDevices}`);
            
            // Update host with progress
            io.to(room.hostId).emit('buffer-progress', {
                completeCount: completeCount,
                totalDevices: room.totalDevices
            });
            
            // ONLY when ALL devices have COMPLETE buffer, start countdown
            if (completeCount >= room.totalDevices && !room.countdownActive) {
                console.log(`🎯 ALL ${room.totalDevices} DEVICES BUFFER COMPLETE! Starting countdown...`);
                room.countdownActive = true;
                
                // Send countdown to ALL devices simultaneously
                let countdown = 5;
                
                // Send initial countdown value
                io.to(roomCode).emit('countdown-update', { number: countdown });
                
                // Start countdown interval
                const interval = setInterval(() => {
                    countdown--;
                    if (countdown >= 0) {
                        io.to(roomCode).emit('countdown-update', { number: countdown });
                    }
                    
                    if (countdown < 0) {
                        clearInterval(interval);
                        // PLAYBACK STARTS INSTANTLY - NO BUFFERING NEEDED!
                        const playAt = Date.now();
                        room.isPlaying = true;
                        room.currentTime = 0;
                        io.to(roomCode).emit('play-now', { 
                            song: room.currentSong,
                            playAt: playAt,
                            startTime: 0
                        });
                        room.countdownActive = false;
                        console.log(`▶️ Playback started at ${playAt} - ALL devices ready!`);
                    }
                }, 1000);
                
                // Store interval for cleanup
                room.countdownInterval = interval;
            }
        }
    });

    // Host controls (only host can send these)
    socket.on('host-pause', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.isPlaying) {
            room.isPlaying = false;
            io.to(roomCode).emit('sync-pause');
            console.log(`⏸️ Host PAUSED`);
        }
    });

    socket.on('host-resume', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && !room.isPlaying) {
            room.isPlaying = true;
            io.to(roomCode).emit('sync-resume');
            console.log(`▶️ Host RESUMED`);
        }
    });

    socket.on('host-stop', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            room.currentSong = null;
            room.countdownActive = false;
            if (room.countdownInterval) clearInterval(room.countdownInterval);
            io.to(roomCode).emit('sync-stop');
            console.log(`⏹️ Host STOPPED`);
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected:', socket.id);
        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id) {
                if (room.countdownInterval) clearInterval(room.countdownInterval);
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