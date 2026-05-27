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
            syncPhase: 'idle', // idle, preloading, countdown, playing
            countdownInterval: null,
            messages: []
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
            
            // Send existing chat messages to new listener
            socket.emit('chat-history', { messages: room.messages || [] });
            
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

    // Chat message
    socket.on('chat-message', ({ roomCode, text, sender }) => {
        const room = rooms.get(roomCode);
        if (room) {
            const message = {
                id: Date.now(),
                text: text,
                sender: sender,
                timestamp: new Date().toISOString()
            };
            room.messages = room.messages || [];
            room.messages.push(message);
            io.to(roomCode).emit('new-chat-message', message);
            console.log(`💬 ${sender}: ${text}`);
        }
    });

    // Host prepares a song - ALL devices start preloading
    socket.on('prepare-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'idle') {
            room.currentSong = song;
            room.readyCount = 0;
            room.hostReady = false;
            room.syncPhase = 'preloading';
            
            // Reset all listener preload states
            for (let [id, listener] of room.listeners) {
                listener.preloadComplete = false;
            }
            
            console.log(`📢 Host preparing: ${song.snippet.title}`);
            console.log(`📢 Broadcasting to ${room.listeners.size + 1} devices to PRELOAD`);
            
            // Tell EVERYONE to preload
            io.to(roomCode).emit('preload-song', { song });
        }
    });

    // Device reports preload is COMPLETE (100% ready for instant playback)
    socket.on('preload-complete', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.syncPhase === 'preloading') {
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
            room.readyCount = completeCount;
            
            console.log(`📊 Preload complete: ${room.readyCount}/${room.totalDevices}`);
            
            // Update all devices with progress
            io.to(roomCode).emit('preload-progress', {
                completeCount: room.readyCount,
                totalDevices: room.totalDevices
            });
            
            // ONLY when ALL devices have preloaded, start countdown
            if (room.readyCount >= room.totalDevices && room.syncPhase === 'preloading') {
                console.log(`🎯 ALL ${room.totalDevices} DEVICES PRELOADED! Starting countdown...`);
                room.syncPhase = 'countdown';
                
                let countdown = 5;
                
                // Send countdown to ALL devices
                io.to(roomCode).emit('countdown-start', { number: countdown });
                
                // Start countdown interval
                const interval = setInterval(() => {
                    countdown--;
                    if (countdown >= 0) {
                        io.to(roomCode).emit('countdown-tick', { number: countdown });
                    }
                    
                    if (countdown < 0) {
                        clearInterval(interval);
                        // PLAYBACK STARTS INSTANTLY - NO BUFFERING NEEDED!
                        room.syncPhase = 'playing';
                        room.isPlaying = true;
                        room.currentTime = 0;
                        io.to(roomCode).emit('play-now', { 
                            song: room.currentSong,
                            startTime: 0
                        });
                        console.log(`▶️ Playback started - ALL devices preloaded!`);
                    }
                }, 1000);
                
                room.countdownInterval = interval;
            }
        }
    });

    // Host controls - Only host can send these
    socket.on('host-pause', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'playing' && room.isPlaying) {
            room.isPlaying = false;
            io.to(roomCode).emit('sync-pause');
            console.log(`⏸️ Host PAUSED in ${roomCode}`);
        }
    });

    socket.on('host-resume', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'playing' && !room.isPlaying) {
            room.isPlaying = true;
            io.to(roomCode).emit('sync-resume');
            console.log(`▶️ Host RESUMED in ${roomCode}`);
        }
    });

    socket.on('host-stop', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            room.syncPhase = 'idle';
            room.currentSong = null;
            if (room.countdownInterval) clearInterval(room.countdownInterval);
            io.to(roomCode).emit('sync-stop');
            console.log(`⏹️ Host STOPPED in ${roomCode}`);
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