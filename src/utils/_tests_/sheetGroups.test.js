import { describe, it, expect } from "vitest";
import { sheetGroups, feltPrint } from "../ruleCatalog";
import { RULE_PRESETS } from "../rulePresets";
import { initialGameState } from "../gameReducer";
import { DealerHoleOptions } from "../constants/dealerHoleOptions";
import { offersAtDeal, canSplit } from "../blackjackLogic";
import { stackedShoe } from "./stackedShoe";

// The Table rules sheet's content (#87): plain English worked out from the settings, in ruleCatalog.js only.
const { US_PEEK, US_NO_PEEK, EU } = DealerHoleOptions;
const VEGAS = initialGameState.settings;
const withRules = (rules) => ({ ...VEGAS, ...rules });
const lines = (settings) => sheetGroups(settings).flatMap((g) => g.items);
const group = (settings, title) => sheetGroups(settings).find((g) => g.title === title).items;

describe("sheetGroups (#87)", () => {
  it("has the five groups, in order, each with at least one line, for every preset", () => {
    for (const [name, preset] of Object.entries(RULE_PRESETS)) {
      const groups = sheetGroups(withRules(preset));
      expect(groups.map((g) => g.title), name).toEqual(["Payouts", "Dealer", "Doubling", "Splitting", "Surrender"]);
      for (const g of groups) expect(g.items.length, `${name} ${g.title}`).toBeGreaterThan(0);
    }
  });

  it("reads Vegas: 6 decks, 3 to 2, insurance and even money, peek, any two cards, 4 hands, late surrender", () => {
    expect(sheetGroups(VEGAS)).toEqual([
      { title: "Payouts", items: ["Blackjack pays 3 to 2", "Other wins pay 1 to 1", "Insurance pays 2 to 1 when the dealer shows an ace", "Even money on your blackjack against a dealer ace"] },
      { title: "Dealer", items: ["6 decks in the shoe", "The dealer hits soft 17", "The dealer peeks for blackjack before you play"] },
      { title: "Doubling", items: ["Double on any two cards", "Double after a split"] },
      { title: "Splitting", items: ["Split up to 4 hands", "Any two ten-value cards split", "Split aces get one card each", "Aces split once", "Each split hand gets its second card when you reach it"] },
      { title: "Surrender", items: ["Late surrender"] },
    ]);
  });

  it.each([
    ["Atlantic City", { decks: "8 decks in the shoe", soft: "The dealer stands on all 17s", mode: "No second card", surrender: "Late surrender" }],
    ["Europe", { decks: "6 decks in the shoe", soft: "The dealer stands on all 17s", mode: "No second card", surrender: "No surrender" }],
    ["Australia", { decks: "6 decks in the shoe", soft: "The dealer stands on all 17s", mode: "No second card", surrender: "No surrender" }],
    ["Singapore", { decks: "6 decks in the shoe", soft: "The dealer stands on all 17s", mode: "No second card", surrender: "Early surrender (not against an ace)" }],
  ])("reads %s from its own preset", (name, expected) => {
    const settings = withRules(RULE_PRESETS[name]);
    const dealer = group(settings, "Dealer");
    expect(dealer[0]).toBe(expected.decks);
    expect(dealer[1]).toBe(expected.soft);
    expect(dealer[2].startsWith(expected.mode)).toBe(true);
    expect(group(settings, "Surrender")).toEqual([expected.surrender]);
  });

  it("follows the preset's split limit: Europe unlimited, Australia and Singapore 3, Vegas 4", () => {
    expect(group(withRules(RULE_PRESETS.Europe), "Splitting")[0]).toBe("Split any number of hands");
    expect(group(withRules(RULE_PRESETS.Australia), "Splitting")[0]).toBe("Split up to 3 hands");
    expect(group(withRules(RULE_PRESETS.Singapore), "Splitting")[0]).toBe("Split up to 3 hands");
    expect(group(VEGAS, "Splitting")[0]).toBe("Split up to 4 hands");
  });

  it("the soft 17 and hole-card lines are the sheet's own full sentences (the mockup's), not the felt's short phrases (L1-23)", () => {
    const lineFor = { [US_PEEK]: "The dealer peeks for blackjack before you play", [US_NO_PEEK]: "The dealer has a hole card but doesn't check it", [EU]: "No second card: the dealer takes it after you play" };
    for (const mode of [US_PEEK, US_NO_PEEK, EU]) {
      const dealer = group(withRules({ dealerHoleBehaviour: mode }), "Dealer");
      expect(dealer, mode).toContain(lineFor[mode]);
    }
    expect(group(withRules({ dealerHitsSoft17: true }), "Dealer")).toContain("The dealer hits soft 17");
    expect(group(withRules({ dealerHitsSoft17: false }), "Dealer")).toContain("The dealer stands on all 17s");
    expect(feltPrint(VEGAS).soft).toBe("Dealer hits soft 17"); // the felt print keeps its own words
  });

  it("says what a dealer blackjack takes only without a peek", () => {
    expect(group(VEGAS, "Dealer").join("|")).not.toMatch(/dealer blackjack takes/i);
    expect(group(withRules({ dealerHoleBehaviour: US_NO_PEEK, noHoleCardLoss: "original" }), "Dealer")).toContain("A dealer blackjack takes only your first bet");
    expect(group(withRules({ dealerHoleBehaviour: EU, noHoleCardLoss: "all" }), "Dealer")).toContain("A dealer blackjack takes everything you staked");
  });

  it("the fixed line 'Any two ten-value cards split' matches the engine: a king and a ten split (canSplit goes by card value)", () => {
    expect(group(VEGAS, "Splitting")).toContain("Any two ten-value cards split");
    const [king, ten] = stackedShoe(["K", "10"]);
    expect(king.rank).not.toBe(ten.rank);
    expect(canSplit({ cards: [king, ten] }, 1, 4)).toBe(true);
  });

  it("says 1 deck, not 1 decks", () => {
    expect(group(withRules({ deckCount: 1 }), "Dealer")[0]).toBe("1 deck in the shoe");
  });

  it("pays 6 to 5 when set, and the felt print agrees", () => {
    const settings = withRules({ blackjackPayout: "6:5" });
    expect(group(settings, "Payouts")[0]).toBe("Blackjack pays 6 to 5");
    expect(feltPrint(settings).pay).toBe("Blackjack Pays 6 to 5");
  });

  it("insurance off: no insurance, no even money", () => {
    const payouts = group(withRules({ insurance: false }), "Payouts");
    expect(payouts).toEqual(["Blackjack pays 3 to 2", "Other wins pay 1 to 1", "No insurance or even money"]);
  });

  it("with two hands there is no resplit line; with more, it says whether aces may be split again", () => {
    expect(group(withRules({ maxSplitHands: 2 }), "Splitting").join("|")).not.toMatch(/split again|Aces split once/);
    expect(group(withRules({ maxSplitHands: 3, resplitAces: true }), "Splitting")).toContain("Aces may be split again");
    expect(group(withRules({ maxSplitHands: 4, resplitAces: false }), "Splitting")).toContain("Aces split once");
  });

  it("split aces and split deal wording", () => {
    expect(group(withRules({ hitSplitAces: true }), "Splitting")).toContain("Split aces may be hit");
    expect(group(withRules({ splitDeal: "both" }), "Splitting")).toContain("Both split hands get their second card at once");
  });

  it("doubling: the double-on rule, DAS on and off, and the two variations only when on", () => {
    expect(group(withRules({ doubleOn: "9-11", doubleAfterSplit: false }), "Doubling")).toEqual(["Double on a hard 9, 10 or 11", "No double after a split"]);
    expect(group(withRules({ doubleOn: "10-11" }), "Doubling")[0]).toBe("Double on a hard 10 or 11");
    const variations = group(withRules({ tripleDown: true, doubleFaceDown: true }), "Doubling");
    expect(variations).toContain("Triple down allowed");
    expect(variations).toContain("The double card is dealt face down");
    expect(group(VEGAS, "Doubling").join("|")).not.toMatch(/Triple|face down/);
    expect(group(withRules({ doubleOn: "any" }), "Doubling")[0]).toBe("Double on any two cards");
  });

  it.each([
    ["none", "No surrender"],
    ["late", "Late surrender"],
    ["early", "Early surrender"],
    ["earlyNoAce", "Early surrender (not against an ace)"],
  ])("surrender %s reads %s", (surrender, text) => {
    expect(group(withRules({ surrender }), "Surrender")).toEqual([text]);
  });

  // Even money is listed exactly when the engine would offer it: cross-check against offersAtDeal for every preset and mode variant.
  const variants = [
    ...Object.entries(RULE_PRESETS).map(([name, rules]) => [name, withRules(rules)]),
    ["no peek", withRules({ dealerHoleBehaviour: US_NO_PEEK, blackjackPaysImmediately: false })],
    ["no peek, pays at once", withRules({ dealerHoleBehaviour: US_NO_PEEK, blackjackPaysImmediately: true })],
    ["EU, blackjack paid at once", withRules({ dealerHoleBehaviour: EU, dealerDrawsOnPlayerBlackjack: false, blackjackPaysImmediately: true })],
    ["EU, dealer draws on a blackjack", withRules({ dealerHoleBehaviour: EU, dealerDrawsOnPlayerBlackjack: true, blackjackPaysImmediately: false })],
    ["peek, insurance off", withRules({ insurance: false })],
  ];
  it.each(variants)("lists even money only when the engine offers it: %s", (_name, settings) => {
    const offered = Boolean(offersAtDeal(stackedShoe(["A", "K"]), stackedShoe(["A"])[0], settings, 10, 1000)?.evenMoney);
    expect(group(settings, "Payouts").some((line) => line.startsWith("Even money")), "even money line").toBe(offered);
  });

  it("calls the hand blackjack throughout, never the brand word or two words", () => {
    for (const [name, settings] of variants) {
      const text = lines(settings).join("\n");
      expect(text, name).not.toMatch(/blakejack|black jack|black-jack/i);
      expect(text, name).toMatch(/lackjack/);
    }
  });

  it("every line is a unique, non-empty string within its group (they are React keys)", () => {
    for (const [name, settings] of variants) {
      for (const g of sheetGroups(settings)) {
        expect(new Set(g.items).size, `${name} ${g.title}`).toBe(g.items.length);
        for (const item of g.items) expect(typeof item === "string" && item.length > 0).toBe(true);
      }
    }
  });
});
