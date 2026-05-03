import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RoomProvider } from './context/RoomContext';
import Landing from './components/Landing';
import RoomScreen from './components/RoomScreen';
import './index.css';

function App() {
    const [inRoom, setInRoom] = React.useState(false);

    const handleEnterRoom = () => {
        setInRoom(true);
    };

    const handleLeaveRoom = () => {
        setInRoom(false);
    };

    return (
        <RoomProvider>
            <BrowserRouter>
                <div className="App">
                    {!inRoom ? (
                        <Landing onEnterRoom={handleEnterRoom} />
                    ) : (
                        <RoomScreen onLeaveRoom={handleLeaveRoom} />
                    )}
                </div>
            </BrowserRouter>
        </RoomProvider>
    );
}

export default App;