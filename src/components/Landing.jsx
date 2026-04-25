import React, { useState } from "react";
import { useRoom } from "../context/RoomContext";

export default function Landing({ onEnterRoom }) {
    const { createRoom, joinRoom, connected, synced } = useRoom();
    const [mode, setMode] = useState(null);
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [createdCode, setCreatedCode] = useState(null);
    const [error, setError] = useState("");

    const handleCreate = async () => {
        if (!name.trim()) { 
            setError("Enter your name first"); 
            return; 
        }
        try {
            const roomCode = await createRoom(name.trim());
            setCreatedCode(roomCode);
        } catch (err) {
            setError("Failed to create room. Make sure backend is running.");
        }
    };

    const handleJoin = () => {
        if (!name.trim()) { 
            setError("Enter your name first"); 
            return; 
        }
        if (code.trim().length < 6) { 
            setError("Enter the 6-character room code"); 
            return; 
        }
        joinRoom(code.trim(), name.trim());
        onEnterRoom();
    };

    const handleEnterCreated = () => {
        onEnterRoom();
    };

    return (
        <div className="landing">
            <div className="landing-bg">
                <div className="orb orb-1" />
                <div className="orb orb-2" />
                <div className="orb orb-3" />
                <div className="grid-overlay" />
            </div>

            <div className="landing-content">
                <header className="landing-header">
                    <div className="logo-mark">
                        <div className="logo-icon">
                            <span className="bar b1" />
                            <span className="bar b2" />
                            <span className="bar b3" />
                            <span className="bar b4" />
                            <span className="bar b5" />
                        </div>
                    </div>
                    <h1 className="logo-text">VibeSync</h1>
                    <p className="tagline">Every phone. One beat. Zero delay.</p>
                    <div className="sync-status">
                        <span className={`dot ${connected ? "dot-green" : "dot-yellow"}`} />
                        <span>{connected ? (synced ? "✓ Server synced" : "🕐 Syncing clock…") : "⚠️ Backend starting..."}</span>
                    </div>
                </header>

                {!mode && !createdCode && (
                    <div className="action-cards">
                        <button className="action-card card-host" onClick={() => { setMode("create"); setError(""); }}>
                            <div className="card-icon">⊕</div>
                            <div className="card-label">Create Room</div>
                            <div className="card-sub">Be the DJ. Control the vibe.</div>
                        </button>
                        <button className="action-card card-join" onClick={() => { setMode("join"); setError(""); }}>
                            <div className="card-icon">→</div>
                            <div className="card-label">Join Room</div>
                            <div className="card-sub">Enter a code. Feel the sync.</div>
                        </button>
                    </div>
                )}

                {(mode === "create" || mode === "join") && !createdCode && (
                    <div className="form-card">
                        <button className="back-btn" onClick={() => { setMode(null); setError(""); }}>
                            ← Back
                        </button>
                        <h2>{mode === "create" ? "Create a Room" : "Join a Room"}</h2>

                        <div className="field">
                            <label>Your name</label>
                            <input
                                type="text"
                                placeholder="e.g. Alex"
                                value={name}
                                onChange={e => { setName(e.target.value); setError(""); }}
                                maxLength={24}
                                autoFocus
                            />
                        </div>

                        {mode === "join" && (
                            <div className="field">
                                <label>Room code</label>
                                <input
                                    type="text"
                                    placeholder="ABC123"
                                    value={code}
                                    onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
                                    maxLength={6}
                                    className="code-input"
                                />
                            </div>
                        )}

                        {error && <p className="form-error">{error}</p>}

                        <button
                            className="submit-btn"
                            onClick={mode === "create" ? handleCreate : handleJoin}
                            // REMOVED the disabled condition - button always works
                        >
                            {mode === "create" ? "Create Room" : "Join Room"}
                        </button>
                    </div>
                )}

                {createdCode && (
                    <div className="form-card created-card">
                        <div className="created-icon">✓</div>
                        <h2>Room Created!</h2>
                        <p className="created-sub">Share this code with your friends</p>
                        <div className="room-code-display">
                            {createdCode.split("").map((ch, i) => (
                                <span key={i} className="code-char">{ch}</span>
                            ))}
                        </div>
                        <p className="created-tip">Everyone on the same WiFi or internet can join</p>
                        <button className="submit-btn" onClick={handleEnterCreated}>
                            Enter Room →
                        </button>
                    </div>
                )}

                <div className="feature-pills">
                    <span className="pill">🎯 NTP clock sync</span>
                    <span className="pill">⚡ &lt;20ms latency</span>
                    <span className="pill">🌐 Works over internet</span>
                    <span className="pill">🔊 Web Audio API</span>
                </div>
            </div>
        </div>
    );
}