import { pillFace } from "../../utils/handDisplay";
import "./Pill.css";

// The total pill (#81): beside the hand, or above it with several seats in portrait, never on a card. Nothing until a card has landed
// face up. Soft "7/17"; a natural "Blackjack!" (it shows even with Show hand totals off, which hides the rest: .no-totals). It is
// aria-hidden: the hand's accessible name already carries the total. `on`: the hand in play. //
export default function Pill({ totals, natural, on = false }) {
  const face = pillFace(totals, natural);
  if (!face) return null;
  return (
    <span className={`pill num ${face.kind}${on ? " on" : ""}`} aria-hidden="true">
      {face.low !== null ? <>{face.low}<small>/</small>{face.text}</> : face.text}
    </span>
  );
}
