// The shoe, the discard pile and the cut card's rest place (#81). None is in the accessibility tree: the shoe is off the table, top right,
// and only the corner of its top card shows; cards leave from its mouth (`.deck-stack`, #6's flights aim there). The discard pile (top left,
// partly off the felt) is backs only, hidden while empty and thicker as it grows; the cut card lies at the felt's left edge once it is drawn.
// Styles: GameBoard.css (they share the stage's --cw). `discard` is the number of cards in the pile. //
const level = (discard) => Math.min(4, Math.ceil(discard / 12));

export default function Shoe({ discard, cutOut }) {
  return (
    <>
      <div className="shoe" aria-hidden="true">
        <svg className="shoe-card" viewBox="0 0 250 363" focusable="false"><use href="#cardback" /></svg>
        <i className="mouth deck-stack" />
      </div>
      <div className={`discard${discard ? "" : " empty"}`} data-lv={level(discard)} aria-hidden="true">
        <svg className="discard-card" viewBox="0 0 250 363" focusable="false"><use href="#cardback" /></svg>
      </div>
      <div className={`cut-rest${cutOut ? " out" : ""}`} aria-hidden="true" />
    </>
  );
}
