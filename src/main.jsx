import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { PlayerProvider } from "./providers/PlayerProvider";
import { GameProvider } from "./providers/GameProvider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <PlayerProvider>
        <GameProvider>
          <App />
        </GameProvider>
      </PlayerProvider>
    </BrowserRouter>
  </React.StrictMode>
);
