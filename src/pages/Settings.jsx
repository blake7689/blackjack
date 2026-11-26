import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import { useNavActions } from "../hooks/useNavActions";
import { useTheme } from "../hooks/useTheme";
import { GamePhases } from "../utils/constants/gamePhases";
import { SETTING_RANGES } from "../utils/gameReducer";
import { RULES_TITLE, APP_SETTINGS, TABLE_MESSAGES, CURRENCIES, resetsTable } from "../utils/ruleCatalog";
import { rulePresetOf } from "../utils/rulePresets";
import { houseEdge, formatEdge } from "../utils/houseEdge";
import { SPEED_STOPS, posToMs, msToPos, speedName, speedText } from "../utils/gameSpeed";
import { FELTS, ACCENTS, applyTheme } from "../utils/theme";
import { leaveGuard } from "../utils/leaveGuard";
import { validateField } from "../utils/validation";
import { ALLOWED_CHIPS } from "../utils/constants/chips";
import { parseChipValues, formatChipValues } from "../utils/chips";
import { money, symbolOf } from "../utils/money";
import { Chip } from "../components/Chip/Chip";
import RulesSection from "../components/RulesSection/RulesSection";
import ConfirmDialog from "../components/SettingsControls/ConfirmDialog";
import { HintLayer, Section, Row, Radio, Switch, Slider } from "../components/SettingsControls/Controls";
import "./pages.css";

// Settings (#84): one page, no tabs. Every section is an accordion card (closed on arrival, one open at a time; a deep link such as
// /settings#rules opens its section). Every setting and profile field is a draft in `edits`, the rules included; a sticky bar shows the
// change count and Save / Discard. Save sends only the keys that changed, the profile first (its failure never blocks the settings), and
// a changed RESET_SETTINGS key asks "Start a new shoe?" first during a round. A dirty draft asks "Discard your changes?" before leaving.
// Changing the username or email, and deleting the profile, need the current password (BlackJackAPI#71). It is never part of the draft.

const SECTIONS = ["rules", "play", "chips", "look", "sound", "account"];
const PROFILE = ["userName", "email", "firstName", "lastName"];
const IDENTITY = ["userName", "email"]; // changing one needs the current password
const WRONG_PASSWORD = "Incorrect password."; // the API's words, for a wrong password and a lockout alike
const PROFILE_FIELDS = { userName: ["Username", "username"], email: ["Email", "email"], firstName: ["First name", "given-name"], lastName: ["Last name", "family-name"] };
const PLAY_KEYS = ["playTimeout", "resetInitialBet", "showTotals", "showCardCount", "autoDeal", "autoDealDelay", "tableMessages", "showKeyHints"];
const LOOK_KEYS = ["feltTheme", "accent", "mode", "currency"];
const SOUND_KEYS = ["soundOn", "soundVolume", "hapticsOn"];
const MODES = [["dark", "Dark"], ["light", "Light"], ["system", "Device"]];
const FAILED_SAVE = "Couldn't save your settings to your account. They apply here until you reload.";

// The section a key belongs to: every key that is not listed is a table rule (or a House variation).
const sectionOf = (key) => (PROFILE.includes(key) ? "account" : key === "chipValues" ? "chips" : LOOK_KEYS.includes(key) ? "look" : SOUND_KEYS.includes(key) ? "sound" : PLAY_KEYS.includes(key) ? "play" : "rules");
const on = (v) => (v ? "on" : "off");

// Delete profile asks for the current password. It lives in this dialog's state only, so closing the dialog forgets it.
function DeleteDialog({ onKeep, onDelete }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const errorId = useId();

  const refuse = (text) => {
    setError(text);
    input.current?.focus(); // gone after a 401: signing out takes the dialog with it
  };
  const remove = async () => {
    if (!password) return refuse("Enter your current password to delete your account.");
    setBusy(true);
    setError("");
    try {
      await onDelete(password);
    } catch (err) {
      setBusy(false);
      setPassword("");
      refuse(err.message || "Delete failed");
    }
  };

  // No <form>: Enter in the field must not delete.
  return (
    <ConfirmDialog title="Delete profile?" body="This removes your account, balance and history. It cannot be undone." safe="Keep my profile" danger="Delete for good"
      busy={busy} onSafe={onKeep} onDanger={remove}>
      <div className="inputs">
        <div>
          <label>Current password
            <input ref={input} type="password" value={password} autoComplete="current-password" readOnly={busy} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
              onChange={(e) => { setError(""); setPassword(e.target.value); }} />
          </label>
          {error && <span className="ferr" id={errorId} role="alert">{error}</span>}
        </div>
      </div>
    </ConfirmDialog>
  );
}

