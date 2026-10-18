import { memo } from "react";
import "./Card.css";

function Card({ card, faceDown = false, small = false }) {
  if (!card && !faceDown) {
    return <div className={`card-skel ${small ? "small" : ""}`} />;
  }
  const src = faceDown ? "/cards/back.png" : `/cards/${card.rank}_of_${card.suit}.png`;
  const altText = faceDown ? "Card back" : `${card.rank} of ${card.suit}`;
  return <img className={`card-img ${small ? "small" : ""}`} src={src} alt={altText} draggable={false} />;
}

// A dealt card never changes, so it skips the board's re-renders (#5).
export default memo(Card);
