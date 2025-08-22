import "./Card.css";

export default function Card({ card, faceDown = false, small = false }) {
  if (!card) {
    return <div className={`card-skel ${small ? "small" : ""}`} />;
  }
  const src = faceDown ? "/cards/back.png" : `/cards/${card.rank}_of_${card.suit}.png`;
  const altText = faceDown ? "Card back" : `${card.rank} of ${card.suit}`;
  return <img className={`card-img ${small ? "small" : ""}`} src={src} alt={altText} draggable={false} />;
}