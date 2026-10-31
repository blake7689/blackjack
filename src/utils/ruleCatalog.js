import { DealerHoleOptions } from "./constants/dealerHoleOptions";
import { BlackjackPayouts, DoubleOn, NoHoleCardLoss, SurrenderOptions } from "./constants/ruleOptions";
import { RESET_SETTINGS, SETTING_RANGES } from "./gameReducer";
import { isEU } from "./blackjackLogic";
import { edgeDelta } from "./houseEdge";

// The table rules in plain language (#91). This file is the ONLY home of rule wording: Settings (and later the rules sheet) read it.
// An entry has the shape of a Settings control: { key, label(value), input, options?, range?, hint?, showWhen?(settings) }, plus:
//   group     the Customize group it sits in (GROUPS)
//   choices   the segmented-control choices when there are no `options` (a checkbox gets On / Off)
//   selected  (settings) -> the value shown as chosen, when it is not just settings[key]
//   patch     (value, settings) -> the settings to write, when it is not just { [key]: value }
//   summary   { line: 1 | 2, text(value, settings) } one phrase of a preset tile's summary
// `hint` is one plain line (a string, or `hint` on each option) shown under the control. Each PR that adds a rule adds its entry here.
const { US_PEEK, US_NO_PEEK, EU } = DealerHoleOptions;

export const GROUPS = ["Shoe", "Dealer", "Payouts", "Doubling", "Splitting", "Surrender"];

export const RULES_TITLE = "Table rules";
export const CUSTOMIZE_TITLE = "Customize rules";
export const VARIATIONS_TITLE = "House variations";
export const ADVANCED_TITLE = "Advanced";
export const EDGE_NOTE = "House edge is an estimate for a player who uses basic strategy and declines insurance: published rule-by-rule figures added together, so it is approximate. A plus sign means a worse deal for you. Insurance, House variations and Advanced options are not counted.";
export const VARIATIONS_NOTE = "These change how this app deals, not casino rules. They are not counted in the house edge.";
export const ADVANCED_NOTE = "These change how this app deals, not casino rules. A change here makes the table Custom. They are not counted in the house edge.";

// A change of dealer mode also moves blackjackPaysImmediately to the new mode's preset pairing (true with a peek, false without a hole
// card or with no peek), but only while it still holds the pairing of the current mode: a value the player set on purpose stays.
const modePatch = (mode, s) => ({
  dealerHoleBehaviour: mode,
  ...(s.blackjackPaysImmediately === (s.dealerHoleBehaviour === US_PEEK) && { blackjackPaysImmediately: mode === US_PEEK }),
});

const ON_OFF = [{ value: true, label: "On" }, { value: false, label: "Off" }];
const surrenderText = { none: "No surrender", late: "Late surrender", early: "Early surrender", earlyNoAce: "Early surrender (not against an ace)" };

