import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "../../hooks/usePlayer";
import { useGame } from "../../hooks/useGame";
import "./Header.css";
import { GamePhases } from "../../utils/constants/gamePhases";

export default function Header() {
  const { player, logout } = usePlayer();
  const { gamePhase, refundLocal, resetGame } = useGame();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  const headerRef = useRef(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const setVar = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--header-height", `${h}px`);
    };
    setVar();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(setVar);
      ro.observe(el);
    }
    window.addEventListener("resize", setVar);
    return () => {
      try { ro && ro.disconnect(); } catch { /* ignore errors */ }
      window.removeEventListener("resize", setVar);
    };
  }, []);

  const goHome = async () => {
    if (loc.pathname !== "/") {
      if (gamePhase !== GamePhases.NONE && gamePhase !== GamePhases.PRE_DEAL) {
        const ok = window.confirm("Leave game and return Home? Any bet in the circle will be lost.");
        if (!ok) return;
      }
      else if (gamePhase === GamePhases.PRE_DEAL) { refundLocal(); }
      resetGame();
      nav("/");
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
    <header className="bj-header" ref={headerRef}>
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