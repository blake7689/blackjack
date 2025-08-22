import { useGame } from "../../hooks/useGame";

export default function DeckStack({ shoe }) {
  const { deckCount } = useGame();
  return (
    <div>
      { <div> Decks: {deckCount}</div> }
      <div>Cards Left in Shoe: {shoe?.length ? shoe.length - 1 : 0}</div>
    </div>
  );
}