import { HandStatus } from "./constants/handStatus";
import { HandResult } from "./constants/handResult";

{/* EVALUATION */} ////////////////////////////////////////////////////////////////////////////////

// Sets initial player status based on blackjack conditions //
export function getInitialPlayerHandEvaluation(playerHasBlackjack, dealerHasBlackjack)
{
  let handStatus = HandStatus.PLAYING;
  let handResult = HandResult.NONE;

  if (dealerHasBlackjack && playerHasBlackjack) {
    handStatus = HandStatus.DONE;
    handResult = HandResult.PUSH;
  } else if (dealerHasBlackjack) {
    handStatus = HandStatus.DONE;
    handResult = HandResult.LOSE;
  } else if (playerHasBlackjack) {
    handStatus = HandStatus.DONE;
    handResult = HandResult.WIN;
  }

  return { handStatus, handResult };
}

// Sets initial dealer status based on blackjack conditions //
export function getInitialDealerHandEvaluation(playerHasBlackjack, dealerHasBlackjack)
{
  let handStatus = HandStatus.NONE;

  if (dealerHasBlackjack && playerHasBlackjack) {
    handStatus = HandStatus.DONE;
  } else if (dealerHasBlackjack) {
    handStatus = HandStatus.DONE;
  } else if (playerHasBlackjack) {
    handStatus = HandStatus.DONE;
  }

  return handStatus;
}

// Evaluates player hand //
export function getHandEvaluation(totals, hand, newCardsLength) {
  let handStatus = hand.status;
  let handResult = hand.result;
  let isBlackjack = hand.isBlackjack;
  let isBusted = hand.isBusted;

  if (totals.every(n => n > 21)) {
    handStatus = HandStatus.DONE;
    handResult = HandResult.LOSE;
    isBusted = true;
  } else if (totals.includes(21) && newCardsLength === 2) {
    handStatus = HandStatus.DONE;
    isBlackjack = true;
  } else if (totals.includes(21)) {
    handStatus = HandStatus.DONE;
  } else {
    handStatus = HandStatus.PLAYING;
  }

  return { handStatus, handResult, isBlackjack, isBusted };
}

// Evaluates dealer hand //
export function getDealerHandEvaluation(totals, hand, playerAllBust) {
  let handStatus = hand.status;
  let isBusted = hand.isBusted;

  if (playerAllBust) {
    handStatus = HandStatus.DONE;
    return { handStatus, isBusted };
  }

  if (totals.every(n => n > 21)) {
    handStatus = HandStatus.DONE;
    isBusted = true;
  } else if (totals.some(n => n >= 17 && n <= 21)) {
    handStatus = HandStatus.DONE;
  } else {
    handStatus = HandStatus.PLAYING;
  }

  return { handStatus, isBusted };
}

// Check total for blackjack //
export function isTotalBlackjack(total) {
  if (!total) return false;
  return (total === 21);
}

// // Check hand for blackjack //
// export function isHandBlackjack(cards) {
//   if (!cards) return false;
//   const total = getHandTotals(cards).total;
//   return (total === 21);
// }

///////////////////////////////////////////////////////////////////////////////////////////////////

{/* TOTALS CALCULATION */} ////////////////////////////////////////////////////////////////////////

// Returns all valid blackjack totals for a hand (ace as 1 or 11) //
export function getHandTotals(cards) {
  let total = 0;
  let aces = 0;

  for (const c of cards) {
    if (c.value === 11) aces++;
    else total += c.value;
  }

  // No Aces
  if (aces === 0) return { totals: [total], total: total };

  // Bust with all Aces as 1
  if (total + aces > 21) return { totals: [total + aces], total: total + aces };

  const totals = [];
  for (let a = 0; a <= aces; a++) {
    const t = total + 1 * (aces - a) + 11 * a;
    totals.push(t);
  }

  const uniqueTotals = Array.from(new Set(totals)).sort((a, b) => b - a);
  const validTotals = uniqueTotals.filter(t => t <= 21);
  if (validTotals.length === 0) return { totals: [Math.min(...uniqueTotals)], total: Math.min(...uniqueTotals) };
  return { totals: validTotals, total: Math.max(...validTotals) };
}

///////////////////////////////////////////////////////////////////////////////////////////////////

{/* SETTLEMENT */} ////////////////////////////////////////////////////////////////////////////////

export function settleHand(hand, dealer) {
  if (hand.result === HandResult.NONE) {
    if (hand.isBusted) {
      hand.result = HandResult.LOSE;
    } else if (hand.isBlackjack) {
      hand.result = HandResult.WIN;
    } else if (hand.total > dealer.total) {
      hand.result = HandResult.WIN;
    } else if (hand.total === dealer.total) {
      hand.result = HandResult.PUSH;
    } else {
      hand.result = HandResult.LOSE;
    }
  }

  if (hand.result === HandResult.WIN && hand.isBlackjack) {
    hand.payout = hand.bet * 2.5;
  } else if (hand.result === HandResult.WIN) {
    hand.payout = hand.bet * 2;
  } else if (hand.result === HandResult.PUSH) {
    hand.payout = hand.bet;
  } else {
    hand.payout = 0;
  }

  return hand;
}

///////////////////////////////////////////////////////////////////////////////////////////////////