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

// Between rounds: auto deal says it is about to deal, else a bet on the table says to tap Deal. //
const bettingMessage = (bet, autoDealing) => (autoDealing ? "Dealing soon" : bet > 0 ? "Tap Deal" : "Place your bets");

// What the one line says for a phase. `lastHand`: the cut card is out, so this is the last hand before the shuffle. //
function phaseMessage({ gamePhase, offers, bet, autoDealing, lastHand }) {
  switch (gamePhase) {
    case GamePhases.PRE_DEAL: return bettingMessage(bet, autoDealing);
    case GamePhases.OFFERS: return offerMessage(offers);
    case GamePhases.PLAYER_TURN: return lastHand ? "Last hand before the shuffle" : "Your move";
    case GamePhases.END_ROUND: return lastHand ? "Shuffling" : "";
    default: return MESSAGES[gamePhase] ?? "";
  }
}

// The one message line (fixed 48 px, CenterMessage.css): a reconnecting or refused-bet notice takes the place of the phase's words. //
function CenterMessage({ gamePhase, waiting, reconnecting, notice, offers, bet = 0, autoDealing = false, lastHand = false }) {
  const text = waiting ? "Waiting for the server..." : phaseMessage({ gamePhase, offers, bet, autoDealing, lastHand });
  return (
    <div className="msg" aria-live="polite">
      {reconnecting ? <span className="reconnecting">Reconnecting...</span>
        : notice ? <span className="notice">{notice}</span>
        : text}
    </div>
  );
}

// Re-renders only when its props change (#5).
export default memo(CenterMessage);
