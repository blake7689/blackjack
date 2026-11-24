import { describe, it, expect } from "vitest";
import {
  RULE_CATALOG, APP_TOGGLES, APP_SETTINGS, GROUPS, EDGE_NOTE, RULES_TITLE, VARIATIONS_TITLE, ADVANCED_TITLE,
  visibleIn, togglesIn, hiddenKeys, choicesFor, patchFor, resetsTable, ruleSummary,
} from "../ruleCatalog";
import { RULE_PRESETS, rulePresetOf, CUSTOM } from "../rulePresets";
import { initialGameState, SETTING_RANGES, RESET_SETTINGS } from "../gameReducer";
import { DealerHoleOptions } from "../constants/dealerHoleOptions";
import { edgeDelta } from "../houseEdge";

const { US_PEEK, US_NO_PEEK, EU } = DealerHoleOptions;
const settings = (dealerHoleBehaviour) => ({ ...initialGameState.settings, dealerHoleBehaviour });
const byKey = (key) => RULE_CATALOG.find((r) => r.key === key);
const toggle = (key) => APP_TOGGLES.find((t) => t.key === key);
const VEGAS = RULE_PRESETS.Vegas;
const keysOf = (list) => list.map((r) => r.key);
// Does writing `patch` over `s` change anything? (what Settings' draft decides with its changed-keys filter)
const changes = (patch, s) => Object.entries(patch).some(([key, value]) => s[key] !== value);

