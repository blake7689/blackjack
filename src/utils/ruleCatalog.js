import { DealerHoleOptions } from "./constants/dealerHoleOptions";
import { BlackjackPayouts, DoubleOn, NoHoleCardLoss, SurrenderOptions } from "./constants/ruleOptions";
import { RESET_SETTINGS, SETTING_RANGES } from "./gameReducer";
import { isEU, bjPaysWithoutPeek } from "./blackjackLogic";
import { edgeDelta } from "./houseEdge";

// The table rules in plain language (#91, #84). This file is the ONLY home of rule wording (sentence case, the hand is "blackjack"): Settings
// and the rules sheet read it. An entry has the shape of a Settings control: { key, label(value), input, options?, range?, hint?, showWhen?(settings) }, plus:
//   group     the Settings group it sits in (GROUPS)
//   choices   the radio choices when there are no `options` (a switch gets On / Off)
//   patch     (value, settings) -> the settings to write, when it is not just { [key]: value }
//   summary   { line: 1 | 2, text(value, settings) } one phrase of a preset's summary
// `hint` is a few words on one line: the "i" shows it and the control is `aria-describedby` it. `showWhen` is the ONE list of what a mode
// hides (a rule that has no effect there): Settings, `rulePresetOf` (utils/rulePresets.js, which imports this file, never the reverse) and the
// rules sheet all read it through `visibleIn`, `togglesIn` and `hiddenKeys`. Each PR that adds a rule adds its entry here.
const { US_PEEK, US_NO_PEEK, EU } = DealerHoleOptions;

export const GROUPS = ["Shoe", "Dealer", "Payouts", "Doubling", "Splitting", "Surrender"];

export const RULES_TITLE = "Table rules";
export const VARIATIONS_TITLE = "House variations";
export const ADVANCED_TITLE = "Advanced";
export const EDGE_NOTE = "House edge is an estimate for a player who uses basic strategy and declines insurance: published rule-by-rule figures added together, so it is approximate. A plus sign means a worse deal for you. Insurance, House variations and Advanced options are not counted.";

// A change of dealer mode also moves blackjackPaysImmediately to the new mode's preset pairing (true with a peek, false without a hole
// card or with no peek), but only while it still holds the pairing of the current mode: a value the player set on purpose stays.
const modePatch = (mode, s) => ({
  dealerHoleBehaviour: mode,
  ...(s.blackjackPaysImmediately === (s.dealerHoleBehaviour === US_PEEK) && { blackjackPaysImmediately: mode === US_PEEK }),
});

const HOLE_OPTIONS = [
  { value: US_PEEK, label: "Peeks", hint: "The dealer checks for blackjack before you play." },
  { value: US_NO_PEEK, label: "No peek", hint: "The dealer has a hole card but doesn't check it." },
  { value: EU, label: "No second card", hint: "The dealer takes the second card after you play." },
];
const ON_OFF = [{ value: true, label: "On" }, { value: false, label: "Off" }];
const surrenderText = { none: "No surrender", late: "Late surrender", early: "Early surrender", earlyNoAce: "Early surrender (not against an ace)" };

