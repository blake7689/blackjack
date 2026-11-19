import { useCardWidthNow } from "../../hooks/useCardWidth";

// Draws nothing: applies the card width in the commit (hooks/useCardWidth.js). A component of its own, rendered before the seats, because layout effects run
// in tree order and the seats' (the glide's measurement, a chip's landing spot) must see the new card size. //
export default function CardWidthSync(props) {
  useCardWidthNow(props.stageRef, props.probeRef, props.seats);
  return null;
}
