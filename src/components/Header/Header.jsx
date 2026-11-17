import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePlayer } from "../../hooks/usePlayer";
import { useNavActions } from "../../hooks/useNavActions";
import { useCssVarHeight } from "../../hooks/useCssVarHeight";
import "./Header.css";

// The page header of Home, Settings and Log in. The table has its own top bar (TopBar), so App does not show this one on /game. //
export default function Header() {
  const { player } = usePlayer();
  const { goHome, goSettings, logOut } = useNavActions();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
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

  const onLogout = () => {
    setOpen(false);
    logOut();
  };

  return (
    <header className="bj-header" ref={headerRef}>
      <div className="bj-left">
        <button className="nav-btn" onClick={goHome}>Home</button>
        <button className="nav-btn" onClick={() => goSettings()}>Settings</button>
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
