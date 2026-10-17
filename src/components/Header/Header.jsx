import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "../../hooks/usePlayer";
import { useGameActions } from "../../hooks/useGame";
import { useCssVarHeight } from "../../hooks/useCssVarHeight";
import "./Header.css";
import { GamePhases } from "../../utils/constants/gamePhases";

export default function Header() {
  const { player, logout } = usePlayer();
  const { getPhase, resetGame } = useGameActions();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const headerRef = useRef(null);
  const menuRef = useRef(null);
  useCssVarHeight(headerRef, "--header-height");

  // Closing on logout too keeps menuRef mounted while the outside-click listener runs.
  const loggedIn = Boolean(player);
  useEffect(() => setOpen(false), [loc.pathname, loggedIn]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => { if (!menuRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const goHome = () => {
    if (loc.pathname === "/") return;
    const phase = getPhase();
    // A bet still in the circle is refunded by the reset; one already dealt is lost.
    if (phase !== GamePhases.NONE && phase !== GamePhases.PRE_DEAL
      && !window.confirm("Leave game and return Home? Any bet in the circle will be lost.")) return;
    resetGame();
    nav("/");
  };

  const onLogout = () => {
    setOpen(false);
    if (!window.confirm("Log out?")) return;
    resetGame();
    logout();
    nav("/");
  };

  return (
    <header className="bj-header" ref={headerRef}>
      <div className="bj-left">
        <button className="nav-btn" onClick={goHome}>Home</button>
        <button className="nav-btn" onClick={() => nav("/settings")}>Settings</button>
      </div>

      <div className="bj-right">
        {player ? (
          <div className="user-menu" ref={menuRef}>
            <button className="user-btn" onClick={() => setOpen((v) => !v)}>{player.userName}</button>
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
