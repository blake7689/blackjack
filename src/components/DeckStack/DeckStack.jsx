import { useGame } from "../../hooks/useGame";
import { cardsRemaining } from "../../utils/cards";

export default function DeckStack({ shoe }) {
  const { deckCount, cutCardFound } = useGame();
  return (
    <div>
      { <div> Decks: {deckCount}</div> }
      <div>Shoe: {shoe ? cardsRemaining(shoe) : 0}</div>
      { cutCardFound && <div>Cut Card Found. Resetting Shoe After Round</div> }
    </div>
  );
}