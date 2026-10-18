import { describe, it, expect } from "vitest";
import { RULE_PRESETS, CUSTOM, rulePresetOf } from "../rulePresets";
import { initialGameState } from "../gameReducer";
import { DealerHoleOptions } from "../constants/dealerHoleOptions";

describe("rulePresetOf", () => {
  it("names each preset, and the default settings are US", () => {
    expect(rulePresetOf({ ...initialGameState.settings, ...RULE_PRESETS.US })).toBe("US");
    expect(rulePresetOf({ ...initialGameState.settings, ...RULE_PRESETS.EU })).toBe("EU");
    expect(rulePresetOf(initialGameState.settings)).toBe("US");
  });

  it("shows Custom when any one rule differs, and the preset again once it matches", () => {
    const eu = { ...initialGameState.settings, ...RULE_PRESETS.EU };
    for (const key of Object.keys(RULE_PRESETS.EU)) {
      const changed = { ...eu, [key]: key === "dealerHoleBehaviour" ? DealerHoleOptions["Draw Early - No Check_US"] : !eu[key] };
      expect(rulePresetOf(changed)).toBe(CUSTOM);
      expect(rulePresetOf({ ...changed, [key]: eu[key] })).toBe("EU");
    }
  });

  it("ignores settings that are not rules", () => {
    expect(rulePresetOf({ ...initialGameState.settings, deckCount: 5, playTimeout: 250, resetInitialBet: true })).toBe("US");
  });

  it("US no peek has no preset", () => {
    expect(rulePresetOf({ ...RULE_PRESETS.US, dealerHoleBehaviour: DealerHoleOptions["Draw Early - No Check_US"] })).toBe(CUSTOM);
  });
});
