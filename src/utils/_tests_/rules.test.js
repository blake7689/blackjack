import { describe, it, expect } from "vitest";
import { playRound, stackedShoe, Modes, HandResult, HandStatus } from "./stackedShoe";
import { canSplit, settleHand } from "../blackjackLogic";
import { drawCardFromShoe, cardsRemaining, trueCount } from "../cards";

// Card order out of the shoe: player, dealer up, player, dealer hole (US modes only), then draws.
// Bets are 10. Payout is what returns to the balance, stake included (win 2x, blackjack 2.5x, push 1x).

const { WIN, LOSE, PUSH } = HandResult;

describe("US peek (dealer checks for blackjack)", () => {
  it("pays a player blackjack 3:2 at once and the dealer draws nothing", () => {
    const r = playRound({ cards: ["A", "10", "K", "6", "5"] });
    expect(r.results).toEqual([WIN]);
    expect(r.payout).toBe(25);
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.cardsLeft).toBe(1);
  });

  it("ends the round on a dealer blackjack before the player acts", () => {
    const r = playRound({ cards: ["10", "A", "9", "K"] });
    expect(r.afterDeal.hands[0].status).toBe(HandStatus.DONE);
    expect(r.afterDeal.dealer.cards).toHaveLength(2);
    expect(r.afterDeal.dealer.isBlackjack).toBe(true);
    expect(r.results).toEqual([LOSE]);
    expect(r.payout).toBe(0);
  });

  it("pushes blackjack against blackjack", () => {
    const r = playRound({ cards: ["A", "A", "K", "K"] });
    expect(r.results).toEqual([PUSH]);
    expect(r.payout).toBe(10);
  });

  it("keeps the hole card hidden when the dealer has no blackjack", () => {
    const r = playRound({ cards: ["10", "10", "9", "7"] });
    expect(r.afterDeal.dealer.cards).toHaveLength(1);
    expect(r.afterDeal.hands[0].status).toBe(HandStatus.PLAYING);
    expect(r.dealer.cards).toHaveLength(2);
  });

  it("dealer hits 16 and wins with 21", () => {
    const r = playRound({ cards: ["10", "10", "K", "6", "5"] });
    expect(r.dealer.total).toBe(21);
    expect(r.dealer.isBlackjack).toBe(false);
    expect(r.results).toEqual([LOSE]);
  });

  it("dealer busts and the player wins 2x", () => {
    const r = playRound({ cards: ["10", "10", "9", "6", "K"] });
    expect(r.dealer.isBusted).toBe(true);
    expect(r.results).toEqual([WIN]);
    expect(r.payout).toBe(20);
  });

  it("dealer stands on soft 17", () => {
    const r = playRound({ cards: ["10", "A", "8", "6", "5"] });
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.dealer.total).toBe(17);
    expect(r.results).toEqual([WIN]);
  });

  it("pushes equal totals", () => {
    const r = playRound({ cards: ["10", "10", "K", "K"] });
    expect(r.results).toEqual([PUSH]);
    expect(r.payout).toBe(10);
  });

  it("a bust loses and the dealer draws nothing", () => {
    const r = playRound({ cards: ["10", "10", "6", "6", "K", "5"], actions: ["hit"] });
    expect(r.hands[0].isBusted).toBe(true);
    expect(r.results).toEqual([LOSE]);
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.cardsLeft).toBe(1);
  });

  it("a hit to 21 stands automatically and pays 2x, not 2.5x", () => {
    const r = playRound({ cards: ["5", "10", "6", "7", "K"], actions: ["hit", "hit"] });
    expect(r.hands[0].cards).toHaveLength(3);
    expect(r.hands[0].isBlackjack).toBe(false);
    expect(r.payout).toBe(20);
  });

  it("double takes one card, doubles the stake and pays on it", () => {
    const r = playRound({ cards: ["5", "10", "6", "7", "10"], actions: ["double"] });
    expect(r.hands[0].cards).toHaveLength(3);
    expect(r.staked).toBe(20);
    expect(r.results).toEqual([WIN]);
    expect(r.payout).toBe(40);
  });

  it("double that loses loses the doubled stake", () => {
    const r = playRound({ cards: ["5", "10", "6", "9", "2"], actions: ["double"] });
    expect(r.results).toEqual([LOSE]);
    expect(r.staked).toBe(20);
    expect(r.payout).toBe(0);
  });
});

