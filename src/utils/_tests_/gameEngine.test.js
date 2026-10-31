import { describe, it, expect } from "vitest";
import { dealRound, peekDealer, revealDealerHole, revealHiddenCards, playerSplit, playerDouble, playerSurrender, dealerNeedsToPlay, dealerOnlyChecksBlackjack, dealerShowsSecondCard } from "../gameEngine";
import { HandResult } from "../constants/handResult";
import { HandStatus } from "../constants/handStatus";
import { initialGameState } from "../gameReducer";
import { stackedShoe, outOfCards, Modes } from "./stackedShoe";

// Animation hints are plain data on copies of the cards: the shoe's own cards are never touched.
// insurance off: these tests are about the cards, and an ace up would offer insurance and defer the peek
const settings = (mode) => ({ ...initialGameState.settings, dealerHoleBehaviour: mode, insurance: false });
const deal = (codes, mode = Modes.PEEK) => {
  const shoe = stackedShoe(codes);
  const originals = [...shoe];
  return { ...dealRound(shoe, 10, () => {}, outOfCards, settings(mode)), originals };
};
describe("card hints", () => {
  it("dealRound numbers the face-up opening cards in dealing order and leaves the shoe's cards alone", () => {
    const { hands, dealer, dealerHoleCards, originals } = deal(["10", "9", "8", "7"]);
    expect(hands[0].cards.map((c) => c.dealOrder)).toEqual([0, 2]);
    expect(dealer.cards.map((c) => c.dealOrder)).toEqual([1]);
    expect(dealerHoleCards.cards[0].dealOrder).toBeUndefined();
    expect(dealerHoleCards.cards[0].revealed).toBeUndefined();
    expect(originals.every((c) => c.dealOrder === undefined && c.revealed === undefined)).toBe(true);
    expect(hands[0].cards[0]).not.toBe(originals[0]);
    expect(hands[0].cards[0].id).toBe(originals[0].id);
  });

  it("a peek that finds a dealer blackjack shows the hole card at the deal: dealt 4th and revealed", () => {
    const { dealer, dealerHoleCards } = deal(["10", "A", "9", "K"]);
    expect(dealer.cards.map((c) => [c.dealOrder, c.revealed])).toEqual([[1, undefined], [3, true]]);
    expect(dealerHoleCards.cards).toEqual([]);
  });

  it("with no peek a dealer blackjack stays hidden and carries no hint", () => {
    const { dealer, dealerHoleCards } = deal(["10", "A", "9", "K"], Modes.NO_PEEK);
    expect(dealer.cards.map((c) => c.dealOrder)).toEqual([1]);
    expect(dealerHoleCards.cards[0].revealed).toBeUndefined();
    expect(dealerHoleCards.cards[0].dealOrder).toBeUndefined();
  });

  it("EU deals only three cards, numbered the same way", () => {
    const { hands, dealer, dealerHoleCards } = deal(["10", "9", "8"], Modes.EU);
    expect([hands[0].cards.map((c) => c.dealOrder), dealer.cards.map((c) => c.dealOrder), dealerHoleCards.cards]).toEqual([[0, 2], [1], []]);
  });

  it("revealDealerHole marks a copy of the hole card revealed and nothing else", () => {
    const { dealer, dealerHoleCards } = deal(["10", "9", "8", "7"]);
    const revealed = revealDealerHole(dealer, dealerHoleCards);
    expect(revealed.cards.map((c) => c.revealed)).toEqual([undefined, true]);
    expect(revealed.cards[1].id).toBe(dealerHoleCards.cards[0].id);
    expect(dealerHoleCards.cards[0].revealed).toBeUndefined();
    expect(revealDealerHole(dealer, { cards: [] }).cards).toEqual(dealer.cards); // EU: no hole card yet
  });

  it("revealHiddenCards marks the face-down double's card revealed, on a copy", () => {
    const { hands } = deal(["5", "10", "6", "7", "10"]);
    const { hand } = playerDouble(hands[0], stackedShoe(["10"]), () => {}, outOfCards, true);
    const revealed = revealHiddenCards(hand);
    expect(revealed.cards.map((c) => c.revealed)).toEqual([undefined, undefined, true]);
    expect(hand.hiddenCards[0].revealed).toBeUndefined();
  });

  it("playerSplit marks only the card that moves to the new hand", () => {
    const { hands } = deal(["8", "10", "8", "7"]);
    const { newHandsArray } = playerSplit(hands[0], stackedShoe(["3", "4"]), () => {}, outOfCards, {});
    expect(newHandsArray.map((h) => h.cards.map((c) => c.moved))).toEqual([[undefined, undefined], [true, undefined]]);
    expect(hands[0].cards[1].moved).toBeUndefined();
  });
});

