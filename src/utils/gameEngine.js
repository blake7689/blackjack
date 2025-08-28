import { getHandTotals, isTotalBlackjack, getDealerHandEvaluation, getInitialPlayerHandEvaluation, getInitialDealerHandEvaluation, getHandEvaluation } from "./blackjackLogic";
import { drawCardFromShoe } from "./cards";
import { HandResult } from "./constants/handResult";
import { HandStatus } from "./constants/handStatus";

{/* GAME ACTIONS */} //////////////////////////////////////////////////////////////////////////////

// Deal Initial Hands //
export function dealRound(shoe, bet) {
  const playerFirstCard = [drawCardFromShoe(shoe)];
  const dealerUpCard = drawCardFromShoe(shoe);
  const playerSecondCard = [drawCardFromShoe(shoe)];
  const playerCards = [playerFirstCard, playerSecondCard];
  const dealerDownCard = { ...drawCardFromShoe(shoe), faceDown: true };
  const dealerCards = [dealerUpCard, dealerDownCard];
  const playerTotals = getHandTotals(playerCards);
  const dealerTotals = getHandTotals(dealerCards);
  const dealerUpCardTotals = getHandTotals([dealerUpCard]);

  // Check for player & dealer blackjack
  const dealerHasBlackjack = isTotalBlackjack(dealerTotals.total);
  const playerHasBlackjack = isTotalBlackjack(playerTotals.total);

  //get player & dealer status based on blackjacks
  const playerHandEvaluation = getInitialPlayerHandEvaluation(playerHasBlackjack, dealerHasBlackjack);
  const dealerHandEvaluation = getInitialDealerHandEvaluation(playerHasBlackjack, dealerHasBlackjack);

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
      payout: undefined
    }],
    dealer: { 
      cards: dealerCards, 
      status: dealerHandEvaluation.handStatus,
      dealerDisplayTotal: dealerUpCardTotals.total,
      total: dealerTotals.total, 
      totals: dealerTotals.totals,
      isBlackjack: dealerHasBlackjack,
      result: dealerHandEvaluation.handResult
    },
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
    if (hand.status === "blackjack") return { ...hand, result: HandResult.WIN, isBlackjack: true, payout: hand.bet * 2.5 };
    
    // Standard outcomes
    if (hand.status === "bust") return { ...hand, result: HandResult.LOSE, payout: 0 };
    if (playerTotal === dealerTotal) return { ...hand, result: HandResult.PUSH, payout: hand.bet };
    if (playerTotal > dealerTotal || dealerTotal > 21) return { ...hand, result: HandResult.WIN, payout: hand.bet * 2 };
    return { ...hand, result: HandResult.LOSE, payout: 0 };
  });
}

///////////////////////////////////////////////////////////////////////////////////////////////////

{/* PLAYER ACTIONS */} ////////////////////////////////////////////////////////////////////////////

// Player Hit //
export function playerHit(hand, shoe) {
  const card = drawCardFromShoe(shoe);
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
export function playerDouble(hand, shoe) {
  const card = drawCardFromShoe(shoe);
  const newCards = [...hand.cards, card];
  const handTotals = getHandTotals(newCards);
  const handEvaluation = getHandEvaluation(handTotals.total, hand, newCards.length);
  const newHand = {
    ...hand,
    cards: newCards,
    total: handTotals.total,
    totals: handTotals.totals,
    status: HandStatus.DONE,
    result: handEvaluation.handResult,
    isDouble: true,
    isBusted: handEvaluation.isBusted,
    bet: hand.bet * 2
  };
  return { hand: newHand, shoe };
}

// Player Split //
export function playerSplit(hand, shoe) {
  const card1 = drawCardFromShoe(shoe);
  const card2 = drawCardFromShoe(shoe);
  const hand1Cards = [hand.cards[0], card1];
  const hand2Cards = [hand.cards[1], card2];
  const hand1Totals = getHandTotals(hand1Cards);
  const hand2Totals = getHandTotals(hand2Cards);
  const hand1Evaluation = getHandEvaluation(hand1Totals.total, hand, hand1Cards.length);
  const hand2Evaluation = getHandEvaluation(hand2Totals.total, hand, hand2Cards.length);

  const newHand1 = { 
    ...hand, 
    cards: hand1Cards, 
    total: hand1Totals.total,
    totals: hand1Totals.totals,
    status: hand1Evaluation.handStatus, 
    result: hand1Evaluation.handResult,
    isBlackjack: hand1Evaluation.isBlackjack,
    isBusted: hand1Evaluation.isBusted
  };

  const newHand2 = { 
    ...hand, 
    cards: hand2Cards, 
    total: hand2Totals.total,
    totals: hand2Totals.totals,
    status: hand2Evaluation.handStatus, 
    result: hand2Evaluation.handResult,
    isBlackjack: hand2Evaluation.isBlackjack,
    isBusted: hand2Evaluation.isBusted
  };


  return [newHand1, newHand2];
}

///////////////////////////////////////////////////////////////////////////////////////////////////

{/* DEALER ACTIONS */} ////////////////////////////////////////////////////////////////////////////

// Dealer logic //
export function dealerPlay(dealer, shoe, playerAllBust = false) {

  let dealerCards = dealer.cards.map((c) => ({ ...c, faceDown: false }));

  if (!playerAllBust && dealer.status === HandStatus.PLAYING) {
    dealerCards = [...dealerCards, drawCardFromShoe(shoe)];
  }

  const dealerTotals = getHandTotals(dealerCards);
  const newHandEvaluation = getDealerHandEvaluation(dealerTotals.total, dealer, playerAllBust);

  const newDealer = { 
    ...dealer, 
    cards: dealerCards, 
    dealerDisplayTotal: dealerTotals.total,
    total: dealerTotals.total, 
    totals: dealerTotals.totals,
    status: newHandEvaluation.handStatus, 
    result: newHandEvaluation.handResult,
    isBusted: newHandEvaluation.isBusted
  };

  return { dealer: newDealer, shoe };
}

///////////////////////////////////////////////////////////////////////////////////////////////////