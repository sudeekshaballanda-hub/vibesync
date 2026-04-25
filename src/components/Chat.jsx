import React, { useState, useRef, useEffect } from 'react';
import { useRoom } from '../context/RoomContext';

export default function Chat() {
    const { messages, sendChatMessage, isHost, roomCode } = useRoom();
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = () => {
        if (input.trim()) {
            sendChatMessage(input.trim());
            setInput('');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <div className="chat-container">
            <div className="chat-header">
                <h3>💬 Chat</h3>
                <span className="room-badge">Room: {roomCode}</span>
            </div>
            <div className="chat-messages">
                {messages.length === 0 ? (
                    <p className="no-messages">No messages yet. Start the conversation!</p>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={msg.id || idx} className={`chat-message ${msg.sender === 'You' ? 'own' : 'other'}`}>
                            <strong>{msg.sender || 'Unknown'}:</strong>
                            <span>{msg.text}</span>
                            <small>{new Date(msg.timestamp).toLocaleTimeString()}</small>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="chat-input">
                <input
                    type="text"
                    placeholder={isHost ? "Broadcast message..." : "Send message to room..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                />
                <button onClick={handleSend}>Send</button>
            </div>
        </div>
    );
}