const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const RANKS = [
  { code: "2", value: 2 }, { code: "3", value: 3 }, { code: "4", value: 4 }, { code: "5", value: 5 },
  { code: "6", value: 6 }, { code: "7", value: 7 }, { code: "8", value: 8 }, { code: "9", value: 9 },
  { code: "10", value: 10 }, { code: "jack", value: 10 }, { code: "queen", value: 10 }, { code: "king", value: 10 },
  { code: "ace", value: 11 },
];

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build a single deck
function buildDeck(deckIndex = 0) {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank.code}-${suit}-${deckIndex}-${Math.random().toString(36).slice(2)}`,
        rank: rank.code,
        suit,
        value: rank.value,
        type: "card"
      });
    }
  }
  return deck;
}

// Build a shoe with n decks and a cut card
export function createShoe(deckCount = 2) {
  let shoe = [];
  for (let i = 0; i < deckCount; i++) {
    shoe.push(...buildDeck(i));
  }
  shoe = shuffle(shoe);
  shoe = shuffle(shoe); // shuffle again for better randomness

  // Insert cut card at random between 60% - 80% depth
  const idx = Math.floor(shoe.length * (0.6 + Math.random() * 0.2));
  const cut = { id: `CUT-${Math.random().toString(36).slice(2)}`, type: "cut" };
  shoe.splice(idx, 0, cut);
  return shoe;
}

// Draw top card from shoe, skipping cut card if encountered
export function drawCardFromShoe(shoe) {
  if (!shoe || shoe.length === 0) throw new Error("Shoe is empty");
  let card;
  do {
    card = shoe.shift();
  } while (card && card.type === "cut" && shoe.length > 0);
  return card;
}

// Utility: check if a card is a cut card
export function isCutCard(c) {
  return c && c.type === "cut";
}