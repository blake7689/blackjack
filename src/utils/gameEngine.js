import { getHandTotals, isTotalBlackjack, getDealerHandEvaluation, getInitialPlayerHandEvaluation, 
  getInitialDealerHandEvaluation, getHandEvaluation, settleHand, isEU } from "./blackjackLogic";
import { drawCardFromShoe } from "./cards";
import { HandResult } from "./constants/handResult";
import { HandStatus } from "./constants/handStatus";
import { DealerHoleOptions } from "../utils/constants/dealerHoleOptions"; 

{/* GAME ACTIONS */} ///////////////////////////////////////////////////////////////////////////////

// Deal Initial Hands //
export function dealRound(shoe, bet, setCutCardFound, resetShoe, settings) {
  const playerFirstCard = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const dealerUpCard = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const playerSecondCard = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const playerCards = [playerFirstCard, playerSecondCard];
  const drawsAfter = isEU(settings);
  const dealerPeeks = settings.dealerHoleBehaviour === DealerHoleOptions["Draw Early - Check_US"];
  const dealerHoleCard = drawsAfter ? [] : [drawCardFromShoe(shoe, setCutCardFound, resetShoe)];
  const dealerCardsAll = [dealerUpCard, ...dealerHoleCard];
  const playerTotals = getHandTotals(playerCards);
  const dealerTotals = getHandTotals(dealerCardsAll);
  const dealerUpCardTotals = getHandTotals([dealerUpCard]);
  // Only a peek reveals a dealer blackjack now; with no peek it stays hidden until the dealer's turn.
  const dealerBlackjackRevealed = dealerPeeks && dealerCardsAll.length === 2 && isTotalBlackjack(dealerTotals.total);
  const dealerCardsShowing = dealerBlackjackRevealed ? dealerCardsAll : [dealerUpCard];
  const playerHasBlackjack = isTotalBlackjack(playerTotals.total);
  // An EU dealer that won't draw on a player blackjack has nothing to compare it with, so it must pay now.
  const blackjackPaysNow = dealerPeeks || settings.blackjackPaysImmediately || (drawsAfter && !settings.dealerDrawsOnPlayerBlackjack);
  const playerHandEvaluation = getInitialPlayerHandEvaluation(playerHasBlackjack, dealerBlackjackRevealed, blackjackPaysNow);
  const dealerHandStatus = getInitialDealerHandEvaluation(playerHasBlackjack, dealerBlackjackRevealed, settings);

  const updatedDealerHandStatus =
    dealerHandStatus === HandStatus.NONE ?
    getDealerHandEvaluation(
      dealerTotals.totals, { status: dealerHandStatus, isBusted: false }, false, dealerCardsAll.length
    ).handStatus :
    dealerHandStatus;
  
  return {
    hands: [{ 
      cards: playerCards, 
      bet: bet, 
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
  };
}

// Dealer only plays when a hand still depends on the dealer's total //
export function dealerNeedsToPlay(hands) {
  return hands.some((h) => !h.isBusted && h.result === HandResult.NONE);
}

// When every hand still waiting is a blackjack, only a dealer blackjack matters: two cards, no more. //
// With dealerDrawsOnceOn21 (EU), a player 21 is treated the same way. //
export function dealerOnlyChecksBlackjack(hands, settings) {
  const onceOn21 = settings.dealerDrawsOnceOn21 && isEU(settings);
  return hands.filter((h) => !h.isBusted && h.result === HandResult.NONE).every((h) => h.isBlackjack || (onceOn21 && h.total === 21));
}

// Rules that show the dealer's second card although no hand depends on it (it still counts) //
export function dealerShowsSecondCard(hands, settings) {
  return (settings.dealerDrawsOnPlayerBust && hands.every((h) => h.isBusted)) ||
    (settings.dealerDrawsOnPlayerBlackjack && hands.some((h) => h.isBlackjack));
}

// Settle Hands //
export function settleHands(hands, dealer) {
  return hands.map((hand) => settleHand(hand, dealer));
}

///////////////////////////////////////////////////////////////////////////////////////////////////

{/* PLAYER ACTIONS */} ////////////////////////////////////////////////////////////////////////////

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

// Player Double //
export function playerDouble(hand, shoe, setCutCardFound, resetShoe) {
  const card = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
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

// Player Split //
export function playerSplit(hand, shoe, setCutCardFound, resetShoe, blackJackOnSplit) {
  const card1 = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const card2 = drawCardFromShoe(shoe, setCutCardFound, resetShoe);
  const hand1Cards = [hand.cards[0], card1];
  const hand2Cards = [hand.cards[1], card2];
  const hand1Totals = getHandTotals(hand1Cards);
  const hand2Totals = getHandTotals(hand2Cards);
  const hand1Evaluation = getHandEvaluation(hand1Totals.totals, hand, hand1Cards.length);
  const hand2Evaluation = getHandEvaluation(hand2Totals.totals, hand, hand2Cards.length);

  // If blackJackOnSplit is false, then a blackjack on the initial two cards after split should be treated as a regular 21, not a blackjack. //
  if (!blackJackOnSplit && hand1Evaluation.isBlackjack) { hand1Evaluation.isBlackjack = false; }
  if (!blackJackOnSplit && hand2Evaluation.isBlackjack) { hand2Evaluation.isBlackjack = false; }

  // Split aces get one card each and stand. //
  const splitAces = hand.cards[0].rank === "ace";

  const newHand1 = {
    ...hand,
    isSplit: true,
    cards: hand1Cards,
    total: hand1Totals.total,
    totals: hand1Totals.totals,
    status: splitAces ? HandStatus.DONE : hand1Evaluation.handStatus,
    result: hand1Evaluation.handResult,
    isBlackjack: hand1Evaluation.isBlackjack,
    isBusted: hand1Evaluation.isBusted
  };

  const newHand2 = {
    ...hand,
    isSplit: true,
    cards: hand2Cards,
    total: hand2Totals.total,
    totals: hand2Totals.totals,
    status: splitAces ? HandStatus.DONE : hand2Evaluation.handStatus,
    result: hand2Evaluation.handResult,
    isBlackjack: hand2Evaluation.isBlackjack,
    isBusted: hand2Evaluation.isBusted
  };

  const newHandsArray = [newHand1, newHand2];

  return { newHandsArray, shoe };
}

///////////////////////////////////////////////////////////////////////////////////////////////////

{/* DEALER ACTIONS */} ////////////////////////////////////////////////////////////////////////////

// Turns the hole card face up at the start of the dealer's turn (no-op in EU, which has no hole card yet) //
export function revealDealerHole(dealer, hole) {
  const cards = [...dealer.cards, ...hole.cards];
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
export function dealerPlay(dealer, hole, shoe, skipDraw = false, setCutCardFound, resetShoe) {
  let dealerCards = [...dealer.cards, ...hole.cards];
  const needsCard = dealer.status === HandStatus.PLAYING || (dealer.status === HandStatus.DRAW_HOLE && dealerCards.length < 2);
  const atTwoForBlackjackCheck = () => dealer.checkBlackjackOnly && dealerCards.length >= 2;

  if (!skipDraw && needsCard && !atTwoForBlackjackCheck()) {
    dealerCards = [...dealerCards, drawCardFromShoe(shoe, setCutCardFound, resetShoe)];
  }

  const dealerTotals = getHandTotals(dealerCards);
  const stopAtTwo = atTwoForBlackjackCheck();
  const newHandEvaluation = getDealerHandEvaluation(dealerTotals.totals, dealer, skipDraw || stopAtTwo, dealerCards.length);

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