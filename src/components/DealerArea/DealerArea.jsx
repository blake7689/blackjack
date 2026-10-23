import { memo, useRef } from "react";
import FlyCard from "../Card/FlyCard.jsx";
import { useLanded } from "../../hooks/useLanded";
import { useSmoothRow } from "../../hooks/useSmoothRow";
import "./DealerArea.css";

function DealerArea({ dealer, hiddenCount = 0 }) {
  const rowRef = useRef(null);
  useSmoothRow(rowRef);
  const shown = useLanded(dealer.cards);
  return (
    <div className="dealer-area">
      <div className="dealer-hand">
        {/* Live text over an invisible copy of the final text (see GameBoard.css). The total counts only cards that have
            landed and flipped; the labels wait for the last one. */}
        <div className="hand-total">
          {[shown.pending, false].map((pending, i) => (
            <span key={i} className={i ? "ht-size" : undefined} aria-hidden={i ? "true" : undefined}>
              Total: {pending ? (shown.totals?.total ?? "-") : dealer.dealerDisplayTotal}
              {!pending && dealer.isBusted && <span className={`busted`}> Busted</span>}
              {!pending && dealer.isBlackjack && <span className={`blackjack`}> Blackjack</span>}
            </span>
          ))}
        </div>
        <div className="dealer cards" ref={rowRef}>
          {/* One list, so the hole card keeps its element from face down to face up (two lists would remount it and fly it in again).
              Face down: the card itself never reaches the DOM, only its place in the deal (dealOrder 3). */}
          {[
            ...dealer.cards.map((c, i) => {
              const k = i === 1 ? "hole" : c.id;
              return <FlyCard key={k} fk={k} card={c} dealOrder={c.dealOrder} />;
            }),
            ...Array.from({ length: hiddenCount }, () => <FlyCard key="hole" fk="hole" dealOrder={3} />),
          ]}
        </div>
      </div>
    </div>
  );
}

// Re-renders only when the dealer's hand changes, or a card lands (#5).
export default memo(DealerArea);
