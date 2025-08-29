import { GamePhases } from "../../utils/constants/gamePhases";

export default function CenterMessage({ gamePhase, message }) {
  let defaultMsg = "";
  switch (gamePhase) {
    case GamePhases.PRE_DEAL:
      defaultMsg = "Place your bets!";
      break;
    case GamePhases.PLAYER_TURN:
      defaultMsg = "Your turn!";
      break;
    case GamePhases.DEALER_TURN:
      defaultMsg = "Dealer's turn...";
      break;
      case GamePhases.SETTLING_HANDS:
      defaultMsg = "Settling bets...";
      break;
    case GamePhases.RESULTS:
      defaultMsg = "Calculating results...";
      break;
    case GamePhases.POST_ROUND:
      defaultMsg = "Click anywhere to continue...";
      break;
    default:
      defaultMsg = "";
  }
  return (
    <div>
      {(message ?? defaultMsg).split("\n").map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}