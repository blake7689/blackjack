import { memo, useRef } from "react";
import FlyCard from "../Card/FlyCard";
import Pill from "../Pill/Pill";
import { ChipStack } from "../Chip/Chip";
import { useLanded } from "../../hooks/useLanded";
import { useSmoothRow } from "../../hooks/useSmoothRow";
import { handLabel } from "../../utils/handDisplay";
import { money } from "../../utils/money";
import "./PlayerHand.css";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandResult } from "../../utils/constants/handResult";

// One seat (#81): the hand (its cards in a straight row, the total pill beside it or above it), the bet circle under it and the amount
// (with the result) under that. The keys that act on it (hit, stay, double, the offers) are in the dock. A hand with no cards is the betting
// seat: just the circle and the chips in it. `active`: the hand in play (the circle and the pill carry the accent).
// The circle (#82) is a button while betting: a tap bets `chip` (the rack's selected chip) through `onBet`; `canBet`: there is a chip to bet.
// Its chips are one stack (the bet), and the side stacks beside it: a double's second stake and the insurance stake, never over the bet. //
function PlayerHand({ hand, index = 0, active, gamePhase, showTotals = true, chip = null, canBet = false, onBet }) {
  const rowRef = useRef(null);
  useSmoothRow(rowRef);
  const shown = useLanded(hand.cards);
  const settled = gamePhase === GamePhases.POST_ROUND || gamePhase === GamePhases.END_ROUND;
  const showResult = hand.result !== HandResult.NONE && (settled || hand.result === HandResult.SURRENDER || hand.evenMoney); // a surrender and even money show at once
  const done = !shown.pending; // the result waits for the last card to land
  const empty = !hand.cards.length && !hand.hiddenCards.length;
  const natural = hand.isBlackjack && done && !!hand.cards.length; // the pill says it once the last card has turned over
  const playing = active && gamePhase === GamePhases.PLAYER_TURN;
  const betting = gamePhase === GamePhases.PRE_DEAL;
  // A double's second stake is its own stack only when the bet is exactly twice the first stake (baseStake). A tripled hand, a refused double and a split-off
  // hand (baseStake 0: its whole stake was an added one) have no such split: one stack of the whole bet, its exact amount on the label.
  const dbl = hand.isDouble && hand.baseStake > 0 && hand.bet === hand.baseStake * 2 ? hand.baseStake : 0;
  const ins = hand.insurance > 0 ? hand.insurance : 0;
  const spotName = betting ? `Bet spot ${index + 1}, ${money(hand.bet)}${canBet && chip ? `. Adds a ${money(chip)} chip` : ""}` : `Bet ${money(hand.bet)}`;

  // The result: the verdict line itself is PR 4's; until then each hand carries its result as a tag under its amount.
  const resultKind = hand.evenMoney ? "even" : hand.isBusted ? "bust" : String(hand.result).toLowerCase();
  const resultText = hand.evenMoney ? "Even money" : hand.isBusted ? "Bust" : hand.result;

  return (
    <div className={`seat${active ? " active" : ""}${empty ? " nocards" : ""}${dbl || ins ? " sides" : ""}`}>
      <div className="hand player-hand" role="group" aria-label={empty ? `Hand ${index + 1}: no cards` : handLabel(`Hand ${index + 1}`, hand.cards, hand.hiddenCards.length, shown, shown.totals, { showTotals, natural })}>
        <div className="fan-row cards" ref={rowRef}>
          {/* One list, so a double's card keeps its element from face down to face up (no second flight).
              Face down: the hidden card itself (and its id) never reaches the DOM. */}
          {[
            ...hand.cards.map((card, i) => {
              const dbl = hand.isDouble && hand.hiddenCards.length === 0 && i === hand.cards.length - 1; // face down: the hidden card is it
              const k = dbl ? "dbl" : card.id;
              return <FlyCard key={k} fk={k} card={card} dealOrder={card.dealOrder} moved={card.moved} sideways={dbl} />;
            }),
            ...hand.hiddenCards.map(() => <FlyCard key="dbl" fk="dbl" sideways />),
          ]}
        </div>
        <Pill totals={shown.totals} natural={natural} on={playing} />
      </div>
      <div className="spot-row">
        {ins > 0 && <div className="side-spot ins"><span className="stack"><ChipStack amount={ins} /></span><i>INS {money(ins)}</i></div>}
        <button type="button" className={`spot${hand.bet > 0 ? " has" : ""}${canBet && !hand.bet ? " open" : ""}`} aria-label={spotName} disabled={!betting || !canBet}
          onClick={() => onBet(chip)}>
          <span className="bet-lbl">BET</span>
          <span className="stack"><ChipStack amount={hand.bet - dbl} /></span>
        </button>
        {dbl > 0 && <div className="side-spot dbl"><span className="stack"><ChipStack amount={dbl} /></span></div>}
      </div>
      <div className="amt">
        {hand.bet > 0 && <span className="num">{money(hand.bet)}</span>}
        {done && showResult && <span className={`tag ${resultKind}`}>{resultText}</span>}
        {done && hand.surrendered && !showResult && <span className="tag surrender">Surrender pending</span>}
        {done && settled && hand.insurance > 0 && (hand.insurancePayout > 0
          ? <span className="tag win">Insurance pays {money(hand.insurancePayout)}</span>
          : <span className="tag lose">Insurance lost</span>)}
      </div>
    </div>
  );
}

// Only plain props and stable actions, so a hand re-renders only when it (or the phase) changes (#5).
export default memo(PlayerHand);
