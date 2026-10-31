// The saved table rules the tests play with (version 4): the Vegas preset, written out so a later change to the defaults moves no test.
// Kept free of @playwright/test so the vitest preset test can import it.
export const VEGAS = {
  v: 4, deckCount: 6, dealerHoleBehaviour: 'drawEarly_Check', dealerHitsSoft17: true, blackjackPayout: '3:2', doubleOn: 'any',
  doubleAfterSplit: true, maxSplitHands: 4, resplitAces: false, hitSplitAces: false, noHoleCardLoss: 'original',
  blackjackPaysImmediately: true, blackJackOnSplit: false, dealerDrawsOnPlayerBust: false, dealerDrawsOnceOn21: false,
  dealerDrawsOnPlayerBlackjack: true, surrender: 'late', insurance: true,
};
