import "../PlayerOptions/PlayerOptions.css";

// The offers before the first move (hidden, not disabled, like the player's options). It reuses `.options-wrap`, so it stays hidden
// while the board is busy with cards in flight (`.board.busy .options-wrap`). "No thanks" closes whatever is left open.
export default function OfferOptions({ offers, stake, onInsurance, onEvenMoney, onSurrender, onDecline }) {
  return (
    <div className="options-wrap" role="group" aria-label="Offers">
      {offers.insurance && <button className="opt" onClick={onInsurance}>Insurance ${stake}</button>}
      {offers.evenMoney && <button className="opt" onClick={onEvenMoney}>Even money</button>}
      {offers.surrender && <button className="opt" onClick={onSurrender}>Surrender</button>}
      <button className="opt" onClick={onDecline}>No thanks</button>
    </div>
  );
}
