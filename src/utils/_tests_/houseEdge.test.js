import { describe, it, expect } from "vitest";
import { BASELINE, deckEffect, houseEdge, edgeDelta, formatEdge, formatDelta } from "../houseEdge";
import { RULE_PRESETS } from "../rulePresets";
import { initialGameState } from "../gameReducer";

// The Vegas table is the default; every rule effect below is measured from it (or from a stated variant).
const VEGAS = RULE_PRESETS.Vegas;
const NO_PEEK = { dealerHoleBehaviour: "drawEarly_NoCheck" };
const EU = { dealerHoleBehaviour: "drawAfter" };
const delta = (patch, base = VEGAS) => edgeDelta(base, patch);

describe("houseEdge (#91): the five presets", () => {
  // Pinned estimates (percent) and the strings on the preset tiles.
  const PRESETS = [
    ["Vegas", 0.5769, "0.6%"],
    ["Atlantic City", 0.3869, "0.4%"],
    ["Europe", 0.6269, "0.6%"],
    ["Australia", 0.5369, "0.5%"],
    ["Singapore", 0.2069, "0.2%"],
  ];

  it.each(PRESETS)("%s is about %s%% and reads %s on its tile", (name, estimate, tile) => {
    expect(houseEdge(RULE_PRESETS[name])).toBeCloseTo(estimate, 4);
    expect(formatEdge(houseEdge(RULE_PRESETS[name]))).toBe(tile);
  });

  it("the default settings are the Vegas table, so the default estimate is Vegas's", () => {
    expect(houseEdge(initialGameState.settings)).toBe(houseEdge(VEGAS));
  });

  it("starts from the 8-deck basic strategy baseline, which is the estimate of that table with no extra rule", () => {
    const base = { ...VEGAS, deckCount: 8, dealerHitsSoft17: false, surrender: "none", maxSplitHands: 4 };
    expect(BASELINE).toBe(0.4469);
    expect(houseEdge(base)).toBeCloseTo(BASELINE, 10);
  });
});

describe("houseEdge (#91): against Wizard of Odds' blackjack calculator", () => {
  // Read 2026-10-31 from https://wizardofodds.com/games/blackjack/calculator/ (its embedded edge table), column "Basic strategy
  // with cut card", house edge in percent. Inputs are (decks, dealer soft 17, DAS, double, split to, RSA, HSA, loses only the
  // original bet to a dealer blackjack, surrender), blackjack 3:2:
  //   Vegas          6, hits,   yes, any,  4, no, no, yes, late   -> 0.5505
  //   Atlantic City  8, stands, yes, any,  4, no, no, yes, late   -> 0.3710 (the calculator has a peek; the spec reads the table this way)
  //   Europe         6, stands, yes, 9-11, 4, no, no, NO,  none   -> 0.6334 (the calculator stops at 4 hands; the preset is unlimited)
  //   Australia      6, stands, yes, 9-11, 3, no, no, yes, none   -> 0.5308
  // Singapore has no published figure (early surrender is not in the calculator), so it is not compared, on purpose.
  // 6:5 is NOT compared either: the calculator's own add-on is 1.36 at 6 decks, the rule-variations page (used here) says 1.39.
  const CALCULATOR = [
    ["Vegas", RULE_PRESETS.Vegas, 0.5505],
    ["Atlantic City", RULE_PRESETS["Atlantic City"], 0.3710],
    ["Europe (split to 4)", { ...RULE_PRESETS.Europe, maxSplitHands: 4 }, 0.6334],
    ["Australia", RULE_PRESETS.Australia, 0.5308],
  ];

  it.each(CALCULATOR)("%s is within 0.05 points of the calculator", (_name, settings, published) => {
    expect(Math.abs(houseEdge(settings) - published)).toBeLessThanOrEqual(0.05);
  });

  it("the Europe comparison table is the Europe preset except for the split limit the calculator cannot take", () => {
    const { maxSplitHands, ...rest } = RULE_PRESETS.Europe;
    expect(maxSplitHands).toBe(0);
    expect(CALCULATOR[2][1]).toMatchObject({ ...rest, maxSplitHands: 4, noHoleCardLoss: "all", doubleOn: "9-11", surrender: "none" });
  });
});

