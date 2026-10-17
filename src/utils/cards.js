{/* BUILD DECK */} ////////////////////////////////////////////////////////////////////////////////

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const RANKS = [
  { code: "2", value: 2, count: 1, faceDown: false }, { code: "3", value: 3, count: 1, faceDown: false }, 
  { code: "4", value: 4, count: 1, faceDown: false }, { code: "5", value: 5, count: 1, faceDown: false }, 
  { code: "6", value: 6, count: 1, faceDown: false }, { code: "7", value: 7, count: 0, faceDown: false }, 
  { code: "8", value: 8, count: 0, faceDown: false }, { code: "9", value: 9, count: 0, faceDown: false }, 
  { code: "10", value: 10, count: -1, faceDown: false }, 
  { code: "jack", value: 10, count: -1, faceDown: false }, 
  { code: "queen", value: 10, count: -1, faceDown: false }, 
  { code: "king", value: 10, count: -1, faceDown: false }, 
  { code: "ace", value: 11, altValue: 1, count: -1, faceDown: false },
];

// Fisher-Yates shuffle //
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export { shuffle }; //for testing

// Build a single deck //
function buildDeck(deckIndex = 0) {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      let count = 0;
      deck.push({
        id: `${rank.code}-${suit}-${deckIndex}-${++count}`,
        rank: rank.code,
        suit,
        value: rank.value,
        count: rank.count,
        altValue: rank.altValue ? rank.altValue : rank.value,
        type: "card"
      });
    }
  }
  return deck;
}
export { buildDeck }; //for testing

// Build a shoe with n decks and a cut card //
export function createShoe(deckCount = 2, includeCutCard = true) {
  let shoe = [];
  for (let i = 0; i < deckCount; i++) {
    shoe.push(...buildDeck(i));
  }
  shoe = shuffle(shoe);
  shoe = shuffle(shoe); 

  if (includeCutCard)
  {
    const idx = Math.floor(shoe.length * (0.6 + Math.random() * 0.2));
    const cut = { id: `CUT-1`, type: "cut" };
    shoe.splice(idx, 0, cut);
  }
  return shoe;
}

///////////////////////////////////////////////////////////////////////////////////////////////////

{/* DRAW CARD */} /////////////////////////////////////////////////////////////////////////////////

// Draw top card from shoe, skipping cut card if encountered //
export function drawCardFromShoe(shoe, setCutCardFound, resetShoe) {
  if (!shoe) throw new Error("Shoe is undefined");
  let card;

  do {
    // Refill in place so every caller holding this shoe keeps drawing from it.
    // shortcut: a fresh shoe can repeat cards still on the table; fine for play, upgrade when discards are tracked.
    if (shoe.length === 0) shoe.push(...resetShoe(true));
    card = shoe.shift();
    if (card.type === "cut") setCutCardFound(true);
  } while (card.type === "cut");

  return card;
}

// Real cards left in the shoe (the cut card is not a card) //
export function cardsRemaining(shoe) {
  return shoe.filter((c) => c.type === "card").length;
}

// Running count per deck left in the shoe (at least one deck) //
export function trueCount(runningCount, shoe) {
  return Math.round(runningCount / Math.max(1, cardsRemaining(shoe) / 52));
}

///////////////////////////////////////////////////////////////////////////////////////////////////