describe("playerSurrender", () => {
  const hand = { tag: 1, bet: 10, baseStake: 10, status: HandStatus.PLAYING, result: HandResult.NONE, cards: [], hiddenCards: [] };
  const up = (code) => stackedShoe([code])[0];
  const surrender = (value, mode, upCode) => playerSurrender(hand, up(upCode), { surrender: value, dealerHoleBehaviour: mode });

  it("always ends the hand and flags it, on a copy that keeps everything else", () => {
    const s = surrender("late", Modes.PEEK, "6");
    expect(s).toMatchObject({ tag: 1, bet: 10, baseStake: 10, status: HandStatus.DONE, surrendered: true });
    expect(s).not.toBe(hand);
    expect(hand).not.toHaveProperty("surrendered");
  });

  it("late with no hole card against an ace or a ten waits; the dealer's blackjack decides at settlement", () => {
    for (const mode of [Modes.NO_PEEK, Modes.EU]) {
      for (const code of ["A", "10", "K"]) expect(surrender("late", mode, code).result).toBe(HandResult.NONE);
    }
  });

  it("late against 2-9 is fixed at once, in every mode (no blackjack is possible)", () => {
    for (const mode of [Modes.PEEK, Modes.NO_PEEK, Modes.EU]) {
      for (const code of ["2", "6", "9"]) expect(surrender("late", mode, code).result).toBe(HandResult.SURRENDER);
    }
  });

  it("late with a peek is fixed at once even against an ace or ten: the peek already ruled the blackjack out", () => {
    for (const code of ["A", "10"]) expect(surrender("late", Modes.PEEK, code).result).toBe(HandResult.SURRENDER);
  });

  it("early and earlyNoAce are always fixed at once, whatever the mode or up card", () => {
    for (const value of ["early", "earlyNoAce"]) {
      for (const mode of [Modes.PEEK, Modes.NO_PEEK, Modes.EU]) {
        for (const code of ["6", "10", "A"]) expect(surrender(value, mode, code).result).toBe(HandResult.SURRENDER);
      }
    }
  });
});

describe("dealer helpers with a surrendered hand", () => {
  const live = { isBusted: false, isBlackjack: false, total: 16, result: HandResult.NONE };
  const waiting = { ...live, surrendered: true, status: HandStatus.DONE };
  const atOnce = { ...waiting, result: HandResult.SURRENDER };
  const rules = (extra = {}) => ({ dealerHoleBehaviour: Modes.EU, dealerDrawsOnceOn21: false, dealerDrawsOnPlayerBust: false, dealerDrawsOnPlayerBlackjack: false, ...extra });

  it("dealerNeedsToPlay: neither a waiting nor an at-once surrender needs the dealer's total", () => {
    expect(dealerNeedsToPlay([live])).toBe(true);
    expect(dealerNeedsToPlay([waiting])).toBe(false);
    expect(dealerNeedsToPlay([atOnce])).toBe(false);
  });

  it("dealerOnlyChecksBlackjack: a waiting surrender needs only the blackjack check; an at-once one is not waiting at all", () => {
    expect(dealerOnlyChecksBlackjack([live], rules())).toBe(false);
    expect(dealerOnlyChecksBlackjack([waiting], rules())).toBe(true);
    expect(dealerOnlyChecksBlackjack([atOnce], rules())).toBe(true); // nothing waits: the empty list
  });

  it("dealerShowsSecondCard: true after a surrender, only through the surrendered clause", () => {
    expect(dealerShowsSecondCard([live], rules())).toBe(false);
    expect(dealerShowsSecondCard([waiting], rules())).toBe(true);
    expect(dealerShowsSecondCard([atOnce], rules())).toBe(true);
    // with both rules on, a live hand that is neither busted nor a blackjack still gives false
    expect(dealerShowsSecondCard([live], rules({ dealerDrawsOnPlayerBust: true, dealerDrawsOnPlayerBlackjack: true }))).toBe(false);
  });
});

