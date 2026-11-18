import { useEffect, useLayoutEffect, useRef } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandStatus } from "../../utils/constants/handStatus";
import { SurrenderOptions } from "../../utils/constants/ruleOptions";
import { handActions, insuranceStake, roundNet } from "../../utils/blackjackLogic";
import { effectiveChip, visibleChips } from "../../utils/chips";
import { money, signed } from "../../utils/money";
import { Chip } from "../Chip/Chip";
import { usePlayer } from "../../hooks/usePlayer";
import { useGameState, useGameActions } from "../../hooks/useGame";
import "./Dock.css";

const NOTHING = { hit: false, double: false, triple: false, split: false, surrender: false }; // not your turn: every action dimmed

// Keys never act from these (typing, a dialog); Space and Enter also keep their own action on a focused control. `OPEN_LAYER`: a dialog or the menu is open.
const NOT_FOR_THE_TABLE = "input, textarea, select, dialog, [role='dialog'], [contenteditable]";
const OWN_ACTION = "button, a, summary, [role='button']";
const OPEN_LAYER = "[role='dialog'], .menu:not([hidden])";

const Icon = ({ id }) => <svg aria-hidden="true" focusable="false"><use href={`#${id}`} /></svg>;

// A key never leaves the layout: an action that can't be taken now is dimmed with aria-disabled (it still takes focus and
// keeps its place). `focus` marks the key the dock moves focus to when the phase changes (see Dock). `icon` and `hotkey` (the keyboard
// shortcut: its `aria-keyshortcuts`, and the hint shown on desktop) are decoration: the label or `name` is the accessible name. A `name` that does not hold the
// label's words (2x) gets the label as generated content (.glyph), so axe's label-content-name-mismatch has no visible text to compare. The hotkey hint is
// generated content too (kbd[data-text]): as real text it would count as visible label text and mismatch `name` (Deal). //
function Key({ label, name, sub, kind = "", off = false, focus = false, icon, hotkey, onClick }) {
  return (
    <button type="button" className={`key ${kind}`} aria-label={name} aria-keyshortcuts={hotkey} aria-disabled={off || undefined} data-focus={focus || undefined}
      onClick={off ? undefined : onClick}>
      {icon && <Icon id={icon} />}
      <span>{label}</span>
      {sub && <small>{sub}</small>}
      {hotkey && <kbd aria-hidden="true" data-text={hotkey} />}
    </button>
  );
}

// The chip rack (#82, DESIGN section 5): the enabled chips the balance covers, whole chips only. Evenly spaced when they fit; otherwise it scrolls by
// whole chips (its width holds k chips exactly, the fades sit in the padding) with a chevron toward more, so a chip at rest is never cut. A tap selects
// a chip (accent ring, aria-pressed). The scroll classes and --rgap / --rpad are set here by hand, not through React, so a render never undoes them. //
function ChipRack({ chips, chip, onTap }) {
  const wrapRef = useRef(null);
  const rackRef = useRef(null);
  const list = chips.join();
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const rack = rackRef.current;
    const more = () => {
      wrap.classList.toggle("more-l", rack.scrollLeft > 2);
      wrap.classList.toggle("more-r", rack.scrollLeft < rack.scrollWidth - rack.clientWidth - 2);
    };
    const fit = () => {
      wrap.classList.remove("scroll", "more-l", "more-r");
      const n = rack.children.length;
      if (!n) return;
      const rc = rack.children[0].offsetWidth;
      if (n * rc + (n - 1) * Math.max(2, parseFloat(getComputedStyle(rack).columnGap) || 0) <= rack.clientWidth) return; // fits with the rack's own gap
      wrap.classList.add("scroll");
      const width = wrap.clientWidth; // the scrolling rack may take a different width: measured again
      const gap = 8;
      const k = Math.max(1, Math.floor((width - 28 + gap) / (rc + gap)));
      wrap.style.setProperty("--rgap", `${gap}px`);
      wrap.style.setProperty("--rpad", `${Math.floor((width - (k * (rc + gap) - gap)) / 2)}px`);
      const selected = rack.querySelector('[aria-pressed="true"]');
      if (selected) rack.scrollLeft = Math.max(0, [...rack.children].indexOf(selected) - k + 1) * (rc + gap);
      more();
    };
    fit();
    rack.addEventListener("scroll", more, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(wrap.closest(".dock-in"));
    window.addEventListener("resize", fit);
    return () => { rack.removeEventListener("scroll", more); observer?.disconnect(); window.removeEventListener("resize", fit); };
  }, [list]);
  return (
    <div className="rack-wrap" ref={wrapRef}>
      <div className="rack" role="group" aria-label="Chips" ref={rackRef}>
        {chips.map((v, i) => (
          <button key={v} type="button" className="rc" data-chip={v} data-key={i < 9 ? i + 1 : undefined} aria-pressed={v === chip} aria-label={`${money(v)} chip`} onClick={() => onTap(v)}>
            <Chip value={v} />
          </button>
        ))}
      </div>
    </div>
  );
}