export const RULE_CATALOG = [
  { key: "deckCount", group: "Shoe", label: () => "Deck size", input: "range", range: SETTING_RANGES.deckCount, hint: "Decks in the shoe",
    choices: [1, 2, 4, 6, 8].map((n) => ({ value: n, label: String(n) })), extraLabel: (v) => `${v} decks`,
    summary: { line: 1, text: (v) => `${v} deck${v === 1 ? "" : "s"}` } },
  // Off = no end-of-shoe shuffle (the shoe is dealt out, and a mid-round refill plays a short shuffle).
  { key: "includeCutCard", group: "Shoe", label: () => "Include cut card", input: "checkbox", hint: "Adds cut card to shoe" },
  // One choice, in the felt print's words: Peeks and No peek are the two US modes, No second card is the EU mode.
  { key: "dealerHoleBehaviour", group: "Dealer", label: () => "Dealer's second card", input: "select", hint: "When the dealer checks for blackjack", options: HOLE_OPTIONS,
    patch: (v, s) => modePatch(v, s),
    summary: { line: 2, text: (v) => (v === EU ? "Dealt after you play" : v === US_NO_PEEK ? "Dealer doesn't check the hole card" : "Dealer peeks") } },
  { key: "dealerHitsSoft17", group: "Dealer", label: () => "Soft 17", input: "checkbox", hint: "Dealer's move on soft 17",
    choices: [{ value: false, label: "Stands" }, { value: true, label: "Hits" }],
    summary: { line: 1, text: (v) => (v ? "Dealer hits soft 17" : "Dealer stands on soft 17") } },
  { key: "noHoleCardLoss", group: "Dealer", label: () => "If the dealer has blackjack, you lose", input: "select", hint: "Your loss to a dealer blackjack",
    showWhen: (s) => s.dealerHoleBehaviour !== US_PEEK, options: [
      { value: NoHoleCardLoss.ALL, label: "Everything you staked" },
      { value: NoHoleCardLoss.ORIGINAL, label: "Only your first bet" },
    ],
    summary: { line: 2, text: (v) => (v === NoHoleCardLoss.ALL ? "Dealer blackjack takes everything" : "Dealer blackjack takes only your first bet") } },
  { key: "blackjackPayout", group: "Payouts", label: () => "Blackjack pays", input: "select", hint: "What a natural blackjack pays", options: [
      { value: BlackjackPayouts.THREE_TWO, label: "3:2" },
      { value: BlackjackPayouts.SIX_FIVE, label: "6:5" },
    ], summary: { line: 1, text: (v) => v } },
  { key: "insurance", group: "Payouts", label: () => "Insurance and even money", input: "checkbox", hint: "Side bet against a dealer ace" },
  { key: "doubleOn", group: "Doubling", label: () => "Double on", input: "select", hint: "Hands you may double", options: [
      { value: DoubleOn.ANY, label: "Any two cards" },
      { value: DoubleOn.NINE_TO_ELEVEN, label: "Hard 9 to 11" },
      { value: DoubleOn.TEN_TO_ELEVEN, label: "Hard 10 to 11" },
    ], summary: { line: 2, text: (v) => `Double on ${v === DoubleOn.ANY ? "any two cards" : v === DoubleOn.NINE_TO_ELEVEN ? "hard 9 to 11" : "hard 10 to 11"}` } },
  { key: "doubleAfterSplit", group: "Doubling", label: () => "Double after a split", input: "checkbox", hint: "Double on split hands" },
  { key: "maxSplitHands", group: "Splitting", label: () => "Max hands after splitting", input: "select", hint: "Max number of times allowed to split a hand",
    options: [2, 3, 4].map((n) => ({ value: n, label: String(n) })).concat({ value: 0, label: "Unlimited" }),
    summary: { line: 2, text: (v) => (v === 0 ? "Split any number of hands" : `Split up to ${v} hands`) } },
  { key: "splitDeal", group: "Splitting", label: () => "Deal split hands", input: "select", hint: "Second cards after a split", options: [
      { value: "one", label: "One at a time" },
      { value: "both", label: "Both at once" },
    ] },
  { key: "resplitAces", group: "Splitting", label: () => "Resplit aces", input: "checkbox", hint: "Split aces again",
    showWhen: (s) => s.maxSplitHands !== 2 }, // with two hands there is no second split to make
  { key: "hitSplitAces", group: "Splitting", label: () => "Hit split aces", input: "checkbox", hint: "Can hit after splitting aces" },
  { key: "surrender", group: "Surrender", label: () => "Surrender", input: "select", hint: "Give up half your bet", options: [
      { value: SurrenderOptions.NONE, label: "None" },
      { value: SurrenderOptions.LATE, label: "Late" },
      { value: SurrenderOptions.EARLY, label: "Early" },
      { value: SurrenderOptions.EARLY_NO_ACE, label: "Early, not against an ace" },
    ], summary: { line: 1, text: (v) => surrenderText[v] } },
];

