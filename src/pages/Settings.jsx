import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import { GamePhases } from "../utils/constants/gamePhases";
import { DealerHoleOptions } from "../utils/constants/dealerHoleOptions";
import { RESET_SETTINGS } from "../utils/gameReducer";
import { validateField } from "../utils/validation";
import "./pages.css";

const PROFILE_FIELDS = [
  { name: "userName", label: "Username" },
  { name: "email", label: "Email" },
  { name: "password", label: "New password", type: "password", placeholder: "Leave blank to keep" },
  { name: "firstName", label: "First name" },
  { name: "lastName", label: "Last name" },
];

const dealerOptionLabel = (key) => key.replace(/_/g, " ").replace(/US|EU/g, (m) => ` (${m})`);

const GAME_SETTINGS = [
  { key: "deckCount", label: (v) => `Deck size: ${v}`, input: "range", min: 1, max: 5 },
  { key: "includeCutCard", label: () => "Include Cut Card", input: "checkbox" },
  { key: "resetInitialBet", label: () => "Reset Bet", input: "checkbox" },
  { key: "dealerHoleBehaviour", label: () => "Dealer Second Card Behaviour", input: "select" },
  { key: "blackJackOnSplit", label: () => "Blackjack on Split", input: "checkbox" },
  { key: "playTimeout", label: (v) => `Rate of Play: ${v / 1000} seconds`, input: "range", min: 250, max: 5000 },
];

function SettingInput({ setting, value, onChange }) {
  if (setting.input === "checkbox") {
    return <input type="checkbox" aria-label={setting.key} checked={value} onChange={(e) => onChange(e.target.checked)} style={{ marginRight: 8 }} />;
  }
  if (setting.input === "select") {
    return (
      <select aria-label={setting.key} value={value} onChange={(e) => onChange(e.target.value)} style={{ marginLeft: 8 }}>
        {Object.entries(DealerHoleOptions).map(([key, v]) => <option key={v} value={v}>{dealerOptionLabel(key)}</option>)}
      </select>
    );
  }
  return (
    <input type="range" aria-label={setting.key} min={setting.min} max={setting.max} value={value}
      onChange={(e) => onChange(Number(e.target.value))} style={{ marginLeft: 8, verticalAlign: "middle" }} />
  );
}

export default function Settings() {
  const { player, updatePlayer, deletePlayer } = usePlayer();
  const { settings, phase } = useGameState();
  const { changeSetting, resetGame } = useGameActions();
  const nav = useNavigate();
  const [form, setForm] = useState(() => ({
    userName: player?.userName ?? "",
    email: player?.email ?? "",
    password: "",
    firstName: player?.firstName ?? "",
    lastName: player?.lastName ?? "",
  }));
  const [drafts, setDrafts] = useState(settings);

  if (!player) return <div className="page-bg"><div style={{ padding: 16, color:"#fff" }}>Please log in to manage settings.</div></div>;

  const errors = Object.fromEntries(PROFILE_FIELDS.map(({ name }) => [name, validateField(name, form[name])]));
  const hasErrors = Object.values(errors).some(Boolean);
  const isUnchanged = PROFILE_FIELDS.every(({ name }) => (name === "password" ? form.password === "" : form[name] === player[name]));
  const midRound = phase !== GamePhases.NONE && phase !== GamePhases.PRE_DEAL;

  const save = async () => {
    try {
      await updatePlayer(form);
      setForm((f) => ({ ...f, password: "" }));
      alert("Saved");
    } catch (err) {
      alert(err.message || "Save failed");
    }
  };

  const remove = async () => {
    if (!confirm("Delete profile? This will inactivate your user.")) return;
    try {
      await deletePlayer();
      alert("Deleted");
      resetGame();
      nav("/");
    } catch (err) {
      alert(err.message || "Delete failed");
    }
  };

  const saveSetting = (key) => {
    if (RESET_SETTINGS.includes(key) && midRound && !confirm("Changing this setting will reset the current game. Any bets will be lost. Continue?")) return;
    changeSetting(key, drafts[key]);
  };

  return (
    <div className="page-bg">
      <div style={{ padding: 18, color: "#fff" }}>
        <button style={{marginBottom:16, background:'#1976d2', color:'#fff', padding:'8px 18px', borderRadius:8, fontWeight:'bold', float: 'right'}} onClick={() => nav("/game")}>
          Back to game
        </button>
        <h2>Settings</h2>
        <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />
        <div style={{ maxWidth: 720 }}>
          {PROFILE_FIELDS.map(({ name, label, type, placeholder }) => (
            <div key={name}>
              <label>{label} <input name={name} type={type} placeholder={placeholder} value={form[name]}
                onChange={(e) => setForm({ ...form, [name]: e.target.value })} style={{ marginLeft: '8px'}} /></label>
              {errors[name] && <div style={{ color: 'red', fontSize: '12px', marginTop: '4px' }}>{errors[name]}</div>}
            </div>
          ))}

          <div style={{ marginTop:12 }}>
            <button onClick={save} disabled={isUnchanged || hasErrors} style={{ cursor: (isUnchanged || hasErrors) ? "not-allowed" : "pointer" }}>Save</button>
            <button onClick={remove} style={{ marginLeft:8, background:"#b22", color:"#fff" }}>Delete Profile</button>
          </div>

          {GAME_SETTINGS.map((setting) => {
            const changed = drafts[setting.key] !== settings[setting.key];
            return (
              <div key={setting.key}>
                <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />
                <label>
                  {setting.label(drafts[setting.key])}
                  <SettingInput setting={setting} value={drafts[setting.key]}
                    onChange={(v) => setDrafts({ ...drafts, [setting.key]: v })} />
                </label>
                {changed && RESET_SETTINGS.includes(setting.key) && phase !== GamePhases.NONE && (
                  <div style={{ color: "red", marginTop: 4, marginBottom: 4 }}>Changing this setting will reset the current game.</div>
                )}
                <div>
                  <button aria-label={`Save ${setting.key}`} style={{ marginTop: 4, cursor: changed ? "pointer" : "not-allowed" }}
                    disabled={!changed} onClick={() => saveSetting(setting.key)}>
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