describe("houseEdge (#91): rule effects (percent points, positive = worse for the player)", () => {
  it.each([
    ["dealer hits soft 17 (Vegas -> stands)", { dealerHitsSoft17: false }, -0.22],
    ["blackjack pays 6:5", { blackjackPayout: "6:5" }, 1.39],
    ["double on 9-11 only", { doubleOn: "9-11" }, 0.09],
    ["double on 10-11 only", { doubleOn: "10-11" }, 0.18],
    ["no double after a split", { doubleAfterSplit: false }, 0.14],
    ["resplit aces", { resplitAces: true }, -0.08],
    ["hit split aces", { hitSplitAces: true }, -0.19],
    ["late surrender off", { surrender: "none" }, 0.07],
    ["split to 3 hands", { maxSplitHands: 3 }, 0.01],
    ["split to 2 hands", { maxSplitHands: 2 }, 0.05],
    ["unlimited splits (taken as 4 hands)", { maxSplitHands: 0 }, 0],
    ["split to 4 hands (the baseline)", { maxSplitHands: 4 }, 0],
  ])("%s", (_name, patch, effect) => {
    expect(delta(patch)).toBeCloseTo(effect, 6);
  });

  it("6:5 raises the Vegas estimate by exactly 1.39, and 3:2 takes it off again", () => {
    expect(delta({ blackjackPayout: "6:5" })).toBeCloseTo(1.39, 10);
    expect(houseEdge({ ...VEGAS, blackjackPayout: "6:5" }) - houseEdge(VEGAS)).toBeCloseTo(1.39, 10);
    expect(delta({ blackjackPayout: "3:2" }, { ...VEGAS, blackjackPayout: "6:5" })).toBeCloseTo(-1.39, 10);
  });

  it("surrender: late -0.07, early -0.63, early not against an ace -0.24, measured from none", () => {
    const none = { ...VEGAS, surrender: "none" };
    expect(delta({ surrender: "late" }, none)).toBeCloseTo(-0.07, 6);
    expect(delta({ surrender: "early" }, none)).toBeCloseTo(-0.63, 6);
    expect(delta({ surrender: "earlyNoAce" }, none)).toBeCloseTo(-0.24, 6);
    expect(delta({ surrender: "none" }, none)).toBe(0);
  });

  it("resplit aces helps only if there is a second split to make: nothing at 2 hands, -0.08 at 3, 4 or unlimited", () => {
    for (const [maxSplitHands, effect] of [[2, 0], [3, -0.08], [4, -0.08], [0, -0.08]]) {
      expect(delta({ resplitAces: true }, { ...VEGAS, maxSplitHands }), `${maxSplitHands} hands`).toBeCloseTo(effect, 6);
    }
  });

  it("a split limit the table does not know counts as no effect rather than breaking the estimate", () => {
    expect(houseEdge({ ...VEGAS, maxSplitHands: 5 })).toBe(houseEdge(VEGAS));
  });

  it("the double limits stack with the other rules by plain addition", () => {
    const worst = { ...VEGAS, dealerHitsSoft17: true, doubleOn: "10-11", doubleAfterSplit: false, blackjackPayout: "6:5" };
    expect(houseEdge(worst)).toBeCloseTo(houseEdge(VEGAS) + 0.18 + 0.14 + 1.39, 6);
  });
});

describe("houseEdge (#91): decks", () => {
  // The rule-variations page: 1 deck +0.48, 2 +0.19, 4 +0.06, 5 +0.03, 6 +0.02 (player), against 8. 3 and 7 are interpolated.
  it.each([
    [1, -0.48], [2, -0.19], [3, -0.125], [4, -0.06], [5, -0.03], [6, -0.02], [7, -0.01], [8, 0],
  ])("%s deck(s) move the edge by %s", (decks, effect) => {
    expect(deckEffect(decks)).toBeCloseTo(effect, 10);
    expect(houseEdge({ ...VEGAS, deckCount: decks }) - houseEdge({ ...VEGAS, deckCount: 8 })).toBeCloseTo(effect, 6);
  });

  it("interpolates the unlisted counts between their neighbours, never outside them", () => {
    expect(deckEffect(3)).toBeCloseTo((deckEffect(2) + deckEffect(4)) / 2, 10);
    expect(deckEffect(7)).toBeCloseTo((deckEffect(6) + deckEffect(8)) / 2, 10);
  });

  it("clamps to the 1 to 8 range the settings allow", () => {
    expect(deckEffect(0)).toBe(deckEffect(1));
    expect(deckEffect(-3)).toBe(deckEffect(1));
    expect(deckEffect(9)).toBe(0);
    expect(deckEffect(100)).toBe(0);
  });

  it("fewer decks is always better for the player", () => {
    const edges = [1, 2, 3, 4, 5, 6, 7, 8].map((deckCount) => houseEdge({ ...VEGAS, deckCount }));
    expect([...edges].sort((a, b) => a - b)).toEqual(edges);
  });
});