describe("triple down", () => {
  const triple = { tripleDown: true };

  it("11 plus two cards: triples the stake, draws both cards, ends the turn and pays on it", () => {
    const r = playRound({ cards: ["5", "10", "6", "7", "4", "5"], rules: triple, actions: ["triple"] });
    expect(r.hands[0].cards).toHaveLength(4);
    expect(r.hands[0].isTriple).toBe(true);
    expect(r.staked).toBe(30);
    expect(r.results).toEqual([WIN]);
    expect(r.payout).toBe(60);
  });

  it("a first card that busts draws no second card unless tripleDrawsOnBust is on", () => {
    const cards = ["6", "10", "6", "7", "K", "5"];
    const one = playRound({ cards, rules: triple, actions: ["triple"] });
    expect(one.hands[0].cards).toHaveLength(3);
    expect(one.hands[0].isBusted).toBe(true);
    expect(one.payout).toBe(0);
    expect(one.staked).toBe(30);
    const two = playRound({ cards, rules: { ...triple, tripleDrawsOnBust: true }, actions: ["triple"] });
    expect(two.hands[0].cards).toHaveLength(4);
    expect(two.hands[0].isBusted).toBe(true);
    expect(two.results).toEqual([LOSE]);
    expect(two.staked).toBe(30);
  });

  it("a first card that makes 21 still draws the second", () => {
    const r = playRound({ cards: ["6", "10", "4", "7", "A", "2"], rules: triple, actions: ["triple"] });
    expect(r.hands[0].cards).toHaveLength(4);
    expect(r.hands[0].total).toBe(13);
  });

  it("works on a split hand, then the next hand plays", () => {
    const r = playRound({ cards: ["8", "10", "8", "7", "3", "10", "2", "K", "9"], rules: triple, actions: ["split", "triple", "stand"] });
    expect(r.hands.map((h) => h.bet)).toEqual([30, 10]);
    expect(r.hands.map((h) => h.cards.length)).toEqual([4, 2]);
  });

  it("pays 2x the tripled stake on a win, 1x on a push, nothing on a loss, with one 2x stake on the ledger", () => {
    const win = playRound({ cards: ["5", "10", "6", "7", "4", "5"], rules: triple, actions: ["triple"] });
    expect(win.state.creditEvents.map(({ kind, amount }) => [kind, amount])).toEqual([["local", -10], ["bet", 10], ["bet", 20], ["settle", 60]]);
    const push = playRound({ cards: ["5", "10", "6", "K", "4", "5"], rules: triple, actions: ["triple"] });
    expect([push.results, push.staked, push.payout]).toEqual([[PUSH], 30, 30]);
    const loss = playRound({ cards: ["5", "10", "6", "K", "2", "2"], rules: triple, actions: ["triple"] });
    expect([loss.results, loss.staked, loss.payout]).toEqual([[LOSE], 30, 0]);
  });

  it("a bust stays a bust, never a blackjack, whether or not the second card is drawn", () => {
    for (const tripleDrawsOnBust of [false, true]) {
      const r = playRound({ cards: ["6", "10", "6", "7", "K", "5"], rules: { ...triple, tripleDrawsOnBust }, actions: ["triple"] });
      expect(r.hands[0]).toMatchObject({ isBusted: true, isBlackjack: false, status: HandStatus.DONE, result: LOSE, bet: 30 });
      expect(r.payout).toBe(0);
    }
  });

  it("a hidden dealer blackjack (US no peek) takes all three stakes", () => {
    const r = playRound({ cards: ["5", "A", "6", "K", "4", "5"], mode: Modes.NO_PEEK, rules: triple, actions: ["triple"] });
    expect(r.hands[0].total).toBe(20);
    expect(r.results).toEqual([LOSE]);
    expect([r.staked, r.payout]).toEqual([30, 0]);
  });

  it("EU: the dealer draws its second card after the tripled hand, and a dealer blackjack still takes 3x", () => {
    const win = playRound({ cards: ["5", "10", "6", "4", "5", "7"], mode: Modes.EU, rules: triple, actions: ["triple"] });
    expect(win.dealer.cards).toHaveLength(2);
    expect([win.results, win.staked, win.payout]).toEqual([[WIN], 30, 60]);
    const lose = playRound({ cards: ["5", "A", "6", "4", "5", "K"], mode: Modes.EU, rules: triple, actions: ["triple"] });
    expect(lose.dealer.isBlackjack).toBe(true);
    expect([lose.results, lose.staked, lose.payout]).toEqual([[LOSE], 30, 0]);
  });

  it("EU: a tripled bust leaves the dealer with one card", () => {
    const r = playRound({ cards: ["6", "10", "6", "K", "5", "9"], mode: Modes.EU, rules: { ...triple, tripleDrawsOnBust: true }, actions: ["triple"] });
    expect(r.hands[0].cards).toHaveLength(4);
    expect(r.dealer.cards).toHaveLength(1);
    expect(r.cardsLeft).toBe(1);
  });
});

