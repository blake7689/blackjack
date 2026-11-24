import { describe, it, expect } from "vitest";
import { cardSize, MIN_CARD_WIDTH } from "../cardWidth";

describe("cardSize (#79)", () => {
  it("falls back to 70 when the width cannot be measured", () => {
    expect(cardSize(0)).toEqual({ cw: 70, ch: 102 });
    expect(cardSize(NaN)).toEqual({ cw: 70, ch: 102 });
  });

  it("never goes under the minimum width", () => {
    expect(MIN_CARD_WIDTH).toBe(40);
    expect(cardSize(39.9)).toEqual({ cw: 40, ch: 58 });
    expect(cardSize(10).cw).toBe(40);
  });

  it("floors to a whole pixel and keeps height minus width even", () => {
    expect(cardSize(89.69)).toEqual({ cw: 89, ch: 129 }); // round(129.2) = 129; 129 - 89 = 40, already even
    expect(cardSize(100)).toEqual({ cw: 100, ch: 146 }); // round(145.2) = 145; 45 is odd, so 146
  });

  it("always yields an even difference", () => {
    for (let w = 40; w < 400; w += 0.7) {
      const { cw, ch } = cardSize(w);
      expect((ch - cw) % 2).toBe(0);
    }
  });
});
