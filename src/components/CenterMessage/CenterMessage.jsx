import { memo } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";

const MESSAGES = {
  [GamePhases.PRE_DEAL]: "Place your bets!",
  [GamePhases.DEALING]: "Dealing...",
  [GamePhases.PEEK]: "Dealer checks for blackjack...",
  [GamePhases.PLAYER_TURN]: "Your turn!",
  [GamePhases.DEALER_TURN]: "Dealer's turn...",
  [GamePhases.SETTLING_HANDS]: "Settling bets...",
  [GamePhases.RESULTS]: "Calculating results...",
  [GamePhases.POST_ROUND]: "Click anywhere to continue...",
};

// The offer still open names itself: "Even money?", "Insurance?", "Surrender?" (or both of the last two). //
function offerMessage({ insurance, evenMoney, surrender }) {
  if (evenMoney) return "Even money?";
  if (insurance) return surrender ? "Insurance or surrender?" : "Insurance?";
  return "Surrender?";
}

function CenterMessage({ gamePhase, waiting, reconnecting, notice, offers }) {
  return (
    <div>
      {waiting ? "Waiting for the server..." : gamePhase === GamePhases.OFFERS && offers ? offerMessage(offers) : MESSAGES[gamePhase] ?? ""}
      {reconnecting && <div role="status">Reconnecting...</div>}
      {notice && <div role="status">{notice}</div>}
    </div>
  );
}

// Re-renders only when its props change (#5).
export default memo(CenterMessage);
