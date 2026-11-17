import { describe, it, expect } from "vitest";
import { MOOD, WORDS, handKind, tagOf, verdictOf } from "../verdict";
import { HandResult } from "../constants/handResult";

const hand = (result, extra = {}) => ({ result, bet: 10, payout: 0, insurance: 0, isBlackjack: false, isBusted: false, ...extra });

describe("handKind", () => {
  it.each([
    [hand(HandResult.WIN, { payout: 20 }), "win"],
    [hand(HandResult.WIN, { payout: 25, isBlackjack: true }), "bj"],
    [hand(HandResult.WIN, { payout: 20, evenMoney: true, isBlackjack: true }), "even"],
    [hand(HandResult.LOSE), "lose"],
    [hand(HandResult.LOSE, { isBusted: true }), "bust"],
    [hand(HandResult.PUSH, { payout: 10 }), "push"],
    [hand(HandResult.SURRENDER, { payout: 5 }), "surrender"],
    [hand(HandResult.NONE), null],
  ])("%j is %s", (h, kind) => expect(handKind(h)).toBe(kind));

  it("every kind has a word and a result light on the felt", () => {
    Object.keys(WORDS).forEach((kind) => expect(MOOD[kind]).toMatch(/^r-/));
    expect(WORDS.bj).toBe("BLACKJACK!"); // never "Blakejack"
  });
});

describe("tagOf", () => {
  it("is the word without its exclamation mark, and null until the hand has a result", () => {
    expect(tagOf(hand(HandResult.WIN, { payout: 25, isBlackjack: true }))).toEqual({ kind: "bj", text: "BLACKJACK" });
    expect(tagOf(hand(HandResult.SURRENDER, { payout: 5 }))).toEqual({ kind: "surrender", text: "SURRENDER" });
    expect(tagOf(hand(HandResult.NONE))).toBeNull();
  });
});

describe("verdictOf: tags only with 2+ hands, one hand names its result", () => {
  it("is null with no hands or while any hand has no result", () => {
    expect(verdictOf([])).toBeNull();
    expect(verdictOf([hand(HandResult.WIN, { payout: 20 }), hand(HandResult.NONE)])).toBeNull();
  });

  it("one hand: its own word and the signed net (a push has no amount)", () => {
    expect(verdictOf([hand(HandResult.WIN, { payout: 20 })])).toEqual({ kind: "win", word: "WIN", amt: "+$10", extra: null });
    expect(verdictOf([hand(HandResult.LOSE, { isBusted: true })])).toEqual({ kind: "bust", word: "BUST", amt: "-$10", extra: null });
    expect(verdictOf([hand(HandResult.PUSH, { payout: 10 })])).toEqual({ kind: "push", word: "PUSH", amt: null, extra: null });
    expect(verdictOf([hand(HandResult.SURRENDER, { payout: 5 })])).toMatchObject({ kind: "surrender", word: "SURRENDER", amt: "-$5" });
  });

  it("one hand with insurance says how the insurance went", () => {
    expect(verdictOf([hand(HandResult.LOSE, { insurance: 5, insurancePayout: 15 })]).extra).toBe("Insurance pays $15");
    expect(verdictOf([hand(HandResult.WIN, { payout: 20, insurance: 5, insurancePayout: 0 })]).extra).toBe("Insurance lost");
  });

  it("several hands show the net as WIN, LOSE or PUSH, never one hand's own word", () => {
    const won = hand(HandResult.WIN, { payout: 20, isBlackjack: true });
    const bust = hand(HandResult.LOSE, { isBusted: true });
    expect(verdictOf([won, hand(HandResult.PUSH, { payout: 10 })])).toEqual({ kind: "win", word: "WIN", amt: "+$10", extra: null });
    expect(verdictOf([bust, hand(HandResult.LOSE)])).toEqual({ kind: "lose", word: "LOSE", amt: "-$20", extra: null });
    expect(verdictOf([won, bust])).toEqual({ kind: "push", word: "PUSH", amt: null, extra: null });
  });
});
