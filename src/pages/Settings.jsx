import { useState } from "react";
import { usePlayer } from "../hooks/usePlayer";
import { useGame } from "../hooks/useGame";
import { useNavigate, useLocation } from "react-router-dom";
import { GamePhases } from "../utils/constants/gamePhases";
import "./pages.css"; 

export default function Settings() {
  const [hasBeenReset, setHasBeenReset] = useState(false);
  const loc = useLocation();
  const { player, updatePlayer, deletePlayer, logout } = usePlayer();
  const { deckCount, setDeckCount, resetGame, gamePhase, includeCutCard, setIncludeCutCard, refundLocal } = useGame();
  const [form, setForm] = useState({
    userName: player?.userName || "",
    email: player?.email || "",
    password: player?.password || "",
    firstName: player?.firstName || "",
    lastName: player?.lastName || "",
    credits: player?.credits || 0,
    deckCount: deckCount,
    includeCutCard: includeCutCard,
  });
  const nav = useNavigate();
  
  // Track previous location
  const [prevLocation] = useState(() => window.sessionStorage.getItem("prevLocation") || "/game");

  const onChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const onExit = () => { 
    if (loc.pathname !== "/" && hasBeenReset) {
      setHasBeenReset(false);
      nav("/game");
    } else if (hasBeenReset) {
      setHasBeenReset(false);
      nav("/");
    } else {
      nav(prevLocation);
    }
  }

  const save = async () => {
    if (!player) return alert("Log in first");
    try {
      await updatePlayer({ ...form, credits: Number(form.credits) });
      alert("Saved");
    } catch (err) {
      alert(err.message || "Save failed");
    }
  };

  const remove = async () => {
    if (!player) return;
    if (!confirm("Delete profile? This will inactivate your user.")) return;
    try {
      await deletePlayer();
      alert("Deleted");
    } catch (e) {
      alert(e.message || "Delete failed");
    }
    logout();
    resetGame();
    nav("/");
  };

  const changeDecks = (n) => { 
    const v = Math.min(5, Math.max(1, Number(n)));
    if (gamePhase !== GamePhases.NONE  && gamePhase !== GamePhases.PRE_DEAL) {
      if (!confirm("Changing deck size will reset the current game. Any bets will be lost. Continue?")) return;
    } else if (gamePhase === GamePhases.PRE_DEAL) {
      refundLocal();
    }
    setDeckCount(v);
    resetGame(v, form.includeCutCard ?? includeCutCard, GamePhases.PRE_DEAL);
    setHasBeenReset(true);
  };

  const changeIncludeCutCard = (c) => { 
    if (gamePhase !== GamePhases.NONE  && gamePhase !== GamePhases.PRE_DEAL) {
      if (!confirm("Changing cut card inclusion will reset the current game. Continue?")) return;
    } else if (gamePhase === GamePhases.PRE_DEAL) {
      refundLocal();
    }
    setIncludeCutCard(c);
    resetGame(form.deckCount ? Number(form.deckCount) : deckCount, c, GamePhases.PRE_DEAL); 
    setHasBeenReset(true);
  };

  if (!player) return <div className="page-bg"><div style={{ padding: 16, color:"#fff" }}>Please log in to manage settings.</div></div>;

  const isUnchanged = (
    form.userName === (player?.userName || "") &&
    form.email === (player?.email || "") &&
    form.password === (player?.password || "") &&
    form.firstName === (player?.firstName || "") &&
    form.lastName === (player?.lastName || "") &&
    String(form.credits) === String(player?.credits || 0)
  );

  return (
    <div className="page-bg">
      <div style={{ padding: 18, color: "#fff" }}>
        <button style={{marginBottom:16, background:'#1976d2', color:'#fff', padding:'8px 18px', borderRadius:8, fontWeight:'bold', float: 'right'}} onClick={onExit}>
          {hasBeenReset ? "Exit" : "Exit & Return"}
        </button>
        <h2>Settings</h2>
        <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />
        <div style={{ maxWidth: 720 }}>
          <div>
            <label>Username <input name="userName" value={form.userName} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
          </div>
          <div>
            <label>Email <input name="email" value={form.email} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
          </div>
          <div>
            <label>Password <input name="password" value={form.password} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
          </div>
          <div>
            <label>First name <input name="firstName" value={form.firstName} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
          </div>
          <div>
            <label>Last name <input name="lastName" value={form.lastName} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
          </div>
          <div>
            <label>Credits <input name="credits" type="number" value={form.credits} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
          </div>

          {/* disable button when no change has been made */}
          <div style={{ marginTop:12 }}>
            <button onClick={save} disabled={isUnchanged} style={{ cursor: !isUnchanged ? "pointer" : "not-allowed" }}>Save</button>
            <button onClick={remove} style={{ marginLeft:8, background:"#b22", color:"#fff" }}>Delete Profile</button>
          </div>

          <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />

          <div>
            <label>Deck size: {form.deckCount || deckCount}</label>
            <input
              type="range"
              min="1"
              max="5"
              value={form.deckCount || deckCount}
              onChange={(e) => setForm({ ...form, deckCount: e.target.value })}
              style={{ marginLeft: 8, verticalAlign: "middle" }}
            />
            {Number(form.deckCount) !== deckCount && gamePhase !== GamePhases.NONE && (
              <div style={{ color: "red", marginTop: 4, marginBottom: 4 }}>
                Changing deck size will reset the current game.
              </div>
            )}
            </div>
            <div>
              <button
                style={{
                  marginTop: 4,
                  cursor: Number(form.deckCount) !== deckCount ? "pointer" : "not-allowed"
                }}
                disabled={Number(form.deckCount) === deckCount}
                onClick={() => changeDecks(form.deckCount)}
              >
              Save
            </button>
          </div>

          <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />

          <div>
            <label>
              <input
                type="checkbox"
                checked={form.includeCutCard}
                onChange={(e) => setForm({ ...form, includeCutCard: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Include Cut Card
            </label>
            <div>
              {form.includeCutCard !== includeCutCard && gamePhase !== GamePhases.NONE && (
                <div style={{ color: "red", marginTop: 4, marginBottom: 4 }}>
                  Changing include cut card option will reset the current game.
                </div>
              )}
            </div>
            <div>
              <button
                style={{
                  marginTop: 4,
                  cursor: form.includeCutCard !== includeCutCard ? "pointer" : "not-allowed"
                }}
                onClick={() => changeIncludeCutCard(form.includeCutCard)}
                disabled={form.includeCutCard === includeCutCard}
              >
              Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}