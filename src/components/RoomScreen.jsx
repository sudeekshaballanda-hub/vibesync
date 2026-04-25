import React, { useState } from "react";
import { useRoom } from "../context/RoomContext";
import MusicPlayer from "./MusicPlayer";
import MembersPanel from "./MembersPanel";
import Chat from "./Chat";

export default function RoomScreen({ onLeave }) {
    const { roomCode, isHost, connected, notification, leaveRoom } = useRoom();
    const [tab, setTab] = useState("player");

    const handleLeave = () => {
        leaveRoom();
        onLeave();
    };

    return (
        <div className="room-screen">
            {/* Top bar */}
            <div className="room-topbar">
                <div className="topbar-left">
                    <div className="topbar-logo">VS</div>
                    <div className="topbar-room">
                        <span className="topbar-label">Room</span>
                        <span className="topbar-code">{roomCode}</span>
                    </div>
                    {isHost && <span className="host-crown">👑 Host</span>}
                </div>
                <div className="topbar-right">
                    <div className={`conn-dot ${connected ? "conn-green" : "conn-red"}`} />
                    <button className="leave-btn" onClick={handleLeave}>Leave</button>
                </div>
            </div>

            {/* Toast notification */}
            {notification && (
                <div className={`toast toast-${notification.type}`}>{notification.msg}</div>
            )}

            {/* Tab nav (mobile) */}
            <div className="tab-nav">
                <button className={`tab-btn ${tab === "player" ? "active" : ""}`} onClick={() => setTab("player")}>
                    🎵 Player
                </button>
                <button className={`tab-btn ${tab === "members" ? "active" : ""}`} onClick={() => setTab("members")}>
                    👥 Room
                </button>
                <button className={`tab-btn ${tab === "chat" ? "active" : ""}`} onClick={() => setTab("chat")}>
                    💬 Chat
                </button>
            </div>

            {/* Panels */}
            <div className="room-body">
                <div className={`room-panel ${tab === "player" ? "visible" : "hidden"}`}>
                    <MusicPlayer />
                </div>
                <div className={`room-panel ${tab === "members" ? "visible" : "hidden"}`}>
                    <MembersPanel />
                </div>
                <div className={`room-panel ${tab === "chat" ? "visible" : "hidden"}`}>
                    <Chat />
                </div>
            </div>
        </div>
    );
}