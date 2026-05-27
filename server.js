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
            countdownInterval: null,
            allPreloaded: false
        });
        socket.emit('room-created', { roomCode });
        console.log(`📢 Room ${roomCode} created by ${hostName}`);
    });

    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.listeners.set(socket.id, { name: listenerName, preloadComplete: false });
            room.totalDevices = room.listeners.size + 1;
            
            io.to(room.hostId).emit('listener-joined', { 
                name: listenerName, 
                totalDevices: room.totalDevices 
            });
            
            socket.emit('room-joined', { roomCode });
            console.log(`👤 ${listenerName} joined ${roomCode} (Total: ${room.totalDevices} devices)`);
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Host prepares a song - ALL devices start preloading
    socket.on('prepare-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentSong = song;
            room.readyCount = 0;
            room.hostReady = false;
            room.countdownActive = false;
            room.allPreloaded = false;
            
            // Reset all listener preload states
            for (let [id, listener] of room.listeners) {
                listener.preloadComplete = false;
            }
            
            console.log(`📢 Host preparing: ${song.snippet.title}`);
            console.log(`📢 Broadcasting to ${room.listeners.size + 1} devices to PRELOAD`);
            
            // Tell EVERYONE to preload (NOT visible yet)
            io.to(roomCode).emit('preload-song', { song });
        }
    });

    // Device reports preload is COMPLETE (iframe hidden and loaded)
    socket.on('preload-complete', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            if (socket.id === room.hostId) {
                room.hostReady = true;
                console.log(`✅ Host preload COMPLETE`);
            } else {
                const listener = room.listeners.get(socket.id);
                if (listener) {
                    listener.preloadComplete = true;
                    console.log(`✅ Listener ${listener.name} preload COMPLETE`);
                }
            }
            
            // Count how many devices have completed preload
            let completeCount = room.hostReady ? 1 : 0;
            for (let [id, listener] of room.listeners) {
                if (listener.preloadComplete) completeCount++;
            }
            
            console.log(`📊 Preload complete: ${completeCount}/${room.totalDevices}`);
            
            // Update host with progress
            io.to(room.hostId).emit('preload-progress', {
                completeCount: completeCount,
                totalDevices: room.totalDevices
            });
            
            // ONLY when ALL devices have preloaded, start countdown
            if (completeCount >= room.totalDevices && !room.countdownActive) {
                console.log(`🎯 ALL ${room.totalDevices} DEVICES PRELOADED! Starting countdown...`);
                room.countdownActive = true;
                room.allPreloaded = true;
                
                // Send countdown to ALL devices simultaneously
                let countdown = 5;
                
                // Send initial countdown value
                io.to(roomCode).emit('countdown-start', { number: countdown });
                
                // Start countdown interval
                const interval = setInterval(() => {
                    countdown--;
                    if (countdown >= 0) {
                        io.to(roomCode).emit('countdown-tick', { number: countdown });
                    }
                    
                    if (countdown < 0) {
                        clearInterval(interval);
                        // PLAYBACK STARTS INSTANTLY - Player already preloaded and hidden
                        const playAt = Date.now();
                        room.isPlaying = true;
                        room.currentTime = 0;
                        io.to(roomCode).emit('play-now', { 
                            song: room.currentSong,
                            playAt: playAt,
                            startTime: 0
                        });
                        room.countdownActive = false;
                        console.log(`▶️ Playback started at ${playAt} - ALL devices preloaded!`);
                    }
                }, 1000);
                
                room.countdownInterval = interval;
            }
        }
    });

    // Host controls
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
        if (room && room.hostId === socket.id && !room.isPlaying && room.currentSong) {
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
            room.allPreloaded = false;
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