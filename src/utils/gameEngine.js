import { getHandTotals, isBlackjack, dealerShouldHit, getInitialHandStatus } from "./blackjackLogic";
import { drawCardFromShoe } from "./cards";
import { HandStatus } from "./constants/handStatus";

{/* GAME ACTIONS */} //////////////////////////////////////////////////////////////////////////////

// Deal Initial Hands // DONE // 
export function dealRound(shoe, bet) {
  const playerFirstCard = [drawCardFromShoe(shoe)];
  const dealerUpCard = drawCardFromShoe(shoe);
  const playerSecondCard = [drawCardFromShoe(shoe)];
  const playerCards = [playerFirstCard, playerSecondCard];
  const dealerDownCard = { ...drawCardFromShoe(shoe), faceDown: true };
  const dealerCards = [dealerUpCard, dealerDownCard];
  const playerTotal = getHandTotals(playerCards).total;
  const dealerTotal = getHandTotals([dealerUpCard, { ...dealerDownCard, faceDown: false }]).total;

  // Check for dealer blackjack
  const dealerHasBlackjack = isBlackjack([dealerUpCard, { ...dealerDownCard, faceDown: false }]);
  const playerHasBlackjack = isBlackjack(playerCards);

  //get player status based on blackjacks
  const handStatus = getInitialHandStatus(playerHasBlackjack, dealerHasBlackjack);

  return {
    hands: [{ cards: playerCards, bet, status: handStatus, blackjack: playerHasBlackjack, total: playerTotal }],
    dealer: { cards: dealerCards, total: dealerTotal, blackjack: dealerHasBlackjack },
    shoe,
  };
}

// Settle Hands //
export function settleHands(hands, dealer) {
  const dealerTotal = getHandTotals(dealer.cards.map((c) => ({ ...c, faceDown: false }))).total;
  return hands.map((hand) => {
    const playerTotal = getHandTotals(hand.cards).total;
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

///////////////////////////////////////////////////////////////////////////////////////////////////

{/* PLAYER ACTIONS */} ////////////////////////////////////////////////////////////////////////////

// Player Hit //
export function playerHit(hand, shoe) {
  const card = drawCardFromShoe(shoe);
  const newCards = [...hand.cards, card];
  const handTotals = getHandTotals(newCards);
  const allTotals = handTotals.totals;
  const newHand = { ...hand, cards: newCards, total: handTotals.total };
  
// !! figure out status !! //

 // set status accordingly
  if (allTotals.every(t => t > 21)) {
    newHand.status = HandStatus.BUST;
  } else if (allTotals.includes(21) && newCards.length === 2) {
    newHand.status = "blackjack";
    newHand.blackjack = true;
  } else if (allTotals.includes(21)) {
    newHand.status = "stand";
  } else {
    newHand.status = "playing";
  }
  return { hand: newHand, shoe };
}

// Player Double //
export function playerDouble(hand, shoe) {
  const card = drawCardFromShoe(shoe);
  const total = getHandTotals([...hand.cards, card]).total;
  const newHand = {
    ...hand,
    bet: hand.bet * 2,
    cards: [...hand.cards, card],
    status: "stand",
    total: total,
  };
  return { hand: newHand, shoe };
}

// Player Split //
export function playerSplit(hand, shoe) {
  const card1 = drawCardFromShoe(shoe);
  const card2 = drawCardFromShoe(shoe);
  const hand1Cards = [hand.cards[0], card1];
  const hand2Cards = [hand.cards[1], card2];
  return [
    { cards: hand1Cards, bet: hand.bet, status: "playing", total: getHandTotals(hand1Cards).total },
    { cards: hand2Cards, bet: hand.bet, status: "playing", total: getHandTotals(hand2Cards).total },
  ];
}

///////////////////////////////////////////////////////////////////////////////////////////////////

{/* DEALER ACTIONS */} ////////////////////////////////////////////////////////////////////////////

// Dealer logic //
export function dealerPlay(dealer, shoe, playerAllBust = false) {
  let dealerCards = dealer.cards.map((c) => ({ ...c, faceDown: false }));
  if (!playerAllBust) {
    while (dealerShouldHit(dealerCards)) {
      dealerCards = [...dealerCards, drawCardFromShoe(shoe)];
    }
  }
  const dealerTotal = getHandTotals(dealerCards).total;
  return { dealer: { cards: dealerCards, total: dealerTotal }, shoe };
}

///////////////////////////////////////////////////////////////////////////////////////////////////