describe("splits", () => {
  it("plays both hands in order and settles each", () => {
    const r = playRound({ cards: ["8", "10", "8", "7", "3", "10", "9"], actions: ["split", "hit", "stand"] });
    expect(r.hands.map((h) => h.total)).toEqual([20, 18]);
    expect(r.results).toEqual([WIN, WIN]);
    expect(r.payout).toBe(40);
  });

  it("allows a double after a split", () => {
    const r = playRound({ cards: ["8", "10", "8", "7", "3", "10", "9"], actions: ["split", "double"] });
    expect(r.hands.map((h) => h.bet)).toEqual([20, 10]);
    expect(r.payout).toBe(60);
  });

  it("a split 21 is not blackjack by default", () => {
    const r = playRound({ cards: ["A", "10", "A", "7", "K", "9"], actions: ["split"] });
    expect(r.hands[0].isBlackjack).toBe(false);
    expect(r.payout).toBe(40);
  });

  it("a 21 on either split hand is not blackjack by default", () => {
    const r = playRound({ cards: ["K", "9", "10", "8", "A", "A"], actions: ["split"] });
    expect(r.hands.map((h) => h.isBlackjack)).toEqual([false, false]);
    expect(r.payout).toBe(40);
  });

  it("a split 21 pays 3:2 when blackjack-on-split is on", () => {
    const r = playRound({ cards: ["A", "10", "A", "7", "K", "9"], actions: ["split"], blackJackOnSplit: true });
    expect(r.hands[0].isBlackjack).toBe(true);
    expect(r.payout).toBe(45);
  });

  it("split aces get one card each and cannot hit", () => {
    const r = playRound({ cards: ["A", "10", "A", "7", "2", "3", "K"], actions: ["split", "hit", "hit"] });
    expect(r.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(r.cardsLeft).toBe(1);
  });

  it("a blackjack on the first split hand does not skip the second", () => {
    const r = playRound({ cards: ["10", "9", "K", "8", "A", "5", "6"], actions: ["split", "hit"], blackJackOnSplit: true });
    expect(r.hands[1].cards).toHaveLength(3);
    expect(r.hands[1].total).toBe(21);
  });

  it("splits a pair of equal value while the hand count is below the limit", () => {
    const [eight] = stackedShoe(["8"]);
    expect(canSplit({ cards: [eight, eight] }, 1, 2)).toBe(true);
    expect(canSplit({ cards: [eight, eight], isSplit: true }, 2, 2)).toBe(false);
    expect(canSplit({ cards: [eight, eight], isSplit: true }, 3, 4)).toBe(true);
    expect(canSplit({ cards: [eight, eight], isSplit: true }, 4, 4)).toBe(false);
    expect(canSplit({ cards: stackedShoe(["K", "10"]) }, 1, 2)).toBe(true);
    expect(canSplit({ cards: stackedShoe(["K", "9"]) }, 1, 2)).toBe(false);
    expect(canSplit({ cards: stackedShoe(["8", "8", "2"]) }, 1, 2)).toBe(false);
  });

  it("0 means unlimited", () => {
    const [eight] = stackedShoe(["8"]);
    expect(canSplit({ cards: [eight, eight], isSplit: true }, 9, 0)).toBe(true);
    expect(canSplit({ cards: stackedShoe(["A", "A"]), isSplit: true }, 9, 0)).toBe(false);
  });

  it("never resplits aces", () => {
    expect(canSplit({ cards: stackedShoe(["A", "A"]) }, 1, 4)).toBe(true);
    expect(canSplit({ cards: stackedShoe(["A", "A"]), isSplit: true }, 2, 4)).toBe(false);
  });
});

describe("D1: split more than once (maxSplitHands)", () => {
  // Deal 8 8 v 10 (hole 7), then each split's two cards: 8 3, 8 2, 10 9; then 10 and K for the hits.
  const eights = ["8", "10", "8", "7", "8", "3", "8", "2", "10", "9", "10", "K"];
  const fourSplits = ["split", "split", "split", "stand", "stand", "hit", "stand", "hit"];

  it("with 4 allowed, 8-8-8-8 ends in 4 hands played in order and settled separately", () => {
    const r = playRound({ cards: eights, actions: fourSplits, rules: { maxSplitHands: 4 } });
    expect(r.hands.map((h) => h.total)).toEqual([18, 17, 20, 21]);
    expect(r.results).toEqual([WIN, PUSH, WIN, WIN]);
    expect(r.staked).toBe(40);
    expect(r.payout).toBe(70);
    expect(r.cardsLeft).toBe(0);
  });

  it("takes one extra stake per split", () => {
    const r = playRound({ cards: eights, actions: fourSplits, rules: { maxSplitHands: 4 } });
    const stakes = r.state.creditEvents.filter((e) => e.kind === "bet" && !e.newRound);
    expect(stakes.map((e) => e.amount)).toEqual([10, 10, 10]);
  });

  it("stops at the limit", () => {
    const r = playRound({ cards: eights, actions: fourSplits, rules: { maxSplitHands: 3 } });
    expect(r.hands).toHaveLength(3);
  });

  it("with 2 allows one split", () => {
    const r = playRound({ cards: eights, actions: ["split", "split"], rules: { maxSplitHands: 2 } });
    expect(r.hands).toHaveLength(2);
  });

  it("by default (unlimited) splits past 4 hands, playing and settling each in order (#50)", () => {
    const cards = ["8", "10", "8", "7", "8", "3", "8", "2", "8", "4", "10", "9", "K", "Q"];
    const actions = ["split", "split", "split", "split", "stand", "stand", "stand", "hit", "stand", "hit"];
    const r = playRound({ cards, actions });
    expect(r.hands.map((h) => h.total)).toEqual([18, 17, 12, 20, 21]);
    expect(r.results).toEqual([WIN, PUSH, LOSE, WIN, WIN]);
    expect(r.staked).toBe(50);
    expect(r.payout).toBe(70);
    expect(r.cardsLeft).toBe(0);
  });

  it("unlimited still never resplits aces", () => {
    const r = playRound({ cards: ["A", "10", "A", "7", "A", "5", "9"], actions: ["split", "split"] });
    expect(r.hands.map((h) => h.cards.length)).toEqual([2, 2]);
  });

  it("does not resplit aces", () => {
    const r = playRound({ cards: ["A", "10", "A", "7", "A", "5", "9"], actions: ["split", "split"], rules: { maxSplitHands: 4 } });
    expect(r.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(r.cardsLeft).toBe(1);
  });
});

describe("US no peek (dealer blackjack wins everything)", () => {
  it("hides a dealer blackjack and lets the player act", () => {
    const r = playRound({ cards: ["10", "A", "9", "K"], mode: Modes.NO_PEEK });
    expect(r.afterDeal.hands[0].status).toBe(HandStatus.PLAYING);
    expect(r.afterDeal.dealer.cards).toHaveLength(1);
    expect(r.afterDeal.dealer.isBlackjack).toBe(false);
    expect(r.dealer.isBlackjack).toBe(true);
    expect(r.results).toEqual([LOSE]);
  });

  it("a dealer blackjack takes a double", () => {
    const r = playRound({ cards: ["5", "A", "6", "K", "10"], mode: Modes.NO_PEEK, actions: ["double"] });
    expect(r.hands[0].total).toBe(21);
    expect(r.results).toEqual([LOSE]);
    expect(r.staked).toBe(20);
    expect(r.payout).toBe(0);
  });

  it("a dealer blackjack takes both split hands", () => {
    const r = playRound({ cards: ["8", "A", "8", "K", "3", "10"], mode: Modes.NO_PEEK, actions: ["split"] });
    expect(r.results).toEqual([LOSE, LOSE]);
    expect(r.staked).toBe(20);
    expect(r.payout).toBe(0);
  });

  it("player blackjack pushes a dealer blackjack", () => {
    const r = playRound({ cards: ["A", "A", "K", "K"], mode: Modes.NO_PEEK });
    expect(r.results).toEqual([PUSH]);
  });

  it("player blackjack pays 3:2 when the dealer has none, and the dealer draws nothing", () => {
    const r = playRound({ cards: ["A", "10", "K", "6", "5"], mode: Modes.NO_PEEK });
    expect(r.payout).toBe(25);
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.cardsLeft).toBe(1);
  });

  it("the dealer still plays out when a split leaves a live non-blackjack hand", () => {
    const r = playRound({ cards: ["10", "10", "K", "6", "A", "7", "5"], mode: Modes.NO_PEEK, actions: ["split"], blackJackOnSplit: true });
    expect(r.dealer.cards).toHaveLength(3);
    expect(r.results).toEqual([WIN, LOSE]);
  });
});

describe("EU (dealer draws the second card after the player)", () => {
  it("deals the dealer one card, so the player always acts", () => {
    const r = playRound({ cards: ["10", "10", "9", "A"], mode: Modes.EU });
    expect(r.afterDeal.dealer.cards).toHaveLength(1);
    expect(r.afterDeal.hands[0].status).toBe(HandStatus.PLAYING);
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.dealer.isBlackjack).toBe(true);
    expect(r.results).toEqual([LOSE]);
  });

  it("a dealer blackjack beats a player's three-card 21", () => {
    const r = playRound({ cards: ["5", "10", "6", "K", "A"], mode: Modes.EU, actions: ["hit"] });
    expect(r.hands[0].total).toBe(21);
    expect(r.results).toEqual([LOSE]);
  });

  it("player blackjack pushes when the dealer makes blackjack", () => {
    const r = playRound({ cards: ["A", "10", "K", "A"], mode: Modes.EU });
    expect(r.results).toEqual([PUSH]);
  });

  it("player blackjack pays 3:2 when the dealer misses", () => {
    const r = playRound({ cards: ["A", "10", "K", "7"], mode: Modes.EU });
    expect(r.payout).toBe(25);
  });

  it("against a player blackjack the dealer draws only its second card", () => {
    const r = playRound({ cards: ["A", "10", "K", "6", "5"], mode: Modes.EU });
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.cardsLeft).toBe(1);
    expect(r.payout).toBe(25);
  });

  it("the dealer keeps drawing to 17", () => {
    const r = playRound({ cards: ["10", "10", "K", "6", "5"], mode: Modes.EU });
    expect(r.dealer.cards).toHaveLength(3);
    expect(r.dealer.total).toBe(21);
    expect(r.dealer.isBlackjack).toBe(false);
    expect(r.results).toEqual([LOSE]);
  });

  it("the dealer draws nothing when the player busts", () => {
    const r = playRound({ cards: ["10", "10", "6", "K", "A"], mode: Modes.EU, actions: ["hit"] });
    expect(r.results).toEqual([LOSE]);
    expect(r.dealer.cards).toHaveLength(1);
    expect(r.cardsLeft).toBe(1);
  });
});

