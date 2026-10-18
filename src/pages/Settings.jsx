import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import { GamePhases } from "../utils/constants/gamePhases";
import { DealerHoleOptions } from "../utils/constants/dealerHoleOptions";
import { RESET_SETTINGS } from "../utils/gameReducer";
import { isEU } from "../utils/blackjackLogic";
import { RULE_PRESETS, CUSTOM, rulePresetOf } from "../utils/rulePresets";
import { validateField } from "../utils/validation";
import "./pages.css";

const PROFILE_FIELDS = [
  { name: "userName", label: "Username" },
  { name: "email", label: "Email" },
 { name: "firstName", label: "First name" },
  { name: "lastName", label: "Last name" },
];

const dealerOptionLabel = (key) => key.replace(/_/g, " ").replace(/US|EU/g, (m) => ` (${m})`);

const RESET_CONFIRM = "Changing this setting will reset the current game. Any bets will be lost. Continue?";

const TABS = [{ id: "player", label: "Player" }, { id: "game", label: "Game" }, { id: "dev", label: "Dev" }];

// Game settings with a tab of their own; the rest are on the Game tab.
const GAME_SETTINGS = [
  { key: "deckCount", label: (v) => `Deck size: ${v}`, input: "range", min: 1, max: 5 },
  { key: "includeCutCard", label: () => "Include Cut Card", input: "checkbox" },
  { key: "resetInitialBet", label: () => "Reset Bet", input: "checkbox" },
  { key: "dealerHoleBehaviour", label: () => "Dealer Second Card Behaviour", input: "select" },
  { key: "blackJackOnSplit", label: () => "Blackjack on Split", input: "checkbox" },
  { key: "dealerDrawsOnPlayerBlackjack", label: () => "EU: Dealer Draws 2nd Card on a Player Blackjack", input: "checkbox" },
  // With no dealer card to compare against, a blackjack must pay at once.
  { key: "blackjackPaysImmediately", label: () => "Blackjack Pays Immediately", input: "checkbox",
    forcedOn: (s) => isEU(s) && !s.dealerDrawsOnPlayerBlackjack },
  { key: "dealerDrawsOnceOn21", label: () => "EU: Dealer Draws Only Once Against a 21", input: "checkbox" },
  { key: "dealerDrawsOnPlayerBust", label: () => "Dealer Draws 2nd Card After a Player Bust", input: "checkbox" },
  { key: "playTimeout", label: (v) => `Rate of Play: ${v / 1000} seconds`, input: "range", min: 250, max: 5000, tab: "dev" },
  { key: "showCardCount", label: () => "Show Card Count", input: "checkbox", tab: "dev" },
];

function SettingInput({ setting, value, forced, onChange }) {
  if (setting.input === "checkbox") {
    return <input type="checkbox" aria-label={setting.key} checked={value || forced} disabled={forced}
      onChange={(e) => onChange(e.target.checked)} style={{ marginRight: 8 }} />;
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
  const { player, updatePlayer, changePassword, deletePlayer } = usePlayer();
  const { settings, phase } = useGameState();
  const { changeSetting, changeSettings, resetGame } = useGameActions();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "player";
  const [form, setForm] = useState(() => ({
    userName: player?.userName ?? "",
    email: player?.email ?? "",
    firstName: player?.firstName ?? "",
    lastName: player?.lastName ?? "",
  }));
  const [drafts, setDrafts] = useState(settings);
  const [passwords, setPasswords] = useState({ current: "", next: "" });

  if (!player) return <div className="page-bg"><div style={{ padding: 16, color:"#fff" }}>Please log in to manage settings.</div></div>;

  const errors = Object.fromEntries(PROFILE_FIELDS.map(({ name }) => [name, validateField(name, form[name])]));
  const hasErrors = Object.values(errors).some(Boolean);
  const isUnchanged = PROFILE_FIELDS.every(({ name }) => form[name] === player[name]);
  const newPasswordError = validateField("password", passwords.next);
  const canChangePassword = passwords.current !== "" && passwords.next !== "" && !newPasswordError;
  const midRound = phase !== GamePhases.NONE && phase !== GamePhases.PRE_DEAL;

  const save = async () => {
    try {
      await updatePlayer(form);
      alert("Saved");
    } catch (err) {
      alert(err.message || "Save failed");
    }
  };

  const savePassword = async () => {
    try {
      await changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "" });
      alert("Password changed");
    } catch (err) {
      alert(err.message || "Password change failed");
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
    if (RESET_SETTINGS.includes(key) && midRound && !confirm(RESET_CONFIRM)) return;
    changeSetting(key, drafts[key]);
  };

  // A preset changes every rule at once, with one reset confirmation.
  const applyPreset = (name) => {
    if (midRound && !confirm(RESET_CONFIRM)) return;
    setDrafts({ ...drafts, ...RULE_PRESETS[name] });
    changeSettings(RULE_PRESETS[name]);
  };

  return (
    <div className="page-bg">
      <div style={{ padding: 18, color: "#fff" }}>
        <button style={{marginBottom:16, background:'#1976d2', color:'#fff', padding:'8px 18px', borderRadius:8, fontWeight:'bold', float: 'right'}} onClick={() => nav("/game", { state: { settingsTab: tab } })}>
          Back to game
        </button>
        <h2>Settings</h2>
        <div role="tablist" style={{ display: "flex", gap: 8 }}>
          {TABS.map(({ id, label }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setParams({ tab: id }, { replace: true })}
              style={{ padding: 8, borderRadius: 8, background: tab === id ? "#2e7bff" : "#2b3a44", color: "#fff", border: "none" }}>
              {label}
            </button>
          ))}
        </div>
        <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />
        <div role="tabpanel" style={{ maxWidth: 720 }}>
          {tab === "player" && <>
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

          <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />
          <div>
            <label>Current password <input type="password" name="currentPassword" value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} style={{ marginLeft: "8px" }} /></label>
          </div>
          <div>
            <label>New password <input type="password" name="newPassword" value={passwords.next}
              onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} style={{ marginLeft: "8px" }} /></label>
            {newPasswordError && <div style={{ color: "red", fontSize: "12px", marginTop: "4px" }}>{newPasswordError}</div>}
          </div>
          <button onClick={savePassword} disabled={!canChangePassword} style={{ marginTop: 4, cursor: canChangePassword ? "pointer" : "not-allowed" }}>
            Change password
          </button>
          </>}

          {tab === "game" && (
          <label>
            Rules preset
            <select aria-label="rulePreset" value={rulePresetOf(drafts)} onChange={(e) => applyPreset(e.target.value)} style={{ marginLeft: 8 }}>
              {Object.keys(RULE_PRESETS).map((name) => <option key={name} value={name}>{name}</option>)}
              <option value={CUSTOM} disabled>{CUSTOM}</option>
            </select>
          </label>
          )}

          {GAME_SETTINGS.filter((setting) => (setting.tab ?? "game") === tab).map((setting) => {
            const changed = drafts[setting.key] !== settings[setting.key];
            return (
              <div key={setting.key}>
                <hr style={{ margin: "14px 0", borderColor: "rgba(255,255,255,0.06)" }} />
                <label>
                  {setting.label(drafts[setting.key])}
                  <SettingInput setting={setting} value={drafts[setting.key]} forced={setting.forcedOn?.(drafts) ?? false}
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