describe("dealRound with offers (#91)", () => {
  const on = (mode, extra = {}) => ({ ...initialGameState.settings, dealerHoleBehaviour: mode, insurance: true, ...extra });
  const dealWith = (codes, mode = Modes.PEEK, extra = {}, credits) => {
    const shoe = stackedShoe(codes);
    return dealRound(shoe, 10, () => {}, outOfCards, on(mode, extra), credits);
  };

  it("a peek game with an ace up defers the peek: one dealer card shows, the hole card stays dealt but hidden, nothing is decided", () => {
    const r = dealWith(["10", "A", "6", "K"]);
    expect(r.offers).toEqual({ insurance: true, evenMoney: false, surrender: false, peek: true });
    expect(r.dealer.cards).toHaveLength(1);
    expect(r.dealer.cards[0].rank).toBe("ace");
    expect(r.dealer.isBlackjack).toBe(false);
    expect(r.dealerHoleCards.cards).toHaveLength(1);
    expect(r.dealerHoleCards.cards[0]).toMatchObject({ rank: "king" });
    expect(r.dealerHoleCards.cards[0].revealed).toBeUndefined();
    expect(r.hands[0]).toMatchObject({ status: HandStatus.PLAYING, result: HandResult.NONE });
  });

  it("deferred: a hidden dealer blackjack is not shown at the deal (the up card is the only dealt hint)", () => {
    const r = dealWith(["10", "A", "6", "K"]);
    expect(r.dealer.cards.map((c) => c.dealOrder)).toEqual([1]);
    expect(r.dealer.dealerDisplayTotal).toBe(11);
  });

  it("deferred: a player blackjack is DONE but unpaid (NONE) until the peek", () => {
    const r = dealWith(["A", "A", "K", "5"]);
    expect(r.offers).toMatchObject({ evenMoney: true, peek: true });
    expect(r.hands[0]).toMatchObject({ isBlackjack: true, status: HandStatus.DONE, result: HandResult.NONE });
  });

  it("no peek and EU never defer: offers.peek is false and the cards are dealt as they always were", () => {
    for (const mode of [Modes.NO_PEEK, Modes.EU]) {
      const r = dealWith(["10", "A", "6", "K"], mode);
      expect(r.offers).toEqual({ insurance: true, evenMoney: false, surrender: false, peek: false });
      expect(r.dealer.cards).toHaveLength(1);
      expect(r.hands[0].result).toBe(HandResult.NONE);
    }
  });

  it("no peek: a player blackjack with blackjackPaysImmediately on is paid at the deal and nothing is offered", () => {
    const r = dealWith(["A", "A", "K", "5"], Modes.NO_PEEK, { blackjackPaysImmediately: true });
    expect(r.offers).toBeNull();
    expect(r.hands[0].result).toBe(HandResult.WIN);
  });

  it("an affordable-balance check: credits below half the bet offer nothing, so the peek is not deferred", () => {
    const poor = dealWith(["10", "A", "6", "K"], Modes.PEEK, {}, 4);
    expect(poor.offers).toBeNull();
    expect(poor.dealer.isBlackjack).toBe(true); // found at the deal, as before
    expect(poor.dealer.cards).toHaveLength(2);
    expect(dealWith(["10", "A", "6", "K"], Modes.PEEK, {}, 5).offers).toMatchObject({ insurance: true, peek: true });
  });

  it("nothing offered: the same object as always, plus offers: null", () => {
    const offered = (codes, extra) => dealWith(codes, Modes.PEEK, { insurance: false, ...extra });
    const r = offered(["10", "A", "9", "K"]);
    expect(r.offers).toBeNull();
    expect(r.dealer).toMatchObject({ isBlackjack: true });
    expect(Object.keys(r).sort()).toEqual(["dealer", "dealerHoleCards", "hands", "offers", "shoe"]);
    expect(offered(["A", "10", "K", "5"]).hands[0].result).toBe(HandResult.WIN); // the peek pays a blackjack at the deal
  });

  it("early surrender in a peek game defers the peek against a ten, with no insurance", () => {
    const r = dealWith(["10", "K", "6", "A"], Modes.PEEK, { surrender: "early" });
    expect(r.offers).toEqual({ insurance: false, evenMoney: false, surrender: true, peek: true });
    expect(r.dealer.isBlackjack).toBe(false);
  });
});

