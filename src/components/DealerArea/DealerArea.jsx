import Card from "../Card/Card.jsx";
import { GamePhases } from "../../utils/constants/gamePhases";
import "./DealerArea.css";

export default function DealerArea({ dealer }) {
  const hasCards = dealer.cards && dealer.cards.length > 0;

  return (
    <div className="dealer-area">
      <div className="dealer-hand">
        {hasCards && (
          <div className="hand-total">
            Total: {dealer.dealerDisplayTotal}
            {dealer.isBusted && (
              <span className={`busted`}> Busted</span>
            )}
            {dealer.isBlackjack && (
              <span className={`blackjack`}> Blackjack</span>
            )}
          </div>
        )}
        <div className="dealer cards">
          {hasCards && dealer.cards.map((c, i) => (
            <div key={i} className={`card-wrap ${c.faceDown ? "down" : "up"}`}>
              <Card card={c} faceDown={c.faceDown} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}