import { memo, useRef } from "react";
import FlyCard from "../Card/FlyCard.jsx";
import Pill from "../Pill/Pill";
import { useLanded } from "../../hooks/useLanded";
import { useSmoothRow } from "../../hooks/useSmoothRow";
import { handLabel } from "../../utils/handDisplay";
import "./DealerArea.css";

// The dealer's hand (#81): a straight row of cards with its total pill beside it on the right. `hiddenCount`: the face-down hole card. //
function DealerArea({ dealer, hiddenCount = 0, showTotals = true }) {
  const rowRef = useRef(null);
  useSmoothRow(rowRef);
  const shown = useLanded(dealer.cards);
  const natural = !!dealer.isBlackjack && !shown.pending;
  return (
    <div className="dealer-area" style={{ "--n": dealer.cards.length + hiddenCount }}>
      <div className="dealer-hand hand" role="group" aria-label={handLabel("Dealer", dealer.cards, hiddenCount, shown, shown.totals, { showTotals, natural })}>
        <div className="fan-row dealer cards" ref={rowRef}>
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
        <Pill totals={shown.totals} natural={natural} />
      </div>
    </div>
  );
}

// Re-renders only when the dealer's hand changes, or a card lands (#5).
export default memo(DealerArea);