describe("A1: EU dealer draws only once against a player 21 (dealerDrawsOnceOn21)", () => {
  const once = { dealerDrawsOnceOn21: true };

  it("on: a two-card dealer total loses to the 21, with no third card", () => {
    const r = playRound({ cards: ["10", "K", "5", "6", "6", "5"], mode: Modes.EU, actions: ["hit"], rules: once });
    expect(r.hands[0].total).toBe(21);
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.cardsLeft).toBe(1);
    expect(r.results).toEqual([WIN]);
  });

  it("on: a dealer blackjack still beats the 21", () => {
    const r = playRound({ cards: ["10", "K", "5", "6", "A"], mode: Modes.EU, actions: ["hit"], rules: once });
    expect(r.dealer.isBlackjack).toBe(true);
    expect(r.results).toEqual([LOSE]);
  });

  it("off: the dealer draws to 17 and a three-card 21 pushes", () => {
    const r = playRound({ cards: ["10", "K", "5", "6", "6", "5"], mode: Modes.EU, actions: ["hit"] });
    expect(r.dealer.cards).toHaveLength(3);
    expect(r.results).toEqual([PUSH]);
  });

  it("does not apply to US modes", () => {
    const r = playRound({ cards: ["10", "K", "5", "6", "6", "5"], mode: Modes.NO_PEEK, actions: ["hit"], rules: once });
    expect(r.dealer.cards).toHaveLength(3);
    expect(r.results).toEqual([PUSH]);
  });
});