describe("peekDealer (the second half of the deal, after the offers)", () => {
  const live = { tag: 1, bet: 10, status: HandStatus.PLAYING, result: HandResult.NONE, isBlackjack: false, isBusted: false };
  const upAndHole = (upCode, holeCode) => ({ dealer: { cards: stackedShoe([upCode]), status: HandStatus.NONE, isBlackjack: false }, hole: { cards: stackedShoe([holeCode]) } });

  it("a dealer blackjack is shown, ends the dealer's hand and loses every live hand", () => {
    const { dealer, hole } = upAndHole("A", "K");
    const r = peekDealer([live], dealer, hole);
    expect(r.dealer).toMatchObject({ isBlackjack: true, status: HandStatus.DONE, total: 21 });
    expect(r.dealer.cards.map((c) => c.revealed)).toEqual([undefined, true]);
    expect(r.hole.cards).toEqual([]);
    expect(r.hands[0]).toMatchObject({ status: HandStatus.DONE, result: HandResult.LOSE });
    expect(live).toMatchObject({ status: HandStatus.PLAYING, result: HandResult.NONE }); // the input is untouched
  });

  it("a dealer blackjack pushes a player blackjack", () => {
    const { dealer, hole } = upAndHole("K", "A");
    expect(peekDealer([{ ...live, isBlackjack: true, status: HandStatus.DONE }], dealer, hole).hands[0]).toMatchObject({ status: HandStatus.DONE, result: HandResult.PUSH });
  });

  it("no dealer blackjack: the hole card stays hidden, a live hand keeps playing, a player blackjack wins at once", () => {
    const { dealer, hole } = upAndHole("A", "6");
    const r = peekDealer([live, { ...live, isBlackjack: true, status: HandStatus.DONE }], dealer, hole);
    expect(r.dealer).toBe(dealer);
    expect(r.hole).toBe(hole);
    expect(r.hands.map((h) => [h.status, h.result])).toEqual([[HandStatus.PLAYING, HandResult.NONE], [HandStatus.DONE, HandResult.WIN]]);
  });

  it("an even-money hand is left alone: a dealer blackjack must not push the 1:1 win", () => {
    const { dealer, hole } = upAndHole("A", "K");
    const even = { ...live, isBlackjack: true, status: HandStatus.DONE, result: HandResult.WIN, evenMoney: true };
    expect(peekDealer([even], dealer, hole).hands[0]).toBe(even);
  });

  it("a surrendered hand is left alone: early surrender keeps its half even against a blackjack", () => {
    const { dealer, hole } = upAndHole("K", "A");
    const gone = { ...live, status: HandStatus.DONE, result: HandResult.SURRENDER, surrendered: true };
    expect(peekDealer([gone], dealer, hole).hands[0]).toBe(gone);
  });

  it("an insured hand is treated like any other: it loses to a dealer blackjack here and the insurance pays at settlement", () => {
    const { dealer, hole } = upAndHole("A", "K");
    expect(peekDealer([{ ...live, insurance: 5 }], dealer, hole).hands[0]).toMatchObject({ result: HandResult.LOSE, insurance: 5 });
  });

  it("an ace with a nine is not a blackjack", () => {
    const { dealer, hole } = upAndHole("A", "9");
    expect(peekDealer([live], dealer, hole).dealer.isBlackjack).toBeFalsy();
  });
});

describe("dealer helpers with an insured hand", () => {
  const live = { isBusted: false, isBlackjack: false, total: 16, result: HandResult.NONE };
  const busted = { ...live, isBusted: true, total: 26 };
  const insured = (hand) => ({ ...hand, insurance: 5 });
  const rules = (extra = {}) => ({ dealerHoleBehaviour: Modes.EU, dealerDrawsOnceOn21: false, dealerDrawsOnPlayerBust: false, dealerDrawsOnPlayerBlackjack: false, ...extra });

  it("dealerShowsSecondCard: an insured hand makes the dealer show its second card (the insurance rides on it)", () => {
    expect(dealerShowsSecondCard([live], rules())).toBe(false);
    expect(dealerShowsSecondCard([insured(live)], rules())).toBe(true);
    expect(dealerShowsSecondCard([insured(busted)], rules())).toBe(true);
    expect(dealerShowsSecondCard([{ ...live, insurance: 0 }], rules())).toBe(false); // a refused insurance does not count
  });

  it("dealerNeedsToPlay: a live insured hand still needs the dealer's total, a busted one does not", () => {
    expect(dealerNeedsToPlay([insured(live)])).toBe(true);
    expect(dealerNeedsToPlay([insured(busted)])).toBe(false);
  });

  it("dealerOnlyChecksBlackjack must not read the insurance: a live insured hand still depends on the dealer's total", () => {
    expect(dealerOnlyChecksBlackjack([insured(live)], rules())).toBe(false);
    expect(dealerOnlyChecksBlackjack([insured(busted)], rules())).toBe(true); // nothing waits
  });
});

describe("playerSplit and insurance", () => {
  const deal = (codes) => dealRound(stackedShoe(codes), 10, () => {}, outOfCards, { ...initialGameState.settings, dealerHoleBehaviour: Modes.NO_PEEK, insurance: false }).hands[0];

  it("the split-off hand carries no insurance: the first hand keeps it, so it is paid once", () => {
    const { newHandsArray } = playerSplit({ ...deal(["8", "A", "8", "K"]), insurance: 5 }, stackedShoe(["3", "4"]), () => {}, outOfCards, {});
    expect(newHandsArray.map((h) => h.insurance)).toEqual([5, 0]);
  });

  it("an uninsured split gets no insurance key at all, so existing hand shapes are unchanged", () => {
    const { newHandsArray } = playerSplit(deal(["8", "A", "8", "K"]), stackedShoe(["3", "4"]), () => {}, outOfCards, {});
    expect(newHandsArray.map((h) => "insurance" in h)).toEqual([false, false]);
    const refused = playerSplit({ ...deal(["8", "A", "8", "K"]), insurance: 0 }, stackedShoe(["3", "4"]), () => {}, outOfCards, {});
    expect(refused.newHandsArray.map((h) => h.insurance)).toEqual([0, 0]);
  });
});
