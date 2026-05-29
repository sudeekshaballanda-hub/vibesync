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
            readyStates: new Map(),
            syncPhase: 'idle',
            messages: []
        });
        
        const room = rooms.get(roomCode);
        room.readyStates.set(socket.id, { name: hostName, isHost: true, preloadComplete: false, playbackReady: false });
        
        socket.emit('room-created', { roomCode });
        console.log(`[SERVER] 📢 Room ${roomCode} created`);
    });

    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.readyStates.set(socket.id, { name: listenerName, isHost: false, preloadComplete: false, playbackReady: false });
            
            socket.emit('room-joined', { roomCode });
            console.log(`[SERVER] 👤 ${listenerName} joined`);
            
            const memberList = Array.from(room.readyStates.entries()).map(([id, data]) => ({
                id: id.slice(-6), name: data.name, isHost: data.isHost
            }));
            io.to(roomCode).emit('members-update', { members: memberList });
        } else {
            socket.emit('error', 'Room not found');
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
                        const startTime = Date.now() + 50;
                        io.to(roomCode).emit('auto-play', { song: room.currentSong, startTime: startTime });
                        console.log(`[SERVER] ▶️ AUTO-PLAY sent`);
                    }
                }, 1000);
                room.countdownInterval = interval;
            }
        }
    });

    // ============================================
    // HOST CONTROLS - THESE MUST WORK
    // ============================================
    
    // ============================================
// CORRECTED PAUSE/RESUME/STOP HANDLERS
// Replace these handlers in your server.js 
// Find and replace the existing pause/resume/stop socket.on() handlers
// ============================================

// PAUSE EVENT - Host pauses, broadcast to ALL listeners
socket.on('host-pause', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    
    // Verify: Is the sender the host? Is there a valid room?
    if (!room) {
        console.log(`❌ [SERVER] PAUSE: Room ${roomCode} not found`);
        socket.emit('error', 'Room not found');
        return;
    }
    
    if (room.hostId !== socket.id) {
        console.log(`❌ [SERVER] PAUSE: Non-host ${socket.id} tried to pause in ${roomCode}`);
        socket.emit('error', 'Only host can control playback');
        return;
    }
    
    // Update room state
    room.isPlaying = false;
    console.log(`[SERVER] ⏸️  HOST PAUSE in room ${roomCode}`);
    
    // ✅ CRITICAL: Use io.to() to send to ALL devices in the room
    // (includes listeners AND host, but listeners will ignore if !isHost)
    io.to(roomCode).emit('force-pause', {
        timestamp: Date.now(),
        roomCode: roomCode,
        source: 'host'
    });
    
    console.log(`[SERVER] ✅ PAUSE broadcast sent to ${roomCode}`);
});

// RESUME EVENT - Host resumes, broadcast to ALL listeners
socket.on('host-resume', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    
    // Verify: Is the sender the host? Is there a valid room?
    if (!room) {
        console.log(`❌ [SERVER] RESUME: Room ${roomCode} not found`);
        socket.emit('error', 'Room not found');
        return;
    }
    
    if (room.hostId !== socket.id) {
        console.log(`❌ [SERVER] RESUME: Non-host ${socket.id} tried to resume in ${roomCode}`);
        socket.emit('error', 'Only host can control playback');
        return;
    }
    
    // Update room state
    room.isPlaying = true;
    console.log(`[SERVER] ▶️  HOST RESUME in room ${roomCode}`);
    
    // ✅ CRITICAL: Use io.to() to send to ALL devices in the room
    io.to(roomCode).emit('force-resume', {
        timestamp: Date.now(),
        roomCode: roomCode,
        source: 'host'
    });
    
    console.log(`[SERVER] ✅ RESUME broadcast sent to ${roomCode}`);
});

// STOP EVENT - Host stops playback completely
socket.on('host-stop', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    
    // Verify: Is the sender the host? Is there a valid room?
    if (!room) {
        console.log(`❌ [SERVER] STOP: Room ${roomCode} not found`);
        socket.emit('error', 'Room not found');
        return;
    }
    
    if (room.hostId !== socket.id) {
        console.log(`❌ [SERVER] STOP: Non-host ${socket.id} tried to stop in ${roomCode}`);
        socket.emit('error', 'Only host can control playback');
        return;
    }
    
    // Update room state
    room.isPlaying = false;
    room.syncPhase = 'idle';
    room.currentSong = null;
    
    // Reset all device ready states
    for (let [id, state] of room.readyStates) {
        state.preloadComplete = false;
        state.playbackReady = false;
    }
    
    console.log(`[SERVER] ⏹️  HOST STOP in room ${roomCode}`);
    
    // ✅ CRITICAL: Use io.to() to send to ALL devices
    io.to(roomCode).emit('force-stop', {
        timestamp: Date.now(),
        roomCode: roomCode,
        source: 'host'
    });
    
    console.log(`[SERVER] ✅ STOP broadcast sent to ${roomCode}`);
});

//=======================================
//Claude corrected the above pause/resume/stop handlers to ensure they broadcast to ALL devices in the room using io.to(roomCode).emit() instead of socket.emit(), which only sends to the sender. This is crucial for synchronizing playback across all listeners when the host controls playback.
//=======================================

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