export default function Settings() {
  const { player, notice: signInNotice, updatePlayer, changePassword, deletePlayer } = usePlayer();
  const { settings, phase } = useGameState();
  const { changeSettings, resetGame } = useGameActions();
  const { logOut, confirm } = useNavActions();
  const nav = useNavigate();
  const { hash } = useLocation();
  const [edits, setEdits] = useState({}); // only unsaved edits, so settings that load after the page opens (#36) still show
  const [open, setOpen] = useState(() => (SECTIONS.includes(hash.slice(1)) ? hash.slice(1) : null));
  // A deep link or a #section change while here, and a Save that sends the player back to Account, scroll that section to the top of the page (the mockup's deep link does;
  // here the page is the scroll container, L1-22). A tap on a header does not. Always at once: a smooth scroll runs on for ~300 ms and the hint bubble hides on any scroll
  // (HintLayer, L1-38). `toScroll` waits until the section is open: the body must be there, or the page is too short to scroll that far.
  const toScroll = useRef(null);
  useEffect(() => { if (SECTIONS.includes(hash.slice(1))) { toScroll.current = hash.slice(1); setOpen(hash.slice(1)); } }, [hash]);
  useEffect(() => {
    if (!toScroll.current || toScroll.current !== open) return;
    document.getElementById(`sec-${open}`)?.scrollIntoView({ block: "start", behavior: "auto" });
    toScroll.current = null;
  });
  const [asking, setAsking] = useState(null); // the confirm on screen: { kind: "leave" | "reset" | "delete", go? }
  const [notice, setNotice] = useState(null); // one status line for the page's results
  const [profileError, setProfileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  // The password for a username or email change: component state only, never part of the draft.
  const [identityPassword, setIdentityPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false); // Save was pressed without it
  const passwordField = useRef(null);
  const toFocus = useRef(false); // like toScroll: the field can be focused only once Account is open
  useEffect(() => {
    if (!toFocus.current || open !== "account") return;
    // Centred by hand: focus() counts a field under the fixed save bar as visible and leaves it there (a phone).
    passwordField.current?.focus({ preventScroll: true });
    passwordField.current?.closest("div").scrollIntoView({ block: "center", behavior: "auto" });
    toFocus.current = false;
  });

  const profile = Object.fromEntries(PROFILE.map((k) => [k, player?.[k] ?? ""]));
  const base = { ...settings, ...profile };
  const draft = { ...base, ...edits };
  const changed = Object.keys(edits).filter((k) => edits[k] !== base[k]);
  const profileChanged = changed.filter((k) => PROFILE.includes(k));
  const identityChanged = profileChanged.some((k) => IDENTITY.includes(k));
  // Username and email both back to saved (typed back, Discard, a good save): the field goes, and its password with it.
  if (!identityChanged && (identityPassword || needPassword)) { setIdentityPassword(""); setNeedPassword(false); }
  const settingsChanged = changed.filter((k) => !PROFILE.includes(k));
  const errors = Object.fromEntries(PROFILE.map((k) => [k, validateField(k, draft[k])]));
  const invalid = profileChanged.filter((k) => errors[k]);
  const count = settingsChanged.filter((k) => sectionOf(k) !== "rules").length + (settingsChanged.some((k) => sectionOf(k) === "rules") ? 1 : 0) + profileChanged.length;
  const canSave = count > invalid.length; // only invalid profile fields left: nothing to save
  const midRound = phase !== GamePhases.NONE && phase !== GamePhases.PRE_DEAL;

  // The appearance previews as it is picked; leaving puts the saved look back.
  useTheme(draft);
  const saved = useRef(settings);
  useEffect(() => { saved.current = settings; });
  useEffect(() => () => applyTheme(saved.current, !!window.matchMedia?.("(prefers-color-scheme: light)")?.matches), []);

  // While there are unsaved changes: Table, Log out (and the table menu's Home / Settings / Log out) ask first (useNavActions / leaveGuard), and so does a page unload.
  const dirty = changed.length > 0;
  useEffect(() => {
    if (!dirty) return undefined;
    leaveGuard.ask = (go) => setAsking({ kind: "leave", go });
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => { leaveGuard.ask = null; window.removeEventListener("beforeunload", warn); };
  }, [dirty]);

  if (!player) return <div className="page-bg"><div className="page-message">{signInNotice && <p className="alert" role="alert">{signInNotice}</p>}<p>Please log in to manage settings.</p><p className="signed"><Link to="/login">Log in</Link> · <Link to="/">Home</Link></p></div></div>; // no header any more: a visitor still needs a way out

  const edit = (patch) => { setNotice(null); setEdits((e) => ({ ...e, ...patch })); };
  const editProfile = (name) => (e) => { setProfileError(""); edit({ [name]: e.target.value }); };
  const discard = () => { setNotice(null); setProfileError(""); setEdits({}); };
  const toggleSection = (id) => () => setOpen((o) => (o === id ? null : id));
  // What was saved stops being an edit (an edit made while it saved stays).
  const forget = (sent) => setEdits((e) => Object.fromEntries(Object.entries(e).filter(([k, v]) => !(k in sent) || v !== sent[k])));
  const pick = (keys) => Object.fromEntries(keys.map((k) => [k, draft[k]]));

  const back = () => (leaveGuard.ask ? leaveGuard.ask(() => nav("/game")) : nav("/game"));

  const save = async () => {
    setAsking(null);
    setSaving(true);
    setNotice(null);
    setProfileError(""); // a refusal from the last try must not outlive a good save
    const problems = [];
    let failed = false;
    if (profileChanged.length) {
      const password = identityPassword;
      // Without the password the username and email wait, like invalid fields: the rest still saves, with the old ones.
      const valid = profileChanged.filter((k) => !errors[k]);
      const sendable = valid.filter((k) => password || !IDENTITY.includes(k));
      const missing = sendable.length < valid.length;
      let wrong = false;
      setNeedPassword(missing);
      if (sendable.length) {
        try {
          await updatePlayer({ ...profile, ...pick(sendable), ...(sendable.some((k) => IDENTITY.includes(k)) && { currentPassword: password }) });
          forget(pick(sendable));
          setIdentityPassword((p) => (p === password ? "" : p)); // one typed while it saved stays
        } catch (err) {
          setProfileError(err.message || "Save failed");
          failed = true;
          wrong = err.message === WRONG_PASSWORD;
          if (wrong) setIdentityPassword("");
        }
      }
      if (failed || missing || invalid.length) {
        problems.push("Your profile isn't saved yet.");
        toFocus.current = missing || wrong;
        toScroll.current = "account";
        setOpen("account");
      }
    }
    if (settingsChanged.length) {
      const sent = pick(settingsChanged);
      const request = changeSettings(sent); // applies here at once; the promise is the save to the account
      forget(sent);
      try { await request; } catch { problems.push(FAILED_SAVE); }
    }
    setNotice(problems.length ? { text: problems.join(" "), error: true } : { text: "Saved" });
    setSaving(false);
  };
  const onSave = () => {
    if (!canSave || saving) return;
    if (resetsTable(pick(settingsChanged)) && midRound) setAsking({ kind: "reset" });
    else save();
  };

  const savePassword = async () => {
    try {
      await changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "" });
      setNotice({ text: "Password changed" });
    } catch (err) {
      setNotice({ text: err.message || "Password change failed", error: true });
    }
  };
  const newPasswordError = validateField("password", passwords.next);
  const canChangePassword = passwords.current !== "" && passwords.next !== "" && !newPasswordError;

  const remove = async (password) => {
    await deletePlayer(password);
    resetGame();
    nav("/");
  };

  const chosenChips = parseChipValues(draft.chipValues);
  const summary = {
    rules: `${rulePresetOf(draft)} · ${formatEdge(houseEdge(draft))} house edge`,
    play: `${speedName(draft.playTimeout)} speed · totals ${on(draft.showTotals)} · count ${on(draft.showCardCount)}${draft.autoDeal ? " · auto deal" : ""}`,
    chips: `${chosenChips.length} of ${ALLOWED_CHIPS.length} chips`,
    look: `${FELTS.find(([k]) => k === draft.feltTheme)[1]} felt · ${ACCENTS.find(([k]) => k === draft.accent)[1]} · ${MODES.find(([k]) => k === draft.mode)[1]} · ${symbolOf(draft.currency)}`,
    sound: `Sound ${on(draft.soundOn)}${draft.soundOn ? ` ${draft.soundVolume}%` : ""} · vibration ${on(draft.hapticsOn)}`,
    account: `${draft.firstName} ${draft.lastName}`.trim() || "No name",
  };
  const titles = { rules: RULES_TITLE, play: "Gameplay", chips: "Chips", look: "Appearance", sound: "Sound & haptics", account: "Account" };
  const dirtyIn = new Set(changed.map(sectionOf));
  const section = (id, children) => (
    <Section id={id} title={titles[id]} summary={summary[id]} dirty={dirtyIn.has(id)} open={open === id} onToggle={toggleSection(id)}>{children}</Section>
  );
  const text = (key) => APP_SETTINGS[key];
  const flag = (key) => <Switch id={key} label={text(key).label} sub={text(key).sub} hint={text(key).hint} checked={draft[key]} onChange={(v) => edit({ [key]: v })} />;

  return (
    <HintLayer className="settings-screen">
      <header className="s-head">
        <button type="button" className="back" onClick={back}><svg aria-hidden="true" focusable="false"><use href="#i-back" /></svg><span>Table</span></button>
        <h1 className="s-title">Settings</h1>
        {notice && <div role="status" className={`s-note${notice.error ? " error" : ""}`}>{notice.text}</div>}
      </header>
      <div className="s-body">
        {section("rules", <RulesSection settings={draft} onApply={edit} />)}

        {section("play", <>
          <Slider id="playTimeout" label={text("playTimeout").label} hint={text("playTimeout").hint} min={0} max={1000} step={1} value={msToPos(draft.playTimeout)}
            text={speedText(draft.playTimeout)} onChange={(pos) => edit({ playTimeout: posToMs(pos) })} stops={SPEED_STOPS} tail="5 s"
            current={speedName(draft.playTimeout)} />
          <Switch id="resetInitialBet" label={text("resetInitialBet").label} hint={text("resetInitialBet").hint} checked={draft.resetInitialBet}
            onChange={(v) => edit(v ? { resetInitialBet: true } : { resetInitialBet: false, autoDeal: false })} />
          {flag("showTotals")}
          {flag("showCardCount")}
          {draft.resetInitialBet && flag("autoDeal")}
          {draft.resetInitialBet && draft.autoDeal && (
            <Slider id="autoDealDelay" label={text("autoDealDelay").label} hint={text("autoDealDelay").hint} min={SETTING_RANGES.autoDealDelay[0]} max={SETTING_RANGES.autoDealDelay[1]}
              step={500} value={draft.autoDealDelay} text={`${(draft.autoDealDelay / 1000).toFixed(1)} s`} onChange={(v) => edit({ autoDealDelay: v })} />
          )}
          <Row id="tableMessages" label={text("tableMessages").label} hint={text("tableMessages").hint}>
            {TABLE_MESSAGES.map(({ value, label, hint }) => <Radio key={value} checked={draft.tableMessages === value} data-pick-messages={value} title={hint} onClick={() => edit({ tableMessages: value })}><span>{label}</span></Radio>)}
          </Row>
          <div className="pc-only">{flag("showKeyHints")}</div>
        </>)}

        {section("chips", (
          <>
            <Row id="chipValues" label={text("chipValues").label} hint={text("chipValues").hint} role="group" className="chip-pick" layout="block">
              {/* Real chips in a groove, as toggle buttons: a chip that is off sinks. The last chip on cannot be turned off (aria-disabled keeps it focusable and described). */}
              {ALLOWED_CHIPS.map((chip) => {
                const chosen = chosenChips.includes(chip);
                const last = chosen && chosenChips.length === 1;
                return (
                  <button key={chip} type="button" className="cp" aria-pressed={chosen} aria-label={`${money(chip)} chip`} aria-disabled={last || undefined}
                    aria-describedby={last ? "chip-hint" : undefined}
                    onClick={() => !last && edit({ chipValues: formatChipValues(chosen ? chosenChips.filter((c) => c !== chip) : [...chosenChips, chip]) })}>
                    <Chip value={chip} />
                    <span aria-hidden="true">{money(chip)}</span>
                  </button>
                );
              })}
            </Row>
            <p id="chip-hint" className="note">At least one chip must stay selected.</p>
          </>
        ))}

        {section("look", <>
          <Row id="feltTheme" label={text("feltTheme").label} hint={text("feltTheme").hint} className="felts" layout="look">
            {FELTS.map(([key, name]) => <Radio key={key} className="fs" checked={draft.feltTheme === key} aria-label={name} data-felt={key} onClick={() => edit({ feltTheme: key })}><i /></Radio>)}
          </Row>
          <Row id="accent" label={text("accent").label} hint={text("accent").hint} className="accents" layout="look">
            {ACCENTS.map(([key, name, colour]) => (
              <Radio key={key} className="ac" checked={draft.accent === key} aria-label={name} title={name} data-pick-accent={key} onClick={() => edit({ accent: key })}><i style={{ background: colour }} /></Radio>
            ))}
          </Row>
          <Row id="mode" label={text("mode").label} hint={text("mode").hint} layout="look">
            {MODES.map(([key, name]) => <Radio key={key} checked={draft.mode === key} data-pick-mode={key} onClick={() => edit({ mode: key })}><span>{name}</span></Radio>)}
          </Row>
          <Row id="currency" label={text("currency").label} hint={text("currency").hint} layout="look">
            {CURRENCIES.map(({ value, label }) => <Radio key={value} checked={draft.currency === value} data-pick-currency={value} onClick={() => edit({ currency: value })}><span>{label}</span></Radio>)}
          </Row>
        </>)}

        {section("sound", <>
          {flag("soundOn")}
          <Slider id="soundVolume" label={text("soundVolume").label} hint={text("soundVolume").hint} min={SETTING_RANGES.soundVolume[0]} max={SETTING_RANGES.soundVolume[1]}
            step={5} value={draft.soundVolume} text={`${draft.soundVolume}%`} disabled={!draft.soundOn} onChange={(v) => edit({ soundVolume: v })} />
          {flag("hapticsOn")}
        </>)}

        {section("account", <>
          <div className="inputs">
            {PROFILE.map((name) => (
              <div key={name}>
                <label>{PROFILE_FIELDS[name][0]}
                  <input name={name} value={draft[name]} autoComplete={PROFILE_FIELDS[name][1]} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `err-${name}` : undefined}
                    onChange={editProfile(name)} />
                </label>
                {errors[name] && <span className="ferr" id={`err-${name}`}>{errors[name]}</span>}
              </div>
            ))}
          </div>
          {identityChanged && (
            <div className="inputs">
              <div>
                <label>Password to save this change
                  <input ref={passwordField} type="password" name="identityPassword" value={identityPassword} autoComplete="current-password"
                    aria-invalid={needPassword || profileError === WRONG_PASSWORD}
                    aria-describedby={["desc-identityPassword", needPassword && "err-identityPassword", profileError === WRONG_PASSWORD && "err-profile"].filter(Boolean).join(" ")}
                    onChange={(e) => { setProfileError(""); setNeedPassword(false); setIdentityPassword(e.target.value); }} />
                </label>
                <small id="desc-identityPassword">Needed to change your username or email.</small>
                {needPassword && <span className="ferr" id="err-identityPassword">Enter your current password to change your username or email.</span>}
              </div>
            </div>
          )}
          {profileError && <div role="alert" className="ferr" id="err-profile">{profileError}</div>}
          <div className="inputs">
            <label>Current password
              <input type="password" name="currentPassword" value={passwords.current} autoComplete="current-password" onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
            </label>
            <div>
              <label>New password
                <input type="password" name="newPassword" value={passwords.next} autoComplete="new-password" aria-invalid={Boolean(newPasswordError)} aria-describedby={newPasswordError ? "err-newPassword" : undefined}
                  onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} />
              </label>
              {newPasswordError && <span className="ferr" id="err-newPassword">{newPasswordError}</span>}
            </div>
          </div>
          <div className="btn-row">
            <button type="button" className="btn" aria-disabled={!canChangePassword} onClick={() => canChangePassword && savePassword()}>Change password</button>
            <button type="button" className="btn" onClick={logOut}>Log out</button>
          </div>
        </>)}

        <div className="danger-zone">
          <div className="row">
            <span className="rl"><b>Your profile</b><small>Balance and history, for good.</small></span>
            <button type="button" className="btn danger-o" onClick={() => setAsking({ kind: "delete" })}>Delete profile</button>
          </div>
        </div>
      </div>

      {count > 0 && (
        <div className="dirty" role="region" aria-label="Unsaved changes">
          <span className="dirty-txt" aria-live="polite">{count} unsaved change{count === 1 ? "" : "s"}</span>
          <button type="button" className="btn plain" onClick={discard}>Discard</button>
          <button type="button" className="btn primary" aria-disabled={!canSave || saving} onClick={onSave}>Save changes</button>
        </div>
      )}

      {confirm}
      {asking?.kind === "leave" && (
        <ConfirmDialog title="Discard your changes?" body="You have changes in Settings that aren't saved." safe="Keep editing" danger="Discard and leave"
          onSafe={() => setAsking(null)} onDanger={() => { discard(); setAsking(null); asking.go(); }} />
      )}
      {asking?.kind === "reset" && (
        <ConfirmDialog title="Start a new shoe?" body="New table rules start with a fresh shoe. The hand in play ends and any bets on it are lost." safe="Cancel" danger="Save and reset"
          onSafe={() => setAsking(null)} onDanger={save} />
      )}
      {asking?.kind === "delete" && <DeleteDialog onKeep={() => setAsking(null)} onDelete={remove} />}
    </HintLayer>
  );
}
