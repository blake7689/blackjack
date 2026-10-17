import { useGameState } from "../../hooks/useGame";
import { cardsRemaining } from "../../utils/cards";

export default function DeckStack({ shoe }) {
  const { settings, cutCardFound } = useGameState();
  return (
    <div>
      <div> Decks: {settings.deckCount}</div>
      <div>Shoe: {cardsRemaining(shoe)}</div>
      {cutCardFound && <div>Cut Card Found. Resetting Shoe After Round</div>}
    </div>
  );
}