describe("houseEdge (#91): the hole card", () => {
  it("with a peek, the dealer blackjack is found before any stake is added, so noHoleCardLoss makes no difference", () => {
    expect(houseEdge({ ...VEGAS, noHoleCardLoss: "all" })).toBe(houseEdge({ ...VEGAS, noHoleCardLoss: "original" }));
  });

  it.each([["US no peek", NO_PEEK], ["Europe", EU]])("%s: a dealer blackjack that takes everything adds 0.11, only the first bet adds 0.01", (_name, mode) => {
    const peek = { ...VEGAS, noHoleCardLoss: "original" };
    expect(delta({ ...mode, noHoleCardLoss: "all" }, peek)).toBeCloseTo(0.11, 6);
    expect(delta({ ...mode, noHoleCardLoss: "original" }, peek)).toBeCloseTo(0.01, 6);
  });

  it("a table with no hole card and no noHoleCardLoss value still gives a finite estimate (the rule counts as 0)", () => {
    const { noHoleCardLoss, ...bare } = { ...VEGAS, ...EU };
    expect(noHoleCardLoss).toBe("original");
    expect(Number.isFinite(houseEdge(bare))).toBe(true);
    expect(houseEdge(bare)).toBe(houseEdge(VEGAS));
    expect(formatEdge(houseEdge(bare))).toBe("0.6%");
  });

  it("US no peek and Europe cost the same", () => {
    for (const noHoleCardLoss of ["all", "original"]) {
      expect(houseEdge({ ...VEGAS, ...NO_PEEK, noHoleCardLoss })).toBe(houseEdge({ ...VEGAS, ...EU, noHoleCardLoss }));
    }
  });
});

describe("houseEdge (#91): what is not counted", () => {
  it("insurance, the Advanced options, the House variations and the app's own settings change nothing", () => {
    const ignored = {
      insurance: false, blackJackOnSplit: true, dealerDrawsOnPlayerBust: true, dealerDrawsOnceOn21: true, dealerDrawsOnPlayerBlackjack: false,
      blackjackPaysImmediately: false, tripleDown: true, tripleDrawsOnBust: true, doubleFaceDown: true,
      includeCutCard: false, resetInitialBet: true, autoDeal: true, autoDealDelay: 0, chipValues: "1", playTimeout: 500, showCardCount: false,
    };
    expect(houseEdge({ ...VEGAS, ...ignored })).toBe(houseEdge(VEGAS));
    expect(edgeDelta(VEGAS, ignored)).toBe(0);
  });
});

describe("edgeDelta (#91)", () => {
  it("is the change in the estimate if the patch were applied", () => {
    expect(edgeDelta(VEGAS, { dealerHitsSoft17: false })).toBeCloseTo(-0.22, 10);
    expect(edgeDelta(VEGAS, { ...RULE_PRESETS.Europe })).toBeCloseTo(houseEdge(RULE_PRESETS.Europe) - houseEdge(VEGAS), 10);
  });

  it("an empty patch, or one that writes what is already there, is zero", () => {
    expect(edgeDelta(VEGAS, {})).toBe(0);
    expect(edgeDelta(VEGAS, { deckCount: 6, surrender: "late" })).toBe(0);
  });

  it("has no float noise (2 - 1.4 style sums stay on the 6th decimal)", () => {
    const d = edgeDelta(VEGAS, { blackjackPayout: "6:5" });
    expect(d).toBe(1.39);
    expect(String(d)).toBe("1.39");
  });

  it("does not change the settings it was given", () => {
    const before = JSON.stringify(VEGAS);
    edgeDelta(VEGAS, { deckCount: 1 });
    expect(JSON.stringify(VEGAS)).toBe(before);
  });
});

describe("formatEdge (#91)", () => {
  it("shows one decimal with a percent sign", () => {
    expect(formatEdge(0.5769)).toBe("0.6%");
    expect(formatEdge(0.5)).toBe("0.5%");
    expect(formatEdge(1.9669)).toBe("2.0%");
    expect(formatEdge(10)).toBe("10.0%");
  });

  it("never prints a negative zero", () => {
    expect(formatEdge(0)).toBe("0.0%");
    expect(formatEdge(-0.04)).toBe("0.0%");
    expect(formatEdge(-0)).toBe("0.0%");
  });

  it("keeps the sign of a real negative edge", () => {
    expect(formatEdge(-0.52)).toBe("-0.5%");
  });
});

describe("formatDelta (#91)", () => {
  it("shows the sign and two decimals", () => {
    expect(formatDelta(1.39)).toBe("+1.39%");
    expect(formatDelta(0.09)).toBe("+0.09%");
    expect(formatDelta(-0.07)).toBe("-0.07%");
    expect(formatDelta(-0.63)).toBe("-0.63%");
    expect(formatDelta(0.5)).toBe("+0.50%");
  });

  it("is empty when it rounds to nothing, whatever the sign", () => {
    expect(formatDelta(0)).toBe("");
    expect(formatDelta(0.004)).toBe("");
    expect(formatDelta(-0.004)).toBe("");
    expect(formatDelta(-0)).toBe("");
  });

  it("rounds to the hundredth", () => {
    expect(formatDelta(0.0149)).toBe("+0.01%");
    expect(formatDelta(-0.1949)).toBe("-0.19%");
  });
});
