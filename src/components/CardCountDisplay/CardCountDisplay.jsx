import "./CardCountDisplay.css";

const CardCountDisplay = ({ hands, dealer, runningCount, deckCount }) => {
  const cardsDealt = hands.reduce((sum, h) => sum + (h.cards ? h.cards.length : 0), 0) + (dealer && dealer.cards ? dealer.cards.length : 0);
  const cardsLeft = deckCount * 52 - cardsDealt;
  const decksRemaining = Math.max(1, cardsLeft / 52);
  const trueCount = Math.round(runningCount / decksRemaining);
  return (
    <div className="card-count-display">
      <span className="count-label">Count:</span>
      <span className="count-value">{runningCount}</span>
      <span className="true-count-label" style={{marginLeft:8}}>True:</span>
      <span className="true-count-value">{trueCount}</span>
    </div>
  );
};

export default CardCountDisplay;
