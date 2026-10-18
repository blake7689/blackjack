import { memo } from "react";
import Card from "../Card/Card";
import PlayerOptions from "../PlayerOptions/PlayerOptions";
import { useGameActions } from "../../hooks/useGame";
import "./PlayerHand.css";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandStatus } from "../../utils/constants/handStatus";
import { HandResult } from "../../utils/constants/handResult";
import { canSplit } from "../../utils/blackjackLogic";

function PlayerHand({ hand, index, active, gamePhase, handCount, maxSplitHands, credits }) {
  const { hit, stand, double, split } = useGameActions();
  const canAffordStake = credits >= hand.bet;
  const showResult = (gamePhase === GamePhases.POST_ROUND || gamePhase === GamePhases.END_ROUND) && hand.result !== HandResult.NONE;
  const canAct = active && gamePhase === GamePhases.PLAYER_TURN && hand.status === HandStatus.PLAYING;

  return (
    <div className={`player-hand${active ? " active" : ""}`}>
      <div className="hand-total">
        Total: {hand.totals.join(" / ")}
        {' '}| Bet: ${hand.bet}
        {showResult && <span className={`hand-result ${hand.result}`}> {hand.result}</span>}
        {hand.isBusted && <span className={`hand-result busted`}> Busted</span>}
        {hand.isBlackjack && <span className={`hand-result blackjack`}> Blackjack</span>}
      </div>
      <div className="cards">
        {hand.cards.map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </div>
      {canAct && (
        <PlayerOptions
          onHit={() => hit(index)}
          onStay={() => stand(index)}
          onDouble={() => double(index)}
          onSplit={() => split(index)}
          showDouble={hand.cards.length === 2 && canAffordStake}
          showSplit={canSplit(hand, handCount, maxSplitHands) && canAffordStake}
        />
      )}
    </div>
  );
}

// Only plain props and stable actions, so a hand re-renders only when it (or the phase) changes (#5).
export default memo(PlayerHand);
