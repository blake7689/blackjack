
import { describe, it, expect } from "vitest";
import { HandStatus } from "../../utils/constants/handStatus";
import { HandResult } from "../../utils/constants/handResult";
import { DealerHoleOptions } from "../../utils/constants/dealerHoleOptions";
import {
  getInitialPlayerHandEvaluation, 
  getInitialDealerHandEvaluation, 
  getHandEvaluation, 
  getDealerHandEvaluation, 
  isTotalBlackjack, 
  getHandTotals,
  settleHand,
  canDouble,
  canSplit,
  isSplitAces,
  cents
} from "../../utils/blackjackLogic";
import { stackedShoe } from "./stackedShoe";



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

  it("returns WIN and DONE if only player has blackjack and dealer does not draw hole on 21", () => {
    const result = getInitialPlayerHandEvaluation(true, false, true);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.handResult).toBe(HandResult.WIN);
  });

  it("returns DONE and NONE if only player has blackjack and dealer draws hole on 21", () => {
    const result = getInitialPlayerHandEvaluation(true, false, false);
    expect(result.handStatus).toBe(HandStatus.DONE);
    expect(result.handResult).toBe(HandResult.NONE);
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
      const result = getInitialDealerHandEvaluation(true, true, { dealerHoleBehaviour: DealerHoleOptions.US_PEEK });
      expect(result).toBe(HandStatus.DONE);
    });

    it("returns DONE if only dealer has blackjack", () => {
      const result = getInitialDealerHandEvaluation(false, true, { dealerHoleBehaviour: DealerHoleOptions.US_NO_PEEK });
      expect(result).toBe(HandStatus.DONE);
    });

    it("returns DONE if only player has blackjack and the EU dealer does not draw on a player blackjack", () => {
      const result = getInitialDealerHandEvaluation(true, false, { dealerHoleBehaviour: DealerHoleOptions.EU, dealerDrawsOnPlayerBlackjack: false });
      expect(result).toBe(HandStatus.DONE);
    });

    it("returns DRAW_HOLE if only player has blackjack and dealer draws hole after EU", () => {
      const result = getInitialDealerHandEvaluation(true, false, { dealerHoleBehaviour: DealerHoleOptions.EU, dealerDrawsOnPlayerBlackjack: true });
      expect(result).toBe(HandStatus.DRAW_HOLE);
    });

    it("returns NONE if neither player nor dealer has blackjack", () => {
      const result = getInitialDealerHandEvaluation(false, false, { dealerHoleBehaviour: DealerHoleOptions.US_NO_PEEK });
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




// #91 table rules ////////////////////////////////////////////////////////////////////////////////

describe("getDealerHandEvaluation with hitsSoft17", () => {
  const hand = { status: HandStatus.PLAYING, isBusted: false };
  const status = (totals, hitsSoft17, cardCount = 3) => getDealerHandEvaluation(totals, hand, false, cardCount, hitsSoft17).handStatus;

  it("hits a soft 17 (an ace still counted as 11) and stands on a hard 17", () => {
    expect(status([17, 7], true)).toBe(HandStatus.PLAYING); // A-6, A-A-5, A-2-4
    expect(status([17], true)).toBe(HandStatus.DONE); // 7-10, A-6-10
    expect(status([17, 7], false)).toBe(HandStatus.DONE); // S17
    expect(status([17, 7])).toBe(HandStatus.DONE); // the default is S17
  });

  it("stands on soft 18 to 21 and busts as before", () => {
    for (const totals of [[18, 8], [19, 9], [20, 10], [21, 11]]) expect(status(totals, true)).toBe(HandStatus.DONE);
    expect(getDealerHandEvaluation([22], hand, false, 3, true)).toMatchObject({ handStatus: HandStatus.DONE, isBusted: true });
  });

  it("several soft totals: A-A-A-4 is [17, 7] and hits", () => {
    expect(status(getHandTotals([{ value: 11 }, { value: 11 }, { value: 11 }, { value: 4 }]).totals, true)).toBe(HandStatus.PLAYING);
  });

  it("a dealer told to skip the draw stops even on soft 17", () => {
    expect(getDealerHandEvaluation([17, 7], hand, true, 2, true).handStatus).toBe(HandStatus.DONE);
  });
});

describe("isSplitAces and canSplit (resplitAces)", () => {
  const aces = stackedShoe(["A", "A"]);
  const eights = stackedShoe(["8", "8"]);

  it("a split ace pair is a split-ace hand; an unsplit pair, a split eight and an ace that got a ten are not", () => {
    expect(isSplitAces({ cards: aces, isSplit: true })).toBe(true);
    expect(isSplitAces({ cards: aces, isSplit: false })).toBe(false);
    expect(isSplitAces({ cards: eights, isSplit: true })).toBe(false);
    expect(isSplitAces({ cards: stackedShoe(["K", "A"]), isSplit: true })).toBe(false); // a hand split from tens that drew an ace
  });

  it("split aces resplit only with resplitAces, up to the hand limit", () => {
    const hand = { cards: aces, isSplit: true };
    expect(canSplit(hand, 2, 4)).toBe(false);
    expect(canSplit(hand, 2, 4, false)).toBe(false);
    expect(canSplit(hand, 2, 4, true)).toBe(true);
    expect(canSplit(hand, 4, 4, true)).toBe(false); // the limit still applies
    expect(canSplit(hand, 9, 0, true)).toBe(true); // 0 = no limit
    expect(canSplit({ cards: stackedShoe(["A", "K"]), isSplit: true }, 2, 4, true)).toBe(false); // not a pair
  });
});

describe("canDouble", () => {
  const hand = (codes, isSplit = false) => ({ cards: stackedShoe(codes), isSplit });
  const rules = (doubleOn, doubleAfterSplit = true) => ({ doubleOn, doubleAfterSplit });
  // hard totals 8 to 12, then the soft hands that must not count as hard
  const table = [
    [["5", "3"], "hard 8", [true, false, false]],
    [["5", "4"], "hard 9", [true, true, false]],
    [["6", "4"], "hard 10", [true, true, true]],
    [["6", "5"], "hard 11", [true, true, true]],
    [["7", "5"], "hard 12", [true, false, false]],
    [["K", "Q"], "hard 20", [true, false, false]],
    [["A", "8"], "soft 19 (hard 9)", [true, false, false]],
    [["A", "9"], "soft 20 (hard 10)", [true, false, false]],
    [["A", "2"], "soft 13", [true, false, false]],
    [["A", "A"], "soft 12", [true, false, false]],
  ];

  it.each(table)("%j is %s: any / 9-11 / 10-11 -> %j", (codes, _name, expected) => {
    expect(["any", "9-11", "10-11"].map((doubleOn) => canDouble(hand(codes), rules(doubleOn)))).toEqual(expected);
  });

  it("is never allowed after the first two cards", () => {
    expect(canDouble(hand(["2", "3", "4"]), rules("any"))).toBe(false);
    expect(canDouble(hand(["3", "3", "4"]), rules("9-11"))).toBe(false);
    expect(canDouble(hand(["A"]), rules("any"))).toBe(false);
  });

  it("doubleAfterSplit off blocks only a split hand", () => {
    expect(canDouble(hand(["5", "6"], true), rules("any", false))).toBe(false);
    expect(canDouble(hand(["5", "6"], false), rules("any", false))).toBe(true);
    expect(canDouble(hand(["5", "6"], true), rules("any", true))).toBe(true);
    expect(canDouble(hand(["5", "6"], true), rules("9-11", true))).toBe(true);
    expect(canDouble(hand(["5", "6"], true), rules("9-11", false))).toBe(false);
  });

  it("split aces are never doubled, whatever the rules", () => {
    expect(canDouble(hand(["A", "5"], true), rules("any", true))).toBe(false);
    expect(canDouble(hand(["A", "K"], true), rules("any", true))).toBe(false);
    expect(canDouble(hand(["A", "5"], false), rules("any", true))).toBe(true); // an unsplit A-5 may be doubled
  });

  it("with no rules it is the pre-#91 behaviour: any two cards, split or not", () => {
    expect(canDouble(hand(["A", "8"]))).toBe(true);
    expect(canDouble(hand(["8", "3"], true), undefined)).toBe(true);
    expect(canDouble(hand(["8", "3"], true), {})).toBe(true);
    expect(canDouble(hand(["2", "3", "4"]))).toBe(false);
  });
});

describe("settleHand: 6:5 and original-bet-only", () => {
  const dealerBlackjack = { total: 21, isBusted: false, isBlackjack: true };
  const live = { bet: 10, baseStake: 10, result: HandResult.NONE, isBusted: false, isBlackjack: false, total: 20, payout: 0 };
  const settled = (hand, dealer, rules) => settleHand(hand, dealer, rules);

  it("a blackjack pays 6:5 to the cent: 10 -> 22, 5 -> 11, 1 -> 2.2, 3 -> 6.6, 7 -> 15.4", () => {
    const bj = { ...live, isBlackjack: true, total: 21 };
    const dealer = { total: 20, isBusted: false };
    for (const [bet, payout] of [[10, 22], [5, 11], [1, 2.2], [3, 6.6], [7, 15.4]]) {
      expect(settled({ ...bj, bet }, dealer, { blackjackPayout: "6:5" }).payout).toBe(payout);
    }
  });

  it("3:2 is the default and rounds to the cent too", () => {
    const bj = { ...live, isBlackjack: true, total: 21 };
    const dealer = { total: 20, isBusted: false };
    expect(settled(bj, dealer).payout).toBe(25);
    expect(settled({ ...bj, bet: 1 }, dealer, { blackjackPayout: "3:2" }).payout).toBe(2.5);
    expect(settled({ ...bj, bet: 5 }, dealer, {}).payout).toBe(12.5);
  });

  it("6:5 changes only a winning blackjack: a plain win pays 2x and a push 1x", () => {
    const rules = { blackjackPayout: "6:5" };
    expect(settled({ ...live, total: 20 }, { total: 18, isBusted: false }, rules).payout).toBe(20);
    expect(settled({ ...live, total: 18 }, { total: 18, isBusted: false }, rules).payout).toBe(10);
  });

  it("original: a loss to a dealer blackjack gets the added stakes back, the result stays LOSE", () => {
    const hand = { ...live, bet: 20 }; // doubled
    const r = settled(hand, dealerBlackjack, { noHoleCardLoss: "original" });
    expect([r.result, r.payout]).toEqual([HandResult.LOSE, 10]);
    expect(settled({ ...live, bet: 30 }, dealerBlackjack, { noHoleCardLoss: "original" }).payout).toBe(20); // tripled
    expect(settled({ ...live, bet: 10, baseStake: 0 }, dealerBlackjack, { noHoleCardLoss: "original" }).payout).toBe(10); // a split-off hand
  });

  it("original: nothing to refund on the first bet alone, and the refund is never negative", () => {
    expect(settled(live, dealerBlackjack, { noHoleCardLoss: "original" }).payout).toBe(0);
    expect(settled({ ...live, bet: 0, baseStake: 10 }, dealerBlackjack, { noHoleCardLoss: "original" }).payout).toBe(0);
    expect(settled({ ...live, bet: 5, baseStake: 10 }, dealerBlackjack, { noHoleCardLoss: "original" }).payout).toBe(0);
  });

  it("original: a hand without a baseStake (an older hand) has no added stake, so nothing is refunded", () => {
    const old = { ...live, bet: 20 };
    delete old.baseStake;
    expect(settled(old, dealerBlackjack, { noHoleCardLoss: "original" }).payout).toBe(0);
  });

  it("original: a bust is never refunded, and a dealer without blackjack takes everything", () => {
    const rules = { noHoleCardLoss: "original" };
    expect(settled({ ...live, bet: 20, isBusted: true, total: 22 }, dealerBlackjack, rules).payout).toBe(0);
    expect(settled({ ...live, bet: 20, total: 15 }, { total: 20, isBusted: false, isBlackjack: false }, rules).payout).toBe(0);
  });

  it("all, and no rules at all, take every stake", () => {
    const hand = { ...live, bet: 20 };
    expect(settled(hand, dealerBlackjack, { noHoleCardLoss: "all" }).payout).toBe(0);
    expect(settled(hand, dealerBlackjack).payout).toBe(0);
  });

  it("original: a push against a dealer blackjack is untouched (a player blackjack pushes)", () => {
    const hand = { ...live, isBlackjack: true, total: 21, result: HandResult.PUSH };
    expect(settled(hand, dealerBlackjack, { noHoleCardLoss: "original" }).payout).toBe(10);
  });

  it("original: a non-blackjack 21 that loses to the dealer blackjack still gets the refund", () => {
    const hand = { ...live, bet: 20, total: 21 };
    const r = settled(hand, dealerBlackjack, { noHoleCardLoss: "original" });
    expect([r.result, r.payout]).toEqual([HandResult.LOSE, 10]);
  });

  it("cents rounds to two decimals", () => {
    expect(cents(6.6000000000000005)).toBe(6.6);
    expect(cents(11.000000000000002)).toBe(11);
    expect(cents(2.5)).toBe(2.5);
  });
});
