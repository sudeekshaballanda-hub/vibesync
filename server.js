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
    console.log(`[SERVER] ✅ Connected: ${socket.id}`);

    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: new Map(),
            currentSong: null,
            isPlaying: false,
            currentTime: 0,
            playbackState: 'stopped', // stopped, playing, paused
            readyStates: new Map(),
            syncPhase: 'idle',
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
        console.log(`[SERVER] 📢 Room ${roomCode} created by ${hostName}`);
    });

    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.listeners.set(socket.id, { name: listenerName });
            room.readyStates.set(socket.id, { 
                name: listenerName, 
                isHost: false, 
                preloadComplete: false, 
                playbackReady: false 
            });
            
            // Send current playback state to new listener
            socket.emit('playback-state', {
                isPlaying: room.isPlaying,
                currentTime: room.currentTime,
                currentSong: room.currentSong
            });
            
            socket.emit('room-joined', { roomCode });
            console.log(`[SERVER] 👤 ${listenerName} joined ${roomCode}`);
            
            // Broadcast updated member list
            const memberList = Array.from(room.readyStates.entries()).map(([id, data]) => ({
                id: id.slice(-6),
                name: data.name,
                isHost: data.isHost
            }));
            io.to(roomCode).emit('members-update', { members: memberList });
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    // Host prepares a song
    socket.on('prepare-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentSong = song;
            room.syncPhase = 'preloading';
            room.isPlaying = false;
            
            // Reset ready states
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
                        io.to(roomCode).emit('play-now', { song: room.currentSong });
                        console.log(`[SERVER] ▶️ PLAYBACK STARTED`);
                    }
                }, 1000);
                room.countdownInterval = interval;
            }
        }
    });

    // ============================================
    // CRITICAL: HOST PLAYBACK CONTROLS
    // ============================================
    
    socket.on('host-play', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.currentSong && room.syncPhase === 'playing') {
            room.isPlaying = true;
            room.playbackState = 'playing';
            console.log(`[SERVER] ▶️ HOST PLAY - Broadcasting to all listeners`);
            
            // Broadcast play command with timestamp for perfect sync
            const playAt = Date.now() + 50;
            io.to(roomCode).emit('force-play', { playAt });
        }
    });
    
    socket.on('host-pause', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            room.playbackState = 'paused';
            console.log(`[SERVER] ⏸️ HOST PAUSE - Broadcasting to all listeners`);
            
            // Broadcast pause command
            io.to(roomCode).emit('force-pause');
        }
    });
    
    socket.on('host-resume', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.currentSong && room.syncPhase === 'playing') {
            room.isPlaying = true;
            room.playbackState = 'playing';
            console.log(`[SERVER] ▶️ HOST RESUME - Broadcasting to all listeners`);
            
            const resumeAt = Date.now() + 50;
            io.to(roomCode).emit('force-resume', { resumeAt });
        }
    });
    
    socket.on('host-stop', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.isPlaying = false;
            room.playbackState = 'stopped';
            room.currentSong = null;
            room.syncPhase = 'idle';
            console.log(`[SERVER] ⏹️ HOST STOP - Broadcasting to all listeners`);
            
            io.to(roomCode).emit('force-stop');
        }
    });
    
    socket.on('host-seek', ({ roomCode, position }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id) {
            room.currentTime = position;
            console.log(`[SERVER] ⏩ HOST SEEK to ${position}ms`);
            
            io.to(roomCode).emit('force-seek', { position });
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
                console.log(`[SERVER] 👋 Listener left ${code}`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[SERVER] 🚀 Server on port ${PORT}`));