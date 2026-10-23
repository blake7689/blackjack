import { memo } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";

const MESSAGES = {
  [GamePhases.PRE_DEAL]: "Place your bets!",
  [GamePhases.PLAYER_TURN]: "Your turn!",
  [GamePhases.DEALER_TURN]: "Dealer's turn...",
  [GamePhases.SETTLING_HANDS]: "Settling bets...",
  [GamePhases.RESULTS]: "Calculating results...",
  [GamePhases.POST_ROUND]: "Click anywhere to continue...",
};

function CenterMessage({ gamePhase, waiting, reconnecting, notice }) {
  return (
    <div>
      {waiting ? "Waiting for the server..." : MESSAGES[gamePhase] ?? ""}
      {reconnecting && <div role="status">Reconnecting...</div>}
      {notice && <div role="status">{notice}</div>}
    </div>
  );
}

// Re-renders only when its props change (#5).
export default memo(CenterMessage);
