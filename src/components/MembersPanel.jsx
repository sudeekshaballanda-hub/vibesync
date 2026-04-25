import React from "react";
import { useRoom } from "../context/RoomContext";

function LatencyBadge({ ms }) {
    if (!ms) return <span className="lat-badge lat-unknown">—</span>;
    const cls = ms < 50 ? "lat-good" : ms < 150 ? "lat-ok" : "lat-bad";
    return <span className={`lat-badge ${cls}`}>{ms}ms</span>;
}

function EqBars({ active }) {
    if (!active) return null;
    return (
        <div className="eq-bars">
            <span className="eq-bar" style={{ "--delay": "0s", "--h": "60%" }} />
            <span className="eq-bar" style={{ "--delay": "0.15s", "--h": "100%" }} />
            <span className="eq-bar" style={{ "--delay": "0.05s", "--h": "75%" }} />
            <span className="eq-bar" style={{ "--delay": "0.2s", "--h": "50%" }} />
        </div>
    );
}

export default function MembersPanel() {
    const { members, userId, isPlaying, roomCode } = useRoom();

    const copyCode = () => {
        navigator.clipboard.writeText(roomCode).catch(() => { });
    };

    return (
        <div className="members-panel">
            <div className="panel-header">
                <span>In the room</span>
                <span className="member-count">{members.length}</span>
            </div>

            <div className="room-code-strip" onClick={copyCode} title="Click to copy">
                <span className="rcs-label">Room code</span>
                <span className="rcs-code">{roomCode}</span>
                <span className="rcs-copy">⧉</span>
            </div>

            <div className="members-list">
                {members.map(m => (
                    <div key={m.userId} className={`member-row ${m.userId === userId ? "self" : ""}`}>
                        <div className="member-avatar">
                            {m.username?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="member-info">
                            <div className="member-name">
                                {m.username}
                                {m.userId === userId && <span className="you-tag">you</span>}
                                {m.isHost && <span className="host-tag">host</span>}
                            </div>
                            <LatencyBadge ms={m.latency} />
                        </div>
                        <EqBars active={isPlaying} />
                    </div>
                ))}

                {members.length === 0 && (
                    <div className="no-members">Share the room code to invite friends</div>
                )}
            </div>
        </div>
    );
}