describe("A2: dealer draws its second card on a player blackjack (dealerDrawsOnPlayerBlackjack)", () => {
  const noDraw = { dealerDrawsOnPlayerBlackjack: false };

  it("off: pays a player blackjack at once without the dealer drawing", () => {
    const r = playRound({ cards: ["A", "10", "K", "A"], mode: Modes.EU, rules: noDraw });
    expect(r.afterDeal.hands[0].result).toBe(WIN);
    expect(r.results).toEqual([WIN]);
    expect(r.payout).toBe(25);
    expect(r.dealer.cards).toHaveLength(1);
    expect(r.cardsLeft).toBe(1);
  });

  it("off: plays like EU when the player has no blackjack", () => {
    const r = playRound({ cards: ["10", "10", "9", "A"], mode: Modes.EU, rules: noDraw });
    expect(r.dealer.isBlackjack).toBe(true);
    expect(r.results).toEqual([LOSE]);
  });
});

describe("A3: dealer draws after the player busts (dealerDrawsOnPlayerBust)", () => {
  const bust = ["10", "10", "6", "K", "A"];

  it("on: the EU dealer draws only its second card, and it counts", () => {
    const on = playRound({ cards: bust, mode: Modes.EU, actions: ["hit"], rules: { dealerDrawsOnPlayerBust: true } });
    const off = playRound({ cards: bust, mode: Modes.EU, actions: ["hit"] });
    expect(on.results).toEqual([LOSE]);
    expect(on.payout).toBe(0);
    expect(on.dealer.cards).toHaveLength(2);
    expect(on.cardsLeft).toBe(0);
    expect(on.state.runningCount).toBe(off.state.runningCount - 1); // the ace
  });

  it("on: the US dealer turns its hole card over and draws nothing more", () => {
    const r = playRound({ cards: ["10", "10", "6", "6", "K", "5"], mode: Modes.NO_PEEK, actions: ["hit"], rules: { dealerDrawsOnPlayerBust: true } });
    expect(r.results).toEqual([LOSE]);
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.cardsLeft).toBe(1);
  });
});

