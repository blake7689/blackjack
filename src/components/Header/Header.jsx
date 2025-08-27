import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "../../hooks/usePlayer";
import { useGame } from "../../hooks/useGame";
import "./Header.css";
import { GamePhases } from "../../../utils/constants/gamePhases";

export default function Header() {
  const { player, logout } = usePlayer();
  const { gamePhase, setGameStarted, setGameEnded, clearBetAndRefund, clearBetAndNoRefund } = useGame();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  const goHome = async () => {
    if (loc.pathname !== "/") {
      if (gamePhase !== GamePhases.PRE_DEAL) {
        const ok = window.confirm("Leave game and return Home? Any bet in the circle will be lost.");
        if (!ok) return;
        await clearBetAndNoRefund();
      }
      else {
        await clearBetAndRefund();
      }
      setGameStarted(false);
      setGameEnded(true);
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
    setGameStarted(false);
    setGameEnded(true);
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