// The fixed-height bottom dock: the same height in every state, so the table never resizes. One of four faces by phase:
// betting (before the deal), offers (insurance, even money, surrender), your move (the action bar, dimmed until it is your turn)
// and results (the net, the balance, Next hand). `busy`: a card is still flying, so the keys that act wait.
// Betting (#82): the chip rack, then Undo, Clear, Rebet, 2x and Deal. `chip` is the selected chip (GameBoard holds it: the bet circle bets it too) and
// `onChip` picks one. A tap on a chip selects it; a second tap on it within 400 ms (timed by hand: a touch fires no dblclick) bets it on the first
// circle. Keys 1-9 do the same by rack position (1, 1 = select, bet), U undoes, C clears, B rebets, X doubles. `shuffling` (#83): the Deal key says
// "Shuffling" and the betting keys wait; a tap on the dock skips the shuffle (useShuffle listens for it), the chips still take it. //
export default function Dock({ busy, chip: picked, onChip = () => {}, shuffling = false }) {
  const { player } = usePlayer();
  const { phase, hands, dealer, offers, selectedHandIndex, betCircle, betHistory, initialBet, settings, autoDealPending, autoDealPaused } = useGameState();
  const actions = useGameActions();
  const ref = useRef(null);
  const credits = player ? player.credits : 0; // a signed-out player has nothing to bet or double with
  const betting = phase === GamePhases.PRE_DEAL;
  const chips = visibleChips(settings.chipValues, credits);
  const chip = effectiveChip(chips, picked);
  const lastTap = useRef({ chip: 0, at: 0 });
  const lastKey = useRef("");
  const tapChip = (v) => {
    const now = performance.now();
    const twice = lastTap.current.chip === v && now - lastTap.current.at < 400;
    lastTap.current = twice ? { chip: 0, at: 0 } : { chip: v, at: now };
    onChip(v);
    if (twice) actions.addBet(v);
  };
  // The keyboard (DESIGN section 8) and the buttons share one table: `bind` registers a key's letter with the same `off` flag and action as its button
  // (a dimmed or absent key does nothing) and gives the button its props. Space and Enter are one key (Deal, Next hand).
  const keys = {};
  const bind = (hotkey, off, run) => { keys[hotkey.toLowerCase()] = { off, run }; return { hotkey, off, onClick: run }; };
  // The listener is attached once and calls the latest handler through a ref, so a render never unbinds it between two key presses.
  const onKey = useRef(null);
  useEffect(() => {
    onKey.current = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.(NOT_FOR_THE_TABLE) || document.querySelector(OPEN_LAYER)) return;
      const k = e.key === " " || e.key === "Enter" ? "space" : e.key.toLowerCase();
      const prev = lastKey.current;
      lastKey.current = k;
      if (betting && /^[1-9]$/.test(k)) {
        const v = chips[Number(k) - 1];
        if (v === undefined) return;
        if (prev === k && chip === v) { lastKey.current = ""; actions.addBet(v); } else onChip(v);
        return;
      }
      if (k === "space" && e.target.closest?.(OWN_ACTION)) return;
      const key = keys[k];
      if (key && !key.off) { e.preventDefault(); key.run(); }
    };
  });
  useEffect(() => {
    const listener = (e) => onKey.current(e);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  // Focus follows the phase (offers: the first offer; your move: Hit; results: Next hand), but only when it was on nothing
  // or already in the dock: never pulled from Settings, a menu or a dialog. It also runs when the open offers change: the focused
  // offer unmounts when taken, and focus would fall to the page. It runs again when `busy` clears, so a move that waited on a flying card still lands.
  const openOffers = offers ? `${!!offers.insurance}${!!offers.evenMoney}${!!offers.surrender}` : "";
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body && !ref.current.contains(active)) return;
    ref.current.querySelector("[data-focus]")?.focus({ preventScroll: true });
  }, [phase, openOffers, busy]);

  const autoOn = settings.autoDeal && settings.resetInitialBet; // Pause / Resume shows between rounds while auto deal is on
  const pause = autoOn && (
    <Key label={autoDealPaused ? "Resume" : "Pause"} name={autoDealPaused ? "Resume auto deal" : "Pause auto deal"}
      onClick={autoDealPaused ? actions.resumeAutoDeal : actions.pauseAutoDeal} />
  );
  let face, rowA, rowB, acting = false;

  if (betting) {
    face = "betting";
    // Out of credits: the rack is a note and nothing that bets is live (the hidden top-up is the only way on). Chips still in the circle keep the rack.
    rowA = chips.length || betCircle > 0
      ? <ChipRack chips={chips} chip={chip} onTap={tapChip} />
      : <div className="dock-note"><Icon id="i-info" /><span>Out of credits. Your balance is {money(credits)}.</span></div>;
    rowB = (
      <>
        <Key label="Undo" icon="i-undo" {...bind("U", shuffling || betHistory.length === 0, actions.undoBet)} />
        <Key label="Clear" icon="i-clear" {...bind("C", shuffling || betCircle === 0, actions.clearBet)} />
        <Key label="Rebet" icon="i-rebet" {...bind("B", shuffling || betCircle > 0 || initialBet <= 0 || credits < initialBet, () => actions.addBet(initialBet))} />
        <Key label={<span className="glyph" data-text="2x" />} name="Double every bet" {...bind("X", shuffling || betCircle === 0 || credits < betCircle, () => actions.addBet(betCircle))} />
        {pause}
        <Key label={shuffling ? "Shuffling" : "Deal"} name={shuffling ? "Shuffling" : "Deal"} kind="primary big wider" sub={autoDealPending && !shuffling ? "auto" : undefined}
          {...bind("Space", shuffling || betCircle === 0 || !player, actions.deal)} />
      </>
    );
  } else if (phase === GamePhases.OFFERS) {
    face = "offers";
    acting = true;
    const half = insuranceStake(hands[0].bet);
    const open = [
      offers.insurance && { id: "insurance", hotkey: "I", label: `Insurance $${half}`, run: actions.takeInsurance },
      offers.evenMoney && { id: "evenMoney", hotkey: "E", label: "Even money", run: actions.evenMoney },
      offers.surrender && { id: "surrender", hotkey: "R", label: "Surrender", sub: `$${half} back`, run: () => actions.surrender(0) },
    ].filter(Boolean);
    rowA = open.map((o, i) => <Key key={o.id} label={o.label} sub={o.sub} kind="offer" focus={i === 0} {...bind(o.hotkey, busy, o.run)} />);
    rowB = <Key label="No thanks" kind="solid big" {...bind("N", busy, actions.declineOffers)} />;
  } else if (phase === GamePhases.POST_ROUND || phase === GamePhases.END_ROUND) {
    face = "results";
    const net = roundNet(hands);
    rowA = (
      <div className="summary">
        <div className="s-l">
          <small>{net > 0 ? "You won" : net < 0 ? "You lost" : "Even round"}</small>
          <b className={net > 0 ? "up" : net < 0 ? "down" : undefined}>{signed(net)}</b>
        </div>
        <div className="s-r">Balance<b>${credits.toLocaleString()}</b></div>
      </div>
    );
    rowB = (
      <>
        {pause}
        <Key label="Next hand" kind="primary big wider" focus {...bind("Space", false, actions.continueRound)} />
      </>
    );
  } else {
    face = "play";
    acting = true;
    const sel = selectedHandIndex;
    // Only on your turn, on a hand still in play with its cards dealt (a split hand waits for its card), and no card in flight.
    const yours = !busy && phase === GamePhases.PLAYER_TURN && hands[sel]?.status === HandStatus.PLAYING && !hands[sel].awaitingCard;
    const can = yours ? handActions(hands[sel], dealer, hands.length, credits, settings) : NOTHING;
    rowA = (
      <>
        <Key label="Double" {...bind("D", !can.double, () => actions.double(sel))} />
        <Key label="Split" {...bind("P", !can.split, () => actions.split(sel))} />
        {settings.surrender !== SurrenderOptions.NONE && <Key label="Surrender" {...bind("R", !can.surrender, () => actions.surrender(sel))} />}
        {settings.tripleDown && <Key label="Triple" {...bind("T", !can.triple, () => actions.triple(sel))} />}
      </>
    );
    rowB = (
      <>
        <Key label="Stay" kind="solid big" {...bind("S", !yours, () => actions.stand(sel))} />
        <Key label="Hit" kind="primary big" focus={phase === GamePhases.PLAYER_TURN} {...bind("H", !can.hit, () => actions.hit(sel))} />
      </>
    );
  }

  // .options-wrap: the hook for "the keys that act wait while cards fly" (the e2e tests watch it; .board.busy .options-wrap is inert).
  return (
    <footer className="dock" aria-label="Controls">
      <div ref={ref} className={`dock-in${acting ? " options-wrap" : ""}`} data-face={face} data-shuffling={shuffling || undefined}
        role={face === "offers" ? "group" : undefined} aria-label={face === "offers" ? "Offers" : undefined}>
        <div className="dock-row">{rowA}</div>
        <div className="dock-row">{rowB}</div>
      </div>
    </footer>
  );
}
