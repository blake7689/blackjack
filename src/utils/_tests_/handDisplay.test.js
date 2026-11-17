import { describe, it, expect } from "vitest";
import { pillFace, handLabel, cardName } from "../handDisplay";
import { getHandTotals } from "../blackjackLogic";
import { stackedShoe } from "./stackedShoe";

const totalsOf = (...codes) => getHandTotals(stackedShoe(codes));

describe("pillFace (#81)", () => {
  it("is nothing until a card has landed", () => {
    expect(pillFace(null, false)).toBeNull();
  });

  it("a hard total is its number", () => {
    expect(pillFace(totalsOf("10", "6"), false)).toEqual({ low: null, text: "16", kind: "" });
  });

  it("a soft total shows both figures, 7/17, until it is 21", () => {
    expect(pillFace(totalsOf("A", "6"), false)).toEqual({ low: 7, text: "17", kind: "soft" });
    expect(pillFace(totalsOf("A", "6", "4"), false)).toEqual({ low: null, text: "21", kind: "" });
  });

  it("a bust shows its total in red", () => {
    expect(pillFace(totalsOf("10", "6", "K"), false)).toEqual({ low: null, text: "26", kind: "bust" });
  });

  it("a natural says Blackjack!, whatever the totals (even before any have landed)", () => {
    expect(pillFace(totalsOf("A", "K"), true)).toEqual({ low: null, text: "Blackjack!", kind: "bj" });
    expect(pillFace(null, true).kind).toBe("bj");
  });
});

describe("handLabel (#81)", () => {
  const cards = stackedShoe(["K", "4"]);
  const all = new Set(cards.map((c) => c.id));
  const total = totalsOf("K", "4");

  it("names the cards and the total", () => {
    expect(cardName(cards[0])).toBe("king of hearts");
    expect(handLabel("Hand 1", cards, 0, all, total, { showTotals: true, natural: false })).toBe("Hand 1: king of hearts, 4 of hearts, 14");
  });

  it("calls a card that has not landed, and a hidden one, face-down, and never names them", () => {
    const label = handLabel("Hand 2", cards, 1, new Set([cards[0].id]), getHandTotals([cards[0]]), { showTotals: true, natural: false });
    expect(label).toBe("Hand 2: king of hearts, face-down card, face-down card, 10");
    expect(label).not.toMatch(/4 of hearts/);
  });

  it("leaves the total out with Show hand totals off", () => {
    expect(handLabel("Hand 1", cards, 0, all, total, { showTotals: false, natural: false })).toBe("Hand 1: king of hearts, 4 of hearts");
  });

  it("says blackjack for a natural, with totals on or off", () => {
    for (const showTotals of [true, false]) expect(handLabel("Hand 1", cards, 0, all, total, { showTotals, natural: true })).toBe("Hand 1: king of hearts, 4 of hearts, blackjack");
  });

  it("the dealer's total reads 'showing', and there is none before a card has landed", () => {
    expect(handLabel("Dealer", cards, 0, all, total, { showTotals: true, natural: false })).toBe("Dealer: king of hearts, 4 of hearts, showing 14");
    expect(handLabel("Dealer", cards, 0, new Set(), null, { showTotals: true, natural: false })).toBe("Dealer: face-down card, face-down card");
  });

  it("an empty hand has no cards", () => {
    expect(handLabel("Hand 1", [], 0, all, null, { showTotals: true, natural: false })).toBe("Hand 1: no cards");
  });
});
