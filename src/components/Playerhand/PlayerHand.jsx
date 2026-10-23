import { memo } from "react";
import Card from "../Card/Card";
import PlayerOptions from "../PlayerOptions/PlayerOptions";
import { useGameActions } from "../../hooks/useGame";
import "./PlayerHand.css";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandStatus } from "../../utils/constants/handStatus";
import { HandResult } from "../../utils/constants/handResult";
import { canSplit } from "../../utils/blackjackLogic";
import { dealingStyle } from "../dealingStyle";

function PlayerHand({ hand, index, active, gamePhase, handCount, maxSplitHands, tripleDown, credits }) {
  const { hit, stand, double, triple, split } = useGameActions();
  const canAffordStake = hand.bet > 0 && credits >= hand.bet; // a hand whose stake was refused can't add to it
  const showResult = (gamePhase === GamePhases.POST_ROUND || gamePhase === GamePhases.END_ROUND) && hand.result !== HandResult.NONE;
  const style = dealingStyle(gamePhase === GamePhases.DEALING);
  const canAct = active && gamePhase === GamePhases.PLAYER_TURN && hand.status === HandStatus.PLAYING;

  return (
    <div className={`player-hand${active ? " active" : ""}`}>
      <div className="hand-total">
        <span style={style}>Total: {hand.totals.join(" / ")}</span>
        {' '}| Bet: ${hand.bet}
        {showResult && <span className={`hand-result ${hand.result}`} style={style}> {hand.result}</span>}
        {hand.isBusted && <span className={`hand-result busted`} style={style}> Busted</span>}
        {hand.isBlackjack && <span className={`hand-result blackjack`} style={style}> Blackjack</span>}
      </div>
      <div className="cards">
        {hand.cards.map((card) => (
          <Card key={card.id} card={card} />
        ))}
        {/* Face down: the hidden card itself (and its id) never reaches the DOM */}
        {hand.hiddenCards.map((_, i) => (
          <Card key={`hidden-${i}`} faceDown />
        ))}
      </div>
      {canAct && (
        <PlayerOptions
          onHit={() => hit(index)}
          onStay={() => stand(index)}
          onDouble={() => double(index)}
          onTriple={() => triple(index)}
          onSplit={() => split(index)}
          showDouble={hand.cards.length === 2 && canAffordStake}
          showTriple={tripleDown && hand.cards.length === 2 && canAffordStake && credits >= 2 * hand.bet}
          showSplit={canSplit(hand, handCount, maxSplitHands) && canAffordStake}
        />
      )}
    </div>
  );
}

// Only plain props and stable actions, so a hand re-renders only when it (or the phase) changes (#5).
export default memo(PlayerHand);
