import { getHandTotals, isTotalBlackjack, getDealerHandEvaluation, getInitialPlayerHandEvaluation, 
  getInitialDealerHandEvaluation, getHandEvaluation, settleHand, isEU, offersAtDeal, bjPaysWithoutPeek } from "./blackjackLogic";
import { drawCardFromShoe } from "./cards";
import { HandResult } from "./constants/handResult";
import { HandStatus } from "./constants/handStatus";
import { DealerHoleOptions } from "../utils/constants/dealerHoleOptions"; 
import { SurrenderOptions } from "./constants/ruleOptions";

// ---- GAME ACTIONS ----

// Deal Initial Hands. credits: the balance after the bet (only insurance's affordability reads it). //
// Returns `offers` (see offersAtDeal): null when nothing is offered. In a peek game with something offered the peek waits: the dealer
// shows one card, the hole card stays in dealerHoleCards, and a player blackjack does not win yet (peekDealer finishes the deal). //
export function dealRound(shoe, bet, setCutCardFound, resetShoe, settings, credits) {
  const playerFirstCard = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const dealerUpCard = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const playerSecondCard = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const playerCards = [{ ...playerFirstCard, dealOrder: 0 }, { ...playerSecondCard, dealOrder: 2 }];
  const drawsAfter = isEU(settings);
  const dealerPeeks = settings.dealerHoleBehaviour === DealerHoleOptions.US_PEEK;
  const dealerHoleCard = drawsAfter ? [] : [drawCardFromShoe(shoe, setCutCardFound, resetShoe)];
  const dealerCardsAll = [dealerUpCard, ...dealerHoleCard];
  const playerTotals = getHandTotals(playerCards);
  const dealerTotals = getHandTotals(dealerCardsAll);
  const dealerUpCardTotals = getHandTotals([dealerUpCard]);
  const offers = offersAtDeal(playerCards, dealerUpCard, settings, bet, credits);
  const deferPeek = dealerPeeks && offers !== null;
  // Only a peek reveals a dealer blackjack now; with no peek it stays hidden until the dealer's turn.
  const dealerBlackjackRevealed = dealerPeeks && !deferPeek && dealerCardsAll.length === 2 && isTotalBlackjack(dealerTotals.total);
  // Animation hints go on copies. The hole card carries one only when the peek shows it at the deal.
  const dealerUpShown = { ...dealerUpCard, dealOrder: 1 };
  const dealerCardsShowing = dealerBlackjackRevealed ? [dealerUpShown, { ...dealerHoleCard[0], dealOrder: 3, revealed: true }] : [dealerUpShown];
  const playerHasBlackjack = isTotalBlackjack(playerTotals.total);
  // An EU dealer that won't draw on a player blackjack has nothing to compare it with, so it must pay now.
  // A deferred peek has not found out yet, so the blackjack waits for it.
  const blackjackPaysNow = !deferPeek && (dealerPeeks || bjPaysWithoutPeek(settings));
  const playerHandEvaluation = getInitialPlayerHandEvaluation(playerHasBlackjack, dealerBlackjackRevealed, blackjackPaysNow);
  const dealerHandStatus = getInitialDealerHandEvaluation(playerHasBlackjack, dealerBlackjackRevealed, settings);

  const updatedDealerHandStatus =
    dealerHandStatus === HandStatus.NONE ?
    getDealerHandEvaluation(
      dealerTotals.totals, { status: dealerHandStatus, isBusted: false }, false, dealerCardsAll.length, settings.dealerHitsSoft17
    ).handStatus :
    dealerHandStatus;
  
  return {
    hands: [{ 
      cards: playerCards, 
      hiddenCards: [], // a face-down double's card, kept out of `cards` until REVEAL_HIDDEN
      bet: bet, 
      baseStake: bet, // the first bet; a dealer blackjack found later takes only this with noHoleCardLoss "original"
      status: playerHandEvaluation.handStatus,
      isBlackjack: playerHasBlackjack, 
      isDouble: false,
      isBusted: false,
      total: playerTotals.total,
      totals: playerTotals.totals,
      result: playerHandEvaluation.handResult,
      payout: 0
    }],
    dealer: { 
      cards: dealerCardsShowing, 
      status: updatedDealerHandStatus,
      dealerDisplayTotal: dealerBlackjackRevealed ? dealerTotals.total : dealerUpCardTotals.total,
      total: dealerTotals.total,
      totals: dealerTotals.totals,
      isBlackjack: dealerBlackjackRevealed,
      isBusted: false
    },
    shoe,
    dealerHoleCards: { cards: dealerBlackjackRevealed ? [] : dealerHoleCard },
    offers: offers && { ...offers, peek: deferPeek },
  };
}

