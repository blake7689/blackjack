import Card from "../Card/Card";
import PlayerOptions from "../PlayerOptions/PlayerOptions";
import { usePlayer } from "../../hooks/usePlayer";
import { getHandTotals, isBlackjack } from "../../utils/blackjackLogic";
import "./PlayerHand.css";

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
  const showDouble = active && gamePhase === "playerTurn" && hand.cards.length === 2;
  const showSplit =
    active &&
    gamePhase === "playerTurn" &&
    hand.cards.length === 2 &&
    hand.cards[0].rank === hand.cards[1].rank;
  const canAffordDouble = player && player.credits >= hand.bet;
  const canAffordSplit = player && player.credits >= hand.bet;

  return (
    <div className={`player-hand${active ? " active" : ""}`}>
      <div className="hand-total">
        Total: {(() => {
          const totals = getHandTotals(hand.cards);
          if (totals.length === 1) return totals[0];
          return totals.join(" / ");
        })()}
        {' '}| Bet: ${hand.bet}
        {gamePhase === "results" && hand.result && (
          <span className={`hand-result ${hand.result}`}> {hand.result === "win" ? "Win" : hand.result === "lose" ? "Lose" : hand.result === "push" ? "Push" : ""}</span>
        )}
      </div>
      <div className="cards">
        {hand.cards.map((card, idx) => (
          <Card key={idx} card={card} />
        ))}
      </div>
      {active && gamePhase === "playerTurn" && hand.status === "playing" && (() => {
        const totals = getHandTotals(hand.cards);
        return !totals.includes(21);
      })() && !isBlackjack(hand.cards) && (
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