export const RULE_CATALOG = [
  { key: "deckCount", group: "Shoe", label: (v) => `Deck size: ${v}`, input: "range", range: SETTING_RANGES.deckCount,
    choices: [1, 2, 4, 6, 8].map((n) => ({ value: n, label: String(n) })), extraLabel: (v) => `${v} decks`,
    summary: { line: 1, text: (v) => `${v} deck${v === 1 ? "" : "s"}` } },
  { key: "dealerHoleBehaviour", group: "Dealer", label: () => "Second Card", input: "select", options: [
      { value: US_PEEK, label: "Dealer peeks for blackjack", hint: "The dealer checks for blackjack before you play." },
      { value: EU, label: "Dealt after you play", hint: "The dealer takes the second card after you play." },
    ],
    // No peek (US) shows as "peeks"; the Advanced checkbox "Dealer doesn't check the hole card" says the rest.
    selected: (s) => (s.dealerHoleBehaviour === US_NO_PEEK ? US_PEEK : s.dealerHoleBehaviour),
    patch: (v, s) => modePatch(v, s),
    summary: { line: 2, text: (v, s) => (v === EU ? "Dealt after you play" : s.dealerHoleBehaviour === US_NO_PEEK ? "Dealer doesn't check the hole card" : "Dealer peeks") } },
  { key: "dealerHitsSoft17", group: "Dealer", label: () => "Soft 17", input: "checkbox",
    choices: [{ value: false, label: "Stands" }, { value: true, label: "Hits" }],
    hint: "Hits: the dealer draws on a hand like ace-6. Stands: the dealer stands on every 17.",
    summary: { line: 1, text: (v) => (v ? "Dealer hits soft 17" : "Dealer stands on soft 17") } },
  { key: "noHoleCardLoss", group: "Dealer", label: () => "If the Dealer Has Blackjack, You Lose", input: "select",
    showWhen: (s) => s.dealerHoleBehaviour !== US_PEEK, options: [
      { value: NoHoleCardLoss.ALL, label: "Everything you staked", hint: "The dealer's blackjack takes doubles and splits too." },
      { value: NoHoleCardLoss.ORIGINAL, label: "Only your first bet", hint: "Doubles and splits are given back (a hand that busted is not)." },
    ],
    summary: { line: 2, text: (v) => (v === NoHoleCardLoss.ALL ? "Dealer blackjack takes everything" : "Dealer blackjack takes only your first bet") } },
  { key: "blackjackPayout", group: "Payouts", label: () => "Blackjack Pays", input: "select", options: [
      { value: BlackjackPayouts.THREE_TWO, label: "3:2", hint: "A $10 blackjack wins $15." },
      { value: BlackjackPayouts.SIX_FIVE, label: "6:5", hint: "A $10 blackjack wins only $12, which is worse for you." },
    ], summary: { line: 1, text: (v) => v } },
  { key: "insurance", group: "Payouts", label: () => "Insurance and Even Money", input: "checkbox",
    hint: "When the dealer shows an ace you may insure for half your bet; it pays 2:1 if the dealer has blackjack. With your own blackjack you may take even money (1:1) at once." },
  { key: "doubleOn", group: "Doubling", label: () => "Double On", input: "select", options: [
      { value: DoubleOn.ANY, label: "Any two cards", hint: "You may double on any first two cards." },
      { value: DoubleOn.NINE_TO_ELEVEN, label: "Hard 9 to 11", hint: "You may double only on a hard total of 9, 10 or 11 (no ace counted as 11)." },
      { value: DoubleOn.TEN_TO_ELEVEN, label: "Hard 10 to 11", hint: "You may double only on a hard total of 10 or 11 (no ace counted as 11)." },
    ], summary: { line: 2, text: (v) => `Double on ${v === DoubleOn.ANY ? "any two cards" : v === DoubleOn.NINE_TO_ELEVEN ? "hard 9 to 11" : "hard 10 to 11"}` } },
  { key: "doubleAfterSplit", group: "Doubling", label: () => "Double After a Split", input: "checkbox", hint: "Allows doubling on a hand made by splitting." },
  { key: "maxSplitHands", group: "Splitting", label: (v) => `Max Hands After Splits: ${v === 0 ? "Unlimited" : v}`, input: "select",
    options: [2, 3, 4].map((n) => ({ value: n, label: String(n) })).concat({ value: 0, label: "Unlimited" }),
    summary: { line: 2, text: (v) => (v === 0 ? "Split any number of hands" : `Split up to ${v} hands`) } },
  { key: "resplitAces", group: "Splitting", label: () => "Resplit Aces", input: "checkbox", hint: "Allows splitting again when a split ace gets another ace.",
    showWhen: (s) => s.maxSplitHands !== 2 }, // with two hands there is no second split to make
  { key: "hitSplitAces", group: "Splitting", label: () => "Hit Split Aces", input: "checkbox", hint: "Off: each split ace gets one card and stands." },
  { key: "surrender", group: "Surrender", label: () => "Surrender", input: "select", options: [
      { value: SurrenderOptions.NONE, label: "None", hint: "You can't give up a hand." },
      { value: SurrenderOptions.LATE, label: "Late", hint: "Give up half your bet on your first two cards. If the dealer has blackjack, you lose the whole bet." },
      { value: SurrenderOptions.EARLY, label: "Early", hint: "Give up half your bet before the dealer checks for blackjack. You keep the half even if the dealer has one." },
      { value: SurrenderOptions.EARLY_NO_ACE, label: "Early (not against an ace)", hint: "Like Early, but not offered when the dealer shows an ace." },
    ], summary: { line: 1, text: (v) => surrenderText[v] } },
];

