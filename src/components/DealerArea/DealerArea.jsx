import Card from "../Card/Card.jsx";
import "./DealerArea.css";

export default function DealerArea({ dealer }) {
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
        </div>
      </div>
    </div>
  );
}
