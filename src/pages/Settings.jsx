import { useState } from "react";
import { usePlayer } from "../hooks/usePlayer";
import { useGame } from "../hooks/useGame";
import { useNavigate } from "react-router-dom";
import { GamePhases } from "../utils/constants/gamePhases";

export default function Settings() {
  const { player, updatePlayer, deletePlayer, logout } = usePlayer();
  const { deckCount, setDeckCount, resetGame, gamePhase} = useGame();
  const [form, setForm] = useState({
    userName: player?.userName || "",
    email: player?.email || "",
    password: player?.password || "",
    firstName: player?.firstName || "",
    lastName: player?.lastName || "",
    credits: player?.credits || 0
  });
  const nav = useNavigate();
  
  // Track previous location
  const [prevLocation] = useState(() => window.sessionStorage.getItem("prevLocation") || "/game");

  const onChange = e => setForm({ ...form, [e.target.name]: e.target.value });

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

  const changeDecks = (n) => { // re-work //!!
    const v = Math.min(5, Math.max(1, Number(n)));
    if (gamePhase !== GamePhases.PRE_DEAL) {
      if (!confirm("Changing deck size will reset the current game. Continue?")) return;
    }
    setDeckCount(v);
    resetGame(v); // is this called when deck count changes? prop needed?
  };

  if (!player) return <div style={{ padding: 16, color:"#fff" }}>Please log in to manage settings.</div>;

  return (
    <div style={{ padding: 18, color: "#fff" }}>
      <h2>Settings</h2>
      <button style={{marginBottom:16, background:'#1976d2', color:'#fff', padding:'8px 18px', borderRadius:8, fontWeight:'bold'}} onClick={() => nav(prevLocation)}>Exit & Return</button>
      <div style={{ maxWidth: 720 }}>
        <label>Username<input name="userName" value={form.userName} onChange={onChange} /></label>
        <label>Email<input name="email" value={form.email} onChange={onChange} /></label>
        <label>Password<input name="password" value={form.password} onChange={onChange} /></label>
        <label>First name<input name="firstName" value={form.firstName} onChange={onChange} /></label>
        <label>Last name<input name="lastName" value={form.lastName} onChange={onChange} /></label>
        <label>Credits<input name="credits" type="number" value={form.credits} onChange={onChange} /></label>

        <div style={{ marginTop:12 }}>
          <button onClick={save}>Save</button>
          <button onClick={remove} style={{ marginLeft:8, background:"#b22", color:"#fff" }}>Delete Profile</button>
        </div>

        <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />

        <div>
          <label>Deck size: {deckCount}</label>
          <input type="range" min="1" max="5" value={deckCount} onChange={(e) => changeDecks(e.target.value)} />
        </div>
      </div>
    </div>
  );
}