describe("A4: blackjack pays immediately (blackjackPaysImmediately)", () => {
  const now = { blackjackPaysImmediately: true };

  it("US no peek on: a hidden dealer blackjack can no longer push it", () => {
    const r = playRound({ cards: ["A", "A", "K", "K"], mode: Modes.NO_PEEK, rules: now });
    expect(r.afterDeal.hands[0].result).toBe(WIN);
    expect(r.dealer.isBlackjack).toBe(true);
    expect(r.results).toEqual([WIN]);
    expect(r.payout).toBe(25);
  });

  it("US no peek off: a dealer blackjack pushes it", () => {
    const r = playRound({ cards: ["A", "A", "K", "K"], mode: Modes.NO_PEEK });
    expect(r.afterDeal.hands[0].result).toBe(HandResult.NONE);
    expect(r.results).toEqual([PUSH]);
  });

  it("EU on: pays at once, and the dealer still shows its second card", () => {
    const r = playRound({ cards: ["A", "10", "K", "A"], mode: Modes.EU, rules: now });
    expect(r.afterDeal.hands[0].result).toBe(WIN);
    expect(r.results).toEqual([WIN]);
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.cardsLeft).toBe(0);
  });

  it("EU off: a dealer blackjack pushes it", () => {
    const r = playRound({ cards: ["A", "10", "K", "A"], mode: Modes.EU });
    expect(r.results).toEqual([PUSH]);
  });

  it("US peek: makes no difference, a revealed dealer blackjack still pushes", () => {
    for (const rules of [now, {}]) {
      expect(playRound({ cards: ["A", "A", "K", "K"], mode: Modes.PEEK, rules }).results).toEqual([PUSH]);
    }
  });
});

describe("settlement", () => {
  it("does not mutate the hand it settles", () => {
    const hand = Object.freeze({ bet: 10, result: HandResult.NONE, total: 20, isBlackjack: false, isBusted: false });
    const settled = settleHand(hand, { total: 18, isBusted: false, isBlackjack: false });
    expect(settled.result).toBe(WIN);
    expect(hand.result).toBe(HandResult.NONE);
  });
});

describe("shoe", () => {
  it("refills an empty shoe in place mid-round instead of returning nothing", () => {
    const shoe = [];
    const card = drawCardFromShoe(shoe, () => {}, () => stackedShoe(["5", "6"]));
    expect(card.rank).toBe("5");
    expect(shoe.map((c) => c.rank)).toEqual(["6"]);
  });

  it("counts only real cards as remaining", () => {
    const shoe = [...stackedShoe(["5", "6"]), { id: "CUT-1", type: "cut" }];
    expect(cardsRemaining(shoe)).toBe(2);
  });

  it("true count divides the running count by the decks left in the shoe", () => {
    const twoDecks = stackedShoe(Array(104).fill("7"));
    expect(trueCount(4, twoDecks)).toBe(2);
    expect(trueCount(4, stackedShoe(Array(10).fill("7")))).toBe(4);
  });
});