// The app's own switches (not casino rules), in the House variations and Advanced groups. The EU-only ones hide in the US modes, and
// "Blackjack pays immediately" under a peek (a peek already pays it at once).
const euOnly = (s) => s.dealerHoleBehaviour === EU;
export const APP_TOGGLES = [
  { key: "blackJackOnSplit", section: "variations", label: () => "Blackjack on split", input: "checkbox", hint: "A+ten after a split counts as blackjack" },
  { key: "tripleDown", section: "variations", label: () => "Triple down", input: "checkbox", hint: "Triple the bet, two cards" },
  { key: "tripleDrawsOnBust", section: "variations", label: () => "Always draw the second triple card, even on a bust", input: "checkbox", hint: "Second triple card always dealt",
    disabledWhen: (s) => !s.tripleDown },
  { key: "doubleFaceDown", section: "variations", label: () => "Double down card face down", input: "checkbox", hint: "Double card dealt face down" },
  { key: "dealerDrawsOnPlayerBlackjack", section: "advanced", label: () => "Dealer draws 2nd card on a player blackjack", input: "checkbox", hint: "Dealer draws against your natural",
    showWhen: euOnly },
  // With no dealer card to compare against, a blackjack must pay at once.
  { key: "blackjackPaysImmediately", section: "advanced", label: () => "Blackjack pays immediately", input: "checkbox", hint: "Natural paid before the dealer",
    showWhen: (s) => s.dealerHoleBehaviour !== US_PEEK, forcedOn: (s) => isEU(s) && !s.dealerDrawsOnPlayerBlackjack },
  { key: "dealerDrawsOnceOn21", section: "advanced", label: () => "Dealer draws only once against a 21", input: "checkbox", hint: "One dealer card against 21", showWhen: euOnly },
  { key: "dealerDrawsOnPlayerBust", section: "advanced", label: () => "Dealer draws 2nd card after a player bust", input: "checkbox", hint: "Dealer draws after you bust", showWhen: euOnly },
];

// The settings that are not table rules (Gameplay, Chips, Appearance): their labels, one-line subtitles and hints, by key.
export const APP_SETTINGS = {
  playTimeout: { label: "Game speed", hint: "How fast cards move" },
  resetInitialBet: { label: "Rebet automatically", hint: "Same bet each round" },
  showTotals: { label: "Show hand totals", sub: "Yours and the dealer's", hint: "Hand totals on the table" },
  showCardCount: { label: "Show the count", sub: "Running and true count", hint: "Hi-Lo card count" },
  autoDeal: { label: "Auto deal", sub: "Needs Rebet", hint: "Automatically deal each round" },
  autoDealDelay: { label: "Auto deal delay", hint: "Pause before auto deal" },
  soundOn: { label: "Sound", hint: "Table sounds" },
  soundVolume: { label: "Volume", hint: "Sound level" },
  hapticsOn: { label: "Vibration", hint: "Buzz on key moments" },
  chipValues: { label: "Chips to show", hint: "Chips in your rack" },
  feltTheme: { label: "Felt", hint: "Colour of the table cloth" },
  accent: { label: "Accent", hint: "Colour of keys and highlights" },
  mode: { label: "Mode", hint: "Dark, light or follow your device" },
};

// The rules that apply to these settings (a rule that does not apply has no effect and is not shown).
export const visibleIn = (settings) => RULE_CATALOG.filter((rule) => rule.showWhen?.(settings) ?? true);
export const togglesIn = (section, settings) => APP_TOGGLES.filter((t) => t.section === section && (t.showWhen?.(settings) ?? true));
// The keys these settings hide: `rulePresetOf` leaves them out of a preset match.
export const hiddenKeys = (settings) => new Set([...RULE_CATALOG, ...APP_TOGGLES].filter((r) => r.showWhen && !r.showWhen(settings)).map((r) => r.key));

export const patchFor = (rule, value, settings) => rule.patch?.(value, settings) ?? { [rule.key]: value };

// Writing `patch` deals a new shoe and resets the table (the same test GameProvider uses).
export const resetsTable = (patch) => Object.keys(patch).some((key) => RESET_SETTINGS.includes(key));

// The choices of a rule's radio group for these settings: { value, label, hint, selected, patch, delta }.
// `delta` is the change in the house edge estimate if only this rule is switched to the choice (0 for the chosen one).
// A saved value the control does not list (3, 5 or 7 decks) is added as one extra chosen choice.
export function choicesFor(rule, settings) {
  const value = settings[rule.key];
  const list = rule.choices ?? rule.options ?? ON_OFF;
  const all = list.some((c) => c.value === value) ? list : [...list, { value, label: rule.extraLabel(value) }].sort((a, b) => a.value - b.value);
  return all.map((c) => {
    const patch = patchFor(rule, c.value, settings);
    const selected = c.value === value;
    return { value: c.value, label: c.label, hint: c.hint, selected, patch, delta: selected ? 0 : edgeDelta(settings, patch) };
  });
}

