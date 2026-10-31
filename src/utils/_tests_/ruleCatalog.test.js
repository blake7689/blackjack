import { describe, it, expect } from "vitest";
import {
  RULE_CATALOG, APP_TOGGLES, GROUPS, EDGE_NOTE, VARIATIONS_NOTE, ADVANCED_NOTE, RULES_TITLE, CUSTOMIZE_TITLE, VARIATIONS_TITLE, ADVANCED_TITLE,
  visibleIn, togglesIn, choicesFor, selectedValue, patchFor, changes, resetsTable, ruleSummary,
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

describe("ruleCatalog (#91)", () => {
  it("lists the table rules, grouped, in the order the Customize groups show them", () => {
    expect(RULE_CATALOG.map((r) => r.key)).toEqual([
      "deckCount", "dealerHoleBehaviour", "dealerHitsSoft17", "noHoleCardLoss", "blackjackPayout", "insurance", "doubleOn", "doubleAfterSplit",
      "maxSplitHands", "resplitAces", "hitSplitAces", "surrender",
    ]);
    expect(GROUPS).toEqual(["Shoe", "Dealer", "Payouts", "Doubling", "Splitting", "Surrender"]);
    for (const rule of RULE_CATALOG) expect(GROUPS, rule.key).toContain(rule.group);
    for (const group of GROUPS) expect(RULE_CATALOG.some((r) => r.group === group), group).toBe(true);
  });

  it("lists the app's own toggles by section: three House variations, six Advanced", () => {
    expect(APP_TOGGLES.filter((t) => t.section === "variations").map((t) => t.key)).toEqual(["tripleDown", "tripleDrawsOnBust", "doubleFaceDown"]);
    expect(APP_TOGGLES.filter((t) => t.section === "advanced").map((t) => t.key)).toEqual([
      "blackJackOnSplit", "dealerDrawsOnPlayerBlackjack", "blackjackPaysImmediately", "dealerDrawsOnceOn21", "dealerDrawsOnPlayerBust", "dealerHoleBehaviour",
    ]);
    expect(APP_TOGGLES.every((t) => t.input === "checkbox")).toBe(true);
  });

  it("every key is a real setting with a default of the kind the control stores", () => {
    for (const rule of [...RULE_CATALOG, ...APP_TOGGLES]) {
      expect(initialGameState.settings).toHaveProperty(rule.key);
      const value = initialGameState.settings[rule.key];
      if (rule.input === "checkbox" && rule.key !== "dealerHoleBehaviour") expect(typeof value, rule.key).toBe("boolean");
      if (rule.input === "range") expect(typeof value).toBe("number");
    }
  });

  it("every rule key a preset sets is in the catalog or the toggles, so no preset value has an unnamed control", () => {
    const named = new Set([...RULE_CATALOG, ...APP_TOGGLES].map((r) => r.key));
    for (const [name, preset] of Object.entries(RULE_PRESETS)) {
      for (const key of Object.keys(preset)) expect(named.has(key), `${name} ${key}`).toBe(true);
    }
  });

  it("the catalog keys and the toggle ids are unique, so two controls never share a name", () => {
    const ids = [...RULE_CATALOG.map((r) => r.key), ...APP_TOGGLES.map((t) => t.id ?? t.key)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every rule has a label function that gives plain text for its current value", () => {
    for (const rule of [...RULE_CATALOG, ...APP_TOGGLES]) {
      expect(typeof rule.label).toBe("function");
      const text = rule.label(initialGameState.settings[rule.key]);
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("keeps the labels of the controls that moved here, so the Settings page reads the same", () => {
    expect(byKey("deckCount").label(4)).toBe("Deck size: 4");
    expect(byKey("maxSplitHands").label(3)).toBe("Max Hands After Splits: 3");
    expect(byKey("maxSplitHands").label(0)).toBe("Max Hands After Splits: Unlimited");
    expect(byKey("dealerHitsSoft17").label()).toBe("Soft 17");
    expect(byKey("dealerHoleBehaviour").label()).toBe("Second Card");
    expect(toggle("tripleDrawsOnBust").label()).toBe("Always Draw the Second Triple Card, Even on a Bust");
    expect(toggle("dealerHoleBehaviour").label()).toBe("Dealer doesn't check the hole card");
  });

  it("the deck range is the one the settings validator uses (1 to 8)", () => {
    expect(byKey("deckCount").range).toEqual(SETTING_RANGES.deckCount);
    expect(byKey("deckCount").range).toEqual([1, 8]);
  });

  it("a select carries the stored values, each with a label and a one-line hint", () => {
    const stored = {
      dealerHoleBehaviour: [US_PEEK, EU], blackjackPayout: ["3:2", "6:5"], doubleOn: ["any", "9-11", "10-11"], noHoleCardLoss: ["all", "original"],
      surrender: ["none", "late", "early", "earlyNoAce"], maxSplitHands: [2, 3, 4, 0],
    };
    const selects = RULE_CATALOG.filter((r) => r.input === "select");
    expect(selects.map((r) => r.key).sort()).toEqual(Object.keys(stored).sort());
    for (const rule of selects) {
      expect(rule.options.map((o) => o.value)).toEqual(stored[rule.key]);
      for (const o of rule.options) expect(o.label).toBeTruthy();
      if (rule.key !== "maxSplitHands") for (const o of rule.options) expect(o.hint).toBeTruthy();
    }
  });

  it("Second Card offers a peek or a card dealt after you play; the third dealer mode is reached by the Advanced checkbox", () => {
    const rule = byKey("dealerHoleBehaviour");
    expect(rule.options.map((o) => o.label)).toEqual(["Dealer peeks for blackjack", "Dealt after you play"]);
    expect(rule.options.map((o) => o.value)).not.toContain(US_NO_PEEK);
  });

  it("a checkbox has a hint, and the 6:5 hint says it is worse", () => {
    for (const rule of RULE_CATALOG.filter((r) => r.input === "checkbox")) expect(rule.hint, rule.key).toBeTruthy();
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
      for (const rule of RULE_CATALOG.filter((r) => r.input === "checkbox")) expect(typeof preset[rule.key], rule.key).toBe("boolean");
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

  it("insurance is a plain checkbox with a hint, on by default, shown in every mode", () => {
    const rule = byKey("insurance");
    expect(rule.input).toBe("checkbox");
    expect(rule.label()).toBe("Insurance and Even Money");
    expect(rule.hint).toMatch(/insure for half your bet.*pays 2:1.*even money/);
    expect(rule.showWhen).toBeUndefined();
    expect(rule.options).toBeUndefined();
    expect(initialGameState.settings.insurance).toBe(true);
    for (const mode of Object.values(DealerHoleOptions)) expect(visibleIn(settings(mode)).map((r) => r.key)).toContain("insurance");
  });

  it("the notes say the edge is an estimate, what a plus sign means, and what is not counted", () => {
    expect(EDGE_NOTE).toMatch(/estimate/);
    expect(EDGE_NOTE).toMatch(/approximate/);
    expect(EDGE_NOTE).toMatch(/plus sign means a worse deal/);
    expect(EDGE_NOTE).toMatch(/Insurance, House variations and Advanced options are not counted/);
    expect(VARIATIONS_NOTE).toMatch(/not casino rules.*not counted/);
    expect(ADVANCED_NOTE).toMatch(/Custom.*not counted/);
    expect([RULES_TITLE, CUSTOMIZE_TITLE, VARIATIONS_TITLE, ADVANCED_TITLE]).toEqual(["Table rules", "Customize rules", "House variations", "Advanced"]);
  });

  describe("visibleIn", () => {
    it("hides 'if the dealer has blackjack, you lose' with a US peek, since the blackjack is found before any stake is added", () => {
      expect(visibleIn(settings(US_PEEK)).map((r) => r.key)).not.toContain("noHoleCardLoss");
    });

    it("shows it for EU and for US no peek", () => {
      for (const mode of [EU, US_NO_PEEK]) {
        expect(visibleIn(settings(mode)).map((r) => r.key)).toContain("noHoleCardLoss");
      }
    });

    it("hides Resplit aces when there are only two hands (no second split to make), and shows it at 3, 4 or unlimited", () => {
      expect(visibleIn({ ...VEGAS, maxSplitHands: 2 }).map((r) => r.key)).not.toContain("resplitAces");
      for (const maxSplitHands of [3, 4, 0]) expect(visibleIn({ ...VEGAS, maxSplitHands }).map((r) => r.key), `${maxSplitHands}`).toContain("resplitAces");
    });

    it("every other rule is always shown, in catalogue order", () => {
      const others = RULE_CATALOG.map((r) => r.key).filter((k) => k !== "noHoleCardLoss");
      expect(visibleIn(settings(US_PEEK)).map((r) => r.key)).toEqual(others);
      expect(visibleIn(settings(EU)).map((r) => r.key)).toEqual(RULE_CATALOG.map((r) => r.key));
    });

    it("only noHoleCardLoss and resplitAces depend on the settings", () => {
      expect(RULE_CATALOG.filter((r) => r.showWhen).map((r) => r.key)).toEqual(["noHoleCardLoss", "resplitAces"]);
    });
  });

  describe("togglesIn", () => {
    it("lists each section's toggles in order", () => {
      expect(togglesIn("variations", VEGAS).map((t) => t.key)).toEqual(["tripleDown", "tripleDrawsOnBust", "doubleFaceDown"]);
      expect(togglesIn("advanced", VEGAS).map((t) => t.key)).toEqual([
        "blackJackOnSplit", "dealerDrawsOnPlayerBlackjack", "blackjackPaysImmediately", "dealerDrawsOnceOn21", "dealerDrawsOnPlayerBust", "dealerHoleBehaviour"]);
      expect(togglesIn("nowhere", VEGAS)).toEqual([]);
    });

    it("hides 'Dealer doesn't check the hole card' in EU, where there is no hole card to check, and shows it for both US modes", () => {
      expect(togglesIn("advanced", settings(EU)).map((t) => t.key)).not.toContain("dealerHoleBehaviour");
      expect(togglesIn("advanced", settings(EU))).toHaveLength(5);
      for (const mode of [US_PEEK, US_NO_PEEK]) expect(togglesIn("advanced", settings(mode)).map((t) => t.key), mode).toContain("dealerHoleBehaviour");
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

  describe("selectedValue and patchFor", () => {
    it("a plain rule reads and writes its own key", () => {
      expect(selectedValue(byKey("deckCount"), VEGAS)).toBe(6);
      expect(patchFor(byKey("deckCount"), 4, VEGAS)).toEqual({ deckCount: 4 });
      expect(patchFor(byKey("doubleAfterSplit"), false, VEGAS)).toEqual({ doubleAfterSplit: false });
    });

    it("Second Card pairs the mode with blackjackPaysImmediately: true exactly when the dealer peeks", () => {
      const rule = byKey("dealerHoleBehaviour");
      for (const value of [US_PEEK, EU]) {
        expect(patchFor(rule, value, VEGAS)).toEqual({ dealerHoleBehaviour: value, blackjackPaysImmediately: value === US_PEEK });
      }
    });

    it("Second Card shows US no peek as 'peeks', since the Advanced checkbox says the rest", () => {
      const rule = byKey("dealerHoleBehaviour");
      expect(selectedValue(rule, settings(US_PEEK))).toBe(US_PEEK);
      expect(selectedValue(rule, settings(US_NO_PEEK))).toBe(US_PEEK);
      expect(selectedValue(rule, settings(EU))).toBe(EU);
    });

    it("the blackjack timing follows the mode only while it still holds the current mode's pairing; a value set on purpose is left out of the patch", () => {
      const second = byKey("dealerHoleBehaviour");
      const noCheck = toggle("dealerHoleBehaviour");
      const pairs = (mode) => ({ ...VEGAS, dealerHoleBehaviour: mode, blackjackPaysImmediately: mode === US_PEEK });
      const kept = (mode) => ({ ...VEGAS, dealerHoleBehaviour: mode, blackjackPaysImmediately: mode !== US_PEEK }); // the opposite of the pairing
      // Following the pairing: it moves to the new mode's pairing, from each of the three modes.
      expect(patchFor(second, EU, pairs(US_PEEK))).toEqual({ dealerHoleBehaviour: EU, blackjackPaysImmediately: false });
      expect(patchFor(second, US_PEEK, pairs(EU))).toEqual({ dealerHoleBehaviour: US_PEEK, blackjackPaysImmediately: true });
      expect(patchFor(second, US_PEEK, pairs(US_NO_PEEK))).toEqual({ dealerHoleBehaviour: US_PEEK, blackjackPaysImmediately: true });
      expect(patchFor(noCheck, true, pairs(US_PEEK))).toEqual({ dealerHoleBehaviour: US_NO_PEEK, blackjackPaysImmediately: false });
      expect(patchFor(noCheck, false, pairs(US_NO_PEEK))).toEqual({ dealerHoleBehaviour: US_PEEK, blackjackPaysImmediately: true });
      // Set on purpose: only the mode is written.
      for (const mode of [US_PEEK, US_NO_PEEK, EU]) {
        expect(patchFor(second, mode === EU ? US_PEEK : EU, kept(mode)), mode).toEqual({ dealerHoleBehaviour: mode === EU ? US_PEEK : EU });
      }
      expect(patchFor(noCheck, true, kept(US_PEEK))).toEqual({ dealerHoleBehaviour: US_NO_PEEK });
      expect(patchFor(noCheck, false, kept(US_NO_PEEK))).toEqual({ dealerHoleBehaviour: US_PEEK });
    });

    it("a table without a stored timing counts as set on purpose, so no key is invented", () => {
      const { blackjackPaysImmediately, ...bare } = VEGAS;
      expect(blackjackPaysImmediately).toBe(true);
      expect(patchFor(byKey("dealerHoleBehaviour"), EU, bare)).toEqual({ dealerHoleBehaviour: EU });
    });

    it("the 'doesn't check' checkbox is ticked only for US no peek, and writes the mode and the paired blackjack timing", () => {
      const rule = toggle("dealerHoleBehaviour");
      expect(selectedValue(rule, settings(US_NO_PEEK))).toBe(true);
      expect(selectedValue(rule, settings(US_PEEK))).toBe(false);
      expect(selectedValue(rule, settings(EU))).toBe(false);
      expect(patchFor(rule, true, VEGAS)).toEqual({ dealerHoleBehaviour: US_NO_PEEK, blackjackPaysImmediately: false });
      expect(patchFor(rule, false, VEGAS)).toEqual({ dealerHoleBehaviour: US_PEEK, blackjackPaysImmediately: true });
    });

    it("building a preset's rules one choice at a time ends on that preset (the pairing keeps Atlantic City equal to its tile)", () => {
      let s = VEGAS;
      for (const [key, value] of [["dealerHoleBehaviour", EU], ["deckCount", 8], ["dealerHitsSoft17", false]]) s = { ...s, ...patchFor(byKey(key), value, s) };
      expect(rulePresetOf(s)).toBe("Atlantic City");
    });

    it("an Advanced toggle turns a preset table into Custom, a House variation does not", () => {
      expect(rulePresetOf({ ...VEGAS, ...patchFor(toggle("blackJackOnSplit"), true, VEGAS) })).toBe(CUSTOM);
      expect(rulePresetOf({ ...VEGAS, ...patchFor(toggle("dealerHoleBehaviour"), true, VEGAS) })).toBe(CUSTOM);
      for (const key of ["tripleDown", "tripleDrawsOnBust", "doubleFaceDown"]) expect(rulePresetOf({ ...VEGAS, [key]: true }), key).toBe("Vegas");
    });
  });

  describe("changes and resetsTable", () => {
    it("changes: true when any key differs, false for a patch that writes what is already there or nothing", () => {
      expect(changes({ deckCount: 4 }, VEGAS)).toBe(true);
      expect(changes({ deckCount: 6, surrender: "none" }, VEGAS)).toBe(true);
      expect(changes({ deckCount: 6, surrender: "late" }, VEGAS)).toBe(false);
      expect(changes({}, VEGAS)).toBe(false);
      expect(changes(RULE_PRESETS.Vegas, VEGAS)).toBe(false);
      expect(changes(RULE_PRESETS.Europe, VEGAS)).toBe(true);
    });

    it("resetsTable: true for every rule key and every preset, false for the House variations and the app's other settings", () => {
      for (const rule of [...RULE_CATALOG, ...APP_TOGGLES.filter((t) => t.section === "advanced")]) {
        expect(resetsTable({ [rule.key]: 1 }), rule.key).toBe(true);
      }
      for (const preset of Object.values(RULE_PRESETS)) expect(resetsTable(preset)).toBe(true);
      for (const key of ["tripleDown", "tripleDrawsOnBust", "doubleFaceDown", "playTimeout", "showCardCount"]) expect(resetsTable({ [key]: true }), key).toBe(false);
      expect(resetsTable({})).toBe(false);
      expect(resetsTable({ tripleDown: true, deckCount: 4 })).toBe(true);
      expect(RESET_SETTINGS).toContain("insurance");
    });
  });

  describe("choicesFor", () => {
    it("a select gives one choice per option, the stored one selected with no edge change, the others with their own patch and delta", () => {
      const choices = choicesFor(byKey("blackjackPayout"), VEGAS);
      expect(choices.map((c) => [c.value, c.label, c.selected])).toEqual([["3:2", "3:2", true], ["6:5", "6:5", false]]);
      expect(choices[0]).toMatchObject({ delta: 0, patch: { blackjackPayout: "3:2" } });
      expect(choices[1].patch).toEqual({ blackjackPayout: "6:5" });
      expect(choices[1].delta).toBeCloseTo(1.39, 10);
      expect(choices[1].hint).toMatch(/worse for you/);
    });

    it("a checkbox with no choices of its own gets On and Off", () => {
      const choices = choicesFor(byKey("doubleAfterSplit"), VEGAS);
      expect(choices.map((c) => [c.label, c.selected])).toEqual([["On", true], ["Off", false]]);
      expect(choices[1].patch).toEqual({ doubleAfterSplit: false });
      expect(choices[1].delta).toBeCloseTo(0.14, 10);
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

    it("Second Card: a peek table has 'peeks' chosen and 'dealt after' would pair the blackjack timing; US no peek shows 'peeks' chosen too", () => {
      const peek = choicesFor(byKey("dealerHoleBehaviour"), VEGAS);
      expect(peek.map((c) => [c.label, c.selected])).toEqual([["Dealer peeks for blackjack", true], ["Dealt after you play", false]]);
      expect(peek[1].patch).toEqual({ dealerHoleBehaviour: EU, blackjackPaysImmediately: false });
      expect(peek[1].delta).toBeCloseTo(0.01, 10); // no peek costs the original-bet-only table 0.01
      const noPeek = choicesFor(byKey("dealerHoleBehaviour"), { ...VEGAS, dealerHoleBehaviour: US_NO_PEEK });
      expect(noPeek.map((c) => c.selected)).toEqual([true, false]);
      expect(noPeek[0].delta).toBe(0);
      const eu = choicesFor(byKey("dealerHoleBehaviour"), { ...VEGAS, dealerHoleBehaviour: EU, blackjackPaysImmediately: false });
      expect(eu.map((c) => c.selected)).toEqual([false, true]);
      expect(eu[0].patch).toEqual({ dealerHoleBehaviour: US_PEEK, blackjackPaysImmediately: true });
    });

    it("on every preset, every visible rule has exactly one chosen choice, whose patch changes nothing, and every other choice changes something", () => {
      for (const [name, preset] of Object.entries(RULE_PRESETS)) {
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

    it("does not mention insurance, whose tick box is not part of the summary", () => {
      expect(ruleSummary({ ...VEGAS, insurance: false }).join(" ")).not.toMatch(/nsurance/);
    });
  });
});
