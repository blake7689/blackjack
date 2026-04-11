import { useState, useEffect } from "react";
import { usePlayer } from "../hooks/usePlayer";
import { useGame } from "../hooks/useGame";
import { useNavigate, useLocation } from "react-router-dom";
import { GamePhases } from "../utils/constants/gamePhases";
import { DealerHoleOptions as DealerHoleBehaviour } from "../utils/constants/dealerHoleOptions";
import "./pages.css"; 

export default function Settings() {
  const [hasBeenReset, setHasBeenReset] = useState(false);
  const loc = useLocation();
  const { player, updatePlayer, deletePlayer, logout } = usePlayer();
  const { deckCount, setDeckCount, resetGame, gamePhase, includeCutCard, setIncludeCutCard, refundLocal, playTimeout, setPlayTimeout, dealerHoleBehaviour, setDealerHoleBehaviour, blackJackOnSplit, setBlackJackOnSplit } = useGame();
  const [form, setForm] = useState({
    userName: player?.userName || "",
    email: player?.email || "",
    password: player?.password || "",
    firstName: player?.firstName || "",
    lastName: player?.lastName || "",
    credits: player?.credits || 0,
    deckCount: deckCount,
    includeCutCard: includeCutCard,
    playTimeout: playTimeout,
    dealerHoleBehaviour: dealerHoleBehaviour,
    blackJackOnSplit: blackJackOnSplit,

  });
  const [errors, setErrors] = useState({});
  const nav = useNavigate();
  
  // Track previous location
  const [prevLocation] = useState(() => window.sessionStorage.getItem("prevLocation") || "/game");

  useEffect(() => {
    // Validate initial values
    Object.keys(form).forEach(key => {
      if (['userName', 'email', 'password', 'firstName', 'lastName', 'credits'].includes(key)) {
        validateField(key, form[key]);
      }
    });
  }, []);

  const onChange = e => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    validateField(name, value);
  };

  const validateField = (name, value) => {
    let error = "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const num = Number(value);
    switch (name) {
      case "userName":
        if (!value.trim()) error = "Username is required.";
        else if (value.length < 3) error = "Username must be at least 3 characters.";
        break;
      case "email": 
        if (!value.trim()) error = "Email is required.";
        else if (!emailRegex.test(value)) error = "Invalid email format.";
        break;
      case "password":
        if (value && value.length < 6) error = "Password must be at least 6 characters.";
        break;
      case "firstName":
        if (!value.trim()) error = "First name is required.";
        break;
      case "lastName":
        if (!value.trim()) error = "Last name is required.";
        break;
      case "credits": 
        if (isNaN(num) || num < 0) error = "Credits must be a non-negative number.";
        break;
      default:
        break;
    }
    setErrors({ ...errors, [name]: error });
  };

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
    if (Object.values(errors).some(e => e)) return alert("Please fix the errors before saving.");
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

   const changeDealerHoleBehaviour = (d) => { 
    if (gamePhase !== GamePhases.NONE  && gamePhase !== GamePhases.PRE_DEAL) {
      if (!confirm("Changing dealer hole behaviour will reset the current game. Continue?")) return;
    } else if (gamePhase === GamePhases.PRE_DEAL) {
      refundLocal();
    }
    setDealerHoleBehaviour(d);
    resetGame(form.deckCount ? Number(form.deckCount) : deckCount, form.includeCutCard ?? includeCutCard, GamePhases.PRE_DEAL); 
    setHasBeenReset(true);
  };

    const changeBlackJackOnSplit = (b) => { 
    if (gamePhase !== GamePhases.NONE  && gamePhase !== GamePhases.PRE_DEAL) {
      if (!confirm("Changing blackjack on split option will reset the current game. Continue?")) return;
    } else if (gamePhase === GamePhases.PRE_DEAL) {
      refundLocal();
    }
    setBlackJackOnSplit(b);
    resetGame(form.deckCount ? Number(form.deckCount) : deckCount, form.includeCutCard ?? includeCutCard, GamePhases.PRE_DEAL); 
    setHasBeenReset(true);
  };

  const changePlayTimeout= (t) => { 
    setPlayTimeout(t);
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

  const hasErrors = Object.values(errors).some(e => e);

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
            {errors.userName && <div style={{ color: 'red', fontSize: '12px', marginTop: '4px' }}>{errors.userName}</div>}
          </div>
          <div>
            <label>Email <input name="email" value={form.email} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
            {errors.email && <div style={{ color: 'red', fontSize: '12px', marginTop: '4px' }}>{errors.email}</div>}
          </div>
          <div>
            <label>Password <input name="password" value={form.password} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
            {errors.password && <div style={{ color: 'red', fontSize: '12px', marginTop: '4px' }}>{errors.password}</div>}
          </div>
          <div>
            <label>First name <input name="firstName" value={form.firstName} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
            {errors.firstName && <div style={{ color: 'red', fontSize: '12px', marginTop: '4px' }}>{errors.firstName}</div>}
          </div>
          <div>
            <label>Last name <input name="lastName" value={form.lastName} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
            {errors.lastName && <div style={{ color: 'red', fontSize: '12px', marginTop: '4px' }}>{errors.lastName}</div>}
          </div>
          <div>
            <label>Credits <input name="credits" type="number" value={form.credits} onChange={onChange} style={{ marginLeft: '8px'}} /></label>
            {errors.credits && <div style={{ color: 'red', fontSize: '12px', marginTop: '4px' }}>{errors.credits}</div>}
          </div>

          {/* disable button when no change has been made */}
          <div style={{ marginTop:12 }}>
            <button onClick={save} disabled={isUnchanged || hasErrors} style={{ cursor: (isUnchanged || hasErrors) ? "not-allowed" : "pointer" }}>Save</button>
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

          <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />

          <div>
            <label>
              Dealer Second Card Behaviour
              <select
                value={form.dealerHoleBehaviour}
                onChange={(e) => setForm({ ...form, dealerHoleBehaviour: e.target.value })}
                style={{ marginLeft: 8 }}
              >
                {Object.entries(DealerHoleBehaviour).map(([key, value]) => (
                  <option key={value} value={value}>
                    {key.replace(/_/g, ' ').replace(/US|EU/g, match => ` (${match})`)}
                  </option>
                ))}
              </select>
            </label>
            <div>
              {form.dealerHoleBehaviour !== dealerHoleBehaviour && gamePhase !== GamePhases.NONE && (
                <div style={{ color: "red", marginTop: 4, marginBottom: 4 }}>
                  Changing dealer second card behaviour option will reset the current game.
                </div>
              )}
            </div>
            <div>
              <button
                style={{
                  marginTop: 4,
                  cursor: form.dealerHoleBehaviour !== dealerHoleBehaviour ? "pointer" : "not-allowed"
                }}
                onClick={() => changeDealerHoleBehaviour(form.dealerHoleBehaviour)}
                disabled={form.dealerHoleBehaviour === dealerHoleBehaviour}
              >
              Save
              </button>
            </div>
          </div>

          <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />

          <div>
            <label>
              <input
                type="checkbox"
                checked={form.blackJackOnSplit}
                onChange={(e) => setForm({ ...form, blackJackOnSplit: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Blackjack on Split
            </label>
            <div>
              {form.blackJackOnSplit !== blackJackOnSplit && gamePhase !== GamePhases.NONE && (
                <div style={{ color: "red", marginTop: 4, marginBottom: 4 }}>
                  Changing blackjack on split option will reset the current game.
                </div>
              )}
            </div>
            <div>
              <button
                style={{
                  marginTop: 4,
                  cursor: form.blackJackOnSplit !== blackJackOnSplit ? "pointer" : "not-allowed"
                }}
                onClick={() => changeBlackJackOnSplit(form.blackJackOnSplit)}
                disabled={form.blackJackOnSplit === blackJackOnSplit}
              >
              Save
              </button>
            </div>
          </div>

          <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />

          <div>
            <label>Rate of Play: {(form.playTimeout || playTimeout)/1000} seconds</label>
            <input
              type="range"
              min="250"
              max="5000"
              value={form.playTimeout || playTimeout}
              onChange={(e) => setForm({ ...form, playTimeout: e.target.value })}
              style={{ marginLeft: 8, verticalAlign: "middle" }}
            />
            </div>
            <div>
              <button
                style={{
                  marginTop: 4,
                  cursor: Number(form.playTimeout) !== playTimeout ? "pointer" : "not-allowed"
                }}
                disabled={Number(form.playTimeout) === playTimeout}
                onClick={() => changePlayTimeout(form.playTimeout)}
              >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}