// The two lines of a preset's summary: "6 decks · Dealer hits soft 17 · 3:2 · Late surrender" and the second-card, doubling and split rules.
export function ruleSummary(settings) {
  const parts = visibleIn(settings).filter((rule) => rule.summary);
  return [1, 2].map((line) => parts.filter((rule) => rule.summary.line === line).map((rule) => rule.summary.text(settings[rule.key], settings)).join(" · "));
}

// The odds in words: "3 to 2" / "6 to 5" (the felt's payout line and the rules sheet).
const blackjackOdds = (settings) => (settings.blackjackPayout === BlackjackPayouts.SIX_FIVE ? "6 to 5" : "3 to 2");

// What the table's felt prints (#81, DESIGN section 5): `pay` (the payout line), `rules` (soft 17 and the hole-card mode, joined by " · ") and
// `insurance` ("" when insurance is off). The same words as Settings' controls and the rules sheet: change them here only.
const HOLE_PRINT = { [US_PEEK]: "Dealer peeks", [US_NO_PEEK]: "No peek", [EU]: "No second card" };
export function feltPrint(settings) {
  return {
    pay: `Blackjack Pays ${blackjackOdds(settings)}`,
    soft: settings.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands on all 17s",
    mode: HOLE_PRINT[settings.dealerHoleBehaviour],
    insurance: settings.insurance ? "Insurance pays 2 to 1" : "",
  };
}

// The sheet's own sentences (the mockup's rules sheet, L1-23): full sentences, where the felt and the Settings summaries are short phrases.
const SHEET_HOLE = { [US_PEEK]: "The dealer peeks for blackjack before you play", [US_NO_PEEK]: "The dealer has a hole card but doesn't check it", [EU]: "No second card: the dealer takes it after you play" };
const SHEET_DOUBLE_ON = { [DoubleOn.ANY]: "any two cards", [DoubleOn.NINE_TO_ELEVEN]: "a hard 9, 10 or 11", [DoubleOn.TEN_TO_ELEVEN]: "a hard 10 or 11" };

// The Table rules sheet (#87): [{ title, items }] for the groups Payouts, Dealer, Doubling, Splitting and Surrender, each line plain English and worked out
// from `settings`. The deck and split-limit lines reuse the catalog's summaries, the rest are the sheet's own sentences; `showWhen` (through `hiddenKeys`)
// leaves out a rule the mode makes meaningless; even money only when offered (`offersAtDeal`: insurance on, and a blackjack that is not paid at once).
export function sheetGroups(settings) {
  const shown = (key) => !hiddenKeys(settings).has(key);
  const summaryOf = (key) => RULE_CATALOG.find((rule) => rule.key === key).summary.text(settings[key], settings);
  const evenMoney = settings.insurance && (settings.dealerHoleBehaviour === US_PEEK || !bjPaysWithoutPeek(settings));
  const groups = [
    ["Payouts", [
      `Blackjack pays ${blackjackOdds(settings)}`,
      "Other wins pay 1 to 1",
      settings.insurance ? "Insurance pays 2 to 1 when the dealer shows an ace" : "No insurance or even money",
      evenMoney && "Even money on your blackjack against a dealer ace",
    ]],
    ["Dealer", [
      `${summaryOf("deckCount")} in the shoe`,
      settings.dealerHitsSoft17 ? "The dealer hits soft 17" : "The dealer stands on all 17s",
      SHEET_HOLE[settings.dealerHoleBehaviour],
      shown("noHoleCardLoss") && (settings.noHoleCardLoss === NoHoleCardLoss.ALL ? "A dealer blackjack takes everything you staked" : "A dealer blackjack takes only your first bet"),
    ]],
    ["Doubling", [
      `Double on ${SHEET_DOUBLE_ON[settings.doubleOn]}`,
      settings.doubleAfterSplit ? "Double after a split" : "No double after a split",
      settings.tripleDown && "Triple down allowed",
      settings.doubleFaceDown && "The double card is dealt face down",
    ]],
    ["Splitting", [
      summaryOf("maxSplitHands"),
      "Any two ten-value cards split",
      settings.hitSplitAces ? "Split aces may be hit" : "Split aces get one card each",
      shown("resplitAces") && (settings.resplitAces ? "Aces may be split again" : "Aces split once"),
      settings.splitDeal === "both" ? "Both split hands get their second card at once" : "Each split hand gets its second card when you reach it",
    ]],
    ["Surrender", [surrenderText[settings.surrender]]],
  ];
  return groups.map(([title, items]) => ({ title, items: items.filter(Boolean) }));
}
