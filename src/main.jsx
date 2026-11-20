import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import { PlayerProvider } from "./providers/PlayerProvider";
import { GameProvider } from "./providers/GameProvider";
import { initialGameState } from "./utils/gameReducer";
import { applyTheme, readLook } from "./utils/theme";
import "./tokens.css";
import "./index.css";

// Paint the last saved look at once; GameProvider's useTheme takes over (same values) and the saved settings then replace them.
applyTheme(readLook(initialGameState.settings), !!window.matchMedia?.("(prefers-color-scheme: light)").matches);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <PlayerProvider>
          <GameProvider>
            <App />
          </GameProvider>
        </PlayerProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