// The deferred peek (after OFFERS): what dealRound would have done at the deal. A dealer blackjack is shown and ends every hand
// except an even-money hand (already paid 1:1) and a surrendered one (early surrender keeps its half); without one, the player's
// blackjack wins at once and the hole card stays face down. //
export function peekDealer(hands, dealer, hole) {
  const full = revealDealerHole(dealer, hole);
  const peeked = hands.map((h) => {
    if (h.evenMoney || h.surrendered) return h;
    const { handStatus, handResult } = getInitialPlayerHandEvaluation(h.isBlackjack, full.isBlackjack, true);
    return { ...h, status: handStatus, result: handResult };
  });
  return full.isBlackjack ? { hands: peeked, dealer: { ...full, status: HandStatus.DONE }, hole: { cards: [] } } : { hands: peeked, dealer, hole };
}

// Dealer only plays when a hand still depends on the dealer's total //
export function dealerNeedsToPlay(hands) {
  return hands.some((h) => !h.isBusted && h.result === HandResult.NONE && !h.surrendered); // a waiting surrender needs only the blackjack check
}

// When every hand still waiting is a blackjack, only a dealer blackjack matters: two cards, no more. //
// With dealerDrawsOnceOn21 (EU), a player 21 is treated the same way. //
export function dealerOnlyChecksBlackjack(hands, settings) {
  const onceOn21 = settings.dealerDrawsOnceOn21 && isEU(settings);
  return hands.filter((h) => !h.isBusted && h.result === HandResult.NONE).every((h) => h.isBlackjack || h.surrendered || (onceOn21 && h.total === 21));
}

// Rules that show the dealer's second card although no hand depends on it (it still counts): a surrender or an insurance bet rides on it //
export function dealerShowsSecondCard(hands, settings) {
  return (settings.dealerDrawsOnPlayerBust && hands.every((h) => h.isBusted)) ||
    (settings.dealerDrawsOnPlayerBlackjack && hands.some((h) => h.isBlackjack)) || hands.some((h) => h.surrendered || h.insurance > 0);
}

// Settle Hands //
export function settleHands(hands, dealer, rules) {
  return hands.map((hand) => settleHand(hand, dealer, rules));
}

///////////////////////////////////////////////////////////////////////////////////////////////////

// ---- PLAYER ACTIONS ----

// Player Hit //
export function playerHit(hand, shoe, setCutCardFound, resetShoe) {
  const card = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const newCards = [...hand.cards, card];
  const handTotals = getHandTotals(newCards);
  const handEvaluation = getHandEvaluation(handTotals.totals, hand, newCards.length);
  const newHand = { 
    ...hand, 
    cards: newCards, 
    total: handTotals.total,
    totals: handTotals.totals,
    status: handEvaluation.handStatus, 
    result: handEvaluation.handResult,
    isBlackjack: handEvaluation.isBlackjack,
    isBusted: handEvaluation.isBusted
  };

  return { hand: newHand, shoe };
}

