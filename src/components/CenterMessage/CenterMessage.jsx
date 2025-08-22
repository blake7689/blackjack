export default function CenterMessage({ gamePhase, message }) {
  let defaultMsg = "";
  switch (gamePhase) {
    case "preDeal":
      defaultMsg = "Place your bets!";
      break;
    case "playerTurn":
      defaultMsg = "Your turn!";
      break;
    case "dealerTurn":
      defaultMsg = "Dealer's turn...";
      break;
    case "results":
      defaultMsg = "Click anywhere to continue...";
      break;
    case "settling":
      defaultMsg = "Settling bets...";
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