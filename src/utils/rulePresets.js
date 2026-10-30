import { DealerHoleOptions } from "./constants/dealerHoleOptions";
import { BlackjackPayouts, DoubleOn, NoHoleCardLoss } from "./constants/ruleOptions";

// Rules presets (#35 A5, #91): each sets every rule setting at once. Any other combination is "Custom".
// Vegas is the default: initialGameState.settings equals it. Sources are in the spec (Specs\Regional rules.md).
// The Advanced values (the last five keys) are the real-table behaviour in every preset; a peek pays a blackjack at once.
const advanced = (peeks) => ({
  blackJackOnSplit: false,
  dealerDrawsOnPlayerBust: false,
  dealerDrawsOnceOn21: false,
  dealerDrawsOnPlayerBlackjack: true,
  blackjackPaysImmediately: peeks,
});

const afterPlayers = DealerHoleOptions.EU; // no hole card: the dealer takes its second card after the players act

export const RULE_PRESETS = {
  Vegas: {
    dealerHoleBehaviour: DealerHoleOptions.US_PEEK, deckCount: 6, dealerHitsSoft17: true,
    blackjackPayout: BlackjackPayouts.THREE_TWO, doubleOn: DoubleOn.ANY, doubleAfterSplit: true,
    maxSplitHands: 4, resplitAces: false, hitSplitAces: false, noHoleCardLoss: NoHoleCardLoss.ORIGINAL,
    ...advanced(true),
  },
  "Atlantic City": {
    dealerHoleBehaviour: afterPlayers, deckCount: 8, dealerHitsSoft17: false,
    blackjackPayout: BlackjackPayouts.THREE_TWO, doubleOn: DoubleOn.ANY, doubleAfterSplit: true,
    maxSplitHands: 4, resplitAces: false, hitSplitAces: false, noHoleCardLoss: NoHoleCardLoss.ORIGINAL,
    ...advanced(false),
  },
  Europe: {
    dealerHoleBehaviour: afterPlayers, deckCount: 6, dealerHitsSoft17: false,
    blackjackPayout: BlackjackPayouts.THREE_TWO, doubleOn: DoubleOn.NINE_TO_ELEVEN, doubleAfterSplit: true,
    maxSplitHands: 0, resplitAces: false, hitSplitAces: false, noHoleCardLoss: NoHoleCardLoss.ALL,
    ...advanced(false),
  },
  Australia: {
    dealerHoleBehaviour: afterPlayers, deckCount: 6, dealerHitsSoft17: false,
    blackjackPayout: BlackjackPayouts.THREE_TWO, doubleOn: DoubleOn.NINE_TO_ELEVEN, doubleAfterSplit: true,
    maxSplitHands: 3, resplitAces: false, hitSplitAces: false, noHoleCardLoss: NoHoleCardLoss.ORIGINAL,
    ...advanced(false),
  },
  Singapore: {
    dealerHoleBehaviour: afterPlayers, deckCount: 6, dealerHitsSoft17: false,
    blackjackPayout: BlackjackPayouts.THREE_TWO, doubleOn: DoubleOn.ANY, doubleAfterSplit: true,
    maxSplitHands: 3, resplitAces: false, hitSplitAces: false, noHoleCardLoss: NoHoleCardLoss.ORIGINAL,
    ...advanced(false),
  },
};

export const CUSTOM = "Custom";

export function rulePresetOf(settings) {
  return Object.keys(RULE_PRESETS).find((name) =>
    Object.entries(RULE_PRESETS[name]).every(([key, value]) => settings[key] === value)) ?? CUSTOM;
}
