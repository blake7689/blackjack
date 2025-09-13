
import { describe, it, expect } from "vitest";
import { HandStatus } from "../../utils/constants/handStatus";
import { HandResult } from "../../utils/constants/handResult";
import {
  getInitialPlayerHandEvaluation, 
  getInitialDealerHandEvaluation, 
  getHandEvaluation, 
  getDealerHandEvaluation, 
  isTotalBlackjack, 
  getHandTotals,
  settleHand
} from "../../utils/blackjackLogic";



// getInitialPlayerHandEvaluation tests ///////////////////////////////////////////////////////////

describe("getInitialPlayerHandEvaluation", () => {
  it("returns PUSH and DONE if both player and dealer have blackjack", () => {
    const result = getInitialPlayerHandEvaluation(true, true);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.handResult).toBe(HandResult.PUSH);
  });

  it("returns LOSE and DONE if only dealer has blackjack", () => {
    const result = getInitialPlayerHandEvaluation(false, true);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.handResult).toBe(HandResult.LOSE);
  });

  it("returns WIN and DONE if only player has blackjack", () => {
    const result = getInitialPlayerHandEvaluation(true, false);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.handResult).toBe(HandResult.WIN);
  });

  it("returns PLAYING and NONE if neither has blackjack", () => {
    const result = getInitialPlayerHandEvaluation(false, false);
    expect(result.handStatus).toBe(HandStatus.PLAYING);
    expect(result.handResult).toBe(HandResult.NONE);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// getInitialDealerHandEvaluation tests ///////////////////////////////////////////////////////////


describe("getInitialDealerHandEvaluation", () => {
    it("returns DONE if both player and dealer have blackjack", () => {
      const result = getInitialDealerHandEvaluation(true, true);
      expect(result).toBe(HandStatus.DONE);
    });

    it("returns DONE if only dealer has blackjack", () => {
      const result = getInitialDealerHandEvaluation(false, true);
      expect(result).toBe(HandStatus.DONE);
    });

    it("returns DONE if only player has blackjack", () => {
      const result = getInitialDealerHandEvaluation(true, false);
      expect(result).toBe(HandStatus.DONE);
    });

    it("returns NONE if neither player nor dealer has blackjack", () => {
      const result = getInitialDealerHandEvaluation(false, false);
      expect(result).toBe(HandStatus.NONE);
    });
  });

///////////////////////////////////////////////////////////////////////////////////////////////////

// getHandEvaluation tests ////////////////////////////////////////////////////////////////////////

describe("getHandEvaluation", () => {
  const baseHand = {
  status: HandStatus.PLAYING,
  result: HandResult.NONE,
  isBlackjack: false,
  isBusted: false,
};

  it("returns LOSE and DONE if all totals are over 21 (bust)", () => {
    const totals = [22, 25];
    const result = getHandEvaluation(totals, baseHand, 3);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.handResult).toBe(HandResult.LOSE);
    expect(result.isBusted).toBe(true);
  });

  it("returns DONE and isBlackjack true if 21 with two cards", () => {
    const totals = [21];
    const hand = { ...baseHand, isBlackjack: false };
    const result = getHandEvaluation(totals, hand, 2);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.isBlackjack).toBe(true);
    expect(result.handResult).toBe(HandResult.NONE);
    expect(result.isBusted).toBe(false);
  });

  it("returns DONE if 21 with more than two cards (not blackjack)", () => {
    const totals = [21];
    const hand = { ...baseHand, isBlackjack: false };
    const result = getHandEvaluation(totals, hand, 3);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.isBlackjack).toBe(false);
    expect(result.handResult).toBe(HandResult.NONE);
    expect(result.isBusted).toBe(false);
  });

  it("returns PLAYING if not bust and not 21", () => {
    const totals = [17, 7];
    const result = getHandEvaluation(totals, baseHand, 2);
    expect(result.handStatus).toBe(HandStatus.PLAYING);
    expect(result.handResult).toBe(HandResult.NONE);
    expect(result.isBlackjack).toBe(false);
    expect(result.isBusted).toBe(false);
  });

  it("preserves handResult and isBlackjack if not changed", () => {
    const totals = [18];
    const hand = { ...baseHand, result: HandResult.PUSH, isBlackjack: true };
    const result = getHandEvaluation(totals, hand, 2);
    expect(result.handResult).toBe(HandResult.PUSH);
    expect(result.isBlackjack).toBe(true);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// getDealerHandEvaluation tests //////////////////////////////////////////////////////////////////

describe("getDealerHandEvaluation", () => {
  const baseHand = {
    status: HandStatus.PLAYING,
    isBusted: false,
  };

  it("returns DONE if playerAllBust is true (dealer doesn't need to play)", () => {
    const totals = [10, 20];
    const result = getDealerHandEvaluation(totals, baseHand, true);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.isBusted).toBe(false);
  });

  it("returns DONE and isBusted true if all totals are over 21 (dealer busts)", () => {
    const hand = { ...baseHand, isBusted: false };
    const totals = [22, 25];
    const result = getDealerHandEvaluation(totals, hand, false);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.isBusted).toBe(true);
  });

  it("returns DONE if any total is between 17 and 21 (dealer stands)", () => {
    const hand = { ...baseHand, isBusted: false };
    const totals = [17, 7];
    const result = getDealerHandEvaluation(totals, hand, false);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.isBusted).toBe(false);
  });

  it("returns PLAYING if all totals are less than 17 (dealer must hit)", () => {
    const hand = { ...baseHand, isBusted: false };
    const totals = [12, 13];
    const result = getDealerHandEvaluation(totals, hand, false);
    expect(result.handStatus).toBe(HandStatus.PLAYING);
    expect(result.isBusted).toBe(false);
  });

  it("preserves isBusted from hand if not busting this turn", () => {
    const hand = { ...baseHand, isBusted: true };
    const totals = [18];
    const result = getDealerHandEvaluation(totals, hand, false);
    expect(result.isBusted).toBe(true);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// isTotalBlackjack tests /////////////////////////////////////////////////////////////////////////

describe("isTotalBlackjack", () => {
  it("returns true if total is exactly 21", () => {
    expect(isTotalBlackjack(21)).toBe(true);
  });

  it("returns false if total is less than 21", () => {
    expect(isTotalBlackjack(20)).toBe(false);
    expect(isTotalBlackjack(0)).toBe(false);
    expect(isTotalBlackjack(1)).toBe(false);
  });

  it("returns false if total is greater than 21", () => {
    expect(isTotalBlackjack(22)).toBe(false);
    expect(isTotalBlackjack(100)).toBe(false);
  });

  it("returns false if total is undefined", () => {
    expect(isTotalBlackjack(undefined)).toBe(false);
  });

  it("returns false if total is null", () => {
    expect(isTotalBlackjack(null)).toBe(false);
  });

  it("returns false if total is NaN", () => {
    expect(isTotalBlackjack(NaN)).toBe(false);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// getHandTotals tests ////////////////////////////////////////////////////////////////////////////

describe("getHandTotals", () => {
  it("returns correct total for hand with no aces", () => {
    const cards = [{ value: 10 }, { value: 9 }];
    const result = getHandTotals(cards);
    expect(result).toEqual({ totals: [19], total: 19 });
  });

  it("returns correct totals for hand with one ace, not busting", () => {
    const cards = [{ value: 11 }, { value: 7 }];
    const result = getHandTotals(cards);
    // Ace can be 1 or 11: totals are 8 and 18
    expect(result).toEqual({ totals: [18, 8], total: 18 });
  });

  it("returns correct totals for hand with one ace, busting if ace is 11", () => {
    const cards = [{ value: 11 }, { value: 10 }, { value: 9 }];
    const result = getHandTotals(cards);
    // Ace as 11: 30 (bust), Ace as 1: 20 (valid)
    expect(result).toEqual({ totals: [20], total: 20 });
  });

  it("returns correct totals for hand with two aces", () => {
    const cards = [{ value: 11 }, { value: 11 }, { value: 8 }];
    const result = getHandTotals(cards);
    // Aces as (11,1): 20, (1,11): 20, (1,1): 10, (11,11): 30 (bust)
    expect(result).toEqual({ totals: [20, 10], total: 20 });
  });

  it("returns correct totals for hand with three aces", () => {
    const cards = [{ value: 11 }, { value: 11 }, { value: 11 }];
    const result = getHandTotals(cards);
    // (11,11,11): 33 (bust), (11,11,1): 23 (bust), (11,1,1): 13, (1,1,1): 3
    expect(result).toEqual({ totals: [13, 3], total: 13 });
  });

  it("returns correct total when all aces must be 1 to avoid bust", () => {
    const cards = [{ value: 11 }, { value: 11 }, { value: 10 }];
    const result = getHandTotals(cards);
    // (11,11,10): 32 (bust), (11,1,10): 22 (bust), (1,1,10): 12
    expect(result).toEqual({ totals: [12], total: 12 });
  });

  it("returns correct total when busting even with all aces as 1", () => {
    const cards = [{ value: 11 }, { value: 11 }, { value: 10 }, { value: 10 }];
    const result = getHandTotals(cards);
    // (1,1,10,10): 22 (bust)
    expect(result).toEqual({ totals: [22], total: 22 });
  });

  it("returns correct total for empty hand", () => {
    const cards = [];
    const result = getHandTotals(cards);
    expect(result).toEqual({ totals: [0], total: 0 });
  });

  it("returns correct totals for hand with mixed values and aces", () => {
    const cards = [{ value: 2 }, { value: 11 }, { value: 6 }];
    const result = getHandTotals(cards);
    // (2+6+11)=19, (2+6+1)=9
    expect(result).toEqual({ totals: [19, 9], total: 19 });
  });

  it("returns correct totals for hand with four aces", () => {
    const cards = [{ value: 11 }, { value: 11 }, { value: 11 }, { value: 11 }];
    const result = getHandTotals(cards);
    // (11*4)=44 (bust), (11*3+1)=34 (bust), (11*2+1*2)=24 (bust), (11+1*3)=14, (1*4)=4
    expect(result).toEqual({ totals: [14, 4], total: 14 });
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// settleHand tests ///////////////////////////////////////////////////////////////////////////////


describe("settleHand", () => {
  const baseHand = {
    bet: 100,
    result: HandResult.NONE,
    isBusted: false,
    isBlackjack: false,
    total: 0,
    payout: 0,
  };

  const baseDealer = {
    total: 0,
    isBusted: false,
  };

  it("sets result to LOSE and payout to 0 if hand is busted", () => {
    const hand = { ...baseHand, isBusted: true, total: 10 };
    const dealer = { ...baseDealer, total: 5 };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.LOSE);
    expect(result.payout).toBe(0);
  });

  it("sets result to WIN and payout to 2.5x bet if hand is blackjack", () => {
    const hand = { ...baseHand, isBlackjack: true, total: 21 };
    const dealer = { ...baseDealer, total: 20 };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.WIN);
    expect(result.payout).toBe(250);
  });

  it("sets result to WIN and payout to 2x bet if hand beats dealer (not blackjack)", () => {
    const hand = { ...baseHand, total: 20 };
    const dealer = { ...baseDealer, total: 18 };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.WIN);
    expect(result.payout).toBe(200);
  });

  it("sets result to WIN and payout to 2x bet if dealer is busted", () => {
    const hand = { ...baseHand, total: 15 };
    const dealer = { ...baseDealer, total: 22, isBusted: true };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.WIN);
    expect(result.payout).toBe(200);
  });

  it("sets result to PUSH and payout to bet if hand ties dealer", () => {
    const hand = { ...baseHand, total: 18 };
    const dealer = { ...baseDealer, total: 18 };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.PUSH);
    expect(result.payout).toBe(100);
  });

  it("sets result to LOSE and payout to 0 if dealer beats hand", () => {
    const hand = { ...baseHand, total: 17 };
    const dealer = { ...baseDealer, total: 19 };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.LOSE);
    expect(result.payout).toBe(0);
  });

  it("does not change result if already set (e.g., PUSH), and sets correct payout", () => {
    const hand = { ...baseHand, result: HandResult.PUSH, total: 17 };
    const dealer = { ...baseDealer, total: 17 };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.PUSH);
    expect(result.payout).toBe(100);
  });

  it("does not change result if already set (e.g., WIN), and sets correct payout for blackjack", () => {
    const hand = { ...baseHand, result: HandResult.WIN, isBlackjack: true, total: 21 };
    const dealer = { ...baseDealer, total: 20 };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.WIN);
    expect(result.payout).toBe(250);
  });

  it("does not change result if already set (e.g., WIN), and sets correct payout for non-blackjack", () => {
    const hand = { ...baseHand, result: HandResult.WIN, isBlackjack: false, total: 20 };
    const dealer = { ...baseDealer, total: 18 };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.WIN);
    expect(result.payout).toBe(200);
  });

  it("does not change result if already set (e.g., LOSE), and sets payout to 0", () => {
    const hand = { ...baseHand, result: HandResult.LOSE, total: 10 };
    const dealer = { ...baseDealer, total: 20 };
    const result = settleHand(hand, dealer);
    expect(result.result).toBe(HandResult.LOSE);
    expect(result.payout).toBe(0);
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////



