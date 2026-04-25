import React from 'react';
import { useRoom } from '../context/RoomContext';

export default function MembersPanel() {
    const { members, hostName, isHost, roomCode } = useRoom();

    return (
        <div className="members-panel">
            <div className="members-header">
                <h3>👥 Members</h3>
                <span className="room-code">Room: {roomCode}</span>
            </div>
            <div className="members-list">
                <div className="member-item host">
                    <span className="member-icon">👑</span>
                    <span className="member-name">{hostName || 'Host'}</span>
                    <span className="member-badge">Host</span>
                </div>
                {members.map((member) => (
                    <div key={member.id} className="member-item listener">
                        <span className="member-icon">🎧</span>
                        <span className="member-name">{member.name}</span>
                        <span className="member-badge">Listener</span>
                    </div>
                ))}
            </div>
            {isHost && (
                <div className="host-info">
                    <p>✨ You are the host</p>
                    <p>Share room code: <strong>{roomCode}</strong></p>
                </div>
            )}
        </div>
    );
}