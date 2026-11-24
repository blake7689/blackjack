import { Routes, Route } from "react-router-dom";
import Sprite from "./components/Sprite/Sprite";
import { ErrorScreen, LoadingScreen } from "./components/PageScreens/PageScreens";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Game from "./pages/Game"
import { usePlayer } from "./hooks/usePlayer";
import "./App.css";

export default function App() {
  const { restoring, restoreFailed, retryRestore, skipRestore } = usePlayer();
  // A saved session is being restored (up to a cold API start), or could not be: Loading or Error on every page, never a page that thinks you are signed out.
  const gate = restoreFailed ? <ErrorScreen onRetry={retryRestore} onHome={skipRestore} /> : restoring ? <LoadingScreen /> : null;
  return (
    <div className="app-root">
      <Sprite />
      {gate ?? (
        <>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game" element={<Game />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/login" element={<Login key="login" />} />
            <Route path="/signup" element={<Login key="signup" signup />} />
          </Routes>
        </>
      )}
    </div>
  );
}
