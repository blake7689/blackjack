import { HandStatus } from "./constants/handStatus";
import { HandResult } from "./constants/handResult";
import { DealerHoleOptions } from "../utils/constants/dealerHoleOptions";
import { BlackjackPayouts, DoubleOn, NoHoleCardLoss, SurrenderOptions } from "./constants/ruleOptions";

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

// Hit: any hand, except a split ace unless hitSplitAces (it may then only be split again or stood on). Whose turn it is and the
// hand's status are checked by the caller (canAct). //
export function canHit(hand, { hitSplitAces = false } = {}) {
  return hitSplitAces || !isSplitAces(hand);
}

// Double (and triple) down: two cards, never on split aces, after a split only with doubleAfterSplit, and with doubleOn
// 9-11 or 10-11 only when the best total is in that range (a two-card hand with an ace is always soft, at least 12, so only hard hands match). //
export function canDouble(hand, { doubleOn = DoubleOn.ANY, doubleAfterSplit = true } = {}) {
  if (hand.cards.length !== 2 || isSplitAces(hand) || (hand.isSplit && !doubleAfterSplit)) return false;
  if (doubleOn === DoubleOn.ANY) return true;
  const { total } = getHandTotals(hand.cards);
  return total >= (doubleOn === DoubleOn.NINE_TO_ELEVEN ? 9 : 10) && total <= 11;
}

// Surrender: the first two cards of a hand that was not split or doubled. Late and early are offered on the same hands (what differs
// is what happens next: see playerSurrender); earlyNoAce is never offered against an ace. //
// In a peek game early surrender against an ace or ten is offered before the peek (OFFERS), never again on the turn; the setting
// can also change mid-round (LOAD_SETTINGS), so the turn guard reads the settings, not what was offered.
export function canSurrender(hand, dealer, settings) {
  const { surrender } = settings;
  return surrender !== SurrenderOptions.NONE && hand.cards.length === 2 && !hand.isSplit && !hand.isDouble
    && !(surrender === SurrenderOptions.EARLY_NO_ACE && dealer.cards[0].value === 11) && !earlyOffer(dealer.cards[0], settings);
}

// ---- OFFERS (insurance, even money, early surrender) ----

// Insurance costs half the bet, to the cent. //
export const insuranceStake = (bet) => cents(bet / 2);

const isPeek = (settings) => settings.dealerHoleBehaviour === DealerHoleOptions.US_PEEK;

// A player blackjack that the settings pay in full at the deal without a peek: nothing to insure, so no even money. //
export const bjPaysWithoutPeek = (settings) => settings.blackjackPaysImmediately || (isEU(settings) && !settings.dealerDrawsOnPlayerBlackjack);

// Early surrender against an ace or ten is decided before the dealer peeks, so it exists only in a peek game; with no
// hole card (or no peek) the player acts first anyway and surrender stays a move on the turn. earlyNoAce: a ten only. //
export function earlyOffer(up, settings) {
  const { surrender } = settings;
  return (surrender === SurrenderOptions.EARLY || surrender === SurrenderOptions.EARLY_NO_ACE) && isPeek(settings)
    && (up.value === 10 || (up.value === 11 && surrender === SurrenderOptions.EARLY));
}

// What the player is offered before the first move: { insurance, evenMoney, surrender } (booleans), or null when nothing is
// offered and the round plays exactly as it always did. Insurance only on an ace, only if the stake is affordable
// (`credits` undefined = unknown = affordable, like the credit checks on double and split). A blackjack gets even money, not insurance. //
export function offersAtDeal(playerCards, up, settings, bet, credits) {
  const blackjack = getHandTotals(playerCards).total === 21;
  const ace = settings.insurance && up.value === 11;
  const offers = {
    evenMoney: ace && blackjack && (isPeek(settings) || !bjPaysWithoutPeek(settings)),
    insurance: ace && !blackjack && !(credits < insuranceStake(bet)),
    surrender: !blackjack && earlyOffer(up, settings),
  };
  return offers.evenMoney || offers.insurance || offers.surrender ? offers : null;
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
    if (hand.surrendered) {
      result = dealer.isBlackjack ? HandResult.LOSE : HandResult.SURRENDER; // a waiting surrender: only a dealer blackjack takes the half
    } else if (hand.isBusted) {
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
  if (result === HandResult.WIN && hand.isBlackjack && !hand.evenMoney) { // even money is paid 1:1 like any win
    payout = cents(hand.bet * (blackjackPayout === BlackjackPayouts.SIX_FIVE ? 2.2 : 2.5));
  } else if (result === HandResult.LOSE && dealer.isBlackjack && !hand.isBusted && noHoleCardLoss === NoHoleCardLoss.ORIGINAL) {
    // Stakes added after the first bet (double, triple, split) are given back; a hand that busted loses everything.
    payout = Math.max(0, hand.bet - (hand.baseStake ?? hand.bet));
  } else if (result === HandResult.SURRENDER) {
    payout = hand.bet / 2;
  } else if (result === HandResult.WIN) {
    payout = hand.bet * 2;
  } else if (result === HandResult.PUSH) {
    payout = hand.bet;
  }

  // Insurance pays 2:1 on a dealer blackjack (the stake comes back too) and is lost otherwise. It joins the hand's payout, so the
  // round still settles once.
  const insured = hand.insurance > 0;
  const insurancePayout = insured && dealer.isBlackjack ? hand.insurance * 3 : 0;
  return { ...hand, result, payout: payout + insurancePayout, ...(insured && { insurancePayout }) };
}

///////////////////////////////////////////////////////////////////////////////////////////////////