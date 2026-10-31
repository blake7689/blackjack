import { DealerHoleOptions } from "./constants/dealerHoleOptions";
import { BlackjackPayouts, DoubleOn, NoHoleCardLoss, SurrenderOptions } from "./constants/ruleOptions";

// Approximate house edge of a rule set (#91), in percent, for a basic-strategy player who declines insurance and even money.
// It is a baseline plus a sum of rule effects, so it is an ESTIMATE: the rules interact a little (see "Accuracy").
//
// Sources, both read on 2026-10-31:
//  - Rule effects: https://wizardofodds.com/games/blackjack/rule-variations/ ("Last updated: Aug 03, 2026"), relative to 8 decks,
//    dealer stands on soft 17, double any two cards, double after a split, split to 4 hands, 3:2, dealer peeks, no surrender.
//    The page gives the effect on the PLAYER's return; each figure below is the same number with the sign flipped (house edge).
//    Verbatim from the page (player): Dealer hits on soft 17 -0.22 | Blackjack pays 6-5 -1.39 | double on 9-11 only -0.09 |
//    double on 10,11 only -0.18 | may not double after splitting -0.14 | may resplit aces +0.08 | may draw to split aces +0.19 |
//    late surrender against ten +0.07, against ace +0.00 | early surrender against ten +0.24, against ace +0.39 |
//    European no hole card -0.11 | no-peek ace showing -0.01, ten showing -0.10 | BB+1 -0.01 | split to only 3 hands -0.01 |
//    single deck +0.48 | double deck +0.19 | four decks +0.06 | five decks +0.03 | six decks +0.02.
//  - Baseline: https://wizardofodds.com/games/blackjack/calculator/ (the page ships its edge table in inline JS). For 8 decks, S17,
//    DAS, double any, split to 4, no RSA, no HSA, "loses only original bet against dealer BJ" yes, no surrender, 3:2 the table says
//    0.430961 ("optimal"); the calculator adds 0.0159 for 8 decks to get "Basic strategy with cut card": 0.446861. That column is the
//    one the variations page models (deltas match: H17 0.214, 9-11 0.094, 10-11 0.188, no DAS 0.142, HSA 0.190, 1 deck 0.478).
//
// UNVERIFIED (no published figure; flagged in the PR):
//  - 3 and 7 decks (linear between the listed 2/4 and 6/8);
//  - split to 2 hands: the page's "may not resplit" says +0.10, the calculator's table says +0.055; the calculator's is used;
//  - unlimited splits (taken as 4 hands: the calculator stops at 4);
//  - the interaction between rules (the model is additive);
//  - early surrender with no hole card, and "early, not against an ace" (taken as the figure against a ten only).
//
// Accuracy: against the calculator's table (3456 rule sets x 3:2 and 6:5) the largest miss is 0.28 (1 deck, 10-11 doubles, RSA and HSA);
// for 4+ decks, double any/9-11 and splits to 3+, the largest is 0.07 and 95% are within 0.05. The presets, compared with the
// calculator's own figure for the same rules (cut-card column): Vegas +0.026, Atlantic City +0.016, Europe -0.007, Australia +0.006.
// Singapore has no calculator figure (early surrender is not in it). 6:5 is NOT pinned against the calculator: its own 6:5 add-on is
// 1.36 at 6 decks, the page says 1.39 (Vegas 6:5 would be 1.9102 there against 1.9669 here, a 0.057 gap); the page figure is used.

export const BASELINE = 0.4469;

// House edge change per deck count, from the page. Anything between two listed counts (3, 7) is interpolated linearly.
const DECK_EFFECT = [[1, -0.48], [2, -0.19], [4, -0.06], [5, -0.03], [6, -0.02], [8, 0]];

export function deckEffect(count) {
  const n = Math.min(8, Math.max(1, count));
  const above = DECK_EFFECT.findIndex(([decks]) => decks >= n);
  const [hiDecks, hi] = DECK_EFFECT[above];
  if (hiDecks === n) return hi;
  const [loDecks, lo] = DECK_EFFECT[above - 1];
  return lo + ((hi - lo) * (n - loDecks)) / (hiDecks - loDecks);
}

const DOUBLE_ON = { [DoubleOn.ANY]: 0, [DoubleOn.NINE_TO_ELEVEN]: 0.09, [DoubleOn.TEN_TO_ELEVEN]: 0.18 };
// Early = 0.24 against a ten + 0.39 against an ace; early not against an ace = the ten only.
const SURRENDER = { [SurrenderOptions.NONE]: 0, [SurrenderOptions.LATE]: -0.07, [SurrenderOptions.EARLY]: -0.63, [SurrenderOptions.EARLY_NO_ACE]: -0.24 };
// Hands after splitting (0 = no limit, taken as 4: UNVERIFIED). 2 hands is the calculator's figure (see above).
const SPLIT_TO = { 2: 0.05, 3: 0.01, 4: 0, 0: 0 };
// A dealer blackjack found after the player added stakes (no hole card). "all" is the page's European no hole card.
// "original" is the engine's refund of added stakes on every hand that did not bust, which is the page's BB+1 (-0.01 for the
// player); the engine differs only when the first hand busts and a later one does not, which slightly favours the player.
const NO_HOLE_LOSS = { [NoHoleCardLoss.ALL]: 0.11, [NoHoleCardLoss.ORIGINAL]: 0.01 };

const round = (x) => Math.round(x * 1e6) / 1e6; // no float noise: 1.39 stays 1.39

// The house edge in percent. Reads only the table rules; insurance, the Advanced options and the House variations are not counted.
export function houseEdge(s) {
  let edge = BASELINE + deckEffect(s.deckCount) + DOUBLE_ON[s.doubleOn] + SURRENDER[s.surrender] + (SPLIT_TO[s.maxSplitHands] ?? 0);
  if (s.dealerHitsSoft17) edge += 0.22;
  if (s.blackjackPayout === BlackjackPayouts.SIX_FIVE) edge += 1.39;
  if (!s.doubleAfterSplit) edge += 0.14;
  if (s.resplitAces && s.maxSplitHands !== 2) edge -= 0.08; // with 2 hands there is no second split to make
  if (s.hitSplitAces) edge -= 0.19;
  if (s.dealerHoleBehaviour !== DealerHoleOptions.US_PEEK) edge += (NO_HOLE_LOSS[s.noHoleCardLoss] ?? 0); // a peek finds the blackjack first
  return round(edge);
}

// How much the estimate moves when `patch` is applied to `settings` (positive = worse for the player).
export const edgeDelta = (settings, patch) => round(houseEdge({ ...settings, ...patch }) - houseEdge(settings));

// "0.6%": one decimal, as on a preset tile.
export function formatEdge(edge) {
  return `${(Math.round(edge * 10) / 10).toFixed(1)}%`;
}

// "+1.39%" / "-0.07%": two decimals, as in the source table; "" when it rounds to nothing.
export function formatDelta(delta) {
  const rounded = Math.round(delta * 100) / 100;
  return rounded === 0 ? "" : `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(2)}%`;
}
