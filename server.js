/**
 * VibeSync Sync Server
 * Handles WebSocket signaling, NTP-style clock synchronization,
 * room state, and playback control relay.
 */
const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "VibeSync Sync Server running", version: "2.0" }));
});

const wss = new WebSocket.Server({ server });

/**
 * Room structure:
 * {
 *   code: string,
 *   hostId: string | null,
 *   clients: Map<clientId, { ws, username, isHost, latency }>
 *   playbackState: { isPlaying, position, startedAt, trackId, trackUrl }
 * }
 */
const rooms = new Map();

function getOrCreateRoom(code) {
    if (!rooms.has(code)) {
        rooms.set(code, {
            code,
            hostId: null,
            clients: new Map(),
            playbackState: {
                isPlaying: false,
                position: 0,        // seconds
                startedAt: null,    // server timestamp when play started
                trackId: null,
                trackUrl: null,
                trackName: null,
            },
        });
    }
    return rooms.get(code);
}

function cleanupRoom(room) {
    if (room.clients.size === 0) {
        const code = room.code;
        rooms.delete(code);
        console.log(`[${code}] Room cleaned up (empty)`);
    }
}

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function sendTo(room, clientId, data) {
    const client = room.clients.get(clientId);
    if (client) send(client.ws, data);
}

function broadcast(room, data, excludeId = null) {
    room.clients.forEach((client, id) => {
        if (id !== excludeId) send(client.ws, data);
    });
}

function broadcastAll(room, data) {
    room.clients.forEach((client) => send(client.ws, data));
}

function getRoomInfo(room) {
    const members = [];
    room.clients.forEach((client, id) => {
        members.push({
            userId: id,
            username: client.username,
            isHost: client.isHost,
            latency: client.latency,
        });
    });
    return {
        code: room.code,
        hostId: room.hostId,
        members,
        playbackState: room.playbackState,
    };
}