describe("ruleCatalog (#91, #84)", () => {
  it("lists the table rules, grouped, in the order Settings shows them (Include cut card is in Shoe)", () => {
    expect(keysOf(RULE_CATALOG)).toEqual([
      "deckCount", "includeCutCard", "dealerHoleBehaviour", "dealerHitsSoft17", "noHoleCardLoss", "blackjackPayout", "insurance", "doubleOn", "doubleAfterSplit",
      "maxSplitHands", "splitDeal", "resplitAces", "hitSplitAces", "surrender",
    ]);
    expect(GROUPS).toEqual(["Shoe", "Dealer", "Payouts", "Doubling", "Splitting", "Surrender"]);
    for (const rule of RULE_CATALOG) expect(GROUPS, rule.key).toContain(rule.group);
    for (const group of GROUPS) expect(RULE_CATALOG.some((r) => r.group === group), group).toBe(true);
    expect(byKey("includeCutCard").group).toBe("Shoe");
  });

  it("lists the app's own toggles by section: four House variations, four Advanced, and no 'doesn't check' checkbox any more", () => {
    expect(keysOf(APP_TOGGLES.filter((t) => t.section === "variations"))).toEqual(["blackJackOnSplit", "tripleDown", "tripleDrawsOnBust", "doubleFaceDown"]);
    expect(keysOf(APP_TOGGLES.filter((t) => t.section === "advanced"))).toEqual([
      "dealerDrawsOnPlayerBlackjack", "blackjackPaysImmediately", "dealerDrawsOnceOn21", "dealerDrawsOnPlayerBust",
    ]);
    expect(APP_TOGGLES.every((t) => t.input === "checkbox")).toBe(true);
    expect(keysOf(APP_TOGGLES)).not.toContain("dealerHoleBehaviour");
  });

  it("every key is a real setting with a default of the kind the control stores", () => {
    for (const rule of [...RULE_CATALOG, ...APP_TOGGLES]) {
      expect(initialGameState.settings).toHaveProperty(rule.key);
      const value = initialGameState.settings[rule.key];
      if (rule.input === "checkbox") expect(typeof value, rule.key).toBe("boolean");
      if (rule.input === "range") expect(typeof value).toBe("number");
    }
    for (const key of Object.keys(APP_SETTINGS)) expect(initialGameState.settings, key).toHaveProperty(key);
  });

  it("every rule key a preset sets is in the catalog or the toggles, so no preset value has an unnamed control", () => {
    const named = new Set(keysOf([...RULE_CATALOG, ...APP_TOGGLES]));
    for (const [name, preset] of Object.entries(RULE_PRESETS)) {
      for (const key of Object.keys(preset)) expect(named.has(key), `${name} ${key}`).toBe(true);
    }
  });

  it("the catalog keys, toggle keys and app setting keys are unique, so two controls never share a name or hint id", () => {
    const ids = [...keysOf(RULE_CATALOG), ...keysOf(APP_TOGGLES), ...Object.keys(APP_SETTINGS)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the rules are named in sentence case, with the hand as 'blackjack' and no 'EU:' prefix", () => {
    expect(byKey("deckCount").label()).toBe("Deck size");
    expect(byKey("includeCutCard").label()).toBe("Include cut card");
    expect(byKey("dealerHoleBehaviour").label()).toBe("Dealer's second card");
    expect(byKey("dealerHitsSoft17").label()).toBe("Soft 17");
    expect(byKey("noHoleCardLoss").label()).toBe("If the dealer has blackjack, you lose");
    expect(byKey("blackjackPayout").label()).toBe("Blackjack pays");
    expect(byKey("maxSplitHands").label()).toBe("Max hands after splitting");
    expect(toggle("blackJackOnSplit").label()).toBe("Blackjack on split");
    expect(toggle("blackjackPaysImmediately").label()).toBe("Blackjack pays immediately");
    expect(toggle("tripleDrawsOnBust").label()).toBe("Always draw the second triple card, even on a bust");
    const labels = [...RULE_CATALOG, ...APP_TOGGLES].map((r) => r.label());
    for (const text of labels) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/^EU:|blakejack/i);
      expect(text, text).not.toMatch(/\b[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+/); // not Title Case
    }
    for (const { label } of Object.values(APP_SETTINGS)) expect(label).not.toMatch(/blakejack/i);
  });

  it("every setting has a short hint, a few words on one line (the 'i' shows it, the control is described by it)", () => {
    const hints = [...RULE_CATALOG, ...APP_TOGGLES].map((r) => [r.key, r.hint]).concat(Object.entries(APP_SETTINGS).map(([key, v]) => [key, v.hint]));
    expect(hints).toHaveLength(RULE_CATALOG.length + APP_TOGGLES.length + Object.keys(APP_SETTINGS).length);
    for (const [key, hint] of hints) {
      expect(typeof hint, key).toBe("string");
      expect(hint.length, key).toBeGreaterThan(3);
      expect(hint.length, key).toBeLessThanOrEqual(50);
      expect(hint, key).not.toMatch(/[.\n]$/);
    }
  });

  it("Gameplay keeps its settings: names, the Show hand totals subtitle, and the Auto deal 'Needs Rebet' subtitle", () => {
    expect(Object.keys(APP_SETTINGS)).toEqual(["playTimeout", "resetInitialBet", "showTotals", "showCardCount", "autoDeal", "autoDealDelay", "soundOn", "soundVolume", "hapticsOn", "chipValues", "feltTheme", "accent", "mode", "tableMessages", "showKeyHints", "currency"]);
    expect(APP_SETTINGS.playTimeout.label).toBe("Game speed");
    expect(APP_SETTINGS.showTotals).toMatchObject({ label: "Show hand totals", sub: "Yours and the dealer's" });
    expect(APP_SETTINGS.autoDeal).toMatchObject({ label: "Auto deal", sub: "Needs Rebet" });
    expect(initialGameState.settings.showTotals).toBe(true);
  });

  it("the deck range is the one the settings validator uses (1 to 8)", () => {
    expect(byKey("deckCount").range).toEqual(SETTING_RANGES.deckCount);
    expect(byKey("deckCount").range).toEqual([1, 8]);
  });

  it("a select carries the stored values, each with a label", () => {
    const stored = {
      dealerHoleBehaviour: [US_PEEK, US_NO_PEEK, EU], blackjackPayout: ["3:2", "6:5"], doubleOn: ["any", "9-11", "10-11"], noHoleCardLoss: ["all", "original"],
      surrender: ["none", "late", "early", "earlyNoAce"], maxSplitHands: [2, 3, 4, 0], splitDeal: ["one", "both"],
    };
    const selects = RULE_CATALOG.filter((r) => r.input === "select");
    expect(keysOf(selects).sort()).toEqual(Object.keys(stored).sort());
    for (const rule of selects) {
      expect(rule.options.map((o) => o.value)).toEqual(stored[rule.key]);
      for (const o of rule.options) expect(o.label).toBeTruthy();
    }
  });

  it("the hole-card mode is one three-way choice in the felt print's words: Peeks, No peek, No second card", () => {
    const rule = byKey("dealerHoleBehaviour");
    expect(rule.options.map((o) => [o.value, o.label])).toEqual([[US_PEEK, "Peeks"], [US_NO_PEEK, "No peek"], [EU, "No second card"]]);
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

  it("every preset value for a checkbox key is a boolean (Include cut card is not a preset key)", () => {
    for (const preset of Object.values(RULE_PRESETS)) {
      for (const rule of RULE_CATALOG.filter((r) => r.input === "checkbox" && r.key !== "includeCutCard")) expect(typeof preset[rule.key], rule.key).toBe("boolean");
      expect(preset).not.toHaveProperty("includeCutCard");
    }
  });

  it("surrender has four options with plain names and is shown in every dealer mode", () => {
    const rule = byKey("surrender");
    expect(rule.input).toBe("select");
    expect(rule.label()).toBe("Surrender");
    expect(rule.options.map((o) => o.label)).toEqual(["None", "Late", "Early", "Early, not against an ace"]);
    expect(rule.showWhen).toBeUndefined();
    for (const mode of Object.values(DealerHoleOptions)) expect(keysOf(visibleIn(settings(mode)))).toContain("surrender");
  });

  it("insurance is a plain checkbox, on by default, shown in every mode", () => {
    const rule = byKey("insurance");
    expect(rule.input).toBe("checkbox");
    expect(rule.label()).toBe("Insurance and even money");
    expect(rule.showWhen).toBeUndefined();
    expect(rule.options).toBeUndefined();
    expect(initialGameState.settings.insurance).toBe(true);
    for (const mode of Object.values(DealerHoleOptions)) expect(keysOf(visibleIn(settings(mode)))).toContain("insurance");
  });

  it("the note is Blake's wording exactly (L2-7), and the section titles", () => {
    expect(EDGE_NOTE).toBe("House edge is an estimated house edge over the player who uses basic strategy and declines insurance. Figure is approximate. A plus sign means a worse deal for you, as the house would gain advantage. Insurance, House variations and Advanced options are not counted.");
    expect(EDGE_NOTE).toMatch(/estimate/);
    expect(EDGE_NOTE).toMatch(/approximate/);
    expect(EDGE_NOTE).toMatch(/plus sign means a worse deal/);
    expect(EDGE_NOTE).toMatch(/Insurance, House variations and Advanced options are not counted/);
    expect([RULES_TITLE, VARIATIONS_TITLE, ADVANCED_TITLE]).toEqual(["Table rules", "House variations", "Advanced"]);
  });

  describe("showWhen: what each mode hides (the one list Settings, rulePresetOf and the rules sheet read)", () => {
    const hiddenIn = (s) => [...hiddenKeys(s)].sort();

    it("US peek hides the dealer-blackjack loss, Blackjack pays immediately and the three EU-only toggles", () => {
      expect(hiddenIn(settings(US_PEEK))).toEqual(["blackjackPaysImmediately", "dealerDrawsOnPlayerBlackjack", "dealerDrawsOnPlayerBust", "dealerDrawsOnceOn21", "noHoleCardLoss"]);
      expect(keysOf(visibleIn(settings(US_PEEK)))).not.toContain("noHoleCardLoss");
      expect(keysOf(togglesIn("advanced", settings(US_PEEK)))).toEqual([]);
    });

    it("US no peek shows the dealer-blackjack loss and Blackjack pays immediately, and hides only the three EU-only toggles", () => {
      expect(hiddenIn(settings(US_NO_PEEK))).toEqual(["dealerDrawsOnPlayerBlackjack", "dealerDrawsOnPlayerBust", "dealerDrawsOnceOn21"]);
      expect(keysOf(visibleIn(settings(US_NO_PEEK)))).toContain("noHoleCardLoss");
      expect(keysOf(togglesIn("advanced", settings(US_NO_PEEK)))).toEqual(["blackjackPaysImmediately"]);
    });

    it("EU hides nothing", () => {
      expect(hiddenIn(settings(EU))).toEqual([]);
      expect(keysOf(visibleIn(settings(EU)))).toEqual(keysOf(RULE_CATALOG));
      expect(keysOf(togglesIn("advanced", settings(EU)))).toEqual(["dealerDrawsOnPlayerBlackjack", "blackjackPaysImmediately", "dealerDrawsOnceOn21", "dealerDrawsOnPlayerBust"]);
    });

    it("hides Resplit aces when there are only two hands (no second split to make), and shows it at 3, 4 or unlimited", () => {
      expect(keysOf(visibleIn({ ...VEGAS, maxSplitHands: 2 }))).not.toContain("resplitAces");
      expect(hiddenKeys({ ...VEGAS, maxSplitHands: 2 }).has("resplitAces")).toBe(true);
      for (const maxSplitHands of [3, 4, 0]) expect(keysOf(visibleIn({ ...VEGAS, maxSplitHands })), `${maxSplitHands}`).toContain("resplitAces");
    });

    it("only these rules and toggles depend on the settings; every other one is always shown", () => {
      expect(keysOf([...RULE_CATALOG, ...APP_TOGGLES].filter((r) => r.showWhen)).sort()).toEqual([
        "blackjackPaysImmediately", "dealerDrawsOnPlayerBlackjack", "dealerDrawsOnPlayerBust", "dealerDrawsOnceOn21", "noHoleCardLoss", "resplitAces",
      ]);
    });
  });

  describe("togglesIn", () => {
    it("lists each section's toggles in order", () => {
      expect(keysOf(togglesIn("variations", VEGAS))).toEqual(["blackJackOnSplit", "tripleDown", "tripleDrawsOnBust", "doubleFaceDown"]);
      expect(togglesIn("nowhere", VEGAS)).toEqual([]);
    });

    it("Always draw is off-limits until Triple down is on, and Blackjack pays immediately is forced in EU when the dealer won't draw on it", () => {
      const draws = toggle("tripleDrawsOnBust");
      expect(draws.disabledWhen({ tripleDown: false })).toBe(true);
      expect(draws.disabledWhen({ tripleDown: true })).toBe(false);
      const pays = toggle("blackjackPaysImmediately");
      expect(pays.forcedOn({ ...settings(EU), dealerDrawsOnPlayerBlackjack: false })).toBe(true);
      expect(pays.forcedOn({ ...settings(EU), dealerDrawsOnPlayerBlackjack: true })).toBe(false);
      expect(pays.forcedOn({ ...settings(US_PEEK), dealerDrawsOnPlayerBlackjack: false })).toBe(false);
    });
  });

  describe("rulePresetOf ignores the keys the current mode hides", () => {
    it("a preset that differs only in a hidden key still reads as that preset, not Custom", () => {
      expect(rulePresetOf({ ...VEGAS, dealerDrawsOnPlayerBlackjack: false, dealerDrawsOnPlayerBust: true, dealerDrawsOnceOn21: true })).toBe("Vegas");
      expect(rulePresetOf({ ...VEGAS, noHoleCardLoss: "all", blackjackPaysImmediately: false })).toBe("Vegas");
    });

    it("the same keys shown in a mode that shows them make it Custom", () => {
      expect(rulePresetOf({ ...RULE_PRESETS.Europe, dealerDrawsOnPlayerBust: true })).toBe(CUSTOM);
      expect(rulePresetOf({ ...RULE_PRESETS["Atlantic City"], noHoleCardLoss: "all" })).toBe(CUSTOM);
      expect(rulePresetOf({ ...RULE_PRESETS["Atlantic City"], dealerDrawsOnceOn21: true })).toBe(CUSTOM);
    });

    it("a visible key that differs is Custom even beside hidden ones", () => {
      expect(rulePresetOf({ ...VEGAS, dealerDrawsOnPlayerBust: true, surrender: "none" })).toBe(CUSTOM);
    });
  });

  describe("patchFor", () => {
    it("a plain rule writes its own key", () => {
      expect(patchFor(byKey("deckCount"), 4, VEGAS)).toEqual({ deckCount: 4 });
      expect(patchFor(byKey("includeCutCard"), false, VEGAS)).toEqual({ includeCutCard: false });
      expect(patchFor(byKey("doubleAfterSplit"), false, VEGAS)).toEqual({ doubleAfterSplit: false });
      expect(patchFor(toggle("tripleDown"), true, VEGAS)).toEqual({ tripleDown: true });
    });

    it("the hole-card mode pairs blackjackPaysImmediately with the mode: true exactly when the dealer peeks", () => {
      const rule = byKey("dealerHoleBehaviour");
      const from = (mode) => ({ ...VEGAS, dealerHoleBehaviour: mode, blackjackPaysImmediately: mode === US_PEEK });
      for (const [value, was] of [[US_PEEK, EU], [US_NO_PEEK, US_PEEK], [EU, US_PEEK]]) {
        expect(patchFor(rule, value, from(was))).toEqual({ dealerHoleBehaviour: value, blackjackPaysImmediately: value === US_PEEK });
      }
    });

    it("the blackjack timing follows the mode only while it still holds the current mode's pairing; a value set on purpose is left out of the patch", () => {
      const second = byKey("dealerHoleBehaviour");
      const pairs = (mode) => ({ ...VEGAS, dealerHoleBehaviour: mode, blackjackPaysImmediately: mode === US_PEEK });
      const kept = (mode) => ({ ...VEGAS, dealerHoleBehaviour: mode, blackjackPaysImmediately: mode !== US_PEEK }); // the opposite of the pairing
      expect(patchFor(second, EU, pairs(US_PEEK))).toEqual({ dealerHoleBehaviour: EU, blackjackPaysImmediately: false });
      expect(patchFor(second, US_PEEK, pairs(EU))).toEqual({ dealerHoleBehaviour: US_PEEK, blackjackPaysImmediately: true });
      expect(patchFor(second, US_PEEK, pairs(US_NO_PEEK))).toEqual({ dealerHoleBehaviour: US_PEEK, blackjackPaysImmediately: true });
      expect(patchFor(second, US_NO_PEEK, pairs(US_PEEK))).toEqual({ dealerHoleBehaviour: US_NO_PEEK, blackjackPaysImmediately: false });
      for (const mode of [US_PEEK, US_NO_PEEK, EU]) {
        expect(patchFor(second, mode === EU ? US_PEEK : EU, kept(mode)), mode).toEqual({ dealerHoleBehaviour: mode === EU ? US_PEEK : EU });
      }
    });

    it("a table without a stored timing counts as set on purpose, so no key is invented", () => {
      const { blackjackPaysImmediately, ...bare } = VEGAS;
      expect(blackjackPaysImmediately).toBe(true);
      expect(patchFor(byKey("dealerHoleBehaviour"), EU, bare)).toEqual({ dealerHoleBehaviour: EU });
    });

    it("building a preset's rules one choice at a time ends on that preset (the pairing keeps Atlantic City equal to its preset)", () => {
      let s = VEGAS;
      for (const [key, value] of [["dealerHoleBehaviour", EU], ["deckCount", 8], ["dealerHitsSoft17", false]]) s = { ...s, ...patchFor(byKey(key), value, s) };
      expect(rulePresetOf(s)).toBe("Atlantic City");
    });

    it("a House variation never turns a preset table into Custom", () => {
      for (const key of ["blackJackOnSplit", "tripleDown", "tripleDrawsOnBust", "doubleFaceDown"]) expect(rulePresetOf({ ...VEGAS, [key]: true }), key).toBe(key === "blackJackOnSplit" ? CUSTOM : "Vegas");
    });
  });

  describe("resetsTable", () => {
    it("true for every rule key, the shown Advanced toggles and every preset; false for the House variations and the app's other settings", () => {
      for (const rule of [...RULE_CATALOG, ...APP_TOGGLES.filter((t) => t.section === "advanced")]) {
        expect(resetsTable({ [rule.key]: 1 }), rule.key).toBe(true);
      }
      for (const preset of Object.values(RULE_PRESETS)) expect(resetsTable(preset)).toBe(true);
      for (const key of ["tripleDown", "tripleDrawsOnBust", "doubleFaceDown", "playTimeout", "showCardCount", "showTotals", "feltTheme"]) expect(resetsTable({ [key]: true }), key).toBe(false);
      expect(resetsTable({})).toBe(false);
      expect(resetsTable({ tripleDown: true, deckCount: 4 })).toBe(true);
      expect(RESET_SETTINGS).toContain("insurance");
      expect(RESET_SETTINGS).toContain("includeCutCard");
    });
  });

  describe("choicesFor", () => {
    it("a select gives one choice per option, the stored one selected with no edge change, the others with their own patch and delta", () => {
      const choices = choicesFor(byKey("blackjackPayout"), VEGAS);
      expect(choices.map((c) => [c.value, c.label, c.selected])).toEqual([["3:2", "3:2", true], ["6:5", "6:5", false]]);
      expect(choices[0]).toMatchObject({ delta: 0, patch: { blackjackPayout: "3:2" } });
      expect(choices[1].patch).toEqual({ blackjackPayout: "6:5" });
      expect(choices[1].delta).toBeCloseTo(1.39, 10);
    });

    it("a checkbox with no choices of its own gets On and Off", () => {
      const choices = choicesFor(byKey("doubleAfterSplit"), VEGAS);
      expect(choices.map((c) => [c.label, c.selected])).toEqual([["On", true], ["Off", false]]);
      expect(choices[1].patch).toEqual({ doubleAfterSplit: false });
      expect(choices[1].delta).toBeCloseTo(0.14, 10);
      expect(choicesFor(byKey("includeCutCard"), initialGameState.settings).map((c) => [c.label, c.selected])).toEqual([["On", true], ["Off", false]]);
    });

    it("Soft 17 has its own words, in the order Stands, Hits", () => {
      const choices = choicesFor(byKey("dealerHitsSoft17"), VEGAS);
      expect(choices.map((c) => [c.label, c.value, c.selected])).toEqual([["Stands", false, false], ["Hits", true, true]]);
      expect(choices[0].delta).toBeCloseTo(-0.22, 10);
    });

    it("insurance has no edge number: switching it changes nothing in the estimate", () => {
      expect(choicesFor(byKey("insurance"), VEGAS).map((c) => c.delta)).toEqual([0, 0]);
    });

    it("the deck chips are 1, 2, 4, 6 and 8 with the edge each would add", () => {
      const choices = choicesFor(byKey("deckCount"), VEGAS);
      expect(choices.map((c) => c.label)).toEqual(["1", "2", "4", "6", "8"]);
      expect(choices.map((c) => c.selected)).toEqual([false, false, false, true, false]);
      expect(choices.find((c) => c.label === "8").delta).toBeCloseTo(0.02, 10);
      expect(choices.find((c) => c.label === "1").delta).toBeCloseTo(-0.46, 10);
    });

    it.each([3, 5, 7])("a saved %s decks (no chip of its own) is added as one extra chosen chip, in order, with no edge change", (deckCount) => {
      const choices = choicesFor(byKey("deckCount"), { ...VEGAS, deckCount });
      expect(choices.map((c) => c.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].filter((n) => [1, 2, 4, 6, 8, deckCount].includes(n)));
      const extra = choices.find((c) => c.value === deckCount);
      expect(extra).toMatchObject({ label: `${deckCount} decks`, selected: true, delta: 0, patch: { deckCount } });
      expect(choices.filter((c) => c.selected)).toHaveLength(1);
      expect(choices.every((c) => c.value === deckCount || c.delta === edgeDelta({ ...VEGAS, deckCount }, c.patch))).toBe(true);
    });

    it("the extra chip goes away once another deck count is chosen", () => {
      expect(choicesFor(byKey("deckCount"), { ...VEGAS, deckCount: 4 }).map((c) => c.label)).toEqual(["1", "2", "4", "6", "8"]);
    });

    it("the hole-card mode selects exactly the stored mode; each choice's patch pairs the blackjack timing", () => {
      const peek = choicesFor(byKey("dealerHoleBehaviour"), VEGAS);
      expect(peek.map((c) => [c.label, c.selected])).toEqual([["Peeks", true], ["No peek", false], ["No second card", false]]);
      expect(peek[1].patch).toEqual({ dealerHoleBehaviour: US_NO_PEEK, blackjackPaysImmediately: false });
      expect(peek[2].patch).toEqual({ dealerHoleBehaviour: EU, blackjackPaysImmediately: false });
      expect(peek[2].delta).toBeCloseTo(0.01, 10); // no hole card costs the original-bet-only table 0.01
      const noPeek = choicesFor(byKey("dealerHoleBehaviour"), { ...VEGAS, dealerHoleBehaviour: US_NO_PEEK, blackjackPaysImmediately: false });
      expect(noPeek.map((c) => c.selected)).toEqual([false, true, false]);
      expect(noPeek[0].patch).toEqual({ dealerHoleBehaviour: US_PEEK, blackjackPaysImmediately: true });
      const eu = choicesFor(byKey("dealerHoleBehaviour"), { ...VEGAS, dealerHoleBehaviour: EU, blackjackPaysImmediately: false });
      expect(eu.map((c) => c.selected)).toEqual([false, false, true]);
    });

    it("on every preset, every visible rule has exactly one chosen choice, whose patch changes nothing, and every other choice changes something", () => {
      for (const [name, rules] of Object.entries(RULE_PRESETS)) {
        const preset = { ...initialGameState.settings, ...rules };
        for (const rule of visibleIn(preset)) {
          const choices = choicesFor(rule, preset);
          expect(choices.filter((c) => c.selected).length, `${name} ${rule.key}`).toBe(1);
          for (const c of choices) expect(changes(c.patch, preset), `${name} ${rule.key} ${c.label}`).toBe(!c.selected);
        }
      }
    });
  });

  describe("ruleSummary", () => {
    it("Vegas reads on two lines, the first with decks, soft 17, payout and surrender", () => {
      expect(ruleSummary(VEGAS)).toEqual(["6 decks · Dealer hits soft 17 · 3:2 · Late surrender", "Dealer peeks · Double on any two cards · Split up to 4 hands"]);
    });

    it.each([
      ["Atlantic City", "8 decks · Dealer stands on soft 17 · 3:2 · Late surrender",
        "Dealt after you play · Dealer blackjack takes only your first bet · Double on any two cards · Split up to 4 hands"],
      ["Europe", "6 decks · Dealer stands on soft 17 · 3:2 · No surrender",
        "Dealt after you play · Dealer blackjack takes everything · Double on hard 9 to 11 · Split any number of hands"],
      ["Australia", "6 decks · Dealer stands on soft 17 · 3:2 · No surrender",
        "Dealt after you play · Dealer blackjack takes only your first bet · Double on hard 9 to 11 · Split up to 3 hands"],
      ["Singapore", "6 decks · Dealer stands on soft 17 · 3:2 · Early surrender (not against an ace)",
        "Dealt after you play · Dealer blackjack takes only your first bet · Double on any two cards · Split up to 3 hands"],
    ])("%s", (name, line1, line2) => {
      expect(ruleSummary(RULE_PRESETS[name])).toEqual([line1, line2]);
    });

    it("the dealer-blackjack phrase shows only when there is no peek", () => {
      expect(ruleSummary(VEGAS).join(" ")).not.toMatch(/Dealer blackjack/);
      expect(ruleSummary({ ...VEGAS, dealerHoleBehaviour: US_NO_PEEK })[1]).toMatch(/Dealer blackjack takes only your first bet/);
      expect(ruleSummary({ ...VEGAS, dealerHoleBehaviour: EU, noHoleCardLoss: "all" })[1]).toMatch(/Dealer blackjack takes everything/);
    });

    it("US no peek says the dealer doesn't check, not that it peeks", () => {
      const [, line2] = ruleSummary({ ...VEGAS, dealerHoleBehaviour: US_NO_PEEK });
      expect(line2.startsWith("Dealer doesn't check the hole card · ")).toBe(true);
      expect(line2).not.toMatch(/Dealer peeks/);
    });

    it("singular deck, 6:5 and every surrender and double wording follow the settings", () => {
      expect(ruleSummary({ ...VEGAS, deckCount: 1 })[0]).toMatch(/^1 deck ·/);
      expect(ruleSummary({ ...VEGAS, blackjackPayout: "6:5" })[0]).toMatch(/· 6:5 ·/);
      const surrenders = { none: "No surrender", late: "Late surrender", early: "Early surrender", earlyNoAce: "Early surrender (not against an ace)" };
      for (const [surrender, text] of Object.entries(surrenders)) expect(ruleSummary({ ...VEGAS, surrender })[0].endsWith(` · ${text}`), surrender).toBe(true);
      expect(ruleSummary({ ...VEGAS, doubleOn: "10-11" })[1]).toMatch(/Double on hard 10 to 11/);
      expect(ruleSummary({ ...VEGAS, maxSplitHands: 2 })[1]).toMatch(/Split up to 2 hands/);
    });

    it("does not mention insurance, whose switch is not part of the summary", () => {
      expect(ruleSummary({ ...VEGAS, insurance: false }).join(" ")).not.toMatch(/nsurance/);
    });
  });
});
