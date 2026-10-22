import { describe, it, expect } from "vitest";
import { DEFAULT_CHIP_VALUES, parseChipValues, formatChipValues, visibleChips } from "../chips";
import { ALLOWED_CHIPS } from "../constants/chips";
import { sanitizeSettings, initialGameState } from "../gameReducer";

describe("chip values", () => {
  it("defaults to every allowed chip", () => {
    expect(parseChipValues(DEFAULT_CHIP_VALUES)).toEqual(ALLOWED_CHIPS);
    expect(initialGameState.settings.chipValues).toBe(DEFAULT_CHIP_VALUES);
  });

  it("parses to allowed chips only, without repeats, smallest first", () => {
    expect(parseChipValues("25,5,5,7,abc,100000")).toEqual([5, 25, 100000]);
    expect(parseChipValues("")).toEqual([]);
  });

  it("formats in chip order, whatever order they were picked in", () => {
    expect(formatChipValues([25, 1, 5])).toBe("1,5,25");
  });

  it("shows the selected chips the player can afford", () => {
    expect(visibleChips("1,5,25,100", 30)).toEqual([1, 5, 25]);
  });

  it("falls back to the largest affordable chip when no selected chip fits", () => {
    expect(visibleChips("100,1000", 60)).toEqual([50]);
  });

  it("treats credits equal to a chip as affordable, and 1 credit as enough for the $1 chip", () => {
    expect(visibleChips("5,25", 25)).toEqual([5, 25]);
    expect(visibleChips("5,25", 1)).toEqual([1]);
    expect(visibleChips("25", 7.5)).toEqual([5]);
  });

  it("shows no chips below 1 credit", () => {
    expect(visibleChips("1,5", 0.99)).toEqual([]);
    expect(visibleChips("1,5", 0.5)).toEqual([]);
    expect(visibleChips("1,5", 0)).toEqual([]);
  });
});

describe("saved chipValues (#36)", () => {
  it("cleans a saved value into chip order, and keeps the default when nothing valid is left", () => {
    expect(sanitizeSettings({ chipValues: "25,1,1,3" }).chipValues).toBe("1,25");
    expect(sanitizeSettings({ chipValues: "" }).chipValues).toBe(DEFAULT_CHIP_VALUES);
    expect(sanitizeSettings({ chipValues: "3,7" }).chipValues).toBe(DEFAULT_CHIP_VALUES);
    expect(sanitizeSettings({ chipValues: ["1", "5"] }).chipValues).toBe(DEFAULT_CHIP_VALUES);
    expect(sanitizeSettings({ chipValues: 5 }).chipValues).toBe(DEFAULT_CHIP_VALUES);
    expect(sanitizeSettings({}).chipValues).toBe(DEFAULT_CHIP_VALUES);
  });
});
