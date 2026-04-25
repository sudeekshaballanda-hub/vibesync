import React, { useState } from "react";
import { RoomProvider } from "./context/RoomContext";
import Landing from "./components/Landing";
import RoomScreen from "./components/RoomScreen";

function App() {
    const [screen, setScreen] = useState("landing");

    return (
        <RoomProvider>
            {screen === "landing" ? (
                <Landing onEnterRoom={() => setScreen("room")} />
            ) : (
                <RoomScreen onLeave={() => setScreen("landing")} />
            )}
        </RoomProvider>
    );
}

export default App;