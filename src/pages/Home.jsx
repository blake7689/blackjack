import { useNavigate } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { useGameActions } from "../hooks/useGame";
import "./pages.css";

export default function Home() {
  const { player } = usePlayer();
  const { startGame } = useGameActions();
  const nav = useNavigate();

  const onStart = () => {
    startGame();
    nav("/game");
  };

  return (
    <div className="page-bg">
      <div className="page-body">
        <div className="home-center">
          <h1>BlakeJack</h1>
          {!player ? (
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
