import { memo, useContext, useLayoutEffect, useRef, useState } from "react";
import FlyCard from "../Card/FlyCard";
import Pill from "../Pill/Pill";
import { ChipStack } from "../Chip/Chip";
import { FlightContext } from "../../context/FlightContext";
import { useLanded } from "../../hooks/useLanded";
import { useSmoothRow } from "../../hooks/useSmoothRow";
import { reducedMotion, reserve } from "../../utils/cardAnimation";
import { PAYOUT_MS, chipsToSpot, payoutFx, payoutKind, stackBack, stackToSide } from "../../utils/chipFlight";
import { handLabel } from "../../utils/handDisplay";
import { cents } from "../../utils/blackjackLogic";
import { money } from "../../utils/money";
import { tagOf } from "../../utils/verdict";
import { playSound } from "../../utils/sound";
import "./PlayerHand.css";
import { GamePhases } from "../../utils/constants/gamePhases";

const SETTLE_WAIT = 520; // ms the verdict shows before the chips move
const SEAT_GAP = 90; // ms between one seat's chips setting off and the next

// The amount a stack shows (#83): a rise waits for the chips gliding in (`launch(rise)` sets them off and says how long, 0 = none flew), a fall is at once.
// `fromNothing`: a stack that is there when the seat mounts came in from nothing (the automatic rebet), unless the board is only being redrawn.
function useArrival(amount, fromNothing, launch) {
  const [shown, setShown] = useState(fromNothing ? 0 : amount);
  const was = useRef(fromNothing ? 0 : amount);
  useLayoutEffect(() => {
    const before = was.current;
    was.current = amount;
    if (amount !== before) {
      const ms = launch(amount - before);
      if (ms > 0) {
        const timer = setTimeout(() => setShown(amount), ms);
        return () => clearTimeout(timer);
      }
    }
    setShown(amount);
    // `launch` reads the DOM at the moment of the change; the amount alone says when.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);
  return shown;
}

// One seat (#81): the hand (its cards in a straight row, the total pill beside it or above it), the bet circle under it and the amount
// (with the result) under that. The keys that act on it (hit, stay, double, the offers) are in the dock. A hand with no cards is the betting
// seat: just the circle and the chips in it. `active`: the hand in play (the circle and the pill carry the accent).
// The circle (#82) is a button while betting: a tap bets `chip` (the rack's selected chip) through `onBet`; `canBet`: there is a chip to bet.
// Its chips are one stack (the bet), and the side stacks beside it: a double's second stake and the insurance stake, never over the bet.
// Motion (#83): chips glide in from the rack (or the dock) and a stack that comes off the table glides back; at the results the stacks lift into moving
// copies that are paid or swept (payoutFx), after the verdict has been on show for a moment, reserving the board's time so the next step waits.
// `multi`: several hands, so each carries its own result tag under its circle (one hand has the verdict line instead). //
function PlayerHand({ hand, index = 0, active, gamePhase, showTotals = true, chip = null, canBet = false, onBet, multi = false }) {
  const { enabled } = useContext(FlightContext);
  const seatRef = useRef(null);
  const rowRef = useRef(null);
  useSmoothRow(rowRef);
  const shown = useLanded(hand.cards);
  const settled = gamePhase === GamePhases.RESULTS || gamePhase === GamePhases.POST_ROUND || gamePhase === GamePhases.END_ROUND;
  const done = !shown.pending; // the result waits for the last card to land
  const empty = !hand.cards.length && !hand.hiddenCards.length;
  const natural = hand.isBlackjack && done && !!hand.cards.length; // the pill says it once the last card has turned over
  const playing = active && gamePhase === GamePhases.PLAYER_TURN;
  const betting = gamePhase === GamePhases.PRE_DEAL;
  // A double's second stake is its own stack only when the bet is exactly twice the first stake (baseStake). A tripled hand, a refused double and a split-off
  // hand (baseStake 0: its whole stake was an added one) have no such split: one stack of the whole bet, its exact amount on the label.
  const dbl = hand.isDouble && hand.baseStake > 0 && hand.bet === hand.baseStake * 2 ? hand.baseStake : 0;
  const ins = hand.insurance > 0 ? hand.insurance : 0;
  const spotName = betting ? `Bet spot ${index + 1}, ${money(hand.bet)}${chip ? `. Adds a ${money(chip)} chip` : ""}` : `Bet ${money(hand.bet)}`;

  // Chips arriving and leaving. The flights are state-driven: whoever changed the bet (a tap, a key, Rebet, 2x, the automatic rebet, a double, insurance) gets the
  // same motion, and none of it reserves or holds the board (a tap must never delay the dock).
  const motion = enabled && !reducedMotion();
  // A split-off hand (its first card is the one that changed hands) comes into being mid-round: its stake comes up from the dock to its circle (#147).
  const splitOff = !!hand.cards[0]?.moved && hand.bet > 0;
  const mainShown = useArrival(hand.bet - dbl, motion && (betting || splitOff), (d) => {
    const stake = !betting && splitOff && d === hand.bet; // only its first arrival: a later double on it is one instant stack
    if ((betting || stake) && d > 0) playSound("chip");
    if (!motion || !(betting || stake)) return 0;
    const spot = seatRef.current.querySelector(".spot");
    if (stake) return stackToSide(spot, d);
    if (d > 0) return chipsToSpot(spot, d);
    stackBack(spot, -d);
    return 0;
  });
  const side = (kind) => (d) => {
    if (d > 0) playSound("chip");
    const spot = motion && d > 0 && seatRef.current.querySelector(`.side-spot.${kind}`);
    return spot ? stackToSide(spot, d) : 0;
  };
  const dblShown = useArrival(dbl, false, side("dbl"));
  const insShown = useArrival(ins, false, side("ins"));

  // The results: the stacks leave. Not again on a seat that mounts after them (the board redrawn, returning from Settings).
  const [paid, setPaid] = useState(gamePhase === GamePhases.POST_ROUND || gamePhase === GamePhases.END_ROUND);
  const fx = useRef(null);
  const paidTimer = useRef(0);
  const results = gamePhase === GamePhases.RESULTS;
  useLayoutEffect(() => {
    if (!results) return;
    if (!motion) { setPaid(true); return; }
    const stake = hand.bet;
    const ret = cents(hand.payout - (hand.insurancePayout ?? 0)); // the insurance has its own stack
    const delay = SETTLE_WAIT + index * SEAT_GAP;
    const undo = reserve(performance.now() + delay + Math.max(PAYOUT_MS[payoutKind(stake, ret)], ins > 0 ? 1000 : 0) + 100);
    const timer = setTimeout(() => {
      fx.current = payoutFx(seatRef.current, { stake, ret, insured: ins > 0, insurancePaid: hand.insurancePayout > 0 });
      // The "$25" label stays and the circle shows no BET until the chips have gone (the mockup zeroes the bet after its payout, #147).
      paidTimer.current = setTimeout(() => setPaid(true), fx.current?.ms ?? 0);
    }, delay);
    return () => { undo(); clearTimeout(timer); };
    // Once per round's results: the hand is settled and does not change while they show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);
  useLayoutEffect(() => () => { clearTimeout(paidTimer.current); fx.current?.cancel(); }, []);

  const tag = multi && settled && done ? tagOf(hand) : null;

  return (
    <div ref={seatRef} className={`seat${active ? " active" : ""}${empty ? " nocards" : ""}${dbl || ins ? " sides" : ""}${paid ? " paid" : ""}`}>
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
        {ins > 0 && <div className="side-spot ins"><span className="stack"><ChipStack amount={insShown} /></span><i>INS<span className="sr-only"> {money(ins)}</span></i></div>}
        <button type="button" className={`spot${hand.bet > 0 ? " has" : ""}${canBet && !hand.bet ? " open" : ""}`} aria-label={spotName} disabled={!betting || !canBet}
          onClick={() => onBet(chip)}>
          <span className="bet-lbl">BET</span>
          <span className="stack"><ChipStack amount={mainShown} /></span>
        </button>
        {dbl > 0 && <div className="side-spot dbl"><span className="stack"><ChipStack amount={dblShown} /></span></div>}
      </div>
      <div className="amt">
        {tag ? <span className={`tag ${tag.kind}`}>{tag.text}</span> : hand.bet > 0 && <span className="num">{money(hand.bet)}</span>}
        {tag && settled && hand.insurance > 0 && (hand.insurancePayout > 0
          ? <span className="tag win">Insurance pays {money(hand.insurancePayout)}</span>
          : <span className="tag lose">Insurance lost</span>)}
      </div>
    </div>
  );
}

// Only plain props and stable actions, so a hand re-renders only when it (or the phase) changes (#5).
export default memo(PlayerHand);
