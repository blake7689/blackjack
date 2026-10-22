import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import { GamePhases } from "../utils/constants/gamePhases";
import { DealerHoleLabels } from "../utils/constants/dealerHoleOptions";
import { RESET_SETTINGS, SETTING_RANGES } from "../utils/gameReducer";
import { isEU } from "../utils/blackjackLogic";
import { RULE_PRESETS, CUSTOM, rulePresetOf } from "../utils/rulePresets";
import { validateField } from "../utils/validation";
import { ALLOWED_CHIPS } from "../utils/constants/chips";
import { parseChipValues, formatChipValues } from "../utils/chips";
import "./pages.css";

const PROFILE_FIELDS = [
  { name: "userName", label: "Username" },
  { name: "email", label: "Email" },
 { name: "firstName", label: "First name" },
  { name: "lastName", label: "Last name" },
];


const RESET_CONFIRM = "Changing this setting will reset the current game. Any bets will be lost. Continue?";

const TABS = [{ id: "player", label: "Player" }, { id: "game", label: "Game" }, { id: "dev", label: "Dev" }];

// Game settings with a tab of their own; the rest are on the Game tab.
const GAME_SETTINGS = [
  { key: "deckCount", label: (v) => `Deck size: ${v}`, input: "range", range: SETTING_RANGES.deckCount },
  { key: "includeCutCard", label: () => "Include Cut Card", input: "checkbox" },
  { key: "resetInitialBet", label: () => "Reset Bet", input: "checkbox" },
  { key: "dealerHoleBehaviour", label: () => "Dealer Second Card Behaviour", input: "select",
    options: Object.entries(DealerHoleLabels).map(([value, label]) => ({ value, label })) },
  { key: "blackJackOnSplit", label: () => "Blackjack on Split", input: "checkbox" },
  { key: "maxSplitHands", label: (v) => `Max Hands After Splits: ${v === 0 ? "Unlimited" : v}`, input: "select",
    options: [2, 3, 4].map((n) => ({ value: n, label: String(n) })).concat({ value: 0, label: "Unlimited" }) },
  { key: "dealerDrawsOnPlayerBlackjack", label: () => "EU: Dealer Draws 2nd Card on a Player Blackjack", input: "checkbox" },
  // With no dealer card to compare against, a blackjack must pay at once.
  { key: "blackjackPaysImmediately", label: () => "Blackjack Pays Immediately", input: "checkbox",
    forcedOn: (s) => isEU(s) && !s.dealerDrawsOnPlayerBlackjack },
  { key: "dealerDrawsOnceOn21", label: () => "EU: Dealer Draws Only Once Against a 21", input: "checkbox" },
  { key: "dealerDrawsOnPlayerBust", label: () => "Dealer Draws 2nd Card After a Player Bust", input: "checkbox" },
  { key: "chipValues", label: () => "Chips to show", input: "chips" },
  { key: "playTimeout", label: (v) => `Rate of Play: ${v / 1000} seconds`, input: "range", range: SETTING_RANGES.playTimeout, tab: "dev" },
  { key: "showCardCount", label: () => "Show Card Count", input: "checkbox", tab: "dev" },
];

