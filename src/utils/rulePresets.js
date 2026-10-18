import { DealerHoleOptions } from "./constants/dealerHoleOptions";

// Rules presets (#35 A5): each sets every rule setting at once. Any other combination is "Custom".
export const RULE_PRESETS = {
  US: {
    dealerHoleBehaviour: DealerHoleOptions["Draw Early - Check_US"],
    blackjackPaysImmediately: true,
    dealerDrawsOnPlayerBlackjack: true,
    dealerDrawsOnPlayerBust: false,
    dealerDrawsOnceOn21: false,
  },
  EU: {
    dealerHoleBehaviour: DealerHoleOptions["Draw After_EU"],
    blackjackPaysImmediately: false,
    dealerDrawsOnPlayerBlackjack: true,
    dealerDrawsOnPlayerBust: false,
    dealerDrawsOnceOn21: false,
  },
};

export const CUSTOM = "Custom";

export function rulePresetOf(settings) {
  return Object.keys(RULE_PRESETS).find((name) =>
    Object.entries(RULE_PRESETS[name]).every(([key, value]) => settings[key] === value)) ?? CUSTOM;
}