// Player Double. faceDown: the card waits in hiddenCards; total, bust and result stay as they were until the reveal. //
export function playerDouble(hand, shoe, setCutCardFound, resetShoe, faceDown = false) {
  const card = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  if (faceDown) {
    return { hand: { ...hand, hiddenCards: [card], status: HandStatus.DONE, isDouble: true, bet: hand.bet * 2 }, shoe };
  }
  const newCards = [...hand.cards, card];
  const handTotals = getHandTotals(newCards);
  const handEvaluation = getHandEvaluation(handTotals.totals, hand, newCards.length);
  const newHand = {
    ...hand,
    cards: newCards,
    total: handTotals.total,
    totals: handTotals.totals,
    status: HandStatus.DONE,
    result: handEvaluation.handResult,
    isDouble: true,
    isBlackjack: handEvaluation.isBlackjack,
    isBusted: handEvaluation.isBusted,
    bet: hand.bet * 2
  };
  return { hand: newHand, shoe };
}

// Turns every face-down card face up and works the hand out again (the hand stays DONE) //
export function revealHiddenCards(hand) {
  if (hand.hiddenCards.length === 0) return hand;
  const cards = [...hand.cards, ...hand.hiddenCards.map((c) => ({ ...c, revealed: true }))];
  const handTotals = getHandTotals(cards);
  const handEvaluation = getHandEvaluation(handTotals.totals, hand, cards.length);
  return {
    ...hand,
    cards,
    hiddenCards: [],
    total: handTotals.total,
    totals: handTotals.totals,
    result: handEvaluation.handResult,
    isBlackjack: handEvaluation.isBlackjack,
    isBusted: handEvaluation.isBusted
  };
}

// Player Triple Down: two cards (one if the first busts, unless drawsOnBust), triple stake, turn over //
export function playerTripleDown(hand, shoe, setCutCardFound, resetShoe, drawsOnBust) {
  let newCards = [...hand.cards, drawCardFromShoe(shoe, setCutCardFound, resetShoe)];
  if (drawsOnBust || getHandTotals(newCards).total <= 21) newCards = [...newCards, drawCardFromShoe(shoe, setCutCardFound, resetShoe)];
  const handTotals = getHandTotals(newCards);
  const handEvaluation = getHandEvaluation(handTotals.totals, hand, newCards.length);
  const newHand = {
    ...hand,
    cards: newCards,
    total: handTotals.total,
    totals: handTotals.totals,
    status: HandStatus.DONE,
    result: handEvaluation.handResult,
    isBlackjack: handEvaluation.isBlackjack,
    isBusted: handEvaluation.isBusted,
    bet: hand.bet * 3
  };
  return { hand: newHand, shoe };
}

// Player Split. rules: { blackJackOnSplit, resplitAces, hitSplitAces } //
export function playerSplit(hand, shoe, setCutCardFound, resetShoe, { blackJackOnSplit = false, resplitAces = false, hitSplitAces = false } = {}) {
  const card1 = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const card2 = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const hand1Cards = [hand.cards[0], card1];
  const hand2Cards = [{ ...hand.cards[1], moved: true }, card2]; // moved: the card that changes hands
  const hand1Totals = getHandTotals(hand1Cards);
  const hand2Totals = getHandTotals(hand2Cards);
  const hand1Evaluation = getHandEvaluation(hand1Totals.totals, hand, hand1Cards.length);
  const hand2Evaluation = getHandEvaluation(hand2Totals.totals, hand, hand2Cards.length);

  // If blackJackOnSplit is false, then a blackjack on the initial two cards after split should be treated as a regular 21, not a blackjack. //
  if (!blackJackOnSplit && hand1Evaluation.isBlackjack) { hand1Evaluation.isBlackjack = false; }
  if (!blackJackOnSplit && hand2Evaluation.isBlackjack) { hand2Evaluation.isBlackjack = false; }

  // Split aces get one card each and stand, unless they may be hit, or may be split again when the card is another ace. //
  // Not canHit (blackjackLogic.js): this decides from raw cards whether a NEW split-ace hand stands, and reads resplitAces; if the Hit rule changes, check this line too. //
  const splitAces = hand.cards[0].rank === "ace";
  const standsAfterOne = (cards) => splitAces && !hitSplitAces && !(resplitAces && cards[1].rank === "ace");

  const newHand1 = {
    ...hand,
    isSplit: true,
    cards: hand1Cards,
    total: hand1Totals.total,
    totals: hand1Totals.totals,
    status: standsAfterOne(hand1Cards) ? HandStatus.DONE : hand1Evaluation.handStatus,
    result: hand1Evaluation.handResult,
    isBlackjack: hand1Evaluation.isBlackjack,
    isBusted: hand1Evaluation.isBusted
  };

  const newHand2 = {
    ...hand,
    baseStake: 0, // the split-off hand's whole stake is an added one
    ...(hand.insurance > 0 && { insurance: 0 }), // the insurance stays on the first hand: it must not be paid twice
    isSplit: true,
    cards: hand2Cards,
    total: hand2Totals.total,
    totals: hand2Totals.totals,
    status: standsAfterOne(hand2Cards) ? HandStatus.DONE : hand2Evaluation.handStatus,
    result: hand2Evaluation.handResult,
    isBlackjack: hand2Evaluation.isBlackjack,
    isBusted: hand2Evaluation.isBusted
  };

  const newHandsArray = [newHand1, newHand2];

  return { newHandsArray, shoe };
}

