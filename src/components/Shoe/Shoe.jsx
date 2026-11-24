import { useLayoutEffect, useRef } from "react";
import { cutFly } from "../../utils/cardFx";

// The shoe, the discard pile and the cut card's rest place (#81, moving in #83). None is in the accessibility tree: the shoe is off the table, top right,
// and only the corner of its top card shows; cards leave from its mouth (`.deck-stack`, #6's flights aim there). The discard pile (top left,
// partly off the felt) is backs only, hidden while empty and thicker as it grows; the sweep lands on its top card (`.discard-card`). The cut card lies at the
// felt's left edge once it is drawn, coming out of the shoe when it is. `away`: the shuffle has slid the shoe and the pile off. Styles: GameBoard.css
// (they share the stage's --cw). `discard` is the number of cards in the pile. //
const level = (discard) => Math.min(4, Math.ceil(discard / 12));

export default function Shoe({ discard, cutOut, away = false }) {
  const cutRef = useRef(null);
  const wasOut = useRef(cutOut); // a board that opens with the cut card already out does not fly it again
  useLayoutEffect(() => {
    if (cutOut && !wasOut.current) cutFly(cutRef.current);
    wasOut.current = cutOut;
  }, [cutOut]);
  return (
    <>
      <div className={`shoe${away ? " shuffling" : ""}`} aria-hidden="true">
        <svg className="shoe-card" viewBox="0 0 250 363" focusable="false"><use href="#cardback" /></svg>
        <i className="mouth deck-stack" />
      </div>
      <div className={`discard${discard ? "" : " empty"}${away ? " away" : ""}`} data-lv={level(discard)} aria-hidden="true">
        <svg className="discard-card" viewBox="0 0 250 363" focusable="false"><use href="#cardback" /></svg>
      </div>
      <div ref={cutRef} className={`cut-rest${cutOut ? " out" : ""}`} aria-hidden="true" />
    </>
  );
}
