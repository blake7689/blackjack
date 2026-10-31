import { DealerHoleOptions } from "./constants/dealerHoleOptions";
import { BlackjackPayouts, DoubleOn, NoHoleCardLoss, SurrenderOptions } from "./constants/ruleOptions";
import { SETTING_RANGES } from "./gameReducer";

// The table rules in plain language (#91). Settings reads its controls from here, so the words live in one place.
// An entry has the shape of a Settings control: { key, label(value), input, options?, range?, hint?, showWhen?(settings) }.
// `hint` is one plain line (a string, or `hint` on each option of a select) shown under the control.
// Each PR that adds a rule adds its entry here.
export const RULE_CATALOG = [
  { key: "deckCount", label: (v) => `Deck size: ${v}`, input: "range", range: SETTING_RANGES.deckCount },
  { key: "maxSplitHands", label: (v) => `Max Hands After Splits: ${v === 0 ? "Unlimited" : v}`, input: "select",
    options: [2, 3, 4].map((n) => ({ value: n, label: String(n) })).concat({ value: 0, label: "Unlimited" }) },
  { key: "dealerHitsSoft17", label: () => "Dealer Hits Soft 17", input: "checkbox",
    hint: "On: the dealer draws on a hand like ace-6. Off: the dealer stands on every 17." },
  { key: "blackjackPayout", label: () => "Blackjack Pays", input: "select", options: [
    { value: BlackjackPayouts.THREE_TWO, label: "3:2", hint: "A $10 blackjack wins $15." },
    { value: BlackjackPayouts.SIX_FIVE, label: "6:5", hint: "A $10 blackjack wins only $12, which is worse for you." },
  ] },
  { key: "doubleOn", label: () => "Double On", input: "select", options: [
    { value: DoubleOn.ANY, label: "Any two cards", hint: "You may double on any first two cards." },
    { value: DoubleOn.NINE_TO_ELEVEN, label: "Hard 9 to 11", hint: "You may double only on a hard total of 9, 10 or 11 (no ace counted as 11)." },
    { value: DoubleOn.TEN_TO_ELEVEN, label: "Hard 10 to 11", hint: "You may double only on a hard total of 10 or 11 (no ace counted as 11)." },
  ] },
  { key: "doubleAfterSplit", label: () => "Double After a Split", input: "checkbox", hint: "Allows doubling on a hand made by splitting." },
  { key: "resplitAces", label: () => "Resplit Aces", input: "checkbox", hint: "Allows splitting again when a split ace gets another ace." },
  { key: "hitSplitAces", label: () => "Hit Split Aces", input: "checkbox", hint: "Off: each split ace gets one card and stands." },
  { key: "noHoleCardLoss", label: () => "If the Dealer Has Blackjack, You Lose", input: "select",
    showWhen: (s) => s.dealerHoleBehaviour !== DealerHoleOptions.US_PEEK, options: [
      { value: NoHoleCardLoss.ALL, label: "Everything you staked", hint: "The dealer's blackjack takes doubles and splits too." },
      { value: NoHoleCardLoss.ORIGINAL, label: "Only your first bet", hint: "Doubles and splits are given back (a hand that busted is not)." },
    ] },
  { key: "surrender", label: () => "Surrender", input: "select", options: [
    { value: SurrenderOptions.NONE, label: "None", hint: "You can't give up a hand." },
    { value: SurrenderOptions.LATE, label: "Late", hint: "Give up half your bet on your first two cards. If the dealer has blackjack, you lose the whole bet." },
    { value: SurrenderOptions.EARLY, label: "Early", hint: "Give up half your bet before the dealer checks for blackjack. You keep the half even if the dealer has one." },
    { value: SurrenderOptions.EARLY_NO_ACE, label: "Early (not against an ace)", hint: "Like Early, but not offered when the dealer shows an ace." },
  ] },
  { key: "insurance", label: () => "Insurance and Even Money", input: "checkbox",
    hint: "When the dealer shows an ace you may insure for half your bet; it pays 2:1 if the dealer has blackjack. With your own blackjack you may take even money (1:1) at once." },
];

// The rules that apply to these settings (a rule that does not apply has no effect and is not shown).
export const visibleIn = (settings) => RULE_CATALOG.filter((rule) => rule.showWhen?.(settings) ?? true);
