import Card from "../Card/Card";
import PlayerOptions from "../PlayerOptions/PlayerOptions";
import { usePlayer } from "../../hooks/usePlayer";
import { useGameState } from "../../hooks/useGame";
import "./PlayerHand.css";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandStatus } from "../../utils/constants/handStatus";
import { HandResult } from "../../utils/constants/handResult";
import { canSplit } from "../../utils/blackjackLogic";

export default function PlayerHand({ hand, active, onHit, onStay, onDouble, onSplit, gamePhase }) {
  const { player } = usePlayer();
  const { hands, settings } = useGameState();
  const canAffordStake = player.credits >= hand.bet;
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
          onHit={onHit}
          onStay={onStay}
          onDouble={onDouble}
          onSplit={onSplit}
          showDouble={hand.cards.length === 2 && canAffordStake}
          showSplit={canSplit(hand, hands.length, settings.maxSplitHands) && canAffordStake}
        />
      )}
    </div>
  );
}
