import Card from "../Card/Card";
import PlayerOptions from "../PlayerOptions/PlayerOptions";
import { usePlayer } from "../../hooks/usePlayer";
import { getHandTotals, isHandBlackjack } from "../../utils/blackjackLogic";
import "./PlayerHand.css";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandResult } from "../../utils/constants/handResult";

export default function PlayerHand({
  hand,
  active,
  onHit,
  onStay,
  onDouble,
  onSplit,
  gamePhase
}) {
  const { player } = usePlayer();
  const showDouble = active && gamePhase === GamePhases.PLAYER_TURN && hand.cards.length === 2;
  const showSplit =
    active &&
    gamePhase === GamePhases.PLAYER_TURN &&
    hand.cards.length === 2 &&
    hand.cards[0].rank === hand.cards[1].rank;
  const canAffordDouble = player && player.credits >= hand.bet;
  const canAffordSplit = player && player.credits >= hand.bet;

  return (
    <div className={`player-hand${active ? " active" : ""}`}>
      <div className="hand-total">
        Total: {(() => {
          const totals = getHandTotals(hand.cards).totals;
          if (totals.length === 1) return totals[0];
          return totals.join(" / ");
        })()}
        {' '}| Bet: ${hand.bet}
        {gamePhase === GamePhases.POST_ROUND && hand.result && (
          <span className={`hand-result ${hand.result}`}> {hand.result === "Win" ? "Win" : hand.result === "Lose" ? "Lose" : hand.result === "Push" ? "Push" : ""}</span>
        )}
      </div>
      <div className="cards">
        {hand.cards.map((card, idx) => (
          <Card key={idx} card={card} />
        ))}
      </div>
      {active && gamePhase === GamePhases.PLAYER_TURN && hand.status === "playing" && (() => {
        const totals = getHandTotals(hand.cards).totals;
        return !totals.includes(21);
      })() && !isHandBlackjack(hand.cards) && (
        <PlayerOptions
          onHit={onHit}
          onStay={onStay}
          onDouble={onDouble}
          onSplit={onSplit}
          showDouble={showDouble}
          showSplit={showSplit}
          disableDouble={!canAffordDouble}
          disableSplit={!canAffordSplit}
        />
      )}
    </div>
  );
}