import React, { useState, useRef, useEffect } from 'react';

export default function Chat({ messages, onSendMessage, roomCode }) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = () => {
        if (input.trim() && onSendMessage) {
            console.log('Sending message:', input);
            onSendMessage(input.trim());
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
                <h3>💬 Room Chat</h3>
                <span className="room-badge">{roomCode}</span>
            </div>
            <div className="chat-messages">
                {!messages || messages.length === 0 ? (
                    <p className="no-messages">💭 No messages yet. Start the conversation!</p>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={msg.id || idx} className="chat-message">
                            <strong>{msg.sender || 'Anonymous'}:</strong>
                            <span>{msg.text}</span>
                            <small>{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</small>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="chat-input">
                <input
                    type="text"
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                />
                <button onClick={handleSend}>📤 Send</button>
            </div>
        </div>
    );
}