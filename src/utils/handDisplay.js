// What a hand says about itself (#81): the total pill's face and the accessible name. Both count only cards that have landed face up. //

// The pill's face for the landed cards' totals ({ totals, total } from getHandTotals, or null before one has landed): a natural says
// "Blackjack!", a soft hand "7/17", a bust shows its total in red. null = no pill yet. `low` is the soft hand's small figure. //
export function pillFace(totals, natural) {
  if (natural) return { low: null, text: "Blackjack!", kind: "bj" };
  if (!totals) return null;
  const { total } = totals;
  if (total > 21) return { low: null, text: String(total), kind: "bust" };
  if (totals.totals.length > 1 && total < 21) return { low: total - 10, text: String(total), kind: "soft" };
  return { low: null, text: String(total), kind: "" };
}

export const cardName = (c) => `${c.rank} of ${c.suit}`;

// "Hand 1: king of diamonds, 4 of clubs, 14": a card still in flight or face down is "face-down card" and never gives its name away;
// the total is left out with Show hand totals off, and a natural says "blackjack" (the pill shows it either way). `landed` is the
// set of landed card ids; the dealer's total reads "showing 6". //
export function handLabel(who, cards, hiddenCount, landed, totals, { showTotals, natural }) {
  if (!cards.length && !hiddenCount) return `${who}: no cards`;
  const names = [...cards.map((c) => (landed.has(c.id) ? cardName(c) : "face-down card")), ...Array(hiddenCount).fill("face-down card")];
  const tail = natural ? "blackjack" : showTotals && totals ? (who === "Dealer" ? `showing ${totals.total}` : totals.total) : null;
  return `${who}: ${[...names, tail].filter((x) => x !== null).join(", ")}`;
}
