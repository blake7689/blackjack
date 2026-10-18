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

function CenterMessage({ gamePhase }) {
  return <div>{MESSAGES[gamePhase] ?? ""}</div>;
}

// Re-renders only when the phase changes (#5).
export default memo(CenterMessage);
