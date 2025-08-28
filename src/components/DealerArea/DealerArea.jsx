import Card from "../Card/Card.jsx";
import "./DealerArea.css";
// import "../GameBoard/GameBoard.css";

// function getBlackjackTotals(cards) {
//   let total = 0;
//   let aces = 0;
//   for (const c of cards) {
//     if (c.rank === "ace") aces++;
//     else if (["jack", "queen", "king"].includes(c.rank)) total += 10;
//     else total += parseInt(c.rank, 10) || 0;
//   }

//   // All possible totals
//   const totals = [];
//   for (let i = 0; i <= aces; i++) {
//     const t = total + i * 1 + (aces - i) * 11;
//     totals.push(t);
//   }

//   // Remove duplicates, sort descending
//   const uniqueTotals = Array.from(new Set(totals)).sort((a, b) => b - a);
  
//   // Only show totals <= 21, or lowest if all bust
//   const validTotals = uniqueTotals.filter(t => t <= 21);
//   if (validTotals.length === 0) return [Math.min(...uniqueTotals)];
//   return validTotals;
// }

export default function DealerArea({ dealer }) {
  const hasCards = dealer.cards && dealer.cards.length > 0;
  // const faceUpCards = hasCards ? dealer.cards.filter(c => !c.faceDown) : [];
  // const totals = hasCards && faceUpCards.length > 0 ? getBlackjackTotals(faceUpCards) : [];

  return (
    <div className="dealer-area">
      <div className="dealer-hand">
        {hasCards && (
          <div className="hand-total">
            Total: {dealer.dealerDisplayTotal.join(" / ")}
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