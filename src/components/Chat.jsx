import React from 'react';

export default function Chat() {
    return (
        <div className="chat-container">
            <div className="chat-header">
                <h3>💬 Chat</h3>
            </div>
            <div className="chat-messages">
                <p className="no-messages">Chat ready!</p>
            </div>
            <div className="chat-input">
                <input type="text" placeholder="Type a message..." />
                <button>Send</button>
            </div>
        </div>
    );
}