// The app's own toggles (not casino rules), in the House variations and Advanced groups. `id` names the control when it is not the key.
export const APP_TOGGLES = [
  { key: "tripleDown", section: "variations", label: () => "Triple Down", input: "checkbox" },
  { key: "tripleDrawsOnBust", section: "variations", label: () => "Always Draw the Second Triple Card, Even on a Bust", input: "checkbox",
    disabledWhen: (s) => !s.tripleDown },
  { key: "doubleFaceDown", section: "variations", label: () => "Double Down Card Face Down", input: "checkbox" },
  { key: "blackJackOnSplit", section: "advanced", label: () => "Blackjack on Split", input: "checkbox" },
  { key: "dealerDrawsOnPlayerBlackjack", section: "advanced", label: () => "EU: Dealer Draws 2nd Card on a Player Blackjack", input: "checkbox" },
  // With no dealer card to compare against, a blackjack must pay at once.
  { key: "blackjackPaysImmediately", section: "advanced", label: () => "Blackjack Pays Immediately", input: "checkbox",
    forcedOn: (s) => isEU(s) && !s.dealerDrawsOnPlayerBlackjack },
  { key: "dealerDrawsOnceOn21", section: "advanced", label: () => "EU: Dealer Draws Only Once Against a 21", input: "checkbox" },
  { key: "dealerDrawsOnPlayerBust", section: "advanced", label: () => "Dealer Draws 2nd Card After a Player Bust", input: "checkbox" },
  { key: "dealerHoleBehaviour", id: "dealerHoleNoCheck", section: "advanced", label: () => "Dealer doesn't check the hole card", input: "checkbox",
    showWhen: (s) => s.dealerHoleBehaviour !== EU,
    selected: (s) => s.dealerHoleBehaviour === US_NO_PEEK,
    patch: (v, s) => modePatch(v ? US_NO_PEEK : US_PEEK, s) },
];

// The rules that apply to these settings (a rule that does not apply has no effect and is not shown).
export const visibleIn = (settings) => RULE_CATALOG.filter((rule) => rule.showWhen?.(settings) ?? true);
export const togglesIn = (section, settings) => APP_TOGGLES.filter((t) => t.section === section && (t.showWhen?.(settings) ?? true));

export const selectedValue = (rule, settings) => rule.selected?.(settings) ?? settings[rule.key];
export const patchFor = (rule, value, settings) => rule.patch?.(value, settings) ?? { [rule.key]: value };

// Writing `patch` changes something (a click on what is already chosen must do nothing: it would still reshuffle the shoe).
export const changes = (patch, settings) => Object.entries(patch).some(([key, value]) => settings[key] !== value);
// Writing `patch` deals a new shoe and resets the table (the same test GameProvider uses).
export const resetsTable = (patch) => Object.keys(patch).some((key) => RESET_SETTINGS.includes(key));

// The choices of a rule's segmented control for these settings: { value, label, hint, selected, patch, delta }.
// `delta` is the change in the house edge estimate if only this rule is switched to the choice (0 for the chosen one).
// A saved value the control does not list (3, 5 or 7 decks) is added as one extra chosen choice.
export function choicesFor(rule, settings) {
  const value = selectedValue(rule, settings);
  const list = rule.choices ?? rule.options ?? ON_OFF;
  const all = list.some((c) => c.value === value) ? list : [...list, { value, label: rule.extraLabel(value) }].sort((a, b) => a.value - b.value);
  return all.map((c) => {
    const patch = patchFor(rule, c.value, settings);
    const selected = c.value === value;
    return { value: c.value, label: c.label, hint: c.hint, selected, patch, delta: selected ? 0 : edgeDelta(settings, patch) };
  });
}

// The two lines of a preset tile: "6 decks · Dealer hits soft 17 · 3:2 · Late surrender" and the second-card, doubling and split rules.
export function ruleSummary(settings) {
  const parts = visibleIn(settings).filter((rule) => rule.summary);
  return [1, 2].map((line) => parts.filter((rule) => rule.summary.line === line).map((rule) => rule.summary.text(selectedValue(rule, settings), settings)).join(" · "));
}
