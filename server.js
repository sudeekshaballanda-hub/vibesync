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
    console.log(`[SERVER] ✅ New connection: ${socket.id}`);

    socket.on('create-room', ({ roomCode, hostName }) => {
        socket.join(roomCode);
        rooms.set(roomCode, {
            hostId: socket.id,
            hostName: hostName,
            listeners: new Map(),
            currentSong: null,
            isPlaying: false,
            readyStates: new Map(), // Track readiness per device
            totalDevices: 1,
            syncPhase: 'idle',
            countdownInterval: null,
            messages: []
        });
        
        // Mark host as connected but not preloaded yet
        const room = rooms.get(roomCode);
        room.readyStates.set(socket.id, { name: hostName, isHost: true, preloadComplete: false, playbackReady: false });
        
        socket.emit('room-created', { roomCode });
        console.log(`[SERVER] 📢 Room ${roomCode} created by ${hostName}`);
        console.log(`[SERVER] 📊 Room state: Host ${socket.id} added to readyStates`);
    });

    socket.on('join-room', ({ roomCode, listenerName }) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(roomCode);
            room.listeners.set(socket.id, { name: listenerName });
            room.readyStates.set(socket.id, { name: listenerName, isHost: false, preloadComplete: false, playbackReady: false });
            room.totalDevices = room.readyStates.size;
            
            // Send existing chat messages
            socket.emit('chat-history', { messages: room.messages || [] });
            
            // Broadcast updated member list
            const memberList = Array.from(room.readyStates.entries()).map(([id, data]) => ({
                id: id,
                name: data.name,
                isHost: data.isHost,
                ready: data.preloadComplete && data.playbackReady
            }));
            io.to(roomCode).emit('members-update', { members: memberList });
            
            io.to(room.hostId).emit('listener-joined', { 
                name: listenerName, 
                totalDevices: room.totalDevices 
            });
            
            socket.emit('room-joined', { roomCode });
            console.log(`[SERVER] 👤 ${listenerName} (${socket.id}) joined ${roomCode}`);
            console.log(`[SERVER] 📊 Total devices: ${room.totalDevices}`);
            console.log(`[SERVER] 📊 ReadyStates: ${JSON.stringify(Array.from(room.readyStates.entries()).map(([id, d]) => ({ id: id.slice(-6), ...d })))}`);
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
            console.log(`[CHAT] 💬 ${sender}: ${text}`);
        }
    });

    // Host prepares a song - RESET all ready states
    socket.on('prepare-song', ({ roomCode, song }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'idle') {
            room.currentSong = song;
            room.syncPhase = 'preloading';
            
            // RESET all ready states
            for (let [id, state] of room.readyStates) {
                state.preloadComplete = false;
                state.playbackReady = false;
            }
            
            console.log(`[SERVER] 📢 Host preparing song: ${song.snippet.title}`);
            console.log(`[SERVER] 📊 ReadyStates reset. Waiting for ${room.readyStates.size} devices to preload`);
            
            // Tell EVERYONE to start preloading
            io.to(roomCode).emit('preload-song', { song });
        }
    });

    // Device reports preload COMPLETE (100% downloaded)
    socket.on('preload-complete', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.syncPhase === 'preloading') {
            const state = room.readyStates.get(socket.id);
            if (state) {
                state.preloadComplete = true;
                console.log(`[SERVER] ✅ ${state.name} (${socket.id.slice(-6)}) - PRELOAD COMPLETE`);
            }
            
            // Count preload completions
            const preloadCount = Array.from(room.readyStates.values()).filter(s => s.preloadComplete).length;
            console.log(`[SERVER] 📊 Preload progress: ${preloadCount}/${room.readyStates.size}`);
            
            // Notify all devices of progress
            io.to(roomCode).emit('preload-progress', {
                completeCount: preloadCount,
                totalDevices: room.readyStates.size
            });
            
            // When ALL devices have completed preload, move to playback-ready verification
            if (preloadCount >= room.readyStates.size) {
                console.log(`[SERVER] 🎯 ALL ${room.readyStates.size} DEVICES PRELOADED! Verifying playback readiness...`);
                
                // Ask all devices to verify playback readiness
                io.to(roomCode).emit('verify-playback-ready');
            }
        }
    });

    // Device reports PLAYBACK READY (fully buffered, can play instantly)
    socket.on('playback-ready', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && (room.syncPhase === 'preloading' || room.syncPhase === 'verifying')) {
            room.syncPhase = 'verifying';
            const state = room.readyStates.get(socket.id);
            if (state) {
                state.playbackReady = true;
                console.log(`[SERVER] 🎯 ${state.name} (${socket.id.slice(-6)}) - PLAYBACK READY`);
            }
            
            // Count playback ready devices
            const readyCount = Array.from(room.readyStates.values()).filter(s => s.playbackReady).length;
            console.log(`[SERVER] 📊 Playback ready: ${readyCount}/${room.readyStates.size}`);
            
            // When ALL devices are playback ready, start countdown
            if (readyCount >= room.readyStates.size && room.syncPhase === 'verifying') {
                console.log(`[SERVER] 🎉 ALL ${room.readyStates.size} DEVICES PLAYBACK READY! Starting countdown...`);
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
                        io.to(roomCode).emit('play-now', { 
                            song: room.currentSong
                        });
                        console.log(`[SERVER] ▶️ PLAYBACK STARTED on all devices!`);
                    }
                }, 1000);
                
                room.countdownInterval = interval;
            }
        }
    });

    // Get room state (for debugging)
    socket.on('get-room-state', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            const states = Array.from(room.readyStates.entries()).map(([id, state]) => ({
                id: id.slice(-6),
                name: state.name,
                isHost: state.isHost,
                preloadComplete: state.preloadComplete,
                playbackReady: state.playbackReady
            }));
            console.log(`[DEBUG] Room ${roomCode} states:`, states);
            socket.emit('room-state-debug', { states, syncPhase: room.syncPhase });
        }
    });

    // Host controls
    socket.on('host-pause', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'playing' && room.isPlaying) {
            room.isPlaying = false;
            io.to(roomCode).emit('sync-pause');
            console.log(`[SERVER] ⏸️ Host PAUSED in ${roomCode}`);
        }
    });

    socket.on('host-resume', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && room.hostId === socket.id && room.syncPhase === 'playing' && !room.isPlaying) {
            room.isPlaying = true;
            io.to(roomCode).emit('sync-resume');
            console.log(`[SERVER] ▶️ Host RESUMED in ${roomCode}`);
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
            console.log(`[SERVER] ⏹️ Host STOPPED in ${roomCode}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SERVER] ❌ Disconnected: ${socket.id}`);
        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id) {
                if (room.countdownInterval) clearInterval(room.countdownInterval);
                io.to(code).emit('host-left');
                rooms.delete(code);
                console.log(`[SERVER] 🔒 Room ${code} closed (host left)`);
                break;
            }
            if (room.readyStates.has(socket.id)) {
                const state = room.readyStates.get(socket.id);
                room.readyStates.delete(socket.id);
                room.totalDevices = room.readyStates.size;
                console.log(`[SERVER] 👋 ${state.name} left ${code}`);
                
                // Update members list
                const memberList = Array.from(room.readyStates.entries()).map(([id, data]) => ({
                    id: id,
                    name: data.name,
                    isHost: data.isHost,
                    ready: data.preloadComplete && data.playbackReady
                }));
                io.to(code).emit('members-update', { members: memberList });
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[SERVER] 🚀 Server on port ${PORT}`));