wss.on("connection", (ws) => {
    let clientId = null;
    let clientRoom = null;
    let clientName = "Unknown";
    let clientIsHost = false;

    ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {

            // ── NTP-style clock sync ───────────────────────────────────────────────
            // Client sends t1 (client send time), server echoes with t2+t3 (server times)
            // Client receives at t4, computes:
            //   offset = ((t2 - t1) + (t3 - t4)) / 2
            //   rtt    = (t4 - t1) - (t3 - t2)
            case "clock-sync": {
                const serverReceive = Date.now();
                send(ws, {
                    type: "clock-sync-reply",
                    t1: msg.t1,
                    t2: serverReceive,
                    t3: Date.now(),
                });
                break;
            }

            // ── Join or create room ────────────────────────────────────────────────
            case "join": {
                const { roomCode, userId, username, isHost } = msg;
                clientId = userId;
                clientName = username;
                clientIsHost = isHost;

                const room = getOrCreateRoom(roomCode);
                clientRoom = room;

                if (isHost && !room.hostId) {
                    room.hostId = userId;
                    clientIsHost = true;
                }

                room.clients.set(userId, {
                    ws,
                    username,
                    isHost: clientIsHost,
                    latency: 0,
                });

                // Tell joiner the current room state + who else is here
                const peers = [];
                room.clients.forEach((client, id) => {
                    if (id !== userId) peers.push({ userId: id, username: client.username, isHost: client.isHost });
                });

                send(ws, {
                    type: "joined",
                    roomInfo: getRoomInfo(room),
                    peers,
                    isHost: clientIsHost,
                });

                // Tell everyone else
                broadcast(room, {
                    type: "peer-joined",
                    userId,
                    username,
                    isHost: clientIsHost,
                }, userId);

                console.log(`[${roomCode}] ${username} (${clientIsHost ? "HOST" : "listener"}) joined. Members: ${room.clients.size}`);
                break;
            }

            // ── Latency report from client ─────────────────────────────────────────
            case "latency-report": {
                if (clientRoom && clientId) {
                    const client = clientRoom.clients.get(clientId);
                    if (client) {
                        client.latency = msg.latency;
                        // Broadcast updated member list
                        broadcastAll(clientRoom, {
                            type: "members-update",
                            members: getRoomInfo(clientRoom).members,
                        });
                    }
                }
                break;
            }

            // ── WebRTC signaling passthrough ───────────────────────────────────────
            case "offer":
            case "answer":
            case "ice-candidate": {
                if (!clientRoom) break;
                const target = clientRoom.clients.get(msg.targetId);
                if (target) send(target.ws, { ...msg, fromId: clientId });
                break;
            }

            // ── Playback control (host only) ───────────────────────────────────────
            case "play": {
                if (!clientRoom || !clientIsHost) break;
                const scheduleAt = Date.now() + 300; // 300ms buffer for all clients to prepare
                clientRoom.playbackState = {
                    ...clientRoom.playbackState,
                    isPlaying: true,
                    position: msg.position || 0,
                    startedAt: scheduleAt,
                    trackId: msg.trackId || clientRoom.playbackState.trackId,
                    trackUrl: msg.trackUrl || clientRoom.playbackState.trackUrl,
                    trackName: msg.trackName || clientRoom.playbackState.trackName,
                };
                broadcastAll(clientRoom, {
                    type: "play",
                    position: clientRoom.playbackState.position,
                    scheduleAt,             // absolute server time to start
                    trackId: clientRoom.playbackState.trackId,
                    trackUrl: clientRoom.playbackState.trackUrl,
                    trackName: clientRoom.playbackState.trackName,
                });
                console.log(`[${clientRoom.code}] PLAY at position ${msg.position}s, schedule=${scheduleAt}`);
                break;
            }

            case "pause": {
                if (!clientRoom || !clientIsHost) break;
                const pausedAt = msg.position;
                clientRoom.playbackState.isPlaying = false;
                clientRoom.playbackState.position = pausedAt;
                clientRoom.playbackState.startedAt = null;
                broadcastAll(clientRoom, {
                    type: "pause",
                    position: pausedAt,
                    scheduleAt: Date.now() + 100,
                });
                console.log(`[${clientRoom.code}] PAUSE at position ${pausedAt}s`);
                break;
            }

            case "seek": {
                if (!clientRoom || !clientIsHost) break;
                const scheduleAt = Date.now() + 300;
                clientRoom.playbackState.position = msg.position;
                if (clientRoom.playbackState.isPlaying) {
                    clientRoom.playbackState.startedAt = scheduleAt;
                }
                broadcastAll(clientRoom, {
                    type: "seek",
                    position: msg.position,
                    scheduleAt,
                    isPlaying: clientRoom.playbackState.isPlaying,
                });
                break;
            }

            case "track-change": {
                if (!clientRoom || !clientIsHost) break;
                const scheduleAt = Date.now() + 500;
                clientRoom.playbackState = {
                    isPlaying: true,
                    position: 0,
                    startedAt: scheduleAt,
                    trackId: msg.trackId,
                    trackUrl: msg.trackUrl,
                    trackName: msg.trackName,
                };
                broadcastAll(clientRoom, {
                    type: "track-change",
                    trackId: msg.trackId,
                    trackUrl: msg.trackUrl,
                    trackName: msg.trackName,
                    scheduleAt,
                });
                break;
            }

            // ── Volume (listener local, no relay needed — kept for future) ─────────
            case "volume": break;

            // ── Chat relay ─────────────────────────────────────────────────────────
            case "chat": {
                if (!clientRoom) break;
                broadcastAll(clientRoom, {
                    type: "chat",
                    userId: clientId,
                    username: clientName,
                    text: msg.text,
                    time: Date.now(),
                });
                break;
            }

            // ── Sync request (listener asks for current state) ─────────────────────
            case "sync-request": {
                if (!clientRoom) break;
                const ps = clientRoom.playbackState;
                let currentPosition = ps.position;
                if (ps.isPlaying && ps.startedAt) {
                    currentPosition = ps.position + (Date.now() - ps.startedAt) / 1000;
                }
                send(ws, {
                    type: "sync-state",
                    isPlaying: ps.isPlaying,
                    position: currentPosition,
                    scheduleAt: Date.now() + 200,
                    trackId: ps.trackId,
                    trackUrl: ps.trackUrl,
                    trackName: ps.trackName,
                });
                break;
            }

            // ── Leave ──────────────────────────────────────────────────────────────
            case "leave": {
                if (clientRoom && clientId) {
                    clientRoom.clients.delete(clientId);
                    broadcast(clientRoom, { type: "peer-left", userId: clientId, username: clientName });
                    if (clientRoom.hostId === clientId) {
                        clientRoom.hostId = null;
                        broadcastAll(clientRoom, { type: "host-left" });
                    }
                    cleanupRoom(clientRoom);
                }
                break;
            }
        }
    });

    ws.on("close", () => {
        if (clientRoom && clientId) {
            clientRoom.clients.delete(clientId);
            broadcast(clientRoom, { type: "peer-left", userId: clientId, username: clientName });
            if (clientRoom.hostId === clientId) {
                clientRoom.hostId = null;
                broadcastAll(clientRoom, { type: "host-left" });
            }
            cleanupRoom(clientRoom);
            console.log(`${clientName} disconnected`);
        }
    });

    ws.on("error", (err) => {
        console.error(`WS error for ${clientName}:`, err.message);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🎵 VibeSync Sync Server v2.0`);
    console.log(`   HTTP:      http://0.0.0.0:${PORT}`);
    console.log(`   WebSocket: ws://0.0.0.0:${PORT}`);
    console.log(`   Features:  NTP clock sync · playback scheduling · room state\n`);
});