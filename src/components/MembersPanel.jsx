import React from 'react';
import { useRoom } from '../context/RoomContext';

export default function MembersPanel() {
    const { members, hostName, isHost, roomCode } = useRoom();

    return (
        <div className="members-panel">
            <div className="members-header">
                <h3>👥 Members in Room</h3>
                <span className="room-code">{roomCode}</span>
            </div>
            <div className="members-list">
                {/* Host always displayed */}
                <div className={`member-item ${isHost ? 'current-user' : ''}`}>
                    <span className="member-icon">👑</span>
                    <span className="member-name">{hostName || 'Host'}</span>
                    <span className="member-badge host-badge">Host</span>
                    {isHost && <span className="you-badge">(You)</span>}
                </div>

                {/* Listeners */}
                {members && members.map((member) => (
                    <div key={member.id} className="member-item listener-item">
                        <span className="member-icon">🎧</span>
                        <span className="member-name">{member.name}</span>
                        <span className="member-badge listener-badge">Listener</span>
                    </div>
                ))}
            </div>

            {isHost && (
                <div className="host-tip">
                    <p>✨ You're the host!</p>
                    <p>Share this code: <strong>{roomCode}</strong></p>
                </div>
            )}
        </div>
    );
}