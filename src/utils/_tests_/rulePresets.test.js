import { describe, it, expect } from "vitest";
import { RULE_PRESETS, CUSTOM, rulePresetOf } from "../rulePresets";
import { initialGameState } from "../gameReducer";
import { DealerHoleOptions } from "../constants/dealerHoleOptions";

describe("rulePresetOf", () => {
  it("names each preset, and the default settings are Vegas", () => {
    for (const name of Object.keys(RULE_PRESETS)) {
      expect(rulePresetOf({ ...initialGameState.settings, ...RULE_PRESETS[name] })).toBe(name);
    }
    expect(rulePresetOf(initialGameState.settings)).toBe("Vegas");
  });

  it("shows Custom when any one rule differs, and the preset again once it matches", () => {
    const europe = { ...initialGameState.settings, ...RULE_PRESETS.Europe };
    for (const key of Object.keys(RULE_PRESETS.Europe)) {
      const other = typeof europe[key] === "boolean" ? !europe[key] : typeof europe[key] === "number" ? europe[key] + 1 : "other";
      const changed = { ...europe, [key]: key === "dealerHoleBehaviour" ? DealerHoleOptions.US_NO_PEEK : other };
      expect(rulePresetOf(changed)).toBe(CUSTOM);
      expect(rulePresetOf({ ...changed, [key]: europe[key] })).toBe("Europe");
    }
  });

  it("ignores settings that are not rules", () => {
    expect(rulePresetOf({ ...initialGameState.settings, playTimeout: 250, resetInitialBet: true })).toBe("Vegas");
  });

  it("a table with a different deck count, or US no peek, matches no preset", () => {
    expect(rulePresetOf({ ...initialGameState.settings, deckCount: 5 })).toBe(CUSTOM);
    expect(rulePresetOf({ ...RULE_PRESETS.Vegas, dealerHoleBehaviour: DealerHoleOptions.US_NO_PEEK })).toBe(CUSTOM);
  });
});

// The spec's preset table (Specs\Regional rules.md), cell for cell. Written out here, not built from the preset code.
const PEEK = DealerHoleOptions.US_PEEK;
const AFTER = DealerHoleOptions.EU; // no hole card: the dealer's second card comes after the players act
const real = (blackjackPaysImmediately) => ({
  blackJackOnSplit: false, dealerDrawsOnPlayerBust: false, dealerDrawsOnceOn21: false, dealerDrawsOnPlayerBlackjack: true, blackjackPaysImmediately,
});
const TABLE = {
  Vegas: {
    dealerHoleBehaviour: PEEK, deckCount: 6, dealerHitsSoft17: true, blackjackPayout: "3:2", doubleOn: "any", doubleAfterSplit: true,
    maxSplitHands: 4, resplitAces: false, hitSplitAces: false, noHoleCardLoss: "original", surrender: "late", ...real(true),
  },
  "Atlantic City": {
    dealerHoleBehaviour: AFTER, deckCount: 8, dealerHitsSoft17: false, blackjackPayout: "3:2", doubleOn: "any", doubleAfterSplit: true,
    maxSplitHands: 4, resplitAces: false, hitSplitAces: false, noHoleCardLoss: "original", surrender: "late", ...real(false),
  },
  Europe: {
    dealerHoleBehaviour: AFTER, deckCount: 6, dealerHitsSoft17: false, blackjackPayout: "3:2", doubleOn: "9-11", doubleAfterSplit: true,
    maxSplitHands: 0, resplitAces: false, hitSplitAces: false, noHoleCardLoss: "all", surrender: "none", ...real(false),
  },
  Australia: {
    dealerHoleBehaviour: AFTER, deckCount: 6, dealerHitsSoft17: false, blackjackPayout: "3:2", doubleOn: "9-11", doubleAfterSplit: true,
    maxSplitHands: 3, resplitAces: false, hitSplitAces: false, noHoleCardLoss: "original", surrender: "none", ...real(false),
  },
  Singapore: {
    dealerHoleBehaviour: AFTER, deckCount: 6, dealerHitsSoft17: false, blackjackPayout: "3:2", doubleOn: "any", doubleAfterSplit: true,
    maxSplitHands: 3, resplitAces: false, hitSplitAces: false, noHoleCardLoss: "original", surrender: "earlyNoAce", ...real(false),
  },
};

describe("the five presets (#91)", () => {
  it("are Vegas, Atlantic City, Europe, Australia and Singapore, in that order", () => {
    expect(Object.keys(RULE_PRESETS)).toEqual(["Vegas", "Atlantic City", "Europe", "Australia", "Singapore"]);
  });

  it.each(Object.keys(TABLE))("%s equals the spec table cell for cell", (name) => {
    expect(RULE_PRESETS[name]).toEqual(TABLE[name]);
  });

  it("every preset sets every rule key (16), so picking one is never order-dependent", () => {
    const keys = Object.keys(TABLE.Vegas).sort();
    expect(keys).toHaveLength(16);
    for (const name of Object.keys(RULE_PRESETS)) expect(Object.keys(RULE_PRESETS[name]).sort()).toEqual(keys);
  });

  it("the default settings are Vegas for every preset key", () => {
    expect(initialGameState.settings).toMatchObject(TABLE.Vegas);
  });

  it("applying a preset over the defaults gives that preset's name and no other", () => {
    for (const name of Object.keys(TABLE)) {
      const matches = Object.keys(TABLE).filter((other) => Object.entries(TABLE[other]).every(([k, v]) => ({ ...initialGameState.settings, ...TABLE[name] })[k] === v));
      expect(matches).toEqual([name]);
    }
  });

  it.each(Object.keys(TABLE))("%s: changing any single rule key gives Custom, and changing it back gives the preset again", (name) => {
    const table = { ...initialGameState.settings, ...RULE_PRESETS[name] };
    for (const key of Object.keys(TABLE[name])) {
      const v = table[key];
      const other = typeof v === "boolean" ? !v : typeof v === "number" ? v + 1 : v === "any" || v === "9-11" ? "10-11" : v === "3:2" ? "6:5" : v === "all" ? "original" : v === "original" ? "all" : DealerHoleOptions.US_NO_PEEK;
      expect(rulePresetOf({ ...table, [key]: other })).toBe(CUSTOM);
      expect(rulePresetOf({ ...table, [key]: v })).toBe(name);
    }
  });

  it("each preset still differs from every other in at least one key", () => {
    const names = Object.keys(TABLE);
    for (const a of names) for (const b of names) if (a !== b) expect(RULE_PRESETS[a]).not.toEqual(RULE_PRESETS[b]);
  });
});
