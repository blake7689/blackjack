import { describe, it, expect } from "vitest";
import { RULE_CATALOG, visibleIn } from "../ruleCatalog";
import { RULE_PRESETS } from "../rulePresets";
import { initialGameState, SETTING_RANGES } from "../gameReducer";
import { DealerHoleOptions } from "../constants/dealerHoleOptions";

const settings = (dealerHoleBehaviour) => ({ ...initialGameState.settings, dealerHoleBehaviour });
const byKey = (key) => RULE_CATALOG.find((r) => r.key === key);

describe("ruleCatalog (#91)", () => {
  it("lists the table rules this PR adds, plus deck count and split limit", () => {
    expect(RULE_CATALOG.map((r) => r.key)).toEqual([
      "deckCount", "maxSplitHands", "dealerHitsSoft17", "blackjackPayout", "doubleOn", "doubleAfterSplit", "resplitAces", "hitSplitAces", "noHoleCardLoss", "surrender", "insurance",
    ]);
  });

  it("every key is a real setting with a default of the kind the control stores", () => {
    for (const rule of RULE_CATALOG) {
      expect(initialGameState.settings).toHaveProperty(rule.key);
      const value = initialGameState.settings[rule.key];
      if (rule.input === "checkbox") expect(typeof value).toBe("boolean");
      if (rule.input === "range") expect(typeof value).toBe("number");
    }
  });

  it("every rule has a label function that gives plain text for its current value", () => {
    for (const rule of RULE_CATALOG) {
      expect(typeof rule.label).toBe("function");
      const text = rule.label(initialGameState.settings[rule.key]);
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("keeps the labels of the two controls that moved here, so the Settings page reads the same", () => {
    expect(byKey("deckCount").label(4)).toBe("Deck size: 4");
    expect(byKey("maxSplitHands").label(3)).toBe("Max Hands After Splits: 3");
    expect(byKey("maxSplitHands").label(0)).toBe("Max Hands After Splits: Unlimited");
  });

  it("the deck range is the one the settings validator uses (1 to 8)", () => {
    expect(byKey("deckCount").range).toEqual(SETTING_RANGES.deckCount);
    expect(byKey("deckCount").range).toEqual([1, 8]);
  });

  it("a select carries the stored values, each with a label and a one-line hint", () => {
    const stored = {
      blackjackPayout: ["3:2", "6:5"], doubleOn: ["any", "9-11", "10-11"], noHoleCardLoss: ["all", "original"], surrender: ["none", "late", "early", "earlyNoAce"], maxSplitHands: [2, 3, 4, 0],
    };
    for (const rule of RULE_CATALOG.filter((r) => r.input === "select")) {
      expect(rule.options.map((o) => o.value)).toEqual(stored[rule.key]);
      for (const o of rule.options) expect(o.label).toBeTruthy();
      if (rule.key !== "maxSplitHands") for (const o of rule.options) expect(o.hint).toBeTruthy();
    }
  });

  it("a checkbox has a hint, and the 6:5 hint says it is worse", () => {
    for (const rule of RULE_CATALOG.filter((r) => r.input === "checkbox")) expect(rule.hint).toBeTruthy();
    expect(byKey("blackjackPayout").options.find((o) => o.value === "6:5").hint).toMatch(/worse/i);
  });

  it("every preset value for a select key is one of its options, and every preset deck count is in range", () => {
    for (const [name, preset] of Object.entries(RULE_PRESETS)) {
      for (const rule of RULE_CATALOG.filter((r) => r.input === "select")) {
        expect(rule.options.map((o) => o.value), `${name} ${rule.key}`).toContain(preset[rule.key]);
      }
      const [min, max] = byKey("deckCount").range;
      expect(preset.deckCount).toBeGreaterThanOrEqual(min);
      expect(preset.deckCount).toBeLessThanOrEqual(max);
    }
  });

  it("every preset value for a checkbox key is a boolean", () => {
    for (const preset of Object.values(RULE_PRESETS)) {
      for (const rule of RULE_CATALOG.filter((r) => r.input === "checkbox")) expect(typeof preset[rule.key]).toBe("boolean");
    }
  });

  it("surrender has four options with plain names and a hint each, and is shown in every dealer mode", () => {
    const rule = byKey("surrender");
    expect(rule.input).toBe("select");
    expect(rule.label()).toBe("Surrender");
    expect(rule.options.map((o) => o.label)).toEqual(["None", "Late", "Early", "Early (not against an ace)"]);
    expect(rule.showWhen).toBeUndefined();
    for (const mode of Object.values(DealerHoleOptions)) expect(visibleIn(settings(mode)).map((r) => r.key)).toContain("surrender");
  });

  it("no surrender hint says early works like late any more: early is offered before the peek (PR 3)", () => {
    for (const o of byKey("surrender").options) expect(o.hint).not.toMatch(/peeks|like Late/);
  });

  describe("visibleIn", () => {
    it("hides 'if the dealer has blackjack, you lose' with a US peek, since the blackjack is found before any stake is added", () => {
      expect(visibleIn(settings(DealerHoleOptions.US_PEEK)).map((r) => r.key)).not.toContain("noHoleCardLoss");
    });

    it("shows it for EU and for US no peek", () => {
      for (const mode of [DealerHoleOptions.EU, DealerHoleOptions.US_NO_PEEK]) {
        expect(visibleIn(settings(mode)).map((r) => r.key)).toContain("noHoleCardLoss");
      }
    });

    it("every other rule is always shown, in catalogue order", () => {
      const others = RULE_CATALOG.map((r) => r.key).filter((k) => k !== "noHoleCardLoss");
      expect(visibleIn(settings(DealerHoleOptions.US_PEEK)).map((r) => r.key)).toEqual(others);
      expect(visibleIn(settings(DealerHoleOptions.EU)).map((r) => r.key)).toEqual(RULE_CATALOG.map((r) => r.key));
    });

    it("only noHoleCardLoss depends on the settings", () => {
      expect(RULE_CATALOG.filter((r) => r.showWhen).map((r) => r.key)).toEqual(["noHoleCardLoss"]);
    });
  });
});
