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

// NTP Clock Sync - 8 samples for accuracy
const performClockSync = (socket, callback) => {
    const samples = [];
    let completed = 0;
    
    const takeSample = () => {
        const t1 = Date.now();
        const t2 = Date.now();
        const t3 = Date.now();
        if (callback) {
            callback({ t1, t2, t3 });
        }
        completed++;
        if (completed < 5) {
            setTimeout(takeSample, 200);
        }
    };
    
    takeSample();
};

io.on('connection', (socket) => {
    console.log(`[SERVER] ✅ Connected: ${socket.id}`);

    // NTP Clock Synchronization
    socket.on('sync', ({ t1 }, callback) => {
        const t2 = Date.now();
        const t3 = Date.now();
        if (callback) {
            callback({ t1, t2, t3 });
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
            messages: []
        });
        
        const room = rooms.get(roomCode);
        room.readyStates.set(socket.id, { 
            name: hostName, 
            isHost: true, 
            preloadComplete: false, 
            playbackReady: false 
        });
        
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
            
            socket.emit('room-joined', { roomCode });
            console.log(`[SERVER] 👤 ${listenerName} joined`);
            
            const memberList = Array.from(room.readyStates.entries()).map(([id, data]) => ({
                id: id.slice(-6), name: data.name, isHost: data.isHost
            }));
            io.to(roomCode).emit('members-update', { members: memberList });
        }
    });

    socket.on('prepare-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'idle') {
            room.currentSong = song;
            room.syncPhase = 'preloading';
            
            for (let [id, state] of room.readyStates) {
                state.preloadComplete = false;
                state.playbackReady = false;
            }
            
            io.to(roomCode).emit('preload-song', { song });
        }
    });

    socket.on('preload-complete', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.syncPhase === 'preloading') {
            const state = room.readyStates.get(socket.id);
            if (state) state.preloadComplete = true;
            
            const preloadCount = Array.from(room.readyStates.values()).filter(s => s.preloadComplete).length;
            io.to(roomCode).emit('preload-progress', { 
                completeCount: preloadCount, 
                totalDevices: room.readyStates.size 
            });
            
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
            
            if (readyCount >= room.readyStates.size) {
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
                        // ADDED: Future scheduling with network buffer (800ms)
                        const NETWORK_BUFFER = 800;
                        const scheduleTime = room.hostStartTime + NETWORK_BUFFER;
                        
                        io.to(roomCode).emit('schedule-play', { 
                            song: room.currentSong,
                            scheduleTime: scheduleTime,
                            hostStartTime: room.hostStartTime
                        });
                        console.log(`[SERVER] 🎬 Scheduled playback at ${scheduleTime}`);
                    }
                }, 1000);
                room.countdownInterval = interval;
            }
        }
    });

    // ============================================
    // HOST STATE BROADCAST (every 2 seconds)
    // ============================================
    socket.on('host-broadcast', ({ roomCode, currentTime, isPlaying }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'playing') {
            room.hostPlaybackTime = currentTime;
            room.isPlaying = isPlaying;
            socket.to(roomCode).emit('host-broadcast', { 
                currentTime: currentTime, 
                isPlaying: isPlaying,
                serverTime: Date.now()
            });
        }
    });

    socket.on('host-play', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'playing') {
            room.isPlaying = true;
            socket.to(roomCode).emit('force-play');
        }
    });
    
    socket.on('host-pause', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            socket.to(roomCode).emit('force-pause');
        }
    });
    
    socket.on('host-resume', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'playing') {
            room.isPlaying = true;
            socket.to(roomCode).emit('force-resume');
        }
    });
    
    socket.on('host-seek', ({ roomCode, position }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.hostPlaybackTime = position;
            socket.to(roomCode).emit('force-seek', { position });
        }
    });
    
    socket.on('host-stop', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            room.syncPhase = 'idle';
            room.currentSong = null;
            io.to(roomCode).emit('force-stop');
        }
    });

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
        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id) {
                if (room.countdownInterval) clearInterval(room.countdownInterval);
                io.to(code).emit('host-left');
                rooms.delete(code);
                break;
            }
            if (room.readyStates.has(socket.id)) {
                room.readyStates.delete(socket.id);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[SERVER] 🚀 Server on port ${PORT}`));