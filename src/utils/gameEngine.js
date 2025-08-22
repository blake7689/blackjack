import { handTotals, isBlackjack, dealerShouldHit, getHandTotals } from "./blackjackLogic";
import { drawCardFromShoe } from "./cards";

// Deal initial hands
export function dealRound(shoe, bet) {
  const playerCards = [drawCardFromShoe(shoe), drawCardFromShoe(shoe)];
  const dealerUpCard = drawCardFromShoe(shoe);
  const dealerDownCard = { ...drawCardFromShoe(shoe), faceDown: true };
  const dealerCards = [dealerUpCard, dealerDownCard];
  const playerTotal = handTotals(playerCards).total;
  const dealerTotal = handTotals([dealerUpCard, { ...dealerDownCard, faceDown: false }]).total;

  // Check for dealer blackjack
  const dealerHasBlackjack = isBlackjack([dealerUpCard, { ...dealerDownCard, faceDown: false }]);
  let playerStatus = "playing";
  if (dealerHasBlackjack) {
    if (isBlackjack(playerCards)) playerStatus = "push";
    else playerStatus = "lose";
  }
    // Check for player natural blackjack
    else if (isBlackjack(playerCards)) {
      playerStatus = "blackjack";
    }

  return {
    hands: [{ cards: playerCards, bet, status: playerStatus, total: playerTotal }],
    dealer: { cards: dealerCards, total: dealerTotal, blackjack: dealerHasBlackjack },
    shoe,
  };
}

// Player actions
export function playerHit(hand, shoe) {
  const card = drawCardFromShoe(shoe);
  const newCards = [...hand.cards, card];
  const totals = handTotals(newCards);
  const allTotals = getHandTotals(newCards);
  const newHand = { ...hand, cards: newCards, total: totals.total };
  if (allTotals.every(t => t > 21)) {
    newHand.status = "bust";
  } else if (allTotals.includes(21) && newCards.length === 2) {
    newHand.status = "blackjack";
  } else if (allTotals.includes(21)) {
    newHand.status = "stand";
  } else {
    newHand.status = "playing";
  }
  return { hand: newHand, shoe };
}

export function playerDouble(hand, shoe) {
  const card = drawCardFromShoe(shoe);
  const totals = handTotals([...hand.cards, card]);
  const newHand = {
    ...hand,
    bet: hand.bet * 2,
    cards: [...hand.cards, card],
    status: "stand",
    total: totals.total,
  };
  return { hand: newHand, shoe };
}

export function playerSplit(hand, shoe) {
  const card1 = drawCardFromShoe(shoe);
  const card2 = drawCardFromShoe(shoe);
  const hand1Cards = [hand.cards[0], card1];
  const hand2Cards = [hand.cards[1], card2];
  return [
    { cards: hand1Cards, bet: hand.bet, status: "playing", total: handTotals(hand1Cards).total },
    { cards: hand2Cards, bet: hand.bet, status: "playing", total: handTotals(hand2Cards).total },
  ];
}

// Dealer logic
// If playerAllBust is true, only reveal dealer's face-down card, do not draw
export function dealerPlay(dealer, shoe, playerAllBust = false) {
  let dealerCards = dealer.cards.map((c) => ({ ...c, faceDown: false }));
  if (!playerAllBust) {
    while (dealerShouldHit(dealerCards)) {
      dealerCards = [...dealerCards, drawCardFromShoe(shoe)];
    }
  }
  const dealerTotal = handTotals(dealerCards).total;
  return { dealer: { cards: dealerCards, total: dealerTotal }, shoe };
}

// Settle hands
export function settleHands(hands, dealer) {
  const dealerTotal = handTotals(dealer.cards.map((c) => ({ ...c, faceDown: false }))).total;
  return hands.map((hand) => {
    const playerTotal = handTotals(hand.cards).total;
    // Double Down
    if (hand.status === "doubleBust") return { ...hand, result: "doubleLose", payout: 0 };
    if (hand.status === "doublePush") return { ...hand, result: "doublePush", payout: hand.bet };
    if (hand.status === "doubleWin") return { ...hand, result: "doubleWin", payout: hand.bet * 2 };

    // Split Blackjack (21 on first 2 cards after split)
    if (hand.status === "blackjack") return { ...hand, result: "blackjack", payout: hand.bet * 2.5 };
    
    // Standard outcomes
    if (hand.status === "bust") return { ...hand, result: "lose", payout: 0 };
    if (playerTotal === dealerTotal) return { ...hand, result: "push", payout: hand.bet };
    if (playerTotal > dealerTotal || dealerTotal > 21) return { ...hand, result: "win", payout: hand.bet * 2 };
    return { ...hand, result: "lose", payout: 0 };
  });
}