// Player Surrender. Late with no hole card against an ace or ten waits: the dealer's blackjack decides at settlement.
// Every other surrender is fixed now: after a peek no dealer blackjack is possible, and early keeps the half either way. //
export function playerSurrender(hand, upCard, { surrender, dealerHoleBehaviour }) {
  const waits = surrender === SurrenderOptions.LATE && dealerHoleBehaviour !== DealerHoleOptions.US_PEEK && upCard.value >= 10;
  return { ...hand, status: HandStatus.DONE, surrendered: true, result: waits ? HandResult.NONE : HandResult.SURRENDER };
}

///////////////////////////////////////////////////////////////////////////////////////////////////

// ---- DEALER ACTIONS ----

// Turns the hole card face up at the start of the dealer's turn (no-op in EU, which has no hole card yet) //
export function revealDealerHole(dealer, hole) {
  const cards = [...dealer.cards, ...hole.cards.map((c) => ({ ...c, revealed: true }))];
  const totals = getHandTotals(cards);
  return {
    ...dealer,
    cards,
    dealerDisplayTotal: totals.total,
    total: totals.total,
    totals: totals.totals,
    isBlackjack: cards.length === 2 && totals.total === 21,
  };
}

// Dealer logic: one step (reveal any hole card, then draw at most one card) //
export function dealerPlay(dealer, hole, shoe, skipDraw = false, setCutCardFound, resetShoe, hitsSoft17 = false) {
  let dealerCards = [...dealer.cards, ...hole.cards];
  const needsCard = dealer.status === HandStatus.PLAYING || (dealer.status === HandStatus.DRAW_HOLE && dealerCards.length < 2);
  const atTwoForBlackjackCheck = () => dealer.checkBlackjackOnly && dealerCards.length >= 2;

  if (!skipDraw && needsCard && !atTwoForBlackjackCheck()) {
    dealerCards = [...dealerCards, drawCardFromShoe(shoe, setCutCardFound, resetShoe)];
  }

  const dealerTotals = getHandTotals(dealerCards);
  const stopAtTwo = atTwoForBlackjackCheck();
  const newHandEvaluation = getDealerHandEvaluation(dealerTotals.totals, dealer, skipDraw || stopAtTwo, dealerCards.length, hitsSoft17);

  const newDealer = { 
    ...dealer, 
    cards: dealerCards, 
    dealerDisplayTotal: dealerTotals.total,
    total: dealerTotals.total, 
    totals: dealerTotals.totals,
    status: newHandEvaluation.handStatus, 
    isBusted: newHandEvaluation.isBusted,
    isBlackjack: newHandEvaluation.isBlackjack
  };

  return { dealer: newDealer, shoe, hole: { cards: [] } };
}

///////////////////////////////////////////////////////////////////////////////////////////////////