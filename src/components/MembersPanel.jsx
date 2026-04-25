import React from 'react';

export default function MembersPanel({ members, hostName, isHost, roomCode }) {
    return (
        <div className="members-panel">
            <div className="members-header">
                <h3>👥 Members ({(members?.length || 0) + 1})</h3>
                <span className="room-code">{roomCode}</span>
            </div>
            <div className="members-list">
                <div className={`member-item ${isHost ? 'current-user' : ''}`}>
                    <span className="member-icon">👑</span>
                    <span className="member-name">{hostName || 'Host'}</span>
                    <span className="member-badge host-badge">Host</span>
                    {isHost && <span className="you-badge">(You)</span>}
                </div>

                {members && members.map((member) => (
                    <div key={member.id} className="member-item">
                        <span className="member-icon">🎧</span>
                        <span className="member-name">{member.name}</span>
                        <span className="member-badge listener-badge">Listener</span>
                    </div>
                ))}
            </div>

            {isHost && (
                <div className="host-tip">
                    <p>✨ You're the host!</p>
                    <p>Share code: <strong>{roomCode}</strong></p>
                </div>
            )}
        </div>
    );
}