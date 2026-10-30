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
