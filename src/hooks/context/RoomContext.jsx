import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useSignaling } from "../hooks/useSignaling";
import { useClockSync } from "../hooks/useClockSync";
import { useAudioSync } from "../hooks/useAudioSync";

const RoomContext = createContext(null);

export function RoomProvider({ children }) {
    const { ws, connected, send } = useSignaling();
    const { serverNow, localTimeForServer, offset, rtt, synced } = useClockSync(ws);

    const [roomCode, setRoomCode] = useState(null);
    const [userId] = useState(() => Math.random().toString(36).slice(2, 10));
    const [username, setUsername] = useState("");
    const [isHost, setIsHost] = useState(false);
    const [members, setMembers] = useState([]);
    const [chat, setChat] = useState([]);
    const [inRoom, setInRoom] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [queue, setQueue] = useState([]);
    const [notification, setNotification] = useState(null);

    const audioSync = useAudioSync({
        localTimeForServer: (serverTs) => serverTs - offset,
        onPositionUpdate: null,
    });

    const notify = useCallback((msg, type = "info") => {
        setNotification({ msg, type, id: Date.now() });
        setTimeout(() => setNotification(null), 3000);
    }, []);

    // Report latency to server periodically
    useEffect(() => {
        if (!connected || !inRoom || rtt === 0) return;
        send({ type: "latency-report", latency: rtt });
    }, [rtt, connected, inRoom, send]);

    // Handle all incoming server messages
    useEffect(() => {
        if (!ws) return;
        const onMessage = async (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }

            switch (msg.type) {

                case "joined": {
                    setInRoom(true);
                    setMembers(msg.roomInfo.members || []);
                    // If server has active playback, sync to it
                    const ps = msg.roomInfo.playbackState;
                    if (ps?.trackUrl) {
                        setCurrentTrack({ id: ps.trackId, url: ps.trackUrl, name: ps.trackName });
                        await audioSync.loadTrack(ps.trackUrl);
                        if (ps.isPlaying && ps.startedAt) {
                            const serverPos = ps.position + (serverNow() - ps.startedAt) / 1000;
                            audioSync.schedulePlay(serverNow() + 500, Math.max(0, serverPos));
                        }
                    }
                    break;
                }

                case "members-update":
                    setMembers(msg.members || []);
                    break;

                case "peer-joined":
                    setMembers(prev => {
                        if (prev.find(m => m.userId === msg.userId)) return prev;
                        return [...prev, { userId: msg.userId, username: msg.username, isHost: msg.isHost, latency: 0 }];
                    });
                    notify(`${msg.username} joined the room`);
                    break;

                case "peer-left":
                    setMembers(prev => prev.filter(m => m.userId !== msg.userId));
                    notify(`${msg.username} left`);
                    break;

                case "host-left":
                    notify("Host disconnected", "warning");
                    break;

                case "play": {
                    if (!currentTrack && msg.trackUrl) {
                        const track = { id: msg.trackId, url: msg.trackUrl, name: msg.trackName };
                        setCurrentTrack(track);
                        await audioSync.loadTrack(msg.trackUrl);
                    }
                    audioSync.schedulePlay(msg.scheduleAt - offset, msg.position);
                    break;
                }

                case "pause":
                    audioSync.schedulePause(msg.scheduleAt - offset, msg.position);
                    break;

                case "seek":
                    audioSync.scheduleSeek(msg.scheduleAt - offset, msg.position, msg.isPlaying);
                    break;

                case "track-change": {
                    const track = { id: msg.trackId, url: msg.trackUrl, name: msg.trackName };
                    setCurrentTrack(track);
                    audioSync.stopSource();
                    const buf = await audioSync.loadTrack(msg.trackUrl);
                    if (buf) audioSync.schedulePlay(msg.scheduleAt - offset, 0);
                    break;
                }

                case "sync-state": {
                    if (msg.trackUrl && (!currentTrack || currentTrack.url !== msg.trackUrl)) {
                        const track = { id: msg.trackId, url: msg.trackUrl, name: msg.trackName };
                        setCurrentTrack(track);
                        await audioSync.loadTrack(msg.trackUrl);
                    }
                    if (msg.isPlaying) {
                        audioSync.schedulePlay(msg.scheduleAt - offset, msg.position);
                    } else {
                        audioSync.schedulePause(Date.now(), msg.position);
                    }
                    break;
                }

                case "chat":
                    setChat(prev => [...prev.slice(-199), {
                        userId: msg.userId,
                        username: msg.username,
                        text: msg.text,
                        time: msg.time,
                    }]);
                    break;

                default: break;
            }
        };

        ws.addEventListener("message", onMessage);
        return () => ws.removeEventListener("message", onMessage);
    }, [ws, audioSync, currentTrack, offset, serverNow, notify]);

    // ── Actions ────────────────────────────────────────────────────────────────

    const createRoom = useCallback((name) => {
        const code = Math.random().toString(36).slice(2, 8).toUpperCase();
        setUsername(name);
        setRoomCode(code);
        setIsHost(true);
        audioSync.ensureCtx();
        send({ type: "join", roomCode: code, userId, username: name, isHost: true });
        return code;
    }, [send, userId, audioSync]);

    const joinRoom = useCallback((code, name) => {
        setUsername(name);
        setRoomCode(code.toUpperCase());
        setIsHost(false);
        audioSync.ensureCtx();
        send({ type: "join", roomCode: code.toUpperCase(), userId, username: name, isHost: false });
        // Request sync after a moment
        setTimeout(() => send({ type: "sync-request" }), 500);
    }, [send, userId, audioSync]);

    const leaveRoom = useCallback(() => {
        send({ type: "leave" });
        audioSync.stopSource();
        setInRoom(false);
        setRoomCode(null);
        setIsHost(false);
        setMembers([]);
        setChat([]);
        setCurrentTrack(null);
        setQueue([]);
    }, [send, audioSync]);

    const play = useCallback(() => {
        if (!isHost) return;
        const pos = audioSync.getCurrentPosition();
        send({
            type: "play",
            position: pos,
            trackId: currentTrack?.id,
            trackUrl: currentTrack?.url,
            trackName: currentTrack?.name,
        });
    }, [isHost, send, audioSync, currentTrack]);

    const pause = useCallback(() => {
        if (!isHost) return;
        send({ type: "pause", position: audioSync.getCurrentPosition() });
    }, [isHost, send, audioSync]);

    const seek = useCallback((position) => {
        if (!isHost) return;
        send({ type: "seek", position });
    }, [isHost, send]);

    const loadTrackAsHost = useCallback(async (track) => {
        if (!isHost) return;
        setCurrentTrack(track);
        await audioSync.loadTrack(track.url);
        send({
            type: "track-change",
            trackId: track.id,
            trackUrl: track.url,
            trackName: track.name,
        });
    }, [isHost, audioSync, send]);

    const addToQueue = useCallback((track) => {
        setQueue(prev => [...prev, track]);
        if (!currentTrack) loadTrackAsHost(track);
    }, [currentTrack, loadTrackAsHost]);

    const sendChat = useCallback((text) => {
        send({ type: "chat", text });
        setChat(prev => [...prev.slice(-199), {
            userId,
            username,
            text,
            time: Date.now(),
            isSelf: true,
        }]);
    }, [send, userId, username]);

    const requestSync = useCallback(() => {
        send({ type: "sync-request" });
    }, [send]);

    return (
        <RoomContext.Provider value={{
            // connection
            connected, synced, offset, rtt,
            // room
            roomCode, userId, username, isHost, inRoom,
            members, chat, notification,
            // track
            currentTrack, queue,
            // audio state
            isPlaying: audioSync.isPlaying,
            position: audioSync.position,
            duration: audioSync.duration,
            loading: audioSync.loading,
            volume: audioSync.volume,
            getFrequencyData: audioSync.getFrequencyData,
            // actions
            createRoom, joinRoom, leaveRoom,
            play, pause, seek,
            loadTrackAsHost, addToQueue,
            setVolume: audioSync.setVolume,
            sendChat, requestSync,
        }}>
            {children}
        </RoomContext.Provider>
    );
}

export const useRoom = () => {
    const ctx = useContext(RoomContext);
    if (!ctx) throw new Error("useRoom must be used within RoomProvider");
    return ctx;
};