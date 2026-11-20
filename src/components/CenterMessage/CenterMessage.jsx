import { memo } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";
import "./CenterMessage.css";

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
const bettingMessage = (bet, autoDealing, broke) => (autoDealing ? "Dealing soon" : bet > 0 ? "Tap Deal" : broke ? "Out of credits" : "Place your bets");

// What the one line says for a phase. `lastHand`: the cut card is out, so this is the last hand before the shuffle. //
function phaseMessage({ gamePhase, offers, bet, autoDealing, lastHand, broke }) {
  switch (gamePhase) {
    case GamePhases.PRE_DEAL: return bettingMessage(bet, autoDealing, broke);
    case GamePhases.OFFERS: return offerMessage(offers);
    case GamePhases.PLAYER_TURN: return lastHand ? "Last hand before the shuffle" : "Your move";
    case GamePhases.END_ROUND: return lastHand ? "Shuffling" : "";
    default: return MESSAGES[gamePhase] ?? "";
  }
}

// The one message line (fixed 48 px, CenterMessage.css): a reconnecting or refused-bet notice takes the place of the phase's words. Then, in turn (#83):
// the shuffle ("Shuffling", also when the shoe runs out mid-round), the peek ("Dealer checks for blackjack", "No blackjack": `peek` is "checking" or
// "clear") and, once the hands are settled, the verdict: one word, never over a card (`verdict`: { kind, word, amt, extra }, see utils/verdict.js).
// This line is the board's ONE polite live region (#85): `heard` (utils/verdict.js `resultsLine`) rides in it, hidden from the eye, with the verdict. //
function CenterMessage({ gamePhase, waiting, reconnecting, notice, offers, bet = 0, broke = false, autoDealing = false, lastHand = false, verdict = null, shuffling = false, peek = null, heard = null }) {
  const text = waiting ? "Waiting for the server..." : shuffling ? "Shuffling"
    : peek === "clear" ? "No blackjack" : peek === "checking" ? "Dealer checks for blackjack"
    : phaseMessage({ gamePhase, offers, bet, autoDealing, lastHand, broke });
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
        : text}
    </div>
  );
}

// Re-renders only when its props change (#5).
export default memo(CenterMessage);
