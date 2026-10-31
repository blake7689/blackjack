import { memo, useRef } from "react";
import FlyCard from "../Card/FlyCard";
import { useLanded } from "../../hooks/useLanded";
import { useSmoothRow } from "../../hooks/useSmoothRow";
import PlayerOptions from "../PlayerOptions/PlayerOptions";
import OfferOptions from "../OfferOptions/OfferOptions";
import { useGameActions } from "../../hooks/useGame";
import "./PlayerHand.css";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandStatus } from "../../utils/constants/handStatus";
import { HandResult } from "../../utils/constants/handResult";
import { canHit, canSplit, canDouble, insuranceStake } from "../../utils/blackjackLogic";
import { DoubleOn } from "../../utils/constants/ruleOptions";

// The rule props default to the rules the game had before #91, so a caller that passes none gets those.
function PlayerHand({ hand, index, active, gamePhase, handCount, maxSplitHands, tripleDown, credits,
  doubleOn = DoubleOn.ANY, doubleAfterSplit = true, resplitAces = false, hitSplitAces = false, showSurrender, offers }) {
  const rowRef = useRef(null);
  useSmoothRow(rowRef);
  const shown = useLanded(hand.cards);
  const { hit, stand, double, triple, split, surrender, takeInsurance, evenMoney, declineOffers } = useGameActions();
  const canAffordStake = hand.bet > 0 && credits >= hand.bet; // a hand whose stake was refused can't add to it
  const settled = gamePhase === GamePhases.POST_ROUND || gamePhase === GamePhases.END_ROUND;
  const showResult = hand.result !== HandResult.NONE && (settled || hand.result === HandResult.SURRENDER || hand.evenMoney); // a surrender and even money show at once
  const resultText = hand.evenMoney ? "Even money" : hand.result;
  const mayDouble = canDouble(hand, { doubleOn, doubleAfterSplit }) && canAffordStake;
  const canAct = active && gamePhase === GamePhases.PLAYER_TURN && hand.status === HandStatus.PLAYING;
  const offering = active && gamePhase === GamePhases.OFFERS && offers; // `offers` is passed only while the phase is OFFERS

  return (
    <div className={`player-hand${active ? " active" : ""}`}>
      {/* Live text over an invisible copy of the final text (see GameBoard.css). The total counts only cards that have
          landed and flipped; the labels wait for the last one. */}
      <div className="hand-total">
        {[shown.pending, false].map((pending, i) => (
          <span key={i} className={i ? "ht-size" : undefined} aria-hidden={i ? "true" : undefined}>
            Total: {pending ? (shown.totals?.totals.join(" / ") ?? "-") : hand.totals.join(" / ")}
            {' '}| Bet: ${hand.bet}
            {hand.insurance > 0 && <> | Insurance: ${hand.insurance}</>}
            {!pending && showResult && <span className={`hand-result ${hand.result}`}> {resultText}</span>}
            {!pending && hand.surrendered && !showResult && <span className="hand-result Surrendered"> Surrender pending</span>}
            {!pending && hand.isBusted && <span className={`hand-result busted`}> Busted</span>}
            {!pending && hand.isBlackjack && <span className={`hand-result blackjack`}> Blackjack</span>}
            {!pending && settled && hand.insurance > 0 && (hand.insurancePayout > 0
              ? <span className="hand-result Win"> Insurance pays ${hand.insurancePayout}</span>
              : <span className="hand-result Lose"> Insurance lost</span>)}
          </span>
        ))}
      </div>
      <div className="cards" ref={rowRef}>
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
      {offering && (
        <OfferOptions
          offers={offers}
          stake={insuranceStake(hand.bet)}
          onInsurance={takeInsurance}
          onEvenMoney={evenMoney}
          onSurrender={() => surrender(index)}
          onDecline={declineOffers}
        />
      )}
      {canAct && (
        <PlayerOptions
          onHit={() => hit(index)}
          onStay={() => stand(index)}
          onDouble={() => double(index)}
          onTriple={() => triple(index)}
          onSplit={() => split(index)}
          onSurrender={() => surrender(index)}
          showHit={canHit(hand, { hitSplitAces })}
          showDouble={mayDouble}
          showTriple={tripleDown && mayDouble && credits >= 2 * hand.bet}
          showSplit={canSplit(hand, handCount, maxSplitHands, resplitAces) && canAffordStake}
          showSurrender={showSurrender}
        />
      )}
    </div>
  );
}

// Only plain props and stable actions, so a hand re-renders only when it (or the phase) changes (#5).
export default memo(PlayerHand);
