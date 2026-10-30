import { HandStatus } from "./constants/handStatus";
import { HandResult } from "./constants/handResult";
import { DealerHoleOptions } from "../utils/constants/dealerHoleOptions";
import { BlackjackPayouts, DoubleOn, NoHoleCardLoss } from "./constants/ruleOptions";

// The dealer draws its second card after the player acts. //
export const isEU = (settings) => settings.dealerHoleBehaviour === DealerHoleOptions.EU;

// ---- EVALUATION ----

// Sets initial player status based on blackjack conditions //
// blackjackPaysNow: a player blackjack wins at the deal (US peek found no dealer blackjack, or a rule pays it at once). //
export function getInitialPlayerHandEvaluation(playerHasBlackjack, dealerHasBlackjack, blackjackPaysNow)
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
    handResult = blackjackPaysNow ? HandResult.WIN : handResult;
  }

  return { handStatus, handResult };
}

// Sets initial dealer status based on blackjack conditions //
export function getInitialDealerHandEvaluation(playerHasBlackjack, dealerHasBlackjack, settings)
{
  let handStatus = isEU(settings) ? HandStatus.DRAW_HOLE : HandStatus.NONE;

  if (dealerHasBlackjack && playerHasBlackjack) {
    handStatus = HandStatus.DONE;
  } else if (dealerHasBlackjack) {
    handStatus = HandStatus.DONE;
  } else if (playerHasBlackjack && isEU(settings) && !settings.dealerDrawsOnPlayerBlackjack) {
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

// Evaluates dealer hand: stands on every 17, or hits a soft 17 (an ace still counted as 11) when hitsSoft17 //
export function getDealerHandEvaluation(totals, hand, skipDraw, cardCount, hitsSoft17 = false) {
  let handStatus = hand.status;
  let isBusted = hand.isBusted;
  const isBlackjack = cardCount === 2 && totals.includes(21);

  if (skipDraw) {
    handStatus = HandStatus.DONE;
    return { handStatus, isBusted, isBlackjack };
  }

  if (totals.every(n => n > 21)) {
    handStatus = HandStatus.DONE;
    isBusted = true;
  } else if (totals.some(n => n >= 17 && n <= 21) && !(hitsSoft17 && Math.max(...totals) === 17 && totals.length > 1)) {
    handStatus = HandStatus.DONE;
  } else {
    handStatus = HandStatus.PLAYING;
  }

  return { handStatus, isBusted, isBlackjack };
}

// A hand made by splitting aces //
export const isSplitAces = (hand) => hand.isSplit && hand.cards[0].rank === "ace";

// Two cards of equal value (10-J-Q-K pair), while the round has fewer than maxSplitHands hands (0 = unlimited). //
// Split aces resplit only with resplitAces. //
export function canSplit(hand, handCount, maxSplitHands, resplitAces = false) {
  return hand.cards.length === 2 && hand.cards[0].value === hand.cards[1].value
    && (maxSplitHands === 0 || handCount < maxSplitHands)
    && (resplitAces || !isSplitAces(hand));
}

// Double (and triple) down: two cards, never on split aces, after a split only with doubleAfterSplit, and with doubleOn
// 9-11 or 10-11 only when the best total is in that range (a two-card hand with an ace is always soft, at least 12, so only hard hands match). //
export function canDouble(hand, { doubleOn = DoubleOn.ANY, doubleAfterSplit = true } = {}) {
  if (hand.cards.length !== 2 || isSplitAces(hand) || (hand.isSplit && !doubleAfterSplit)) return false;
  if (doubleOn === DoubleOn.ANY) return true;
  const { total } = getHandTotals(hand.cards);
  return total >= (doubleOn === DoubleOn.NINE_TO_ELEVEN ? 9 : 10) && total <= 11;
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

// ---- TOTALS CALCULATION ----

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
  // Never empty: all aces as 1 is at most 21 here (checked above).
  const validTotals = uniqueTotals.filter(t => t <= 21);
  return { totals: validTotals, total: Math.max(...validTotals) };
}

///////////////////////////////////////////////////////////////////////////////////////////////////

// ---- SETTLEMENT ----

export const cents = (amount) => Math.round(amount * 100) / 100;

// Returns a settled copy; never mutates the hand (it lives in React state) //
// rules (settings): blackjackPayout, noHoleCardLoss. Without them: 3:2, and a dealer blackjack takes every stake. //
export function settleHand(hand, dealer, { blackjackPayout = BlackjackPayouts.THREE_TWO, noHoleCardLoss = NoHoleCardLoss.ALL } = {}) {
  let result = hand.result;
  if (result === HandResult.NONE) {
    if (hand.isBusted) {
      result = HandResult.LOSE;
    } else if (hand.isBlackjack && dealer.isBlackjack) {
      result = HandResult.PUSH;
    } else if (hand.isBlackjack) {
      result = HandResult.WIN;
    } else if (dealer.isBlackjack) {
      result = HandResult.LOSE; // dealer blackjack beats any non-blackjack 21
    } else if (hand.total > dealer.total || dealer.isBusted) {
      result = HandResult.WIN;
    } else if (hand.total === dealer.total) {
      result = HandResult.PUSH;
    } else {
      result = HandResult.LOSE;
    }
  }

  let payout = 0;
  if (result === HandResult.WIN && hand.isBlackjack) {
    payout = cents(hand.bet * (blackjackPayout === BlackjackPayouts.SIX_FIVE ? 2.2 : 2.5));
  } else if (result === HandResult.LOSE && dealer.isBlackjack && !hand.isBusted && noHoleCardLoss === NoHoleCardLoss.ORIGINAL) {
    // Stakes added after the first bet (double, triple, split) are given back; a hand that busted loses everything.
    payout = Math.max(0, hand.bet - (hand.baseStake ?? hand.bet));
  } else if (result === HandResult.WIN) {
    payout = hand.bet * 2;
  } else if (result === HandResult.PUSH) {
    payout = hand.bet;
  }

  return { ...hand, result, payout };
}

///////////////////////////////////////////////////////////////////////////////////////////////////