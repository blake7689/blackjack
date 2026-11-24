import { memo, useEffect, useState } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";
import { OPEN_LAYER } from "../../utils/constants/layers";
import "./CenterMessage.css";

// What a line is, for the Table messages setting (L2-1): a prompt asks for your move (shown in Hints after 5 s with no input, always in All), a notice is never
// hidden, and anything else is a status that resolves by itself (Dealing, Dealer plays...: shown only in All).
const PROMPT = "prompt", NOTICE = "notice", STATUS = "status";
export const IDLE_MS = 5000;

const MESSAGES = {
  [GamePhases.DEALING]: "Dealing",
  [GamePhases.PEEK]: "Dealer checks for blackjack",
  [GamePhases.DEALER_TURN]: "Dealer plays",
  [GamePhases.SETTLING_HANDS]: "Settling bets",
  [GamePhases.RESULTS]: "Settling bets",
};

// The offer still open asks itself, one question at a time: even money, then insurance, then surrender. //
const offerMessage = ({ evenMoney, insurance }) => (evenMoney ? "Even money?" : insurance ? "Insurance?" : "Surrender?");

// Between rounds: auto deal says it is about to deal, else a bet on the table says to tap Deal; with nothing on the table and no chip the balance covers (`broke`), it says so. //
const bettingMessage = (bet, autoDealing, broke) => (autoDealing ? ["Dealing soon", STATUS] : bet > 0 ? ["Tap Deal", PROMPT] : broke ? ["Out of credits", NOTICE] : ["Place your bets", PROMPT]);

// What the one line says for a phase, and what kind of line it is. `lastHand`: the cut card is out, so this is the last hand before the shuffle. //
function phaseMessage({ gamePhase, offers, bet, autoDealing, lastHand, broke }) {
  switch (gamePhase) {
    case GamePhases.PRE_DEAL: return bettingMessage(bet, autoDealing, broke);
    case GamePhases.OFFERS: return [offerMessage(offers), PROMPT];
    case GamePhases.PLAYER_TURN: return lastHand ? ["Last hand before the shuffle", NOTICE] : ["Your move", PROMPT];
    case GamePhases.END_ROUND: return [lastHand ? "Shuffling" : "", STATUS];
    default: return [MESSAGES[gamePhase] ?? "", STATUS];
  }
}

// True once `key` (the prompt on show) has had IDLE_MS with no pointer or key on the page; a new prompt starts the wait again, so does any input (L2-1).
// `active` is false when nothing waits on it (the idle state is cleared then, so a prompt that comes back with the same text waits its 5 s again). The state holds the key
// it fired for, so a changed prompt is never shown for a render before the wait restarts. The wait is held while a dialog or the menu is open (it restarts when it ends up
// over one), so the prompt never comes up behind them.
function useIdle(key, active) {
  const [idleFor, setIdleFor] = useState(null);
  useEffect(() => {
    if (!active) { setIdleFor(null); return undefined; }
    let timer;
    const start = () => { clearTimeout(timer); timer = setTimeout(() => (document.querySelector(OPEN_LAYER) ? start() : setIdleFor(key)), IDLE_MS); };
    const poke = () => { setIdleFor(null); start(); };
    setIdleFor(null);
    start();
    document.addEventListener("pointerdown", poke, true);
    document.addEventListener("keydown", poke, true);
    return () => { clearTimeout(timer); document.removeEventListener("pointerdown", poke, true); document.removeEventListener("keydown", poke, true); };
  }, [key, active]);
  return active && idleFor === key;
}

// The one message line (fixed 48 px, CenterMessage.css): a reconnecting or refused-bet notice takes the place of the phase's words. Then, in turn (#83):
// the shuffle ("Shuffling", also when the shoe runs out mid-round), the peek ("Dealer checks for blackjack", "No blackjack": `peek` is "checking" or
// "clear") and, once the hands are settled, the verdict: one word, never over a card (`verdict`: { kind, word, amt, extra }, see utils/verdict.js).
// This line is the board's ONE polite live region (#85): `heard` (utils/verdict.js `resultsLine`) rides in it, hidden from the eye, with the verdict.
// `messages` (L2-1, the tableMessages setting): "all" shows every line; "hints" (default) leaves a status line out and a prompt out until the player has been idle
// 5 s (it fades in); "results" shows no prompt or status. Results and notices (reconnecting, a refused bet, Out of credits, the last hand) show in every mode.
// `hand` (the selected hand) is part of the wait's key: the turn moving to another split hand starts it again. A line that is not shown is not rendered at all, so screen readers do not hear it either; the .msg element and its height stay. //
function CenterMessage({ gamePhase, waiting, reconnecting, notice, offers, bet = 0, broke = false, autoDealing = false, lastHand = false, verdict = null, shuffling = false, peek = null, heard = null, messages = "all", hand = 0 }) {
  const [text, kind] = waiting ? ["Waiting for the server...", STATUS] : shuffling ? ["Shuffling", STATUS]
    : peek === "clear" ? ["No blackjack", STATUS] : peek === "checking" ? ["Dealer checks for blackjack", STATUS]
    : phaseMessage({ gamePhase, offers, bet, autoDealing, lastHand, broke });
  const shown = reconnecting || notice || (verdict && !shuffling); // these are never left out
  const prompt = !shown && kind === PROMPT && text;
  const idle = useIdle(`${text}|${hand}`, messages === "hints" && !!prompt);
  const line = kind === NOTICE || messages === "all" ? text : prompt && idle ? <span className="prompt">{text}</span> : null;
  return (
    <div className="msg" aria-live="polite">
      {reconnecting ? <span className="reconnecting">Reconnecting...</span>
        : notice ? <span className="notice">{notice}</span>
        : verdict && !shuffling ? (
          <>
            <span className={`verdict ${verdict.kind}`}>
              <b>{verdict.word}</b>
              {verdict.amt && <span className="num">{verdict.amt}</span>}
              {verdict.extra && <em>{verdict.extra}</em>}
            </span>
            <span className="sr-only">{heard}</span>
          </>
        )
        : line}
    </div>
  );
}

// Re-renders only when its props change (#5).
export default memo(CenterMessage);