function SettingInput({ setting, value, forced, onChange }) {
  if (setting.input === "checkbox") {
    return <input type="checkbox" aria-label={setting.key} checked={value || forced} disabled={forced}
      onChange={(e) => onChange(e.target.checked)} className="checkbox-input" />;
  }
  if (setting.input === "chips") {
    const chosen = parseChipValues(value);
    return ALLOWED_CHIPS.map((chip) => (
      <label key={chip} className="chip-option">
        <input type="checkbox" aria-label={`chip ${chip}`} className="checkbox-input" checked={chosen.includes(chip)}
          disabled={chosen.length === 1 && chosen[0] === chip}
          onChange={(e) => onChange(formatChipValues(e.target.checked ? [...chosen, chip] : chosen.filter((c) => c !== chip)))} />
        ${chip.toLocaleString()}
      </label>
    ));
  }
  if (setting.input === "select") {
    return (
      <select aria-label={setting.key} value={value} className="field-input"
        onChange={(e) => onChange(setting.options.find((o) => String(o.value) === e.target.value).value)}>
        {setting.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input type="range" aria-label={setting.key} min={setting.range[0]} max={setting.range[1]} value={value}
      onChange={(e) => onChange(Number(e.target.value))} className="range-input" />
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
  // Only unsaved edits are kept here, so settings that load after the page opens (#36) still show.
  const [edits, setEdits] = useState({});
  const drafts = { ...settings, ...edits };
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  // One inline message line for the page's results (instead of alerts).
  const [notice, setNotice] = useState(null);
  const done = (text) => setNotice({ text });
  const failed = (text) => setNotice({ text, error: true });

  if (!player) return <div className="page-bg"><div className="page-message">Please log in to manage settings.</div></div>;

  const errors = Object.fromEntries(PROFILE_FIELDS.map(({ name }) => [name, validateField(name, form[name])]));
  const hasErrors = Object.values(errors).some(Boolean);
  const isUnchanged = PROFILE_FIELDS.every(({ name }) => form[name] === player[name]);
  const newPasswordError = validateField("password", passwords.next);
  const canChangePassword = passwords.current !== "" && passwords.next !== "" && !newPasswordError;
  const midRound = phase !== GamePhases.NONE && phase !== GamePhases.PRE_DEAL;

  const save = async () => {
    try {
      await updatePlayer(form);
      done("Saved");
    } catch (err) {
      failed(err.message || "Save failed");
    }
  };

  const savePassword = async () => {
    try {
      await changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "" });
      done("Password changed");
    } catch (err) {
      failed(err.message || "Password change failed");
    }
  };

  const remove = async () => {
    if (!confirm("Delete profile? This will inactivate your user.")) return;
    try {
      await deletePlayer();
      resetGame();
      nav("/");
    } catch (err) {
      failed(err.message || "Delete failed");
    }
  };

  const saveSetting = (key) => {
    if (RESET_SETTINGS.includes(key) && midRound && !confirm(RESET_CONFIRM)) return;
    remember(changeSetting(key, drafts[key]));
  };

  // A setting applies at once; if saving it to the server fails it still applies here, and we say so.
  const remember = (saving) => saving.then(() => setNotice(null),
    () => failed("Couldn't save your settings to your account. They apply here until you reload."));

  // A preset changes every rule at once, with one reset confirmation.
  const applyPreset = (name) => {
    if (midRound && !confirm(RESET_CONFIRM)) return;
    setEdits({ ...edits, ...RULE_PRESETS[name] });
    remember(changeSettings(RULE_PRESETS[name]));
  };

  return (
    <div className="page-bg">
      <div className="settings-body">
        <button className="back-btn" onClick={() => nav("/game", { state: { settingsTab: tab } })}>
          Back to game
        </button>
        <h2>Settings</h2>
        <div role="tablist" className="tabs">
          {TABS.map(({ id, label }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setParams({ tab: id }, { replace: true })}
              className={`tab-btn${tab === id ? " active" : ""}`}>
              {label}
            </button>
          ))}
        </div>
        {notice && <div role="status" className={`notice${notice.error ? " error" : ""}`}>{notice.text}</div>}
        <hr className="divider" />
        <div role="tabpanel" className="settings-panel">
          {tab === "player" && <>
          {PROFILE_FIELDS.map(({ name, label, type, placeholder }) => (
            <div key={name}>
              <label>{label} <input name={name} type={type} placeholder={placeholder} value={form[name]}
                onChange={(e) => setForm({ ...form, [name]: e.target.value })} className="field-input" /></label>
              {errors[name] && <div className="field-error">{errors[name]}</div>}
            </div>
          ))}

          <div className="actions-row">
            <button onClick={save} disabled={isUnchanged || hasErrors} className="save-btn">Save</button>
            <button onClick={remove} className="danger-btn">Delete Profile</button>
          </div>

          <hr className="divider" />
          <div>
            <label>Current password <input type="password" name="currentPassword" value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} className="field-input" /></label>
          </div>
          <div>
            <label>New password <input type="password" name="newPassword" value={passwords.next}
              onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} className="field-input" /></label>
            {newPasswordError && <div className="field-error">{newPasswordError}</div>}
          </div>
          <button onClick={savePassword} disabled={!canChangePassword} className="save-btn spaced">
            Change password
          </button>
          </>}

          {tab === "game" && (
          <label>
            Rules preset
            <select aria-label="rulePreset" value={rulePresetOf(drafts)} onChange={(e) => applyPreset(e.target.value)} className="field-input">
              {Object.keys(RULE_PRESETS).map((name) => <option key={name} value={name}>{name}</option>)}
              <option value={CUSTOM} disabled>{CUSTOM}</option>
            </select>
          </label>
          )}

          {GAME_SETTINGS.filter((setting) => (setting.tab ?? "game") === tab).map((setting) => {
            const changed = drafts[setting.key] !== settings[setting.key];
            return (
              <div key={setting.key}>
                <hr className="divider" />
                {setting.input === "chips" ? (
                  <fieldset className="chip-options">
                    <legend>{setting.label(drafts[setting.key])}</legend>
                    <SettingInput setting={setting} value={drafts[setting.key]} onChange={(v) => setEdits({ ...edits, [setting.key]: v })} />
                  </fieldset>
                ) : (
                  <label>
                    {setting.label(drafts[setting.key])}
                    <SettingInput setting={setting} value={drafts[setting.key]} forced={setting.forcedOn?.(drafts) ?? false}
                      onChange={(v) => setEdits({ ...edits, [setting.key]: v })} />
                  </label>
                )}
                {changed && RESET_SETTINGS.includes(setting.key) && phase !== GamePhases.NONE && (
                  <div className="reset-warning">Changing this setting will reset the current game.</div>
                )}
                <div>
                  <button aria-label={`Save ${setting.key}`} className="save-btn spaced"
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
