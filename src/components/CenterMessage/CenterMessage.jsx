import { GamePhases } from "../../utils/constants/gamePhases";

const MESSAGES = {
  [GamePhases.PRE_DEAL]: "Place your bets!",
  [GamePhases.PLAYER_TURN]: "Your turn!",
  [GamePhases.DEALER_TURN]: "Dealer's turn...",
  [GamePhases.SETTLING_HANDS]: "Settling bets...",
  [GamePhases.RESULTS]: "Calculating results...",
  [GamePhases.POST_ROUND]: "Click anywhere to continue...",
};

export default function CenterMessage({ gamePhase }) {
  return <div>{MESSAGES[gamePhase] ?? ""}</div>;
}
