import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "../../hooks/usePlayer";
import { useGame } from "../../hooks/useGame";
import "./Header.css";
import { GamePhases } from "../../utils/constants/gamePhases";

export default function Header() {
  const { player, logout } = usePlayer();
  const { gamePhase, clearBetAndRefund, clearBetAndNoRefund, resetGame } = useGame();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  const goHome = async () => {
    if (loc.pathname !== "/") {
      if (gamePhase !== GamePhases.PRE_DEAL && gamePhase !== GamePhases.POST_ROUND && gamePhase !== GamePhases.RESULTS && gamePhase !== GamePhases.END_ROUND) {
        const ok = window.confirm("Leave game and return Home? Any bet in the circle will be lost.");
        if (!ok) return;
        clearBetAndNoRefund();
      }
      else {
        clearBetAndRefund();
      }
      resetGame();
      nav("/");
    } else {
      if (gamePhase !== GamePhases.PRE_DEAL) {
        const ok = window.confirm("Reset and return to pre-deal? Any bet in the circle will be lost.");
        if (!ok) return;
      }
    }
  };

  const goSettings = () => nav("/settings");

  const onLogout = () => {
    const ok = window.confirm("Log out?");
    if (!ok) return;
    logout();
    resetGame();
    nav("/");
  };

  return (
    <header className="bj-header">
      <div className="bj-left">
        <button className="nav-btn" onClick={goHome}>Home</button>
        <button className="nav-btn" onClick={goSettings}>Settings</button>
      </div>

      <div className="bj-right">
        {player ? (
          <div className="user-menu">
            <button className="user-btn" onClick={() => setOpen(v => !v)}>{player.userName}</button>
            {open && (
              <div className="dropdown">
                <button onClick={onLogout}>Log out</button>
              </div>
            )}
          </div>
        ) : (
          <Link className="nav-btn" to="/login">Log in</Link>
        )}
      </div>
    </header>
  );
}