import { useNavigate } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import Wordmark from "../components/Wordmark/Wordmark";
import "./pages.css";

export default function Home() {
  const { player, restoring } = usePlayer();
  const { starting } = useGameState();
  const { startGame } = useGameActions();
  const nav = useNavigate();

  const onStart = () => {
    startGame();
    nav("/game");
  };

  // A saved session being restored (up to a cold API start), or a player just signed in whose table is about to start (DESIGN section 8):
  // Loading, never a flash of Home. A signed-in player opens on the table; Home is reached from its menu. //
  const loading = restoring || starting;

  return (
    <div className="page-bg">
      <div className="page-body">
        <div className="home-center" role={loading ? "status" : undefined}>
          <h1>
            <Wordmark className="home-wordmark" />
            <span className="sr-only">Blakejack</span>
          </h1>
          {loading ? (
            <p>Shuffling up...</p>
          ) : !player ? (
            <p>Please log in to start playing.</p>
          ) : (
            <button onClick={onStart} className="start-btn">
              Start Game
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
