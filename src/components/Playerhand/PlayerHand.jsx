import { memo, useRef } from "react";
import FlyCard from "../Card/FlyCard";
import { useLanded } from "../../hooks/useLanded";
import { useSmoothRow } from "../../hooks/useSmoothRow";
import PlayerOptions from "../PlayerOptions/PlayerOptions";
import { useGameActions } from "../../hooks/useGame";
import "./PlayerHand.css";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandStatus } from "../../utils/constants/handStatus";
import { HandResult } from "../../utils/constants/handResult";
import { canSplit, canDouble, isSplitAces } from "../../utils/blackjackLogic";
import { DoubleOn } from "../../utils/constants/ruleOptions";

// The rule props default to the rules the game had before #91, so a caller that passes none gets those.
function PlayerHand({ hand, index, active, gamePhase, handCount, maxSplitHands, tripleDown, credits,
  doubleOn = DoubleOn.ANY, doubleAfterSplit = true, resplitAces = false, hitSplitAces = false }) {
  const rowRef = useRef(null);
  useSmoothRow(rowRef);
  const shown = useLanded(hand.cards);
  const { hit, stand, double, triple, split } = useGameActions();
  const canAffordStake = hand.bet > 0 && credits >= hand.bet; // a hand whose stake was refused can't add to it
  const showResult = (gamePhase === GamePhases.POST_ROUND || gamePhase === GamePhases.END_ROUND) && hand.result !== HandResult.NONE;
  const mayDouble = canDouble(hand, { doubleOn, doubleAfterSplit }) && canAffordStake;
  const canAct = active && gamePhase === GamePhases.PLAYER_TURN && hand.status === HandStatus.PLAYING;

  return (
    <div className={`player-hand${active ? " active" : ""}`}>
      {/* Live text over an invisible copy of the final text (see GameBoard.css). The total counts only cards that have
          landed and flipped; the labels wait for the last one. */}
      <div className="hand-total">
        {[shown.pending, false].map((pending, i) => (
          <span key={i} className={i ? "ht-size" : undefined} aria-hidden={i ? "true" : undefined}>
            Total: {pending ? (shown.totals?.totals.join(" / ") ?? "-") : hand.totals.join(" / ")}
            {' '}| Bet: ${hand.bet}
            {!pending && showResult && <span className={`hand-result ${hand.result}`}> {hand.result}</span>}
            {!pending && hand.isBusted && <span className={`hand-result busted`}> Busted</span>}
            {!pending && hand.isBlackjack && <span className={`hand-result blackjack`}> Blackjack</span>}
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
      {canAct && (
        <PlayerOptions
          onHit={() => hit(index)}
          onStay={() => stand(index)}
          onDouble={() => double(index)}
          onTriple={() => triple(index)}
          onSplit={() => split(index)}
          showHit={hitSplitAces || !isSplitAces(hand)}
          showDouble={mayDouble}
          showTriple={tripleDown && mayDouble && credits >= 2 * hand.bet}
          showSplit={canSplit(hand, handCount, maxSplitHands, resplitAces) && canAffordStake}
        />
      )}
    </div>
  );
}

// Only plain props and stable actions, so a hand re-renders only when it (or the phase) changes (#5).
export default memo(PlayerHand);
