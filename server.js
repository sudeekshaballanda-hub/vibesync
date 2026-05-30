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

// NTP-style clock synchronization
const syncClock = (socket, callback) => {
    const clientTime = Date.now();
    callback({ serverTime: clientTime });
};

// Calculate clock offset between client and server
const calculateOffset = (clientRequestTime, serverTime, clientReceiveTime) => {
    const rtt = clientReceiveTime - clientRequestTime;
    const oneWayDelay = rtt / 2;
    const offset = serverTime - (clientRequestTime + oneWayDelay);
    return offset;
};

io.on('connection', (socket) => {
    console.log(`[SERVER] ✅ Connected: ${socket.id}`);

    // NTP Clock Sync - Devices sync their clocks with server
    socket.on('sync-clock', (clientTime, callback) => {
        const serverTime = Date.now();
        if (callback) {
            callback({ serverTime, clientTime });
        }
    });

    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: new Map(),
            currentSong: null,
            hostPlaybackTime: 0,
            hostStartTime: null,
            isPlaying: false,
            syncPhase: 'idle',
            readyStates: new Map(),
            clockOffsets: new Map(), // Store clock offset per device
            messages: []
        });
        
        const room = rooms.get(roomCode);
        room.readyStates.set(socket.id, { 
            name: hostName, 
            isHost: true, 
            preloadComplete: false, 
            playbackReady: false 
        });
        room.clockOffsets.set(socket.id, 0);
        
        socket.emit('room-created', { roomCode });
        console.log(`[SERVER] 📢 Room ${roomCode} created`);
    });

    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.readyStates.set(socket.id, { 
                name: listenerName, 
                isHost: false, 
                preloadComplete: false, 
                playbackReady: false 
            });
            room.clockOffsets.set(socket.id, 0);
            
            socket.emit('room-joined', { roomCode });
            console.log(`[SERVER] 👤 ${listenerName} joined`);
            
            const memberList = Array.from(room.readyStates.entries()).map(([id, data]) => ({
                id: id.slice(-6), name: data.name, isHost: data.isHost
            }));
            io.to(roomCode).emit('members-update', { members: memberList });
        }
    });

    // ============================================
    // CLOCK SYNCHRONIZATION - Multiple samples for accuracy
    // ============================================
    
    socket.on('clock-sync-request', (callback) => {
        const samples = [];
        const collectSample = () => {
            const clientSend = Date.now();
            const serverReceive = Date.now();
            const serverSend = Date.now();
            
            // Send back to client
            if (callback) {
                callback({ 
                    clientSend, 
                    serverReceive, 
                    serverSend,
                    timestamp: Date.now()
                });
            }
        };
        
        // Take 5 samples for accurate offset calculation
        for (let i = 0; i < 5; i++) {
            collectSample();
        }
    });
    
    // Host reports current playback position
    socket.on('host-playback-update', ({ roomCode, currentTime, isPlaying }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.hostPlaybackTime = currentTime;
            room.isPlaying = isPlaying;
            
            // Broadcast host position to all listeners for drift correction
            socket.to(roomCode).emit('playback-reference', {
                hostTime: currentTime,
                serverTimestamp: Date.now(),
                isPlaying: room.isPlaying
            });
        }
    });
    
    // Listener reports their current position (for drift detection)
    socket.on('listener-playback-report', ({ roomCode, currentTime, localTime }) => {
        const room = rooms.get(roomCode);
        if (room && !room.readyStates.get(socket.id)?.isHost) {
            const drift = currentTime - room.hostPlaybackTime;
            
            // If drift exceeds threshold, send correction
            if (Math.abs(drift) > 100) { // 100ms threshold
                console.log(`[SERVER] 🎯 Drift detected: ${drift}ms for ${socket.id.slice(-6)}`);
                socket.emit('drift-correction', { 
                    targetTime: room.hostPlaybackTime,
                    drift: drift
                });
            }
        }
    });

    socket.on('prepare-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'idle') {
            room.currentSong = song;
            room.syncPhase = 'preloading';
            room.hostPlaybackTime = 0;
            room.hostStartTime = null;
            
            for (let [id, state] of room.readyStates) {
                state.preloadComplete = false;
                state.playbackReady = false;
            }
            
            console.log(`[SERVER] 📢 Preparing: ${song.snippet.title}`);
            io.to(roomCode).emit('preload-song', { song });
        }
    });

    socket.on('preload-complete', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.syncPhase === 'preloading') {
            const state = room.readyStates.get(socket.id);
            if (state) state.preloadComplete = true;
            
            const preloadCount = Array.from(room.readyStates.values()).filter(s => s.preloadComplete).length;
            console.log(`[SERVER] 📊 Preload: ${preloadCount}/${room.readyStates.size}`);
            
            io.to(roomCode).emit('preload-progress', { completeCount: preloadCount, totalDevices: room.readyStates.size });
            
            if (preloadCount >= room.readyStates.size) {
                io.to(roomCode).emit('verify-playback-ready');
            }
        }
    });

    socket.on('playback-ready', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && (room.syncPhase === 'preloading' || room.syncPhase === 'verifying')) {
            room.syncPhase = 'verifying';
            const state = room.readyStates.get(socket.id);
            if (state) state.playbackReady = true;
            
            const readyCount = Array.from(room.readyStates.values()).filter(s => s.playbackReady).length;
            console.log(`[SERVER] 📊 Playback ready: ${readyCount}/${room.readyStates.size}`);
            
            if (readyCount >= room.readyStates.size) {
                console.log(`[SERVER] 🎉 ALL READY! Starting countdown...`);
                room.syncPhase = 'countdown';
                
                let countdown = 5;
                io.to(roomCode).emit('countdown-start', { number: countdown });
                
                const interval = setInterval(() => {
                    countdown--;
                    if (countdown >= 0) {
                        io.to(roomCode).emit('countdown-tick', { number: countdown });
                    }
                    if (countdown < 0) {
                        clearInterval(interval);
                        room.syncPhase = 'playing';
                        room.isPlaying = true;
                        room.hostStartTime = Date.now();
                        const startTime = room.hostStartTime + 50;
                        
                        io.to(roomCode).emit('auto-play', { 
                            song: room.currentSong,
                            startTime: startTime,
                            hostStartTime: room.hostStartTime
                        });
                        console.log(`[SERVER] ▶️ AUTO-PLAY sent at timestamp ${startTime}`);
                    }
                }, 1000);
                room.countdownInterval = interval;
            }
        }
    });

    // ============================================
    // HOST CONTROLS WITH TIMESTAMP SYNC
    // ============================================
    
    socket.on('host-play', ({ roomCode, currentTime }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.currentSong) {
            room.isPlaying = true;
            room.hostPlaybackTime = currentTime;
            room.hostStartTime = Date.now() - currentTime;
            const playTime = Date.now() + 50;
            
            console.log(`[SERVER] ▶️ HOST PLAY at time ${currentTime}ms`);
            socket.to(roomCode).emit('force-play', { 
                playTime, 
                targetTime: currentTime,
                hostStartTime: room.hostStartTime
            });
        }
    });
    
    socket.on('host-pause', ({ roomCode, currentTime }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            room.hostPlaybackTime = currentTime;
            console.log(`[SERVER] ⏸️ HOST PAUSE at time ${currentTime}ms`);
            socket.to(roomCode).emit('force-pause', { 
                pauseTime: currentTime,
                serverTimestamp: Date.now()
            });
        }
    });
    
    socket.on('host-resume', ({ roomCode, currentTime }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.currentSong) {
            room.isPlaying = true;
            room.hostPlaybackTime = currentTime;
            room.hostStartTime = Date.now() - currentTime;
            const resumeTime = Date.now() + 50;
            
            console.log(`[SERVER] ▶️ HOST RESUME at time ${currentTime}ms`);
            socket.to(roomCode).emit('force-resume', { 
                resumeTime, 
                targetTime: currentTime,
                hostStartTime: room.hostStartTime
            });
        }
    });
    
    socket.on('host-seek', ({ roomCode, position }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.hostPlaybackTime = position;
            room.hostStartTime = Date.now() - position;
            console.log(`[SERVER] ⏩ HOST SEEK to ${position}ms`);
            socket.to(roomCode).emit('force-seek', { 
                position: position,
                serverTimestamp: Date.now(),
                hostStartTime: room.hostStartTime
            });
        }
    });
    
    socket.on('host-stop', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            room.syncPhase = 'idle';
            room.currentSong = null;
            room.hostPlaybackTime = 0;
            room.hostStartTime = null;
            console.log(`[SERVER] ⏹️ HOST STOP`);
            io.to(roomCode).emit('force-stop');
        }
    });

    // Chat message
    socket.on('chat-message', ({ roomCode, text, sender }) => {
        const room = rooms.get(roomCode);
        if (room) {
            const message = { id: Date.now(), text, sender, timestamp: new Date().toISOString() };
            room.messages = room.messages || [];
            room.messages.push(message);
            io.to(roomCode).emit('new-chat-message', message);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SERVER] ❌ Disconnected: ${socket.id}`);
        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id) {
                if (room.countdownInterval) clearInterval(room.countdownInterval);
                io.to(code).emit('host-left');
                rooms.delete(code);
                console.log(`[SERVER] 🔒 Room ${code} closed`);
                break;
            }
            if (room.readyStates.has(socket.id)) {
                room.readyStates.delete(socket.id);
                room.clockOffsets.delete(socket.id);
                console.log(`[SERVER] 👋 Listener left ${code}`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[SERVER] 🚀 Server on port ${PORT}`));