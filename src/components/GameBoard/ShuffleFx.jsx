import { useShuffle } from "../../hooks/useShuffle";

// Plays the shuffle (hooks/useShuffle.js). A component of its own, rendered before the table: React runs layout effects in tree order, so this one reserves
// the board's time before any card that arrives in the same render (the refill mid-round) plans its flight. Draws nothing. //
export default function ShuffleFx(props) {
  useShuffle(props);
  return null;
}
