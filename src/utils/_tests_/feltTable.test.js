import { describe, it, expect } from "vitest";
import { feltPrint } from "../ruleCatalog";
import { printLayout } from "../printLayout";
import { cardStep, dealerRoom } from "../cardWidth";
import { discardCount } from "../cards";
import { initialGameState } from "../gameReducer";
import { DealerHoleOptions } from "../constants/dealerHoleOptions";

const { US_PEEK, US_NO_PEEK, EU } = DealerHoleOptions;
const rules = (patch) => feltPrint({ ...initialGameState.settings, ...patch });

describe("feltPrint (#81): the words the felt prints", () => {
  it("the default table: 3 to 2, hits soft 17, peeks, insurance", () => {
    expect(rules({})).toEqual({ pay: "Blackjack Pays 3 to 2", soft: "Dealer hits soft 17", mode: "Dealer peeks", insurance: "Insurance pays 2 to 1" });
  });

  it("follows the payout, soft 17, insurance and the hole-card mode", () => {
    expect(rules({ blackjackPayout: "6:5" }).pay).toBe("Blackjack Pays 6 to 5");
    expect(rules({ dealerHitsSoft17: false }).soft).toBe("Dealer stands on all 17s");
    expect(rules({ insurance: false }).insurance).toBe("");
    expect([US_PEEK, US_NO_PEEK, EU].map((m) => rules({ dealerHoleBehaviour: m }).mode)).toEqual(["Dealer peeks", "No peek", "No second card"]);
  });
});

describe("printLayout (#81)", () => {
  it("portrait: three arcs and two bands, sizes inside the design's ranges", () => {
    const l = printLayout(400, 82, false);
    expect(l.landscape).toBe(false);
    expect([l.pay.fs, l.rules.fs, l.insurance.fs]).toEqual([24, 16, 13]);
    expect(l.pay.d).toMatch(/^M2 -?[\d.]+A580 580 0 0 0 398 /); // radius 1.45 x width, from 2 px in to 2 px in
    expect(l.insurance.bands).toHaveLength(2);
  });

  it("clamps the payout line to 16-26 px, and the others with it", () => {
    expect(printLayout(100, 82, false).pay.fs).toBe(16);
    expect(printLayout(900, 200, false).pay.fs).toBe(26);
    expect(printLayout(900, 200, false).rules.fs).toBe(17);
    expect(printLayout(900, 200, false).insurance.fs).toBe(15);
  });

  it("landscape: one line, 15 px, on one arc", () => {
    const l = printLayout(800, 44, true);
    expect(l).toMatchObject({ landscape: true, line: { fs: 15 } });
    expect(l.pay).toBeUndefined();
  });
});

describe("the card step and the dealer's room (#81)", () => {
  it("the step is 0.27 of a card, in whole pixels", () => {
    expect([40, 89, 148].map(cardStep)).toEqual([11, 24, 40]);
  });

  it("the dealer's room: clear of the shoe, never under a card and a half, unlimited without a measured shoe", () => {
    expect(dealerRoom({ stageW: 390, cw: 89, shoeLeft: 309, centre: 195 })).toBe(240); // shoe: 2 x (309 + 8 - 195) - 4
    expect(dealerRoom({ stageW: 390, cw: 89, shoeLeft: null, centre: 195 })).toBeCloseTo(390 - 2 * (89 * 0.55 + 14)); // the room for the total and a margin
    expect(dealerRoom({ stageW: 390, cw: 89, shoeLeft: 100, centre: 195 })).toBe(89 * 1.6); // a card and a half at least
  });
});

describe("discardCount (#81)", () => {
  const shoe = (n) => Array.from({ length: n }, () => ({ type: "card" })).concat({ type: "cut" });
  it("is what was dealt and is no longer on the table; the cut card is not a card", () => {
    expect(discardCount(2, shoe(104), 0)).toBe(0);
    expect(discardCount(2, shoe(90), 4)).toBe(10);
  });
  it("is never negative", () => expect(discardCount(1, shoe(52), 5)).toBe(0));
});
