// Returns all valid blackjack totals for a hand (ace as 1 or 11)
export function getHandTotals(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "ace" || c.rank === "A") aces++;
    else if (["jack", "queen", "king", "J", "Q", "K"].includes(c.rank)) total += 10;
    else total += parseInt(c.rank, 10) || 0;
  }
  const totals = [];
  for (let i = 0; i <= aces; i++) {
    const t = total + i * 1 + (aces - i) * 11;
    totals.push(t);
  }
  const uniqueTotals = Array.from(new Set(totals)).sort((a, b) => b - a);
  const validTotals = uniqueTotals.filter(t => t <= 21);
  if (validTotals.length === 0) return [Math.min(...uniqueTotals)];
  return validTotals;
}

// Returns result message for a hand and dealer
export function getResultMessage(hand, dealer) {
  if (dealer && dealer.blackjack) {
    if (hand.status === "push") return "Dealer has blackjack! Push.";
    return "Dealer has blackjack! You lose.";
  }
  if (hand.status === "win") return "You win!";
  if (hand.status === "lose" || hand.status === "bust") return "You lose!";
  if (hand.status === "push") return "Push!";
  return "Settling bets...";
}

// Hand evaluation and dealer rules
export function handTotals(cards) {

  // returns { total, soft } where soft is true if any ace counted as 11
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += c.value;
    if (c.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  const soft = cards.some(c => c.rank === "A") && total + 10 <= 21; // informative only
  return { total, soft };
}

export function isBlackjack(cards) {
  if (!cards || cards.length !== 2) return false;
  const hasAce = cards.some(c => c.rank === "A");
  const hasTen = cards.some(c => c.value === 10 && c.rank !== "A");
  return hasAce && hasTen;
}

// Dealer stands on soft 17 or higher
export function dealerShouldHit(cards) {
  // compute best total with aces
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += c.value;
    if (c.rank === "A") aces++;
  }

  // adjust aces down while over 21
  while (total > 21 && aces > 0) { total -= 10; aces--; }

  // Check for soft totals: see if any ace counted as 11 making total >=17
  let softTotal = 0;
  let aces2 = 0;
  for (const c of cards) { softTotal += c.value; if (c.rank === "A") aces2++; }

  // convert as many aces from 11->1 as needed to not bust
  while (softTotal > 21 && aces2 > 0) { softTotal -= 10; aces2--; }

  // If there's an ace that can be 11 and softTotal (with that ace as 11) between 17-21 -> stand
  const canHaveAceAs11 = cards.some(c => c.rank === "A");
  if (canHaveAceAs11) {

    // compute highest possible soft total (count one ace as 11 if possible)
    let maxSoft = 0;
    let nonAces = cards.filter(c => c.rank !== "A").reduce((s, c) => s + c.value, 0);
    const aceCount = cards.filter(c => c.rank === "A").length;
    
    // Try to use one ace as 11, others as 1
    if (aceCount > 0) {
      maxSoft = nonAces + 11 + (aceCount - 1) * 1;
      if (maxSoft >= 17 && maxSoft <= 21) return false; // stand on soft 17+
    }
  }

  return total < 17;
}