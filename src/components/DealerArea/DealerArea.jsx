import { memo } from "react";
import Card from "../Card/Card.jsx";
import "./DealerArea.css";

function DealerArea({ dealer, hiddenCount = 0 }) {
  return (
    <div className="dealer-area">
      <div className="dealer-hand">
        <div className="hand-total">
          Total: {dealer.dealerDisplayTotal}
          {dealer.isBusted && <span className={`busted`}> Busted</span>}
          {dealer.isBlackjack && <span className={`blackjack`}> Blackjack</span>}
        </div>
        <div className="dealer cards">
          {dealer.cards.map((c) => (
            <div key={c.id} className="card-wrap up">
              <Card card={c} />
            </div>
          ))}
          {/* Face down: the hidden card itself never reaches the DOM */}
          {Array.from({ length: hiddenCount }, (_, i) => (
            <div key={`hidden-${i}`} className="card-wrap down">
              <Card faceDown />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Re-renders only when the dealer's hand changes (#5).
export default memo(DealerArea);
