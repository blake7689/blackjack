import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Wordmark from "../Wordmark/Wordmark";
import TopUpPrompt from "../TopUpPrompt/TopUpPrompt";
import { usePlayer } from "../../hooks/usePlayer";
import { useGameState, useGameActions } from "../../hooks/useGame";
import { useLanded } from "../../hooks/useLanded";
import { useNavActions } from "../../hooks/useNavActions";
import { cardsRemaining } from "../../utils/cards";
import { money } from "../../utils/money";
import "./TopBar.css";

const TAPS = 7;
const TAP_WINDOW_MS = 3000;
const FELTS = [["green", "Green"], ["blue", "Blue"], ["red", "Red"]];
const signedFigure = (n) => (n > 0 ? `+${n}` : String(n));

const Icon = ({ id }) => <svg aria-hidden="true" focusable="false"><use href={`#${id}`} /></svg>;

// The balance, centred on the bar. It is also the hidden top-up's tap target (#90): 7 taps within 3 s open the code prompt while `tapEnabled`
// (set by GameBoard: idle, signed in, low). Nothing about that is in the page before then: plain text, no role, tabindex or aria on it. The
// change badge takes the label's place on phones and sits after the number on wide screens; the number never moves. `id="bal"` is the live smoke's hook. //
const Balance = memo(function Balance({ player, tapEnabled }) {
  const { creditChange } = usePlayer();
  const delta = creditChange?.delta;
  const [asking, setAsking] = useState(false);
  const taps = useRef([]);

  const handleTap = () => {
    if (!tapEnabled) return;
    const now = Date.now();
    taps.current = [...taps.current, now].filter((t) => now - t < TAP_WINDOW_MS).slice(-TAPS);
    if (taps.current.length === TAPS) {
      taps.current = [];
      setAsking(true);
    }
  };
  const closePrompt = useCallback(() => setAsking(false), []);

  return (
    <>
      <div className={`bal${delta !== undefined ? " changing" : ""}`} onClick={handleTap}>
        <span className="bal-top">
          <span className="bal-lbl">Balance</span>
          {delta !== undefined && <span className={`delta num ${delta > 0 ? "up" : "down"}`}>{delta > 0 ? `+${delta}` : delta}</span>}
        </span>
        <b id="bal" className="num">{money(player ? player.credits : 0)}</b>
      </div>
      {asking && <TopUpPrompt onClose={closePrompt} />}
    </>
  );
});

// Hi-Lo over the cards seen face up, and the true count (running count per deck left). Live and never blank: both move as each card
// lands face up (the hole card when it turns), because the figures leave out the cards still on their way. Fixed-width figures, so the box never moves. //
function Count() {
  const { runningCount, shoe, hands, dealer } = useGameState();
  const onTable = [...hands.flatMap((h) => h.cards), ...dealer.cards];
  const { has } = useLanded(onTable); // subscribes to landings
  const flying = onTable.filter((c) => !has(c.id));
  const running = runningCount - flying.reduce((sum, c) => sum + c.count, 0);
  const trueCount = Math.round(running / Math.max(1, (cardsRemaining(shoe) + flying.length) / 52));
  return (
    <div className="count" role="group" aria-label="Card count" title="Hi-Lo running count, and the true count (running count per deck left in the shoe)">
      <span><i>Count</i><b className="num">{signedFigure(running)}</b></span>
      <span><i>True</i><b className="num">{signedFigure(trueCount)}</b></span>
    </div>
  );
}

// The table's top bar (#81, DESIGN section 5): one quiet row in three columns with equal outer ones, so the balance sits on the bar's centre.
// Left: the menu (Home, Table rules, Analytics soon, Settings, felt swatches, Log out) and the wordmark. Right: the count and Settings. //
export default function TopBar({ tapEnabled = false }) {
  const { player } = usePlayer();
  const { settings } = useGameState();
  const { changeSettings } = useGameActions();
  const { goHome, goSettings, logOut } = useNavActions();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const feltLabel = useId();
  const barRef = useRef(null);

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => { if (!barRef.current.querySelector(".bar-l").contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); barRef.current.querySelector(".menu-btn").focus(); } };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (action) => () => { setOpen(false); action(); };
  const setFelt = (feltTheme) => () => { changeSettings({ feltTheme }).catch(() => {}); }; // a failed save keeps the felt the player picked

  return (
    <header className="top" ref={barRef}>
      <div className="top-in">
        <div className="bar-l">
          <button type="button" className="icon-btn menu-btn" aria-label="Menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((v) => !v)}>
            <Icon id="i-menu" />
          </button>
          <Wordmark className="wm top-wm" />
          <span className="sr-only">Blakejack</span>
          <nav id={menuId} className="menu" aria-label="Menu" hidden={!open}>
            <button type="button" className="menu-i" onClick={pick(goHome)}><Icon id="i-back" />Home</button>
            <button type="button" className="menu-i" onClick={pick(() => goSettings("game"))}><Icon id="i-rules" />Table rules</button>
            <button type="button" className="menu-i" aria-disabled="true"><Icon id="i-chart" />Analytics <small>Soon</small></button>
            <button type="button" className="menu-i" onClick={pick(() => goSettings())}><Icon id="i-settings" />Settings</button>
            <hr />
            <p className="menu-h" id={feltLabel}>Felt</p>
            <div className="felts" role="radiogroup" aria-labelledby={feltLabel}>
              {FELTS.map(([key, name]) => (
                <button key={key} type="button" className="fs" role="radio" aria-checked={settings.feltTheme === key} aria-label={name} data-felt={key} onClick={setFelt(key)}><i /></button>
              ))}
            </div>
            <hr />
            <button type="button" className="menu-i" onClick={pick(logOut)}><Icon id="i-logout" />Log out</button>
          </nav>
        </div>
        <Balance player={player} tapEnabled={tapEnabled} />
        <div className="top-r">
          {settings.showCardCount && <Count />}
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => goSettings()}><Icon id="i-settings" /></button>
        </div>
      </div>
    </header>
  );
}
