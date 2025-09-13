import { useNavigate } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { useGame } from "../hooks/useGame";

export default function Home() {
  const { player } = usePlayer();
  const { startGame } = useGame();
  const nav = useNavigate();

  const onStart = () => {
    if (!player) { nav("/login"); return; }
    startGame();
    nav("/game");
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ textAlign:"center", marginTop:36 }}>
        <h1 style={{ color:"#fff" }}>Blackjack</h1>
        {!player ? (
          <p style={{ color:"#fff" }}>Please log in to start playing.</p>
        ) : (
          <button onClick={onStart} style={{ padding:"12px 20px", borderRadius:10, border:"none", background:"#1db954", color:"#fff", fontSize:18 }}>
            Start Game
          </button>
        )}
      </div>
    </div>
  );
}