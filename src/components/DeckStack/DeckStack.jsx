import { useGame } from "../../hooks/useGame";

export default function DeckStack({ shoe }) {
  const { deckCount, cutCardFound } = useGame();
  return (
    <div>
      { <div> Decks: {deckCount}</div> }
      <div>Shoe: {shoe?.length ? shoe.length - 1 : 0}</div>
      { cutCardFound && <div>Cut Card Found. Resetting Shoe After Round.</div> }
    </div>
  );
}