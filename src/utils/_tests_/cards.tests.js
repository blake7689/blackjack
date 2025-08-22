import { describe, it, expect } from "vitest";
import { buildShoeWithCutCard, isCutCard } from "../../utils/cards";

describe("shoe & cut card", () => {
  it("inserts a cut card and shuffles", () => {
    const shoe = buildShoeWithCutCard(2);
    expect(shoe.length).toBeGreaterThan(0);
    expect(shoe.some(isCutCard)).toBe(true);
  });
});