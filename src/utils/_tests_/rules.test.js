import { describe, it, expect } from "vitest";
import { playRound, stackedShoe, outOfCards, confirmBets, Modes, HandResult, HandStatus } from "./stackedShoe";
import { gameReducer, nextAutoAction } from "../gameReducer";
import { GamePhases } from "../constants/gamePhases";
import { canSplit, canSurrender, settleHand } from "../blackjackLogic";
import { drawCardFromShoe, cardsRemaining, trueCount } from "../cards";
import { RULE_PRESETS } from "../rulePresets";

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

  it("never resplits aces (resplitAces is off)", () => {
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

  it("with no limit (the pre-#91 default) splits past 4 hands, playing and settling each in order (#50)", () => {
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

describe("U6.8: face-down double (doubleFaceDown, #66)", () => {
  const rules = { doubleFaceDown: true };
  const faceDown = (opts) => playRound({ rules, actions: ["double"], ...opts });
  // The money the server sees: the deal's stake, each extra stake, and the final payout.
  const ledger = (r) => r.state.creditEvents.filter((e) => e.kind !== "local").map((e) => ({ ...e, seq: undefined, handTag: undefined }));
  const hiddenIds = (r) => r.beforeReveal.hands.flatMap((h) => h.hiddenCards.map((c) => c.id));
  const bet = (amount, newRound, alreadyDeducted) => ({ kind: "bet", amount, newRound, alreadyDeducted, seq: undefined });
  const settle = (amount) => ({ kind: "settle", amount, seq: undefined });

  it.each([
    ["wins", ["6", "10", "5", "7", "K"], 21, WIN, 40, 1],
    ["pushes", ["6", "10", "5", "K", "9"], 20, PUSH, 20, 0],
    ["loses", ["6", "10", "5", "7", "3"], 14, LOSE, 0, 1],
  ])("keeps the card out of the hand and the count until the reveal, then %s", (_name, cards, total, result, payout, countBefore) => {
    const r = faceDown({ cards });
    const before = r.beforeReveal.hands[0];
    expect(before.cards).toHaveLength(2);
    expect(before.hiddenCards).toHaveLength(1);
    expect([before.total, before.totals, before.isBusted, before.result, before.status, before.bet]).toEqual([11, [11], false, HandResult.NONE, HandStatus.DONE, 20]);
    expect(r.beforeReveal.seenIds).not.toContain(hiddenIds(r)[0]);
    expect(r.beforeReveal.runningCount).toBe(countBefore); // 6 +1, 10 -1, 5 +1, dealer hole (7 0 / K -1 / 7 0)
    expect(r.dealer.cards).toHaveLength(2); // the dealer plays on a live hand as normal
    expect(r.hands[0]).toMatchObject({ total, totals: [total], hiddenCards: [], result, payout });
    expect(r.hands[0].cards).toHaveLength(3);
    expect(r.state.seenIds).toContain(hiddenIds(r)[0]);
    expect(r.state.runningCount).toBe([...r.hands[0].cards, ...r.dealer.cards].reduce((sum, c) => sum + c.count, 0));
    expect(r.staked).toBe(20);
  });

  it("books one bet at the deal, one extra stake at the double and one settle at the end", () => {
    expect(ledger(faceDown({ cards: ["6", "10", "5", "7", "K"] }))).toEqual([bet(10, true, true), bet(10, false, false), settle(40)]);
    expect(ledger(faceDown({ cards: ["6", "10", "5", "7", "3"] }))).toEqual([bet(10, true, true), bet(10, false, false), settle(0)]);
  });

  it("a hidden bust shows nothing, the dealer plays out, and the hand loses at the reveal", () => {
    const r = faceDown({ cards: ["10", "10", "2", "6", "K", "5"] });
    const before = r.beforeReveal.hands[0];
    expect([before.total, before.isBusted, before.result]).toEqual([12, false, HandResult.NONE]);
    expect(r.beforeReveal.dealer.cards).toHaveLength(3); // dealer 16 hit the 5
    expect(r.hands[0]).toMatchObject({ total: 22, isBusted: true, result: LOSE, bet: 20, payout: 0 });
    expect(r.cardsLeft).toBe(0);
  });

  // #89: the player busted first, so a dealer bust does not save a hand whose bust only shows at the reveal.
  it.each([
    ["US peek", Modes.PEEK, ["10", "10", "2", "6", "K", "K"]],
    ["US no peek", Modes.NO_PEEK, ["10", "10", "2", "6", "K", "K"]],
    ["EU", Modes.EU, ["10", "10", "2", "K", "6", "K"]],
  ])("%s: the dealer busts first, then the hidden bust is revealed and the hand still loses", (_name, mode, cards) => {
    const r = faceDown({ cards, mode });
    const before = r.beforeReveal;
    expect(before.dealer).toMatchObject({ total: 26, isBusted: true });
    expect([before.hands[0].total, before.hands[0].isBusted, before.hands[0].result]).toEqual([12, false, HandResult.NONE]);
    expect(r.hands[0]).toMatchObject({ total: 22, isBusted: true, hiddenCards: [], result: LOSE, bet: 20, payout: 0 });
    expect(ledger(r)).toEqual([bet(10, true, true), bet(10, false, false), settle(0)]);
  });

  it("a split hand that busts face down loses while the other hand wins against the dealer's bust", () => {
    const r = faceDown({ cards: ["10", "10", "10", "6", "2", "9", "K", "K"], actions: ["split", "double", "stand"] });
    expect(r.beforeReveal.dealer.isBusted).toBe(true);
    expect(r.beforeReveal.hands.map((h) => [h.total, h.isBusted, h.result])).toEqual([[12, false, HandResult.NONE], [19, false, HandResult.NONE]]);
    expect(r.hands.map((h) => [h.total, h.isBusted, h.bet, h.payout])).toEqual([[22, true, 20, 0], [19, false, 10, 20]]);
    expect(r.results).toEqual([LOSE, WIN]);
    expect(r.payout).toBe(20);
    expect(r.staked).toBe(30);
    expect(ledger(r)).toEqual([bet(10, true, true), bet(10, false, false), bet(10, false, false), settle(20)]);
  });

  it("a hidden 21 made from an ace keeps both totals and is not a blackjack", () => {
    const r = faceDown({ cards: ["A", "10", "5", "9", "5"] });
    expect(r.beforeReveal.hands[0]).toMatchObject({ totals: [16, 6], isBlackjack: false });
    expect(r.hands[0]).toMatchObject({ totals: [21, 11], total: 21, isBlackjack: false, result: WIN, payout: 40 });
  });

  it("two split hands both doubled face down reveal together and settle on their own totals", () => {
    const r = faceDown({ cards: ["8", "10", "8", "7", "3", "2", "10", "5"], actions: ["split", "double", "double"] });
    expect(r.beforeReveal.hands.map((h) => [h.cards.length, h.hiddenCards.length, h.total, h.result])).toEqual([[2, 1, 11, HandResult.NONE], [2, 1, 10, HandResult.NONE]]);
    expect(r.beforeReveal.seenIds).toHaveLength(6); // player 8 3 8 2, dealer 10 7: no hidden card
    expect(r.hands.map((h) => [h.total, h.hiddenCards.length, h.bet])).toEqual([[21, 0, 20], [15, 0, 20]]);
    expect(r.results).toEqual([WIN, LOSE]);
    expect(r.payout).toBe(40);
    expect(r.staked).toBe(40);
    expect(ledger(r)).toEqual([bet(10, true, true), bet(10, false, false), bet(10, false, false), bet(10, false, false), settle(40)]);
  });

  it("both split hands can bust face down; the dealer still plays and both lose", () => {
    const r = faceDown({ cards: ["10", "10", "10", "7", "2", "3", "K", "9"], actions: ["split", "double", "double"] });
    expect(r.beforeReveal.hands.map((h) => [h.total, h.isBusted])).toEqual([[12, false], [13, false]]);
    expect(r.hands.map((h) => [h.total, h.isBusted])).toEqual([[22, true], [22, true]]);
    expect(r.results).toEqual([LOSE, LOSE]);
    expect(r.payout).toBe(0);
  });

  it("US no peek: a dealer blackjack takes the doubled hand, double stake and all", () => {
    const r = faceDown({ cards: ["5", "A", "6", "K", "10"], mode: Modes.NO_PEEK });
    expect(r.beforeReveal.hands[0]).toMatchObject({ total: 11, result: HandResult.NONE });
    expect(r.beforeReveal.dealer.isBlackjack).toBe(true);
    expect(r.hands[0]).toMatchObject({ total: 21, result: LOSE, bet: 20, payout: 0 });
    expect(ledger(r).at(-1)).toEqual(settle(0));
  });

  it("EU: the dealer draws its second card after a face-down double, then the hand is revealed", () => {
    const r = faceDown({ cards: ["6", "10", "5", "K", "7"], mode: Modes.EU });
    expect(r.afterDeal.dealer.cards).toHaveLength(1);
    expect(r.beforeReveal.hands[0]).toMatchObject({ total: 11, bet: 20 });
    expect(r.beforeReveal.dealer.cards).toHaveLength(2);
    expect(r.hands[0]).toMatchObject({ total: 21, result: WIN, payout: 40 });
  });

  it("EU: the dealer draws the same whether the hidden card busts the hand or not", () => {
    const bust = faceDown({ cards: ["10", "10", "2", "K", "7"], mode: Modes.EU });
    const live = faceDown({ cards: ["10", "10", "2", "3", "7"], mode: Modes.EU });
    expect([bust.dealer.cards.length, live.dealer.cards.length]).toEqual([2, 2]);
    expect(bust.results).toEqual([LOSE]);
    expect(live.results).toEqual([LOSE]); // 15 against the dealer's 17
  });

  it("turning the option off after the double still reveals and settles the hand", () => {
    const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: 1000, ...action });
    let s = step(playRound({ cards: ["6", "10", "5", "7", "K"], rules }).afterDeal, { type: "DOUBLE", handIdx: 0 });
    s = confirmBets(step(s, { type: "SET_SETTING", key: "doubleFaceDown", value: false }));
    expect(s.hands[0].hiddenCards).toHaveLength(1);
    while (s.phase !== GamePhases.POST_ROUND) s = step(s, { type: nextAutoAction(s) });
    expect(s.hands[0]).toMatchObject({ total: 21, hiddenCards: [], result: WIN, payout: 40 });
  });

  it("with the option off a double is face up at once and no reveal step runs", () => {
    const r = playRound({ cards: ["6", "10", "5", "7", "K"], actions: ["double"] });
    expect(r.hands[0].hiddenCards).toEqual([]);
    expect(r.beforeReveal).toBeNull();
    expect(r.afterDeal.hands[0].hiddenCards).toEqual([]);
  });

  it("a plain double stays face down when triple down is also on", () => {
    const r = faceDown({ cards: ["6", "10", "5", "7", "K"], rules: { ...rules, tripleDown: true } });
    expect(r.beforeReveal.hands[0].hiddenCards).toHaveLength(1);
    expect(r.hands[0]).toMatchObject({ total: 21, result: WIN, bet: 20 });
  });

  it("a triple stays face up when the option is on", () => {
    const r = playRound({ cards: ["2", "10", "3", "7", "4", "5"], rules: { ...rules, tripleDown: true }, actions: ["triple"] });
    expect(r.beforeReveal).toBeNull();
    expect(r.hands[0]).toMatchObject({ total: 14, bet: 30, hiddenCards: [] });
    expect(r.hands[0].cards).toHaveLength(4);
  });

  it("a double that refills the shoe keeps its card hidden and out of the new count", () => {
    const step = (state, action) => gameReducer(state, { refill: () => stackedShoe(["K", "3", "4"]), credits: 1000, ...action });
    let s = step(playRound({ cards: ["6", "10", "5", "7"], rules }).afterDeal, { type: "DOUBLE", handIdx: 0 });
    s = confirmBets(s);
    expect(s.hands[0].hiddenCards.map((c) => c.rank)).toEqual(["king"]);
    expect(s.seenIds).toHaveLength(3); // the count restarted with the refill, and the king is not in it
    expect(s.runningCount).toBe(1); // 6 +1, 10 -1, 5 +1
    while (s.phase !== GamePhases.POST_ROUND) s = step(s, { type: nextAutoAction(s) });
    expect(s.hands[0]).toMatchObject({ total: 21, result: WIN, hiddenCards: [] });
    expect(s.seenIds).toHaveLength(5);
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

describe("a refused bet (#23)", () => {
  const rules = { tripleDown: true };
  // What the server holds open for the round: every bet it took.
  const serverStake = (r, refused) => r.state.creditEvents.filter((e) => e.kind === "bet")
    .reduce((sum, e, i) => sum + (refused.includes(i) ? 0 : e.amount), 0);
  const settledAt = (r) => r.state.creditEvents.find((e) => e.kind === "settle");

  it("a double the server takes pays 2x the doubled stake, which is fine against the open stake", () => {
    const r = playRound({ cards: ["5", "10", "6", "7", "K"], actions: ["double"] });
    expect([r.hands[0].bet, r.payout, serverStake(r, [])]).toEqual([20, 40, 20]);
  });

  it("a refused double keeps its cards, plays for the single stake and a win is paid on it (the PayoutTooHigh case)", () => {
    const r = playRound({ cards: ["5", "10", "6", "7", "K"], actions: ["double"], refuse: [1] });
    expect(r.hands[0].cards.map((c) => c.rank)).toEqual(["5", "6", "king"]);
    expect(r.hands[0]).toMatchObject({ total: 21, result: WIN, bet: 10, payout: 20 });
    expect(r.state.notice).toMatch(/refused \$10/);
    expect(serverStake(r, [1])).toBe(10);
    expect(r.payout).toBe(20);
    expect(r.payout).toBeLessThanOrEqual(2.5 * serverStake(r, [1])); // un-reduced it would be 40, over the 25 cap
    expect(settledAt(r).amount).toBe(20); // the settle the server receives
  });

  it("a refused double loses only the single stake, and a push returns it", () => {
    const lose = playRound({ cards: ["5", "10", "6", "7", "3"], actions: ["double"], refuse: [1] });
    expect([lose.results, lose.hands[0].bet, lose.payout]).toEqual([[LOSE], 10, 0]);
    const push = playRound({ cards: ["6", "10", "5", "K", "9"], actions: ["double"], refuse: [1] }); // 20 against 20
    expect([push.results, push.hands[0].bet, push.payout]).toEqual([[PUSH], 10, 10]);
  });

  it("a refused face-down double reduces the stake, then reveals and settles on it", () => {
    const r = playRound({ cards: ["6", "10", "5", "7", "K"], rules: { doubleFaceDown: true }, actions: ["double"], refuse: [1] });
    expect(r.beforeReveal.hands[0]).toMatchObject({ bet: 10, total: 11 }); // already reduced before the reveal
    expect(r.hands[0]).toMatchObject({ total: 21, hiddenCards: [], result: WIN, bet: 10, payout: 20 });
  });

  it("a refused triple drops the bet by 2x the base and a win is paid on the single stake", () => {
    const r = playRound({ cards: ["5", "10", "6", "7", "4", "5"], rules, actions: ["triple"], refuse: [1] });
    expect(r.hands[0]).toMatchObject({ total: 20, result: WIN, bet: 10, payout: 20 });
    expect(r.state.notice).toMatch(/refused \$20/);
    expect(r.payout).toBeLessThanOrEqual(2.5 * serverStake(r, [1]));
  });

  it("a refused split lowers the split-off hand's bet; the parent hand still wins on its own stake", () => {
    // 8 8 split: the first hand gets K (18, wins against 17), the split-off hand gets 3 (11, stands and loses).
    const r = playRound({ cards: ["8", "10", "8", "7", "K", "3"], actions: ["split"], refuse: [1] });
    expect(r.hands.map((h) => [h.tag, h.bet, h.result, h.payout])).toEqual([[1, 10, WIN, 20], [2, 0, LOSE, 0]]);
    expect(r.payout).toBeLessThanOrEqual(2.5 * serverStake(r, [1]));
  });

  it("a refused split whose split-off hand wins pays that hand nothing, and the parent hand is untouched", () => {
    // The split-off hand gets the K (18) and the first hand the 3 (11).
    const r = playRound({ cards: ["8", "10", "8", "7", "3", "K"], actions: ["split"], refuse: [1] });
    expect(r.hands.map((h) => [h.tag, h.bet, h.result, h.payout])).toEqual([[1, 10, LOSE, 0], [2, 0, WIN, 0]]);
    expect(r.payout).toBe(0);
    const accepted = playRound({ cards: ["8", "10", "8", "7", "3", "K"], actions: ["split"] });
    expect(accepted.payout).toBe(20); // the same hands pay when the server takes the split stake
  });

  it("two splits and a resplit, with both of the first two split bets refused: each cut lands on its own hand and the payout stays within 2.5x the open stake", () => {
    // 8 8 -> split -> [8 8][8 8] -> split the first -> [8 3][8 K][8 8] -> split the third -> [8 3][8 K][8 2][8 K].
    const cards = ["8", "10", "8", "7", "8", "8", "3", "K", "2", "K"];
    const actions = ["split", "split", "stand", "stand", "split"];
    const all = playRound({ cards, actions });
    expect(all.hands.map((h) => [h.tag, h.total, h.bet, h.payout])).toEqual([[1, 11, 10, 0], [3, 18, 10, 20], [2, 10, 10, 0], [4, 18, 10, 20]]);

    const r = playRound({ cards, actions, refuse: [1, 2] }); // bet 1 = the first split (tag 2), bet 2 = the second (tag 3)
    expect(r.hands.map((h) => [h.tag, h.total, h.bet, h.payout])).toEqual([[1, 11, 10, 0], [3, 18, 0, 0], [2, 10, 0, 0], [4, 18, 10, 20]]);
    expect(r.state.betCircle).toBe(20);
    expect(serverStake(r, [1, 2])).toBe(20); // the opening bet and the third split
    expect(r.staked).toBe(serverStake(r, [1, 2]));
    expect(r.payout).toBe(20);
    expect(r.payout).toBeLessThanOrEqual(2.5 * serverStake(r, [1, 2]));
  });

  it("refusing the third split lands on the resplit hand, not on the hand now at the same position", () => {
    const r = playRound({ cards: ["8", "10", "8", "7", "8", "8", "3", "K", "2", "K"], actions: ["split", "split", "stand", "stand", "split"], refuse: [3] });
    expect(r.hands.map((h) => [h.tag, h.bet, h.payout])).toEqual([[1, 10, 0], [3, 10, 20], [2, 10, 0], [4, 0, 0]]);
  });

  it("a refused opening bet voids the round: back to betting, nothing on the table, no settle", () => {
    const r = playRound({ cards: ["5", "10", "6", "7", "K"], actions: ["double"], refuse: [0] });
    expect(r.state).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle: 0, hands: [], pendingBets: [] });
    expect(r.state.creditEvents.some((e) => e.kind === "settle")).toBe(false);
    expect(r.state.creditEvents.filter((e) => e.kind === "local").map((e) => e.amount)).toEqual([-10]); // no refund event either
    expect(r.state.notice).toMatch(/round was cancelled/);
  });

  it("a win with every bet accepted still pays in full (no regression for the normal path)", () => {
    const r = playRound({ cards: ["A", "10", "K", "6", "5"] });
    expect(r.payout).toBe(25);
    expect(r.state.notice).toBeNull();
  });
});

// ---- #91 PR 1: regional rules. Scenarios start from LEGACY_RULES (see playRound); each one turns its rule on. ----

describe("H17: dealer hits soft 17 (dealerHitsSoft17)", () => {
  const h17 = { dealerHitsSoft17: true };
  // Player 10-9 (19) stands. The dealer's cards come after: up card, hole card (EU: its second card), then draws.
  const soft17 = (rules, cards, mode) => playRound({ cards, mode, rules });

  it.each([
    ["US peek", Modes.PEEK],
    ["US no peek", Modes.NO_PEEK],
    ["EU", Modes.EU],
  ])("%s: A-6 hits, and a 3 makes soft 20 that beats 19", (_name, mode) => {
    const r = soft17(h17, ["10", "A", "9", "6", "3"], mode);
    expect(r.dealer.cards).toHaveLength(3);
    expect(r.dealer.total).toBe(20);
    expect(r.results).toEqual([LOSE]);
    expect(r.cardsLeft).toBe(0);
  });

  it.each([
    ["US peek", Modes.PEEK],
    ["US no peek", Modes.NO_PEEK],
    ["EU", Modes.EU],
  ])("%s: with S17 (off) the same A-6 stands and the player's 19 wins", (_name, mode) => {
    const r = soft17({ dealerHitsSoft17: false }, ["10", "A", "9", "6", "3"], mode);
    expect(r.dealer.cards).toHaveLength(2);
    expect(r.dealer.total).toBe(17);
    expect(r.results).toEqual([WIN]);
    expect(r.cardsLeft).toBe(1);
  });

  it("the dealer's order of cards does not matter: 6 up and an ace in the hole is soft 17 too", () => {
    const r = soft17(h17, ["10", "6", "9", "A", "3"]);
    expect(r.dealer.cards).toHaveLength(3);
    expect(r.dealer.total).toBe(20);
  });

  it.each([
    ["A-A-5", ["10", "A", "9", "A", "5", "3"]],
    ["A-2-4", ["10", "A", "9", "2", "4", "3"]],
  ])("%s is a soft 17 that hits, whichever the order it was built in", (_name, cards) => {
    const r = soft17(h17, cards);
    expect(r.dealer.cards).toHaveLength(4);
    expect(r.dealer.total).toBe(20);
    expect(r.results).toEqual([LOSE]);
  });

  it("A-6-10 is a hard 17: the dealer stands (no fourth card is available)", () => {
    const r = soft17(h17, ["10", "A", "9", "6", "10"]);
    expect(r.dealer.cards).toHaveLength(3);
    expect(r.dealer.total).toBe(17);
    expect(r.results).toEqual([WIN]);
  });

  it("7-10 and soft 18 stand", () => {
    const hard = soft17(h17, ["10", "10", "9", "7"]);
    expect([hard.dealer.cards.length, hard.dealer.total, hard.results]).toEqual([2, 17, [WIN]]);
    const soft18 = soft17(h17, ["10", "A", "9", "7"]);
    expect([soft18.dealer.cards.length, soft18.dealer.total, soft18.results]).toEqual([2, 18, [WIN]]);
  });

  it("a soft 17 that hits into a hard 12 keeps drawing, and a bust ends it", () => {
    const bust = soft17(h17, ["10", "A", "9", "6", "5", "K"]); // A-6 hits 5 (hard 12), draws K and busts
    expect(bust.dealer.isBusted).toBe(true);
    expect(bust.results).toEqual([WIN]);
    expect(bust.payout).toBe(20);
  });

  it("a dealer that only checks for blackjack (the player has one) stops at two cards even on soft 17", () => {
    const us = soft17(h17, ["A", "A", "K", "6", "5"]);
    expect(us.dealer.cards).toHaveLength(2);
    expect(us.cardsLeft).toBe(1);
    expect(us.payout).toBe(25);
    const eu = soft17(h17, ["A", "A", "K", "6", "5"], Modes.EU);
    expect(eu.dealer.cards).toHaveLength(2);
    expect(eu.dealer.total).toBe(17);
    expect(eu.cardsLeft).toBe(1);
    expect(eu.payout).toBe(25);
  });

  it("the dealer takes no card when every hand busted, even with soft 17", () => {
    const us = playRound({ cards: ["10", "A", "6", "6", "K"], actions: ["hit"], rules: h17 });
    expect(us.hands[0].isBusted).toBe(true);
    expect(us.dealer.cards).toHaveLength(2);
    expect(us.cardsLeft).toBe(0);
    const eu = playRound({ cards: ["10", "A", "6", "K"], actions: ["hit"], mode: Modes.EU, rules: h17 });
    expect(eu.hands[0].isBusted).toBe(true);
    expect(eu.dealer.cards).toHaveLength(1);
  });
});

describe("6:5 blackjack (blackjackPayout)", () => {
  const sixFive = { blackjackPayout: "6:5" };
  const bj = ["A", "10", "K", "6", "5"]; // player blackjack against a dealer 16 that need not draw (a blackjack wins at once)

  it.each([[10, 22], [5, 11], [1, 2.2], [3, 6.6], [25, 55]])("a $%s blackjack pays $%s back (stake included)", (bet, payout) => {
    const r = playRound({ cards: bj, bet, rules: sixFive });
    expect(r.results).toEqual([WIN]);
    expect(r.payout).toBe(payout);
    expect(r.state.creditEvents.find((e) => e.kind === "settle").amount).toBe(payout);
  });

  it.each([[10, 25], [5, 12.5], [1, 2.5]])("3:2 is unchanged: a $%s blackjack pays $%s", (bet, payout) => {
    expect(playRound({ cards: bj, bet, rules: { blackjackPayout: "3:2" } }).payout).toBe(payout);
    expect(playRound({ cards: bj, bet }).payout).toBe(payout); // and so is the legacy default
  });

  it.each([
    ["US peek", Modes.PEEK, bj],
    ["US no peek", Modes.NO_PEEK, bj],
    ["EU", Modes.EU, ["A", "10", "K", "7"]],
  ])("%s pays 6:5 the same way", (_name, mode, cards) => {
    expect(playRound({ cards, mode, rules: sixFive }).payout).toBe(22);
  });

  it("a plain win, a push and a loss are not touched", () => {
    expect(playRound({ cards: ["10", "10", "9", "7"], rules: sixFive }).payout).toBe(20);
    expect(playRound({ cards: ["A", "A", "K", "K"], rules: sixFive }).payout).toBe(10); // blackjack against blackjack
    expect(playRound({ cards: ["10", "10", "6", "K"], rules: sixFive }).payout).toBe(0);
  });

  it("a split 21 that counts as blackjack (blackJackOnSplit) pays 6:5 as well", () => {
    const r = playRound({ cards: ["A", "10", "A", "7", "K", "9"], actions: ["split"], blackJackOnSplit: true, rules: sixFive });
    expect(r.hands.map((h) => h.payout)).toEqual([22, 20]);
  });

  it("a split 21 that is not blackjack still pays 1:1", () => {
    const r = playRound({ cards: ["A", "10", "A", "7", "K", "9"], actions: ["split"], rules: sixFive });
    expect(r.hands.map((h) => h.payout)).toEqual([20, 20]);
  });

  it("three $1 blackjacks settle 6.6 (not 6.6000000000000005): the API rejects more than two decimals", () => {
    // A-A split, resplit the second ace: each hand is A-K, all blackjack on a split.
    const r = playRound({
      cards: ["A", "10", "A", "7", "K", "A", "K", "K"], bet: 1, actions: ["split", "split"], blackJackOnSplit: true,
      rules: { ...sixFive, resplitAces: true },
    });
    expect(r.hands.map((h) => h.isBlackjack)).toEqual([true, true, true]);
    expect(r.hands.map((h) => h.payout)).toEqual([2.2, 2.2, 2.2]);
    expect(r.state.creditEvents.find((e) => e.kind === "settle").amount).toBe(6.6);
  });
});

describe("double limits (doubleOn, doubleAfterSplit) and triple down", () => {
  // Dealer 10-7 stands on 17. A double that is allowed draws the 2; a refused one leaves the hand as it was.
  const tryDouble = (cards, rules, action = "double") => playRound({ cards: [cards[0], "10", cards[1], "7", "2", "2"], actions: [action], rules });
  const doubled = (r) => r.hands[0].bet === 20;
  const tripled = (r) => r.hands[0].bet === 30;

  // [name, the two cards, allowed by: any, 9-11, 10-11]
  it.each([
    ["hard 8", ["5", "3"], [true, false, false]],
    ["hard 9", ["5", "4"], [true, true, false]],
    ["hard 10", ["6", "4"], [true, true, true]],
    ["hard 11", ["6", "5"], [true, true, true]],
    ["hard 12", ["7", "5"], [true, false, false]],
    ["hard 20 (10-K)", ["K", "10"], [true, false, false]],
    ["soft 19 (A-8, which is also a hard 9)", ["A", "8"], [true, false, false]],
    ["soft 13 (A-2)", ["A", "2"], [true, false, false]],
    ["soft 18 (A-7)", ["A", "7"], [true, false, false]],
    ["soft 20 (A-9, a hard 10)", ["A", "9"], [true, false, false]],
  ])("%s: doubles on any, 9-11, 10-11 as %j", (_name, hand, [any, nineEleven, tenEleven]) => {
    expect(doubled(tryDouble(hand, { doubleOn: "any" }))).toBe(any);
    expect(doubled(tryDouble(hand, { doubleOn: "9-11" }))).toBe(nineEleven);
    expect(doubled(tryDouble(hand, { doubleOn: "10-11" }))).toBe(tenEleven);
  });

  it("a refused double changes nothing: same cards, same stake, no extra ledger bet, and the hand stands next", () => {
    const r = tryDouble(["5", "3"], { doubleOn: "9-11" });
    expect(r.hands[0]).toMatchObject({ bet: 10, status: HandStatus.DONE });
    expect(r.hands[0].cards).toHaveLength(2);
    expect(r.state.creditEvents.filter((e) => e.kind === "bet")).toHaveLength(1);
    expect(r.cardsLeft).toBe(2);
  });

  it("legacy settings (any two cards) are unchanged", () => {
    expect(doubled(playRound({ cards: ["5", "10", "3", "7", "2"], actions: ["double"] }))).toBe(true);
  });

  it("doubleAfterSplit off blocks a double on a split hand, on blocks nothing", () => {
    const cards = ["8", "10", "8", "7", "3", "10", "9"]; // split: 8-3 (11) and 8-10; a double would draw the 9
    const off = playRound({ cards, actions: ["split", "double"], rules: { doubleAfterSplit: false } });
    expect(off.hands.map((h) => h.bet)).toEqual([10, 10]);
    expect(off.hands[0].cards).toHaveLength(2);
    const on = playRound({ cards, actions: ["split", "double"], rules: { doubleAfterSplit: true } });
    expect(on.hands.map((h) => h.bet)).toEqual([20, 10]);
  });

  it("doubleAfterSplit off still allows a double on the first two cards of an unsplit hand", () => {
    expect(doubled(playRound({ cards: ["5", "10", "6", "7", "K"], actions: ["double"], rules: { doubleAfterSplit: false } }))).toBe(true);
  });

  it("doubleOn applies to a split hand as well: 8-3 (11) doubles on 10-11, 8-K (18) does not", () => {
    const rules = { doubleOn: "10-11" };
    const good = playRound({ cards: ["8", "10", "8", "7", "3", "K", "4"], actions: ["split", "double"], rules });
    expect(good.hands.map((h) => h.bet)).toEqual([20, 10]);
    const bad = playRound({ cards: ["8", "10", "8", "7", "K", "3", "4"], actions: ["split", "double"], rules });
    expect(bad.hands.map((h) => h.bet)).toEqual([10, 10]);
  });

  it("split aces are never doubled, even when they may be hit and doubling is allowed everywhere", () => {
    const r = playRound({ cards: ["A", "10", "A", "7", "5", "4", "3"], actions: ["split", "double"], rules: { hitSplitAces: true, doubleAfterSplit: true, doubleOn: "any" } });
    expect(r.hands.map((h) => [h.bet, h.cards.length])).toEqual([[10, 2], [10, 2]]);
    expect(r.state.creditEvents.filter((e) => e.kind === "bet")).toHaveLength(2); // the opening bet and the split stake only
  });

  describe("triple down obeys the same limits", () => {
    const triple = { tripleDown: true };
    const tryTriple = (cards, rules) => playRound({ cards: [cards[0], "10", cards[1], "7", "2", "2", "2"], actions: ["triple"], rules: { ...triple, ...rules } });

    it("triples where a double is allowed and is refused where it is not", () => {
      expect(tripled(tryTriple(["5", "4"], { doubleOn: "9-11" }))).toBe(true);
      expect(tripled(tryTriple(["5", "3"], { doubleOn: "9-11" }))).toBe(false);
      expect(tripled(tryTriple(["A", "8"], { doubleOn: "9-11" }))).toBe(false);
      expect(tripled(tryTriple(["6", "4"], { doubleOn: "10-11" }))).toBe(true);
      expect(tripled(tryTriple(["5", "4"], { doubleOn: "10-11" }))).toBe(false);
    });

    it("legacy: any two cards", () => {
      expect(tripled(tryTriple(["A", "8"], {}))).toBe(true);
    });

    it("is refused on a split hand when doubleAfterSplit is off, and works when it is on", () => {
      const cards = ["8", "10", "8", "7", "3", "K", "2", "2"];
      const off = playRound({ cards, actions: ["split", "triple"], rules: { ...triple, doubleAfterSplit: false } });
      expect(off.hands.map((h) => h.bet)).toEqual([10, 10]);
      const on = playRound({ cards, actions: ["split", "triple"], rules: triple });
      expect(on.hands.map((h) => h.bet)).toEqual([30, 10]);
    });

    it("a refused triple never falls through to a split of the pair", () => {
      const r = playRound({ cards: ["8", "10", "8", "7", "2", "2"], actions: ["triple"], rules: { ...triple, doubleOn: "9-11" } });
      expect(r.hands).toHaveLength(1);
      expect(r.hands[0].bet).toBe(10);
    });

    it("split aces are never tripled", () => {
      const r = playRound({ cards: ["A", "10", "A", "7", "5", "4", "3", "2"], actions: ["split", "triple"], rules: { ...triple, hitSplitAces: true } });
      expect(r.hands.map((h) => [h.bet, h.cards.length])).toEqual([[10, 2], [10, 2]]);
    });
  });
});

describe("split aces (resplitAces, hitSplitAces)", () => {
  const a = ["A", "10", "A", "7"]; // A-A against 10-7; the split's cards come next: first hand, second hand
  const ranks = (r) => r.hands.map((h) => h.cards.map((c) => c.rank[0]).join(""));

  it("by default each split ace gets one card and stands, even an ace", () => {
    const r = playRound({ cards: [...a, "A", "5", "9"], actions: ["split"], rules: { resplitAces: false } });
    expect(r.hands.map((h) => [h.cards.length, h.status])).toEqual([[2, HandStatus.DONE], [2, HandStatus.DONE]]);
    expect(r.cardsLeft).toBe(1);
  });

  it("resplitAces: a split ace that gets an ace stays playable and splits again, then the other ace is dead and finishes", () => {
    // Split 1: first hand A-A (waits), second hand A-K (stands). Split 2, with the hand limit 3: A-K and A-K; the first hand's A-A is left.
    const r = playRound({ cards: [...a, "A", "K", "A", "K"], actions: ["split", "split"], rules: { resplitAces: true, maxSplitHands: 3 } });
    expect(r.state.phase).toBe(GamePhases.POST_ROUND);
    expect(ranks(r)).toEqual(["aa", "ak", "ak"]);
    expect(r.hands.every((h) => h.status === HandStatus.DONE)).toBe(true);
    expect(r.cardsLeft).toBe(0);
    expect(r.staked).toBe(30);
  });

  it("resplitAces stops at maxSplitHands: a second split is refused and both A-A hands finish without hanging the round", () => {
    const r = playRound({ cards: [...a, "A", "A", "5", "9", "K"], actions: ["split", "split"], rules: { resplitAces: true, maxSplitHands: 2 } });
    expect(r.hands).toHaveLength(2);
    expect(ranks(r)).toEqual(["aa", "aa"]);
    expect(r.hands.every((h) => h.status === HandStatus.DONE)).toBe(true);
    expect(r.state.phase).toBe(GamePhases.POST_ROUND);
  });

  it("resplitAces with no limit (0) splits as long as aces come", () => {
    // [A-A][A-A] -> split the first: [A-A][A-A][A-A] -> split the first again: [A-5][A-K][A-A][A-A]; the other two aces are left to stand.
    const r = playRound({ cards: [...a, "A", "A", "A", "A", "5", "K"], actions: ["split", "split", "split"], rules: { resplitAces: true, maxSplitHands: 0 } });
    expect(r.hands).toHaveLength(4);
    expect(r.staked).toBe(40);
    expect(r.state.phase).toBe(GamePhases.POST_ROUND);
  });

  it("a split ace that gets a king (A-K) stands, with resplitAces on", () => {
    const r = playRound({ cards: [...a, "K", "K"], actions: ["split"], rules: { resplitAces: true } });
    expect(r.hands.map((h) => [h.total, h.status, h.isBlackjack])).toEqual([[21, HandStatus.DONE, false], [21, HandStatus.DONE, false]]);
    expect(r.payout).toBe(40);
  });

  it("resplitAces off by default: a third ace is not split", () => {
    const r = playRound({ cards: [...a, "A", "A", "5"], actions: ["split", "split"] });
    expect(r.hands).toHaveLength(2);
  });

  it("hitSplitAces: a split ace may hit, and a 21 stops it", () => {
    const r = playRound({ cards: [...a, "5", "2", "5", "K"], actions: ["split", "hit"], rules: { hitSplitAces: true } });
    expect(r.hands[0].cards).toHaveLength(3);
    expect([r.hands[0].total, r.hands[0].status]).toEqual([21, HandStatus.DONE]);
    expect(r.hands[1].cards).toHaveLength(2); // A-2 stood
    expect(r.cardsLeft).toBe(1);
    expect(r.results).toEqual([WIN, LOSE]);
  });

  it("hitSplitAces with resplitAces: an ace pair that can still hit stays in play at the hand limit", () => {
    const r = playRound({ cards: [...a, "A", "5", "A", "K", "2"], actions: ["split", "split", "hit"], rules: { hitSplitAces: true, resplitAces: true, maxSplitHands: 3 } });
    expect(r.hands).toHaveLength(3);
    expect(r.hands[0].cards).toHaveLength(3); // the A-A hand was not finished for the player: the hit went through
    expect(r.hands.every((h) => h.status === HandStatus.DONE)).toBe(true);
  });

  it("a hit on a split ace is refused without hitSplitAces: the hand keeps its two cards and the shoe its cards", () => {
    const r = playRound({ cards: [...a, "A", "5", "K", "K"], actions: ["split", "hit"], rules: { resplitAces: true, maxSplitHands: 0 } });
    expect(r.hands[0].cards).toHaveLength(2); // A-A may only split or stand; the hit did nothing and the hand then stood
    expect(r.cardsLeft).toBe(2);
  });

  it("a hit works on a normal split hand, with or without hitSplitAces", () => {
    for (const hitSplitAces of [false, true]) {
      const r = playRound({ cards: ["8", "10", "8", "7", "3", "10", "K"], actions: ["split", "hit"], rules: { hitSplitAces } });
      expect(r.hands[0].cards).toHaveLength(3);
    }
  });
});

describe("original bet only (noHoleCardLoss): a dealer blackjack found after the player added stakes", () => {
  const original = { noHoleCardLoss: "original" };
  const all = { noHoleCardLoss: "all" };
  // The dealer has an ace up and a king: with no peek the hole card is dealt at the start, in EU the dealer's second card
  // comes after the player has acted. `draws` are the player's cards in between.
  const play = (mode, p1, p2, draws, actions, rules, extra = {}) =>
    playRound({ cards: mode === Modes.EU ? [p1, "A", p2, ...draws, "K"] : [p1, "A", p2, "K", ...draws], mode, actions, rules, ...extra });

  describe.each([["US no peek", Modes.NO_PEEK], ["EU", Modes.EU]])("%s", (_name, mode) => {
    it("a double loses the original bet and gets the doubled stake back", () => {
      const r = play(mode, "5", "6", ["10"], ["double"], original);
      expect(r.dealer.isBlackjack).toBe(true);
      expect(r.hands[0]).toMatchObject({ total: 21, bet: 20, result: LOSE, payout: 10 });
      expect([r.staked, r.payout]).toEqual([20, 10]);
    });

    it("all (the legacy rule) takes both stakes", () => {
      const r = play(mode, "5", "6", ["10"], ["double"], all);
      expect(r.results).toEqual([LOSE]);
      expect([r.staked, r.payout]).toEqual([20, 0]);
    });

    it("a triple gets the two added stakes back", () => {
      const r = play(mode, "5", "6", ["2", "3"], ["triple"], { ...original, tripleDown: true });
      expect([r.results, r.staked, r.payout]).toEqual([[LOSE], 30, 20]);
      expect(play(mode, "5", "6", ["2", "3"], ["triple"], { ...all, tripleDown: true }).payout).toBe(0);
    });

    it("a split with two live hands loses one bet in all: the split-off hand's stake comes back", () => {
      const r = play(mode, "8", "8", ["3", "2"], ["split"], original);
      expect(r.hands.map((h) => [h.bet, h.result, h.payout])).toEqual([[10, LOSE, 0], [10, LOSE, 10]]);
      expect([r.staked, r.payout]).toEqual([20, 10]);
      expect(play(mode, "8", "8", ["3", "2"], ["split"], all).payout).toBe(0);
    });

    it("a split where the first hand busts and the second is live still loses only one bet", () => {
      const r = play(mode, "8", "8", ["6", "3", "K"], ["split", "hit"], original);
      expect(r.hands.map((h) => [h.isBusted, h.payout])).toEqual([[true, 0], [false, 10]]);
      expect([r.staked, r.payout]).toEqual([20, 10]);
    });

    // The agreed rule (spec: "a hand that busted is never refunded"): the added stake belongs to the split-off hand, so when
    // that hand busts its stake is lost, and the first hand, live, loses its own bet. Both bets go. Do not "fix" this one.
    it("a split where the second hand busts and the first is live loses both bets: a bust is never refunded", () => {
      const r = play(mode, "8", "8", ["3", "6", "K"], ["split", "stand", "hit"], original);
      expect(r.hands.map((h) => [h.isBusted, h.payout])).toEqual([[false, 0], [true, 0]]);
      expect([r.staked, r.payout]).toEqual([20, 0]);
    });

    it("a double on the split-off hand gets all of its doubled stake back", () => {
      const r = play(mode, "8", "8", ["3", "2", "5"], ["split", "stand", "double"], original);
      expect(r.hands.map((h) => [h.bet, h.payout])).toEqual([[10, 0], [20, 20]]);
      expect([r.staked, r.payout]).toEqual([30, 20]);
    });

    it("a double on the first hand of a split gets only the doubled stake back, plus the split stake of the other hand", () => {
      const r = play(mode, "8", "8", ["3", "2", "5"], ["split", "double"], original);
      expect(r.hands.map((h) => [h.bet, h.payout])).toEqual([[20, 10], [10, 10]]);
      expect([r.staked, r.payout]).toEqual([30, 20]);
    });

    it("a face-down double that did not bust gets the doubled stake back", () => {
      const r = play(mode, "5", "6", ["10"], ["double"], { ...original, doubleFaceDown: true });
      expect(r.hands[0]).toMatchObject({ total: 21, bet: 20, result: LOSE, payout: 10 });
    });

    it("a face-down double that busts loses everything: a bust is never refunded", () => {
      const r = play(mode, "10", "2", ["K"], ["double"], { ...original, doubleFaceDown: true });
      expect(r.hands[0]).toMatchObject({ total: 22, isBusted: true, bet: 20, result: LOSE, payout: 0 });
    });

    it("a face-down double with all takes everything either way", () => {
      expect(play(mode, "5", "6", ["10"], ["double"], { ...all, doubleFaceDown: true }).payout).toBe(0);
    });

    it("a hit to 21 (not a blackjack) loses to the dealer blackjack; nothing was added, so nothing comes back", () => {
      const r = play(mode, "5", "6", ["K"], ["hit"], original);
      expect(r.hands[0]).toMatchObject({ total: 21, isBlackjack: false, result: LOSE, bet: 10, payout: 0 });
    });

    it("a refused double stake leaves nothing to refund, and the payout is never negative", () => {
      const r = play(mode, "5", "6", ["10"], ["double"], original, { refuse: [1] });
      expect(r.hands[0]).toMatchObject({ bet: 10, result: LOSE, payout: 0 });
    });

    it("a refused triple stake leaves nothing to refund", () => {
      const r = play(mode, "5", "6", ["2", "3"], ["triple"], { ...original, tripleDown: true }, { refuse: [1] });
      expect(r.hands[0]).toMatchObject({ bet: 10, payout: 0 });
    });

    it("a refused split stake leaves the split-off hand with no bet and no refund", () => {
      const r = play(mode, "8", "8", ["3", "2"], ["split"], original, { refuse: [1] });
      expect(r.hands.map((h) => [h.bet, h.payout])).toEqual([[10, 0], [0, 0]]);
    });

    it("a player blackjack against the dealer blackjack still pushes", () => {
      const r = playRound({ cards: ["A", "A", "K", "K"], mode, rules: original });
      expect(r.results).toEqual([PUSH]);
      expect(r.payout).toBe(10);
    });
  });

  it("a split into two aces that each stand loses one bet in all, like any other split", () => {
    const r = playRound({ cards: ["A", "A", "A", "K", "K", "9"], mode: Modes.NO_PEEK, actions: ["split"], rules: original });
    expect(r.dealer.isBlackjack).toBe(true);
    expect([r.staked, r.payout]).toEqual([20, 10]);
  });

  it("with a peek the dealer blackjack is found at the deal, before any extra stake: both values lose just the bet", () => {
    for (const rules of [original, all]) {
      const r = playRound({ cards: ["10", "A", "9", "K"], rules });
      expect([r.results, r.staked, r.payout]).toEqual([[LOSE], 10, 0]);
    }
  });

  it("a player blackjack pushes a dealer blackjack with a peek under both values", () => {
    for (const rules of [original, all]) expect(playRound({ cards: ["A", "A", "K", "K"], rules }).payout).toBe(10);
  });

  it("a dealer without blackjack changes nothing: a lost double still loses the whole doubled stake", () => {
    const r = playRound({ cards: ["5", "10", "6", "K", "2"], mode: Modes.NO_PEEK, actions: ["double"], rules: original });
    expect(r.dealer.isBlackjack).toBe(false);
    expect([r.results, r.staked, r.payout]).toEqual([[LOSE], 20, 0]);
  });

  it("a dealer 21 of three cards is not a blackjack and takes everything", () => {
    // Player 9-2 doubles into 16; the dealer 5-6 draws a 10.
    const r = playRound({ cards: ["9", "5", "2", "5", "6", "10"], mode: Modes.EU, actions: ["double"], rules: original });
    expect(r.dealer.isBlackjack).toBe(false);
    expect(r.dealer.total).toBe(21);
    expect([r.results, r.staked, r.payout]).toEqual([[LOSE], 20, 0]);
  });

  it("the displayed result stays a loss, and the refund is part of the one settle sent to the server", () => {
    const r = play(Modes.EU, "5", "6", ["10"], ["double"], original);
    expect(r.state.creditEvents.filter((e) => e.kind !== "local").map((e) => [e.kind, e.amount])).toEqual([["bet", 10], ["bet", 10], ["settle", 10]]);
  });
});

describe("rule presets (#91): one signature scenario each, with the preset's own settings", () => {
  const preset = (name) => RULE_PRESETS[name];
  // Eight 8s then the dealer's card: the first four splits come out as 8-8 pairs, the last split (if allowed) ends the pairs.
  const pairs = ["8", "10", "8", "8", "8", "8", "8", "8", "8", "K", "9", "7"];
  const splits = ["split", "split", "split", "split"];

  it("Vegas: the dealer hits soft 17 (A-6 draws), and a peek finds a dealer blackjack at the deal", () => {
    const r = playRound({ cards: ["10", "A", "9", "6", "3"], rules: preset("Vegas") });
    expect(r.dealer.cards).toHaveLength(3);
    expect(r.results).toEqual([LOSE]);
    const bj = playRound({ cards: ["10", "A", "9", "K"], rules: preset("Vegas") });
    expect(bj.afterOffers.dealer.isBlackjack).toBe(true); // an ace up offers insurance, so the peek waits for it
    expect(bj.afterDeal.phase).toBe(GamePhases.OFFERS);
  });

  it("Atlantic City: no hole card, and a dealer blackjack after a double takes only the original bet", () => {
    const r = playRound({ cards: ["5", "A", "6", "10", "K"], actions: ["double"], rules: preset("Atlantic City") });
    expect(r.afterDeal.dealer.cards).toHaveLength(1);
    expect(r.dealer.isBlackjack).toBe(true);
    expect([r.results, r.staked, r.payout]).toEqual([[LOSE], 20, 10]);
    const stands = playRound({ cards: ["10", "A", "9", "6"], rules: preset("Atlantic City") }); // S17: A-6 stands
    expect(stands.dealer.cards).toHaveLength(2);
  });

  it("Europe: no double on 8, a double on 9, resplit with no limit, and a dealer blackjack takes everything", () => {
    const europe = preset("Europe");
    const eight = playRound({ cards: ["5", "10", "3", "K", "2"], actions: ["double"], rules: europe });
    expect(eight.hands[0].bet).toBe(10);
    const nine = playRound({ cards: ["5", "10", "4", "2", "K"], actions: ["double"], rules: europe });
    expect(nine.hands[0].bet).toBe(20);
    const resplit = playRound({ cards: pairs, actions: splits, rules: europe });
    expect(resplit.hands).toHaveLength(5); // four splits: past the 4 hands of the other regions
    const takesAll = playRound({ cards: ["5", "A", "6", "10", "K"], actions: ["double"], rules: europe });
    expect([takesAll.results, takesAll.staked, takesAll.payout]).toEqual([[LOSE], 20, 0]);
  });

  it("Australia: double on hard 9-11 only, and a fourth hand is not allowed", () => {
    const australia = preset("Australia");
    expect(playRound({ cards: ["5", "10", "4", "2", "K"], actions: ["double"], rules: australia }).hands[0].bet).toBe(20);
    expect(playRound({ cards: ["7", "10", "5", "K", "2"], actions: ["double"], rules: australia }).hands[0].bet).toBe(10); // hard 12
    expect(playRound({ cards: ["A", "10", "8", "K", "2"], actions: ["double"], rules: australia }).hands[0].bet).toBe(10); // soft 19
    expect(playRound({ cards: pairs, actions: splits, rules: australia }).hands).toHaveLength(3);
  });

  it("Singapore: double on A-7 (any first two cards), and a fourth hand is not allowed", () => {
    const singapore = preset("Singapore");
    const r = playRound({ cards: ["A", "10", "7", "3", "7"], actions: ["double"], rules: singapore });
    expect([r.hands[0].bet, r.hands[0].total, r.results]).toEqual([20, 21, [WIN]]);
    expect(playRound({ cards: pairs, actions: splits, rules: singapore }).hands).toHaveLength(3);
  });

  it("Vegas and Atlantic City allow up to four hands", () => {
    expect(playRound({ cards: pairs, actions: splits, rules: preset("Atlantic City") }).hands).toHaveLength(4);
    // Vegas peeks, so its dealer's hole card is dealt up front.
    const peekPairs = ["8", "10", "8", "7", ...pairs.slice(3)];
    expect(playRound({ cards: peekPairs, actions: splits, rules: preset("Vegas") }).hands).toHaveLength(4);
  });
});

describe("surrender (#91): every dealer mode, value and up card", () => {
  const { SURRENDER } = HandResult;
  const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: 1e9, ...action });
  const settles = (r) => r.state.creditEvents.filter((e) => e.kind === "settle").map((e) => e.amount);
  // Player 10-6 (16) against `up` and `hole` (in EU the hole is the dealer's second card, drawn after the player), two spare cards behind.
  // A surplus draw by the player or the dealer shows in `cardsLeft`.
  const SPARES = ["9", "9"];
  const play = (mode, surrender, up, hole, extra = {}) =>
    playRound({ cards: ["10", up, "6", hole, ...SPARES], mode, actions: ["surrender"], offers: ["surrender"], bet: extra.bet ?? 10, rules: { surrender, ...extra.rules } });
  const surrendered = (r, payout) => {
    expect(r.results).toEqual([SURRENDER]);
    expect(r.hands[0]).toMatchObject({ surrendered: true, status: HandStatus.DONE, payout });
    expect([r.payout, settles(r)]).toEqual([payout, [payout]]);
    expect(r.dealer.cards).toHaveLength(2); // the dealer takes its second card and stops
    expect(r.cardsLeft).toBe(SPARES.length); // nobody drew a card
  };
  const modes = [["US peek", Modes.PEEK], ["US no peek", Modes.NO_PEEK], ["EU", Modes.EU]];

  describe.each(modes)("%s, the dealer has no blackjack", (_name, mode) => {
    it.each([
      ["late", "6", "K"], ["late", "K", "5"], ["late", "A", "5"],
      ["early", "6", "K"], ["early", "K", "5"], ["early", "A", "5"],
      ["earlyNoAce", "6", "K"], ["earlyNoAce", "K", "5"],
    ])("%s against %s: half the bet comes back, whatever the dealer's total", (surrender, up, hole) => {
      const r = play(mode, surrender, up, hole);
      surrendered(r, 5);
      expect(r.dealer.isBlackjack).toBe(false);
    });

    it.each([["none", "6", "K"], ["none", "K", "5"], ["earlyNoAce", "A", "5"]])("%s against %s: the action is ignored and the hand stands", (surrender, up, hole) => {
      const r = play(mode, surrender, up, hole);
      expect(r.hands[0].surrendered).toBeUndefined();
      expect(r.results).not.toContain(SURRENDER);
      expect(settles(r)).toEqual([r.payout]);
      expect(r.payout).not.toBe(5);
    });
  });

  describe("US peek, a dealer blackjack at the deal", () => {
    // The round ends before the player has a turn, so late has nothing to give up. Early is offered before the peek (below).
    it.each([
      ["late", "K", "A"], ["late", "A", "K"], ["earlyNoAce", "A", "K"], ["none", "K", "A"],
    ])("%s with %s up: no player turn, the bet is lost", (surrender, up, hole) => {
      const r = play(Modes.PEEK, surrender, up, hole);
      expect(r.afterDeal.hands[0].status).toBe(HandStatus.DONE);
      expect(r.afterDeal.phase).not.toBe(GamePhases.PLAYER_TURN);
      expect(r.afterDeal.dealer.isBlackjack).toBe(true);
      expect(r.hands[0].surrendered).toBeUndefined();
      expect([r.results, r.payout, settles(r)]).toEqual([[LOSE], 0, [0]]);
    });
  });

  describe("US peek, early surrender is offered before the peek", () => {
    it.each([["early", "K", "A"], ["early", "A", "K"], ["earlyNoAce", "K", "A"]])("%s with %s up: the half is kept although the dealer has blackjack", (surrender, up, hole) => {
      const r = play(Modes.PEEK, surrender, up, hole);
      expect(r.afterDeal.phase).toBe(GamePhases.OFFERS);
      surrendered(r, 5);
      expect(r.dealer.isBlackjack).toBe(true);
    });

    it("declined, the peek finds the blackjack and the bet is lost", () => {
      const r = playRound({ cards: ["10", "K", "6", "A", ...SPARES], actions: ["surrender"], rules: { surrender: "early" } });
      expect([r.results, r.payout]).toEqual([[LOSE], 0]);
    });
  });

  describe.each([["US no peek", Modes.NO_PEEK], ["EU", Modes.EU]])("%s, a dealer blackjack the player cannot see", (_name, mode) => {
    it.each([["K", "A"], ["A", "K"]])("late against %s: the surrender waits, and the dealer's blackjack takes the whole bet", (up, hole) => {
      const r = play(mode, "late", up, hole);
      expect(r.dealer.isBlackjack).toBe(true);
      expect(r.hands[0]).toMatchObject({ surrendered: true, result: LOSE, payout: 0 });
      expect([r.payout, settles(r)]).toEqual([0, [0]]);
      expect(r.cardsLeft).toBe(SPARES.length);
    });

    it.each([
      ["early", "K", "A"], ["early", "A", "K"], ["earlyNoAce", "K", "A"],
    ])("%s against %s: the half is kept even though the dealer has blackjack", (surrender, up, hole) => {
      const r = play(mode, surrender, up, hole);
      surrendered(r, 5);
      expect(r.dealer.isBlackjack).toBe(true);
    });

    it("earlyNoAce against an ace: not offered, the hand stands and loses to the blackjack", () => {
      const r = play(mode, "earlyNoAce", "A", "K");
      expect(r.hands[0].surrendered).toBeUndefined();
      expect([r.results, r.payout]).toEqual([[LOSE], 0]);
    });

    it("late against a 2-9 up card is fixed at once: no blackjack is possible", () => {
      const s = step(play(mode, "late", "6", "K").afterDeal, { type: "SURRENDER", handIdx: 0 });
      expect(s.hands[0]).toMatchObject({ surrendered: true, result: SURRENDER, status: HandStatus.DONE });
    });

    it.each([["K", "5"], ["A", "5"]])("late against %s waits: result NONE until the dealer's blackjack is known", (up, hole) => {
      const { afterDeal } = play(mode, "late", up, hole);
      const s = step(afterDeal, { type: "SURRENDER", handIdx: 0 });
      expect(s).toMatchObject({ phase: GamePhases.DEALER_TURN });
      expect(s.hands[0]).toMatchObject({ surrendered: true, result: HandResult.NONE, status: HandStatus.DONE });
      expect(s.creditEvents).toBe(afterDeal.creditEvents); // no credit event until the settle
    });

    it("a waiting surrender with original-bet-only still loses everything to the dealer blackjack: nothing was added to the first bet", () => {
      const r = play(mode, "late", "K", "A", { rules: { noHoleCardLoss: "original" } });
      expect(r.hands[0]).toMatchObject({ result: LOSE, bet: 10, payout: 0 });
      expect(settles(r)).toEqual([0]);
    });

    it("a waiting surrender with original-bet-only and no blackjack still gets half back", () => {
      surrendered(play(mode, "late", "K", "5", { rules: { noHoleCardLoss: "original" } }), 5);
    });
  });

  describe("the dealer stops at two cards after a surrender", () => {
    // Dealer 6 + ace is a soft 17: with H17 it would hit if it were playing out its hand.
    it.each(modes)("%s, H17 with a soft 17: no hit", (_name, mode) => {
      surrendered(play(mode, "late", "6", "A", { rules: { dealerHitsSoft17: true } }), 5);
    });

    it.each(modes)("%s control: without a surrender the same dealer hits soft 17", (_name, mode) => {
      const r = playRound({ cards: ["10", "6", "6", "A", ...SPARES], mode, rules: { dealerHitsSoft17: true } });
      expect(r.dealer.cards.length).toBeGreaterThan(2);
    });

    it("EU: the surrendered hand is the only hand and the dealer still draws its second card", () => {
      const r = play(Modes.EU, "late", "K", "5");
      expect(r.afterDeal.dealer.cards).toHaveLength(1);
      surrendered(r, 5);
      expect(r.dealer.cards.map((c) => c.value)).toEqual([10, 5]);
    });

    it("EU: the dealer toggles change nothing", () => {
      for (const rules of [{ dealerDrawsOnceOn21: true }, { dealerDrawsOnPlayerBust: true }, { dealerDrawsOnPlayerBlackjack: true }]) {
        surrendered(play(Modes.EU, "late", "6", "K", { rules }), 5);
        surrendered(play(Modes.EU, "late", "K", "5", { rules }), 5);
      }
    });

    it("US no peek: a surrender at once against a 2-9 draws no card for a dealer under 17", () => {
      const r = play(Modes.NO_PEEK, "late", "6", "5");
      surrendered(r, 5);
      expect(r.dealer.total).toBe(11);
    });

    it("US no peek: a waiting surrender with a dealer 10-5 stops at two cards", () => {
      const r = play(Modes.NO_PEEK, "late", "K", "5");
      surrendered(r, 5);
      expect(r.dealer.total).toBe(15);
    });
  });

  describe("never offered", () => {
    const rules = { surrender: "late", tripleDown: true };
    const dealt = (cards, mode = Modes.PEEK, extra = {}) => playRound({ cards: [...cards, "9", "9", "9", "9"], mode, rules: { ...rules, ...extra } }).afterDeal;
    const refused = (s, handIdx = s.selectedHandIndex) => expect(step(s, { type: "SURRENDER", handIdx })).toBe(s);

    it("offered on the first two cards", () => {
      const s = dealt(["10", "6", "6", "K"]);
      expect(s.phase).toBe(GamePhases.PLAYER_TURN);
      expect(step(s, { type: "SURRENDER", handIdx: 0 })).not.toBe(s);
    });

    it("not after a hit", () => {
      const s = step(dealt(["2", "6", "3", "K", "4"]), { type: "HIT", handIdx: 0 });
      expect(s).toMatchObject({ phase: GamePhases.PLAYER_TURN });
      expect(s.hands[0].cards).toHaveLength(3);
      refused(s);
    });

    it("not after a double", () => {
      const s = step(dealt(["5", "6", "6", "K", "10"]), { type: "DOUBLE", handIdx: 0 });
      expect(s.hands[0]).toMatchObject({ isDouble: true, status: HandStatus.DONE });
      refused(s);
    });

    it("not after a face-down double", () => {
      const s = step(dealt(["5", "6", "6", "K", "10"], Modes.PEEK, { doubleFaceDown: true }), { type: "DOUBLE", handIdx: 0 });
      expect(s.hands[0].hiddenCards).toHaveLength(1);
      refused(s);
    });

    it("not after a triple", () => {
      const s = step(dealt(["5", "6", "6", "K", "2", "3"]), { type: "TRIPLE", handIdx: 0 });
      expect(s.hands[0].bet).toBe(30);
      refused(s);
    });

    it.each([[Modes.PEEK], [Modes.NO_PEEK], [Modes.EU]])("not on either hand of a split (%s)", (mode) => {
      const split = step(dealt(["8", "6", "8", "K", "3", "2"], mode), { type: "SPLIT", handIdx: 0 });
      expect(split.hands).toHaveLength(2);
      refused(split, 0);
      const second = step(split, { type: "STAND", handIdx: 0 });
      expect(second).toMatchObject({ phase: GamePhases.PLAYER_TURN, selectedHandIndex: 1 });
      refused(second, 1);
    });

    it("not on a player blackjack: the hand has no turn and the action is ignored", () => {
      const r = playRound({ cards: ["A", "6", "K", "K"], mode: Modes.NO_PEEK, actions: ["surrender"], rules });
      expect(r.afterDeal.phase).toBe(GamePhases.DEALER_TURN);
      refused(r.afterDeal, 0);
      expect([r.results, r.payout]).toEqual([[WIN], 25]);
    });

    it("not on a hand that is not the current one", () => {
      const split = step(dealt(["8", "6", "8", "K", "3", "2"]), { type: "SPLIT", handIdx: 0 });
      refused(split, 1);
    });
  });

  describe("money", () => {
    it.each([[1, 0.5], [5, 2.5], [10, 5], [25, 12.5]])("a bet of %s gives back %s in one settle", (bet, back) => {
      surrendered(play(Modes.PEEK, "late", "6", "K", { bet }), back);
    });

    it("a waiting surrender settles the half too", () => {
      surrendered(play(Modes.EU, "late", "K", "5", { bet: 5 }), 2.5);
    });

    it("the stake was booked once, at the deal: bet, then the one settle", () => {
      const r = play(Modes.PEEK, "late", "6", "K");
      expect(r.state.creditEvents.filter((e) => e.kind !== "local").map((e) => [e.kind, e.amount])).toEqual([["bet", 10], ["settle", 5]]);
    });

    it("a refused opening bet voids the round: no settle", () => {
      for (const mode of [Modes.PEEK, Modes.EU]) {
        const r = playRound({ cards: ["10", "6", "6", "K", ...SPARES], mode, actions: ["surrender"], rules: { surrender: "late" }, refuse: [0] });
        expect(r.state.phase).toBe(GamePhases.PRE_DEAL);
        expect(settles(r)).toEqual([]);
        expect(r.hands).toHaveLength(0);
      }
    });

    it("settling waits for the pending bet, and sends the half once the server has answered", () => {
      let s = step(play(Modes.PEEK, "late", "6", "K").afterDeal, { type: "SURRENDER", handIdx: 0 });
      expect(s.pendingBets).toHaveLength(1);
      while (nextAutoAction(s)) s = step(s, { type: nextAutoAction(s) });
      expect(s.phase).toBe(GamePhases.SETTLING_HANDS);
      expect(s.creditEvents.some((e) => e.kind === "settle")).toBe(false);
      s = confirmBets(s);
      expect(nextAutoAction(s)).toBe("SETTLE");
      s = step(s, { type: "SETTLE" });
      expect(s.hands[0]).toMatchObject({ result: SURRENDER, payout: 5 });
    });

    it("auto deal rebets and arms the next deal after a surrender round, as after any round", () => {
      const done = playRound({ cards: ["10", "6", "6", "K", ...SPARES], actions: ["surrender"], rules: { surrender: "late" } }).state;
      const s = { ...done, settings: { ...done.settings, resetInitialBet: true, autoDeal: true } };
      expect(nextAutoAction(s)).toBe("CONTINUE");
      const armed = [{ type: "CONTINUE" }, { type: "END_ROUND" }].reduce(step, s);
      expect(armed).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle: 10, autoDealPending: true });
      expect(nextAutoAction(armed)).toBe("DEAL");
    });
  });

  describe("presets", () => {
    const withPreset = (name, cards, actions = ["surrender"]) => playRound({ cards: [...cards, ...SPARES], actions, rules: RULE_PRESETS[name] });

    it("Vegas: late against a 6 with the dealer peeking, and a soft 17 stays at two cards", () => {
      expect(RULE_PRESETS.Vegas.surrender).toBe("late");
      surrendered(withPreset("Vegas", ["10", "6", "6", "K"]), 5);
      surrendered(withPreset("Vegas", ["10", "6", "6", "A"]), 5); // H17, but nothing to play out
    });

    it("Atlantic City: late against a ten is void on a dealer blackjack, and half comes back otherwise", () => {
      const lost = withPreset("Atlantic City", ["10", "K", "6", "A"]);
      expect(lost.dealer.isBlackjack).toBe(true);
      expect([lost.results, lost.payout, settles(lost)]).toEqual([[LOSE], 0, [0]]);
      surrendered(withPreset("Atlantic City", ["10", "K", "6", "5"]), 5);
    });

    it.each(["Europe", "Australia"])("%s: no surrender, the action is ignored", (name) => {
      const r = withPreset(name, ["10", "K", "6", "9"]);
      expect(RULE_PRESETS[name].surrender).toBe("none");
      expect(r.hands[0].surrendered).toBeUndefined();
      expect([r.results, r.payout]).toEqual([[LOSE], 0]);
    });

    it("Singapore: early against a ten keeps half even with a dealer blackjack, and is not offered against an ace", () => {
      expect(RULE_PRESETS.Singapore.surrender).toBe("earlyNoAce");
      const kept = withPreset("Singapore", ["10", "K", "6", "A"]);
      surrendered(kept, 5);
      expect(kept.dealer.isBlackjack).toBe(true);
      const ace = withPreset("Singapore", ["10", "A", "6", "K"]);
      expect(ace.hands[0].surrendered).toBeUndefined();
      expect([ace.results, ace.payout]).toEqual([[LOSE], 0]);
    });
  });
});

describe("offers (#91): insurance, even money and early surrender at the offers", () => {
  const { SURRENDER } = HandResult;
  const { OFFERS, PEEK, PLAYER_TURN, DEALER_TURN } = GamePhases;
  const step = (state, ...actions) => actions.reduce((s, a) => gameReducer(s, { refill: outOfCards, credits: 1e9, ...a }), state);
  const settles = (r) => r.state.creditEvents.filter((e) => e.kind === "settle").map((e) => e.amount);
  const ledger = (r) => r.state.creditEvents.filter((e) => e.kind === "bet" || e.kind === "settle");
  const SPARES = ["9", "9"]; // a draw by the player or the dealer that should not happen shows in `cardsLeft`
  const modes = [["US peek", Modes.PEEK], ["US no peek", Modes.NO_PEEK], ["EU", Modes.EU]];
  const takeIns = "take_insurance";
  const INSURANCE_BET = { kind: "bet", amount: 5, newRound: false, alreadyDeducted: false, side: "insurance" };

  // Bet 10, insurance on. Cards in table order: the player's two, the dealer's up card, the hole card (EU: drawn after the player's own draws).
  const round = (mode, { player = ["10", "6"], up = "A", hole = "6", draws = [], rules = {}, ...rest } = {}) => playRound({
    cards: mode === Modes.EU ? [player[0], up, player[1], ...draws, hole, ...SPARES] : [player[0], up, player[1], hole, ...draws, ...SPARES],
    mode, rules: { insurance: true, ...rules }, ...rest,
  });

  describe.each(modes)("%s: insurance against an ace", (_name, mode) => {
    const peek = mode === Modes.PEEK;

    it("stops at OFFERS with one dealer card showing and the hole card still hidden", () => {
      const r = round(mode, { hole: "K" });
      expect(r.afterDeal.phase).toBe(OFFERS);
      expect(r.afterDeal.offers).toEqual({ insurance: true, evenMoney: false, surrender: false, peek });
      expect(r.afterDeal.dealer.cards).toHaveLength(1);
      expect(r.afterDeal.hands[0]).toMatchObject({ status: HandStatus.PLAYING, result: HandResult.NONE });
      if (mode !== Modes.EU) expect(r.afterDeal.dealerHole.cards).toHaveLength(1); // dealt, but face down and unresolved
      expect(r.afterDeal.dealer.isBlackjack).toBeFalsy(); // a deferred peek has decided nothing yet
    });

    it("taken against a dealer blackjack: insurance pays 2:1 and the hand's stake is lost, in one settle (net 0)", () => {
      const r = round(mode, { hole: "K", offers: [takeIns] });
      expect(r.dealer.isBlackjack).toBe(true);
      expect(r.hands[0]).toMatchObject({ result: LOSE, insurance: 5, insurancePayout: 15, payout: 15 });
      expect([r.payout, settles(r), r.insuranceStaked]).toEqual([15, [15], 5]);
      expect(ledger(r)).toEqual([expect.objectContaining({ kind: "bet", amount: 10, newRound: true }), expect.objectContaining(INSURANCE_BET), expect.objectContaining({ kind: "settle", amount: 15 })]);
      expect(r.staked + r.insuranceStaked - r.payout).toBe(0);
    });

    it("declined against a dealer blackjack: the whole bet is lost, no second ledger bet", () => {
      const r = round(mode, { hole: "K", offers: ["decline_offers"] });
      expect(r.hands[0].insurance).toBeUndefined();
      expect(r.hands[0].insurancePayout).toBeUndefined();
      expect([r.results, r.payout, settles(r)]).toEqual([[LOSE], 0, [0]]);
      expect(ledger(r).filter((e) => e.kind === "bet")).toHaveLength(1);
    });

    it("taken, no dealer blackjack, the player loses: insurance is lost with the bet (net -15)", () => {
      const r = round(mode, { hole: "6", offers: [takeIns] }); // 16 against a soft 17
      expect(r.dealer.isBlackjack).toBe(false);
      expect(r.hands[0]).toMatchObject({ result: LOSE, insurance: 5, insurancePayout: 0, payout: 0 });
      expect([r.payout, settles(r)]).toEqual([0, [0]]);
    });

    it("taken, no dealer blackjack, the player wins: only the hand pays (net +5)", () => {
      const r = round(mode, { player: ["10", "9"], hole: "6", offers: [takeIns] });
      expect(r.hands[0]).toMatchObject({ result: WIN, insurancePayout: 0, payout: 20 });
      expect([r.payout, settles(r)]).toEqual([20, [20]]);
      expect(r.staked + r.insuranceStaked - r.payout).toBe(-5);
    });

    it("declined, no dealer blackjack: the round plays as it always did", () => {
      const r = round(mode, { player: ["10", "9"], hole: "6" });
      expect([r.results, r.payout, settles(r), r.insuranceStaked]).toEqual([[WIN], 20, [20], 0]);
    });

    it("sends the insurance as a ledger bet for half the stake, newRound false, tagged with the hand", () => {
      const s = step(round(mode, { hole: "K" }).afterDeal, { type: "TAKE_INSURANCE" });
      const event = s.creditEvents.at(-1);
      expect(event).toMatchObject({ ...INSURANCE_BET, handTag: s.hands[0].tag });
      expect(s.pendingBets.at(-1)).toMatchObject({ amount: 5, newRound: false, side: "insurance", handTag: s.hands[0].tag });
      expect(s.hands[0].bet).toBe(10); // the hand's own stake and the bet circle are untouched
      expect(s.betCircle).toBe(10);
    });

    it("is not offered against a ten, and the round never visits OFFERS or PEEK", () => {
      const r = round(mode, { up: "K", hole: "6" });
      expect(r.afterDeal.phase).toBe(PLAYER_TURN);
      expect(r.afterDeal.offers).toBeNull();
    });

    it("is not offered with the setting off", () => {
      const r = round(mode, { hole: "K", rules: { insurance: false } });
      expect(r.afterDeal.phase).not.toBe(OFFERS);
      expect(r.afterDeal.offers).toBeNull();
      expect([r.results, r.payout]).toEqual([[LOSE], 0]);
    });

    it("is not offered when the balance cannot cover half the bet, and the round plays on", () => {
      const r = round(mode, { hole: "K", credits: 4 });
      expect(r.afterDeal.phase).not.toBe(OFFERS);
      expect(r.afterDeal.offers).toBeNull();
      expect(r.payout).toBe(0);
    });

    it("is offered when the balance covers exactly half the bet", () => {
      expect(round(mode, { hole: "K", credits: 5 }).afterDeal.phase).toBe(OFFERS);
    });

    it("a player blackjack gets even money, not insurance", () => {
      const r = round(mode, { player: ["A", "K"], hole: "6" });
      expect(r.afterDeal.offers).toMatchObject({ evenMoney: true, insurance: false });
    });
  });

  describe.each(modes)("%s: insurance on a hand that busts", (_name, mode) => {
    const peek = mode === Modes.PEEK;
    const bust = { draws: ["K"], actions: ["hit"] }; // 10-6 hits a king

    // With a peek the dealer's blackjack is found before the player acts, so there is no hit to bust on.
    if (!peek) {
      it("busts against a dealer blackjack: insurance still pays 2:1 and the dealer takes its second card", () => {
        const r = round(mode, { ...bust, hole: "K", offers: [takeIns] });
        expect(r.hands[0]).toMatchObject({ isBusted: true, result: LOSE, insurancePayout: 15, payout: 15 });
        expect(r.dealer.cards).toHaveLength(2);
        expect(r.dealer.isBlackjack).toBe(true);
        expect([r.payout, settles(r), r.cardsLeft]).toEqual([15, [15], SPARES.length]);
      });
    }

    it("busts and the dealer has no blackjack: the dealer still takes its second card, stops at two, and the insurance is lost", () => {
      const r = round(mode, { ...bust, hole: "5", offers: [takeIns] }); // A-5 is a soft 16: playing on would draw
      expect(r.hands[0]).toMatchObject({ isBusted: true, result: LOSE, insurancePayout: 0, payout: 0 });
      expect(r.dealer.cards).toHaveLength(2);
      expect([r.payout, settles(r), r.cardsLeft]).toEqual([0, [0], SPARES.length]);
    });

    if (mode === Modes.EU) {
      it("control: without insurance an all-bust EU round never draws the dealer's second card", () => {
        const r = round(mode, { ...bust, hole: "5" });
        expect(r.dealer.cards).toHaveLength(1);
        expect(r.cardsLeft).toBe(SPARES.length + 1);
      });
    }
  });

  describe("US peek: the deferred peek", () => {
    it("the hole card is not decided before PEEK, and PEEK reveals a dealer blackjack and ends the hand", () => {
      const r = round(Modes.PEEK, { hole: "K", offers: [takeIns] });
      expect(r.afterDeal.dealerHole.cards).toHaveLength(1);
      const insured = step(r.afterDeal, { type: "TAKE_INSURANCE" });
      expect(insured.phase).toBe(PEEK);
      expect(insured.dealer.cards).toHaveLength(1);
      expect(insured.hands[0].result).toBe(HandResult.NONE); // not decided until the peek
      const peeked = step(insured, { type: "PEEK" });
      expect(peeked).toMatchObject({ phase: DEALER_TURN, offers: null });
      expect(peeked.dealer).toMatchObject({ isBlackjack: true, status: HandStatus.DONE });
      expect(peeked.dealer.cards).toHaveLength(2);
      expect(peeked.dealerHole.cards).toHaveLength(0);
      expect(peeked.hands[0]).toMatchObject({ result: LOSE, status: HandStatus.DONE });
    });

    it("no dealer blackjack: the hole card stays face down and the player's turn begins", () => {
      const r = round(Modes.PEEK, { hole: "6", offers: [takeIns] });
      expect(r.afterOffers).toMatchObject({ phase: PLAYER_TURN, offers: null });
      expect(r.afterOffers.dealer.cards).toHaveLength(1);
      expect(r.afterOffers.dealerHole.cards).toHaveLength(1);
      expect(r.afterOffers.hands[0].status).toBe(HandStatus.PLAYING);
    });

    it("late surrender and insurance: a dealer blackjack at the peek takes the hand and pays the insurance, nothing to surrender", () => {
      const r = round(Modes.PEEK, { hole: "K", offers: [takeIns], actions: ["surrender"], rules: { surrender: "late" } });
      expect(r.afterOffers.phase).toBe(DEALER_TURN);
      expect(r.hands[0]).toMatchObject({ result: LOSE, payout: 15, insurancePayout: 15 });
      expect(r.hands[0].surrendered).toBeUndefined();
      expect(settles(r)).toEqual([15]);
    });

    it("late surrender and insurance: with no blackjack the surrender gives half back and the insurance is lost", () => {
      const r = round(Modes.PEEK, { hole: "6", offers: [takeIns], actions: ["surrender"], rules: { surrender: "late" } });
      expect(r.hands[0]).toMatchObject({ result: SURRENDER, surrendered: true, payout: 5, insurancePayout: 0 });
      expect([r.payout, settles(r)]).toEqual([5, [5]]);
      expect(r.dealer.cards).toHaveLength(2); // the dealer shows its second card and stops
      expect(r.cardsLeft).toBe(SPARES.length);
    });

    it("the peek runs by itself: the next automatic step is PEEK, and OFFERS has none", () => {
      const r = round(Modes.PEEK, { hole: "6" });
      expect(nextAutoAction(r.afterDeal)).toBeNull();
      expect(nextAutoAction(step(r.afterDeal, { type: "DECLINE_OFFERS" }))).toBe("PEEK");
    });

    it("original-bet-only does not change the peek: the insured hand never had a turn", () => {
      const r = round(Modes.PEEK, { hole: "K", offers: [takeIns], rules: { noHoleCardLoss: "original" } });
      expect([r.payout, settles(r)]).toEqual([15, [15]]);
    });
  });

  describe.each([["US no peek", Modes.NO_PEEK], ["EU", Modes.EU]])("%s: insurance and the player's turn", (_name, mode) => {
    it("late surrender against a dealer blackjack: the surrender is void (the whole bet is lost), insurance pays 2:1", () => {
      const r = round(mode, { hole: "K", offers: [takeIns], actions: ["surrender"], rules: { surrender: "late" } });
      expect(r.hands[0]).toMatchObject({ surrendered: true, result: LOSE, payout: 15, insurancePayout: 15 });
      expect([r.payout, settles(r)]).toEqual([15, [15]]);
    });

    it("late surrender with no dealer blackjack: half comes back, the insurance is lost", () => {
      const r = round(mode, { hole: "6", offers: [takeIns], actions: ["surrender"], rules: { surrender: "late" } });
      expect(r.hands[0]).toMatchObject({ surrendered: true, result: SURRENDER, payout: 5, insurancePayout: 0 });
      expect([r.payout, settles(r)]).toEqual([5, [5]]);
      expect(r.dealer.cards).toHaveLength(2);
      expect(r.cardsLeft).toBe(SPARES.length);
    });

    it("early surrender stays a move on the turn here: insure at OFFERS, surrender later, half is kept even against a blackjack", () => {
      const r = round(mode, { hole: "K", offers: [takeIns], actions: ["surrender"], rules: { surrender: "early" } });
      expect(r.afterDeal.offers).toMatchObject({ insurance: true, surrender: false }); // never offered at OFFERS here
      expect(r.afterOffers.phase).toBe(PLAYER_TURN);
      expect(r.hands[0]).toMatchObject({ surrendered: true, result: SURRENDER, payout: 20, insurancePayout: 15 }); // 5 back + 15 insurance
      expect(settles(r)).toEqual([20]);
    });

    it("early surrender against a ten stays on the turn too: no OFFERS step at all", () => {
      const r = round(mode, { up: "K", hole: "5", actions: ["surrender"], rules: { surrender: "early", insurance: false } });
      expect(r.afterDeal.phase).toBe(PLAYER_TURN);
      expect(r.hands[0]).toMatchObject({ result: SURRENDER, payout: 5 });
    });

    it("a double after insuring: the dealer's blackjack takes both stakes (all) and the insurance still pays once", () => {
      const r = round(mode, { player: ["5", "6"], hole: "K", draws: ["10"], offers: [takeIns], actions: ["double"] });
      expect(r.hands[0]).toMatchObject({ bet: 20, result: LOSE, insurancePayout: 15, payout: 15 });
      expect(ledger(r).filter((e) => e.kind === "bet").map((e) => e.amount)).toEqual([10, 5, 10]);
      expect(settles(r)).toEqual([15]);
    });

    it("a double after insuring with original-bet-only: the added stake comes back, plus the insurance", () => {
      const r = round(mode, { player: ["5", "6"], hole: "K", draws: ["10"], offers: [takeIns], actions: ["double"], rules: { noHoleCardLoss: "original" } });
      expect(r.hands[0]).toMatchObject({ bet: 20, result: LOSE, payout: 25, insurancePayout: 15 });
      expect(settles(r)).toEqual([25]);
    });

    it("an insured hand that splits: the split-off hand carries no insurance and it is paid once", () => {
      const r = round(mode, { player: ["8", "8"], hole: "K", draws: ["3", "2"], offers: [takeIns], actions: ["split", "stand", "stand"] });
      expect(r.hands).toHaveLength(2);
      expect(r.hands.map((h) => h.insurance ?? 0)).toEqual([5, 0]);
      expect(r.hands.map((h) => h.insurancePayout)).toEqual([15, undefined]);
      expect(r.insuranceStaked).toBe(5);
      expect([r.results, r.payout, settles(r)]).toEqual([[LOSE, LOSE], 15, [15]]);
      expect(ledger(r).filter((e) => e.kind === "bet").map((e) => e.amount)).toEqual([10, 5, 10]);
    });

    it("an insured split with original-bet-only: the split-off stake comes back, the insurance once", () => {
      const r = round(mode, { player: ["8", "8"], hole: "K", draws: ["3", "2"], offers: [takeIns], actions: ["split", "stand", "stand"], rules: { noHoleCardLoss: "original" } });
      expect([r.payout, settles(r)]).toEqual([25, [25]]); // 0 + 10 (split-off) + 15
    });

    it("an insured live hand still makes the dealer play out its total (the insurance does not stop the dealer at two)", () => {
      const r = round(mode, { player: ["10", "9"], hole: "5", offers: [takeIns] }); // A-5 hits both spare nines and busts
      expect(r.dealer).toMatchObject({ isBusted: true });
      expect(r.dealer.cards).toHaveLength(4);
      expect(r.hands[0]).toMatchObject({ result: WIN, payout: 20, insurancePayout: 0 });
    });
  });

  describe.each(modes)("%s: even money", (_name, mode) => {
    const peek = mode === Modes.PEEK;
    const bj = { player: ["A", "K"] };

    it("is offered on a player blackjack against an ace, and only that", () => {
      const r = round(mode, { ...bj, hole: "5" });
      expect(r.afterDeal.phase).toBe(OFFERS);
      expect(r.afterDeal.offers).toEqual({ insurance: false, evenMoney: true, surrender: false, peek });
      expect(r.afterDeal.hands[0].result).toBe(HandResult.NONE); // the blackjack is not paid yet
    });

    it.each([["K", true], ["5", false]])("taken against a dealer hole of %s: paid 1:1 (20), never pushed, no second ledger bet", (hole, dealerBj) => {
      const r = round(mode, { ...bj, hole, offers: ["even_money"] });
      expect(r.dealer.isBlackjack).toBe(dealerBj);
      expect(r.hands[0]).toMatchObject({ result: WIN, evenMoney: true, payout: 20 });
      expect([r.payout, settles(r)]).toEqual([20, [20]]);
      expect(ledger(r).filter((e) => e.kind === "bet")).toHaveLength(1);
    });

    it("taken: the win is fixed at once, before the peek or the dealer's turn", () => {
      const s = step(round(mode, { ...bj, hole: "K" }).afterDeal, { type: "EVEN_MONEY" });
      expect(s.hands[0]).toMatchObject({ result: WIN, evenMoney: true, status: HandStatus.DONE });
      expect(s.phase).toBe(peek ? PEEK : DEALER_TURN);
    });

    it("declined against a dealer blackjack: a push (10)", () => {
      const r = round(mode, { ...bj, hole: "K" });
      expect([r.results, r.payout, settles(r)]).toEqual([[PUSH], 10, [10]]);
      expect(r.hands[0].evenMoney).toBeUndefined();
    });

    it("declined, no dealer blackjack: paid 3:2 (25)", () => {
      const r = round(mode, { ...bj, hole: "5" });
      expect([r.results, r.payout, settles(r)]).toEqual([[WIN], 25, [25]]);
    });

    it("with 6:5: declined pays 22, even money still 20", () => {
      expect(round(mode, { ...bj, hole: "5", rules: { blackjackPayout: "6:5" } }).payout).toBe(22);
      expect(round(mode, { ...bj, hole: "5", rules: { blackjackPayout: "6:5" }, offers: ["even_money"] }).payout).toBe(20);
    });

    it("insurance cannot be taken on it (a blackjack gets even money only): the action is ignored", () => {
      const { afterDeal } = round(mode, { ...bj, hole: "K" });
      expect(step(afterDeal, { type: "TAKE_INSURANCE" })).toBe(afterDeal);
    });

    it("is not offered with the insurance setting off: the blackjack waits for the dealer or pays at the deal as before", () => {
      const r = round(mode, { ...bj, hole: "5", rules: { insurance: false } });
      expect(r.afterDeal.offers).toBeNull();
      expect(r.afterDeal.phase).toBe(DEALER_TURN);
      expect(r.payout).toBe(25);
    });
  });

  describe("even money where the blackjack already pays in full at once", () => {
    const bj = { player: ["A", "K"], hole: "5" };

    it("US no peek with blackjackPaysImmediately: no offer, 25 at the deal", () => {
      const r = round(Modes.NO_PEEK, { ...bj, rules: { blackjackPaysImmediately: true } });
      expect(r.afterDeal).toMatchObject({ phase: DEALER_TURN, offers: null });
      expect(r.afterDeal.hands[0].result).toBe(WIN);
      expect([r.payout, settles(r)]).toEqual([25, [25]]);
    });

    it("EU without dealerDrawsOnPlayerBlackjack: no offer, 25 at the deal", () => {
      const r = round(Modes.EU, { ...bj, rules: { dealerDrawsOnPlayerBlackjack: false } });
      expect(r.afterDeal).toMatchObject({ phase: DEALER_TURN, offers: null });
      expect(r.afterDeal.hands[0].result).toBe(WIN);
      expect([r.payout, settles(r)]).toEqual([25, [25]]);
    });

    it("US no peek without it, and EU with dealerDrawsOnPlayerBlackjack: the offer is made", () => {
      expect(round(Modes.NO_PEEK, bj).afterDeal.phase).toBe(OFFERS);
      expect(round(Modes.EU, { ...bj, rules: { dealerDrawsOnPlayerBlackjack: true } }).afterDeal.phase).toBe(OFFERS);
    });

    it("US peek: blackjackPaysImmediately makes no difference, even money is offered either way", () => {
      for (const blackjackPaysImmediately of [true, false]) expect(round(Modes.PEEK, { ...bj, rules: { blackjackPaysImmediately } }).afterDeal.phase).toBe(OFFERS);
    });

    it("US peek with insurance off: the blackjack is paid at the deal as before (25), no OFFERS", () => {
      const r = round(Modes.PEEK, { ...bj, rules: { insurance: false } });
      expect(r.afterDeal).toMatchObject({ phase: DEALER_TURN, offers: null });
      expect(r.afterDeal.hands[0].result).toBe(WIN);
      expect(r.payout).toBe(25);
    });
  });

  describe("US peek: early surrender at the offers", () => {
    const early = ({ rules = {}, ...rest } = {}) => round(Modes.PEEK, { rules: { surrender: "early", insurance: false, ...rules }, ...rest });

    it("offered against a ten (no insurance there); taken, the half is kept against a dealer blackjack", () => {
      const r = early({ up: "K", hole: "A", offers: ["surrender"] });
      expect(r.afterDeal.offers).toEqual({ insurance: false, evenMoney: false, surrender: true, peek: true });
      expect(r.hands[0]).toMatchObject({ surrendered: true, result: SURRENDER, payout: 5 });
      expect(r.dealer.isBlackjack).toBe(true);
      expect([r.payout, settles(r)]).toEqual([5, [5]]);
    });

    it("taken with no dealer blackjack: the same half, and the dealer stops at two cards", () => {
      const r = early({ up: "K", hole: "5", offers: ["surrender"] });
      expect([r.results, r.payout, r.dealer.cards.length, r.cardsLeft]).toEqual([[SURRENDER], 5, 2, SPARES.length]);
    });

    it("declined against a dealer blackjack: the whole bet is lost", () => {
      const r = early({ up: "K", hole: "A" });
      expect([r.results, r.payout]).toEqual([[LOSE], 0]);
    });

    it("declined with no blackjack: play begins, and Surrender is no longer offered on the turn", () => {
      const r = early({ up: "K", hole: "5" });
      expect(r.afterOffers.phase).toBe(PLAYER_TURN);
      expect(canSurrender(r.afterOffers.hands[0], r.afterOffers.dealer, r.afterOffers.settings)).toBe(false);
      expect(step(r.afterOffers, { type: "SURRENDER", handIdx: 0 })).toBe(r.afterOffers);
    });

    it("earlyNoAce is offered against a ten and not against an ace", () => {
      expect(early({ up: "K", hole: "5", rules: { surrender: "earlyNoAce" } }).afterDeal.offers).toMatchObject({ surrender: true });
      const ace = early({ up: "A", hole: "5", rules: { surrender: "earlyNoAce" } });
      expect(ace.afterDeal.phase).toBe(PLAYER_TURN); // nothing is offered, so no OFFERS step
      const withInsurance = early({ up: "A", hole: "K", rules: { surrender: "earlyNoAce", insurance: true } });
      expect(withInsurance.afterDeal.offers).toEqual({ insurance: true, evenMoney: false, surrender: false, peek: true });
    });

    it("early against a 6 is not an OFFERS matter: it is a turn move, as before", () => {
      const r = early({ up: "6", hole: "K", actions: ["surrender"] });
      expect(r.afterDeal.phase).toBe(PLAYER_TURN);
      expect([r.results, r.payout]).toEqual([[SURRENDER], 5]);
    });

    it("a player blackjack is never offered a surrender", () => {
      expect(early({ player: ["A", "K"], up: "K", hole: "5" }).afterDeal.offers).toBeNull();
    });

    describe("early against an ace with insurance on", () => {
      const both = (offers, hole) => round(Modes.PEEK, { rules: { surrender: "early" }, offers, hole });

      it("both offers are open together", () => {
        expect(both([], "K").afterDeal.offers).toEqual({ insurance: true, evenMoney: false, surrender: true, peek: true });
      });

      it.each([[[takeIns, "surrender"]], [["surrender", takeIns]]])("%j, dealer blackjack: half back plus the insurance, one settle of 20", (offers) => {
        const r = both(offers, "K");
        expect(r.hands[0]).toMatchObject({ surrendered: true, result: SURRENDER, insurancePayout: 15, payout: 20 });
        expect([r.payout, settles(r)]).toEqual([20, [20]]);
        expect(r.dealer.isBlackjack).toBe(true);
      });

      it.each([[[takeIns, "surrender"]], [["surrender", takeIns]]])("%j, no dealer blackjack: half back, insurance lost (net -10)", (offers) => {
        const r = both(offers, "6");
        expect(r.hands[0]).toMatchObject({ surrendered: true, result: SURRENDER, insurancePayout: 0, payout: 5 });
        expect([r.payout, settles(r)]).toEqual([5, [5]]);
        expect(r.staked + r.insuranceStaked - r.payout).toBe(10);
      });

      it("each answer closes only its own offer; the phase ends when none is left", () => {
        const first = both([], "K").afterDeal;
        const insured = step(first, { type: "TAKE_INSURANCE" });
        expect([insured.phase, insured.offers]).toEqual([OFFERS, { insurance: false, evenMoney: false, surrender: true, peek: true }]);
        const surrendered = step(first, { type: "SURRENDER", handIdx: 0 });
        expect([surrendered.phase, surrendered.offers.insurance, surrendered.offers.surrender]).toEqual([OFFERS, true, false]);
        expect(step(insured, { type: "SURRENDER", handIdx: 0 }).phase).toBe(PEEK);
      });

      it("surrender at the offers is not the late kind: it is fixed at once, and a dealer blackjack at the peek leaves it alone", () => {
        const s = step(both([], "K").afterDeal, { type: "SURRENDER", handIdx: 0 });
        expect(s.hands[0]).toMatchObject({ result: SURRENDER, surrendered: true, status: HandStatus.DONE });
        expect(step(s, { type: "DECLINE_OFFERS" }, { type: "PEEK" }).hands[0].result).toBe(SURRENDER);
      });
    });
  });

  describe("money", () => {
    it.each([[1, 0.5, 1.5], [5, 2.5, 7.5], [10, 5, 15], [25, 12.5, 37.5], [3, 1.5, 4.5]])("a bet of %s insures for %s and a dealer blackjack pays %s, to the cent", (bet, stake, back) => {
      for (const [, mode] of modes) {
        const r = round(mode, { bet, hole: "K", offers: [takeIns] });
        expect(r.insuranceStaked).toBe(stake);
        expect(r.hands[0].insurancePayout).toBe(back);
        expect([r.payout, settles(r)]).toEqual([back, [back]]);
        expect(ledger(r)[1]).toMatchObject({ kind: "bet", amount: stake, newRound: false, side: "insurance" });
      }
    });

    it("the one settle is the sum of the hand payouts, insurance included, to the cent (bet 5: stake 2.5, pays 7.5)", () => {
      const r = round(Modes.NO_PEEK, { player: ["8", "8"], hole: "K", draws: ["3", "2"], offers: [takeIns], bet: 5, actions: ["split", "stand", "stand"], rules: { noHoleCardLoss: "original" } });
      expect(settles(r)).toEqual([r.hands.reduce((sum, h) => sum + h.payout, 0)]);
      expect(settles(r)).toEqual([12.5]); // 0 + 5 (split-off stake back) + 7.5
    });

    it("6:5 pays 2.2 times a blackjack, and an odd bet rounds to the cent", () => {
      expect(round(Modes.PEEK, { player: ["A", "K"], hole: "5", bet: 15, rules: { blackjackPayout: "6:5" } }).payout).toBe(33);
      expect(round(Modes.PEEK, { player: ["A", "K"], hole: "5", bet: 1, rules: { blackjackPayout: "6:5" } }).payout).toBe(2.2);
    });

    it("exactly one settle per round, whatever the offers", () => {
      for (const [, mode] of modes) {
        for (const offers of [[], [takeIns]]) expect(settles(round(mode, { hole: "K", offers }))).toHaveLength(1);
        expect(settles(round(mode, { player: ["A", "K"], hole: "K", offers: ["even_money"] }))).toHaveLength(1);
      }
    });

    it("TAKE_INSURANCE with a balance below the stake is ignored; the offer stays open", () => {
      const { afterDeal } = round(Modes.PEEK, { hole: "K" });
      expect(step(afterDeal, { type: "TAKE_INSURANCE", credits: 4.99 })).toBe(afterDeal);
      expect(step(afterDeal, { type: "TAKE_INSURANCE", credits: 5 }).hands[0].insurance).toBe(5);
      expect(step(afterDeal, { type: "TAKE_INSURANCE", credits: undefined }).hands[0].insurance).toBe(5); // unknown balance counts as affordable
    });

    it("a second TAKE_INSURANCE is ignored (the offer closed): insurance is never stacked", () => {
      const insured = step(round(Modes.EU, { hole: "K" }).afterDeal, { type: "TAKE_INSURANCE" });
      expect(insured.phase).toBe(PLAYER_TURN);
      expect(step(insured, { type: "TAKE_INSURANCE" })).toBe(insured);
    });
  });

  describe("the server refuses or is slow", () => {
    it.each(modes)("%s: a refused insurance bet voids only the insurance: the hand keeps its stake and no insurance is paid", (_name, mode) => {
      const r = round(mode, { hole: "K", offers: [takeIns], refuse: [1] });
      expect(r.hands[0]).toMatchObject({ bet: 10, insurance: 0 });
      expect(r.hands[0].insurancePayout).toBeUndefined();
      expect(r.state.notice).toMatch(/insurance bet/);
      expect([r.results, r.payout, settles(r)]).toEqual([[LOSE], 0, [0]]);
    });

    it("a refused insurance bet leaves the bet circle, the stake and the other ledger bets alone", () => {
      const insured = step(round(Modes.EU, { hole: "6" }).afterDeal, { type: "TAKE_INSURANCE" });
      const seq = insured.pendingBets.find((b) => b.side === "insurance").seq;
      const refused = step(insured, { type: "BET_REJECTED", seq });
      expect(refused.hands[0]).toMatchObject({ bet: 10, insurance: 0 });
      expect(refused.betCircle).toBe(insured.betCircle);
      expect(refused.pendingBets.map((b) => b.side)).toEqual([undefined]); // only the opening bet is left waiting
    });

    it("a refused insurance bet is found by the hand's tag, after a split moved the indexes", () => {
      const split = step(round(Modes.NO_PEEK, { player: ["8", "8"], hole: "6", draws: ["3", "2"] }).afterDeal, { type: "TAKE_INSURANCE" }, { type: "SPLIT", handIdx: 0 });
      const seq = split.pendingBets.find((b) => b.side === "insurance").seq;
      const refused = step(split, { type: "BET_REJECTED", seq });
      expect(refused.hands.map((h) => h.insurance ?? 0)).toEqual([0, 0]);
      expect(refused.hands.map((h) => h.bet)).toEqual([10, 10]);
    });

    it("a refused opening bet after insuring voids the round: no settle, no offers left, the late answer for the insurance is ignored", () => {
      const r = round(Modes.PEEK, { hole: "K", offers: [takeIns], refuse: [0] });
      expect(r.state).toMatchObject({ phase: GamePhases.PRE_DEAL, offers: null, pendingBets: [] });
      expect(r.hands).toHaveLength(0);
      expect(settles(r)).toEqual([]);
      const insuranceSeq = ledger(r).find((e) => e.side === "insurance").seq;
      expect(step(r.state, { type: "BET_REJECTED", seq: insuranceSeq })).toBe(r.state);
    });

    it("settling waits for the insurance bet to be answered, then sends the one settle with the insurance in it", () => {
      let s = step(round(Modes.PEEK, { hole: "K" }).afterDeal, { type: "TAKE_INSURANCE" });
      while (nextAutoAction(s)) s = step(s, { type: nextAutoAction(s) });
      expect(s.phase).toBe(GamePhases.SETTLING_HANDS);
      expect(s.pendingBets.map((b) => b.side)).toEqual([undefined, "insurance"]);
      expect(s.creditEvents.some((e) => e.kind === "settle")).toBe(false);
      s = step(s, { type: "BET_CONFIRMED", seq: s.pendingBets[0].seq });
      expect(nextAutoAction(s)).toBeNull(); // one bet is still waiting
      s = confirmBets(s);
      expect(nextAutoAction(s)).toBe("SETTLE");
      while (nextAutoAction(s)) s = step(s, { type: nextAutoAction(s) });
      expect(s.creditEvents.filter((e) => e.kind === "settle").map((e) => e.amount)).toEqual([15]);
    });

    it("settling does not start on the peek: PEEK and the player's moves do not wait for the server", () => {
      const insured = step(round(Modes.PEEK, { hole: "6" }).afterDeal, { type: "TAKE_INSURANCE" });
      expect(insured.pendingBets).toHaveLength(2);
      expect(nextAutoAction(insured)).toBe("PEEK");
      expect(step(insured, { type: "PEEK" }).phase).toBe(PLAYER_TURN);
    });
  });

  describe("presets", () => {
    it.each(Object.keys(RULE_PRESETS))("%s: insurance is on and an ace up offers it", (name) => {
      const rules = RULE_PRESETS[name];
      expect(rules.insurance).toBe(true);
      const r = playRound({ cards: ["10", "A", "6", "K", ...SPARES], mode: rules.dealerHoleBehaviour, rules });
      expect(r.afterDeal.phase).toBe(OFFERS);
      expect(r.afterDeal.offers.insurance).toBe(true);
    });

    it("Vegas peeks at the offers; Atlantic City, Europe, Australia and Singapore have no hole card to peek at", () => {
      for (const name of Object.keys(RULE_PRESETS)) {
        const r = playRound({ cards: ["10", "A", "6", "K", ...SPARES], mode: RULE_PRESETS[name].dealerHoleBehaviour, rules: RULE_PRESETS[name] });
        expect(r.afterDeal.offers.peek).toBe(name === "Vegas");
      }
    });

    it("Singapore has no hole card to peek at: early surrender against a ten stays a move on the turn, with no OFFERS step", () => {
      expect(playRound({ cards: ["10", "K", "6", "5", ...SPARES], mode: RULE_PRESETS.Singapore.dealerHoleBehaviour, rules: RULE_PRESETS.Singapore }).afterDeal.phase).toBe(PLAYER_TURN);
    });
  });

  describe("a round with nothing offered never visits OFFERS or PEEK", () => {
    // mulberry32: the same shoes on every run.
    const rng = (seed) => () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    const shoeCodes = (seed) => { const next = rng(seed); return Array.from({ length: 24 }, () => RANKS[Math.floor(next() * RANKS.length)]); };
    const dealt = (codes, mode, rules) => playRound({ cards: codes, mode, rules });
    const SHOES = Array.from({ length: 300 }, (_, seed) => shoeCodes(seed));
    const quiet = (r) => {
      expect([PLAYER_TURN, DEALER_TURN]).toContain(r.afterDeal.phase);
      expect(r.afterDeal.offers).toBeNull();
      expect(r.afterOffers).toBe(r.afterDeal);
    };

    it("insurance off, in every mode, with late, none, and (where it is a turn move) early surrender", () => {
      for (const codes of SHOES) {
        for (const surrender of ["late", "none"]) for (const [, mode] of modes) quiet(dealt(codes, mode, { insurance: false, surrender }));
        for (const mode of [Modes.NO_PEEK, Modes.EU]) for (const surrender of ["early", "earlyNoAce"]) quiet(dealt(codes, mode, { insurance: false, surrender }));
      }
    });

    it("insurance on, any up card but an ace, in every mode: no OFFERS and no PEEK", () => {
      const notAce = SHOES.filter((codes) => codes[1] !== "A");
      expect(notAce.length).toBeGreaterThan(200);
      for (const codes of notAce) {
        for (const [, mode] of modes) {
          quiet(dealt(codes, mode, { insurance: true, surrender: "late" }));
          if (mode !== Modes.PEEK) quiet(dealt(codes, mode, { insurance: true, surrender: "early" }));
        }
      }
    });

    it("control: with insurance on an ace up always opens OFFERS (insurance or even money)", () => {
      const aces = SHOES.filter((codes) => codes[1] === "A");
      expect(aces.length).toBeGreaterThan(10);
      for (const codes of aces) for (const [, mode] of modes) {
        const r = dealt(codes, mode, { insurance: true });
        expect(r.afterDeal.phase).toBe(OFFERS);
        expect(r.afterDeal.offers.peek).toBe(mode === Modes.PEEK);
      }
    });

    it("a quiet peek round deals exactly as it did: the dealer blackjack is shown at the deal and the player blackjack is paid", () => {
      const dealerBj = dealt(["9", "K", "7", "A", ...SPARES], Modes.PEEK, { insurance: true });
      expect(dealerBj.afterDeal).toMatchObject({ phase: DEALER_TURN, offers: null });
      expect(dealerBj.afterDeal.dealer.cards).toHaveLength(2);
      const playerBj = dealt(["A", "K", "K", "5", ...SPARES], Modes.PEEK, { insurance: true });
      expect(playerBj.afterDeal.hands[0].result).toBe(WIN);
    });
  });
});

describe("splitDeal (#133): one at a time, or both at once", () => {
  const ranks = (r) => r.hands.map((h) => h.cards.map((c) => c.rank[0]).join(""));
  const totals = (r) => r.hands.map((h) => h.total);
  // Everything a round decides, to compare two rounds that deal the same cards to the same hands.
  const outcome = (r) => ({
    ranks: ranks(r), totals: totals(r), results: r.results, payout: r.payout, staked: r.staked, status: r.hands.map((h) => h.status), cardsLeft: r.cardsLeft,
    ledger: r.state.creditEvents.map(({ kind, amount }) => [kind, amount]), blackjack: r.hands.map((h) => h.isBlackjack),
  });
  const withRule = (splitDeal) => (args) => playRound({ ...args, rules: { ...args.rules, splitDeal } });
  const one = withRule("one");
  const both = withRule("both");
  // A round where the first hand acts without drawing: both rules deal the same cards, in the same order, to the same hands.
  const sameOutcome = (args) => {
    const r = one(args);
    expect(outcome(r)).toEqual(outcome(both(args)));
    return r;
  };

  it("the shoe's order differs only when the first hand draws: 'one' gives the first hand's hit before the second hand's card, 'both' after", () => {
    const cards = ["8", "10", "8", "7", "3", "5", "K", "9"]; // 8-8 v 10-7, then 3, 5, K
    const actions = ["split", "hit", "stand"];
    const a = one({ cards, actions });
    expect(ranks(a)).toEqual(["835", "8k"]); // hand 1: 3 then the hit 5; hand 2 gets K only when play reaches it
    expect(totals(a)).toEqual([16, 18]);
    expect(a.results).toEqual([LOSE, WIN]);
    const b = both({ cards, actions });
    expect(ranks(b)).toEqual(["83k", "85"]); // 3 and 5 at the split, the hit takes K
    expect(totals(b)).toEqual([21, 13]);
    expect(b.results).toEqual([WIN, LOSE]);
  });

  it("deals no extra card: the same shoe, the same cards left over", () => {
    const cards = ["8", "10", "8", "7", "3", "K", "9"];
    expect(one({ cards, actions: ["split"] }).cardsLeft).toBe(1);
    expect(both({ cards, actions: ["split"] }).cardsLeft).toBe(1);
  });

  describe.each([["US peek", Modes.PEEK], ["US no peek", Modes.NO_PEEK], ["EU", Modes.EU]])("%s: a split where the first hand stands", (_name, mode) => {
    // EU deals the dealer's second card after the player acts; the US modes deal it with the opening cards.
    const table = (d2, ...draws) => (mode === Modes.EU ? ["8", "10", "8", ...draws, d2] : ["8", "10", "8", d2, ...draws]);

    it("a pair of eights against 10-7 plays the same under both rules", () => {
      const r = sameOutcome({ cards: table("7", "3", "K"), mode, actions: ["split"] });
      expect([ranks(r), r.results, r.payout, r.staked]).toEqual([["83", "8k"], [LOSE, WIN], 20, 20]);
    });
  });

  describe.each([["US no peek", Modes.NO_PEEK], ["EU", Modes.EU]])("%s: a hidden dealer blackjack", (_name, mode) => {
    it("takes both split hands, and the late card changes nothing", () => {
      const cards = mode === Modes.EU ? ["8", "A", "8", "3", "10", "K"] : ["8", "A", "8", "K", "3", "10"];
      const r = sameOutcome({ cards, mode, actions: ["split"] });
      expect([r.results, r.payout, r.dealer.isBlackjack]).toEqual([[LOSE, LOSE], 0, true]);
    });
  });

  it("the waiting hand ends with two cards, the one that moved first, and no waiting flag", () => {
    const r = one({ cards: ["8", "10", "8", "7", "3", "K", "9"], actions: ["split"] });
    expect(r.hands[1]).toMatchObject({ awaitingCard: false, isSplit: true, status: HandStatus.DONE });
    expect(r.hands[1].cards[0].moved).toBe(true);
    expect(r.hands[1].cards).toHaveLength(2);
  });

  it("doubleAfterSplit applies to the second hand once it has its card: 8-3 (11) doubles, drawing the next card", () => {
    const r = one({ cards: ["8", "10", "8", "7", "5", "3", "9"], actions: ["split", "stand", "double"] });
    expect(ranks(r)).toEqual(["85", "839"]);
    expect(r.hands.map((h) => h.bet)).toEqual([10, 20]);
    expect(r.results).toEqual([LOSE, WIN]);
    expect([r.staked, r.payout]).toEqual([30, 40]);
    expect(r.state.creditEvents.filter((e) => e.kind === "bet").map((e) => e.amount)).toEqual([10, 10, 10]); // opening, split, double
  });

  it("a face-down double on the first hand does not stop the second hand getting its card", () => {
    const r = one({ cards: ["8", "10", "8", "7", "3", "9", "K"], actions: ["split", "double"], rules: { doubleFaceDown: true } });
    expect(ranks(r)).toEqual(["839", "8k"]);
    expect(totals(r)).toEqual([20, 18]);
    expect(r.results).toEqual([WIN, WIN]);
    expect(r.hands.every((h) => h.hiddenCards.length === 0)).toBe(true);
    expect(r.state.phase).toBe(GamePhases.POST_ROUND);
  });

  describe("split aces", () => {
    const aces = ["A", "10", "A", "7"];

    it("each ace stands on its one card; the second's card arrives as play reaches it", () => {
      const r = sameOutcome({ cards: [...aces, "5", "9"], actions: ["split"] });
      expect([ranks(r), r.results, r.payout]).toEqual([["a5", "a9"], [LOSE, WIN], 20]);
      expect(r.hands.every((h) => h.status === HandStatus.DONE)).toBe(true);
    });

    it("the same with resplitAces on when no ace comes", () => {
      sameOutcome({ cards: [...aces, "K", "5"], actions: ["split"], rules: { resplitAces: true } });
    });

    it("resplitAces: the first ace gets an ace and splits again while the second still waits; each waiting ace then takes a card in turn", () => {
      // Split 1: [A-A][A (waiting)]. Split 2 of the first: [A-K][A (waiting)][A (waiting)]; the waiting aces draw 5 and 9 in order.
      const r = one({ cards: [...aces, "A", "K", "5", "9"], actions: ["split", "split"], rules: { resplitAces: true, maxSplitHands: 4 } });
      expect(ranks(r)).toEqual(["ak", "a5", "a9"]);
      expect(r.hands.every((h) => h.status === HandStatus.DONE && !h.awaitingCard)).toBe(true);
      expect(r.state.phase).toBe(GamePhases.POST_ROUND);
      expect([r.staked, r.results, r.payout]).toEqual([30, [WIN, LOSE, WIN], 40]);
    });

    it("resplitAces at the hand limit: the first A-A is finished at once and the second hand's late ace ends it too, with no hang", () => {
      const r = sameOutcome({ cards: [...aces, "A", "A", "5"], actions: ["split", "split"], rules: { resplitAces: true, maxSplitHands: 2 } });
      expect(ranks(r)).toEqual(["aa", "aa"]);
      expect(r.hands.every((h) => h.status === HandStatus.DONE)).toBe(true);
      expect(r.state.phase).toBe(GamePhases.POST_ROUND);
      expect(r.cardsLeft).toBe(1);
    });

    it("hitSplitAces: the first ace may hit before the second ace's card is dealt", () => {
      const rules = { hitSplitAces: true };
      const a = one({ cards: [...aces, "5", "2", "K"], actions: ["split", "hit", "stand"], rules });
      expect(ranks(a)).toEqual(["a52", "ak"]); // the hit took the 2, then the second ace got the K
      expect([totals(a)[0], a.hands[1].total, a.hands[1].isBlackjack]).toEqual([18, 21, false]);
      const b = both({ cards: [...aces, "5", "2", "K"], actions: ["split", "hit", "stand"], rules });
      expect(ranks(b)).toEqual(["a5k", "a2"]);
    });

    it("hitSplitAces: the second ace is in play on its card, not standing, so it can hit", () => {
      const r = one({ cards: [...aces, "5", "2", "K"], actions: ["split", "stand", "hit"], rules: { hitSplitAces: true } });
      expect(ranks(r)).toEqual(["a5", "a2k"]);
    });
  });

  describe("a first hand that is already finished at the split goes straight to the second", () => {
    it("a 21 (10-A): the turn skips to the waiting hand", () => {
      const r = sameOutcome({ cards: ["10", "9", "10", "8", "A", "5"], actions: ["split"] });
      expect([ranks(r), totals(r), r.results, r.payout]).toEqual([["1a", "15"], [21, 15], [WIN, LOSE], 20]);
      expect(r.hands[0].isBlackjack).toBe(false);
    });

    it("the second hand may act after its card (10-5 hits to 10-5-6 = 21)", () => {
      const r = one({ cards: ["10", "9", "10", "8", "A", "5", "6"], actions: ["split", "hit"] });
      expect([ranks(r), totals(r), r.results, r.payout]).toEqual([["1a", "156"], [21, 21], [WIN, WIN], 40]);
    });

    it("blackJackOnSplit on: the first hand's 21 is a blackjack and pays 3:2; off it pays 1:1", () => {
      const cards = ["10", "9", "10", "8", "A", "5"];
      const on = sameOutcome({ cards, actions: ["split"], blackJackOnSplit: true });
      expect([on.hands[0].isBlackjack, on.payout]).toEqual([true, 25]);
      const off = sameOutcome({ cards, actions: ["split"], blackJackOnSplit: false });
      expect([off.hands[0].isBlackjack, off.payout]).toEqual([false, 20]);
    });

    it("blackJackOnSplit on: a blackjack on the card the second hand gets later counts; off it is a plain 21", () => {
      const cards = ["10", "9", "10", "8", "5", "A"];
      const on = sameOutcome({ cards, actions: ["split"], blackJackOnSplit: true });
      expect([on.hands.map((h) => h.isBlackjack), on.hands[1].status, on.payout]).toEqual([[false, true], HandStatus.DONE, 25]);
      const off = sameOutcome({ cards, actions: ["split"], blackJackOnSplit: false });
      expect([off.hands.map((h) => h.isBlackjack), off.hands[1].status, off.payout]).toEqual([[false, false], HandStatus.DONE, 20]);
    });

    it("both hands 21: the dealer still plays and both win", () => {
      const r = sameOutcome({ cards: ["K", "10", "K", "6", "A", "A", "4"], actions: ["split"] });
      expect([totals(r), r.results, r.dealer.total]).toEqual([[21, 21], [WIN, WIN], 20]);
    });
  });

  describe("resplitting the second hand after its card", () => {
    const eights = ["8", "10", "8", "7"];

    it("the second hand gets its 8 and splits again: the first of the pair draws, the new hand waits and draws in turn", () => {
      const r = one({ cards: [...eights, "3", "8", "2", "K"], actions: ["split", "stand", "split", "stand", "stand"] });
      expect(ranks(r)).toEqual(["83", "82", "8k"]);
      expect([totals(r), r.results, r.staked, r.payout]).toEqual([[11, 10, 18], [LOSE, LOSE, WIN], 30, 20]);
      expect(r.cardsLeft).toBe(0);
    });

    it("the hand limit applies to the late 8: with 2 hands a second split is refused and the hand plays on as it is", () => {
      const r = one({ cards: [...eights, "3", "8", "K"], actions: ["split", "stand", "split", "stand"], rules: { maxSplitHands: 2 } });
      expect(r.hands).toHaveLength(2);
      expect(ranks(r)).toEqual(["83", "88"]);
      expect(r.staked).toBe(20);
      expect(r.cardsLeft).toBe(1); // the refused split drew nothing
    });

    it("two waiting hands in a row: the first hand splits again, so the second and third hand each wait and draw in turn", () => {
      // [8][8 waiting] -> the first draws 8 -> split again: [8-2][8 waiting][8 waiting]; K and 5 arrive when each is reached.
      const r = one({ cards: [...eights, "8", "2", "K", "5"], actions: ["split", "split", "stand", "stand", "stand"] });
      expect(ranks(r)).toEqual(["82", "8k", "85"]);
      expect([totals(r), r.results, r.staked, r.payout]).toEqual([[10, 18, 13], [LOSE, WIN, LOSE], 30, 20]);
      expect(new Set(r.hands.map((h) => h.tag)).size).toBe(3);
    });

    it("one ledger bet per split, and one settle for the round", () => {
      const r = one({ cards: [...eights, "8", "2", "K", "5"], actions: ["split", "split", "stand", "stand", "stand"] });
      expect(r.state.creditEvents.map(({ kind, amount }) => [kind, amount])).toEqual([["local", -10], ["bet", 10], ["bet", 10], ["bet", 10], ["settle", 20]]);
    });
  });

  it("settlement matches 'both' when the same cards land in the same hands, with other table rules on", () => {
    const rules = { dealerHitsSoft17: true, noHoleCardLoss: "original", maxSplitHands: 4 };
    sameOutcome({ cards: ["8", "10", "8", "6", "3", "K", "5"], actions: ["split"], rules });
    sameOutcome({ cards: ["8", "A", "8", "6", "3", "K", "2"], actions: ["split"], mode: Modes.NO_PEEK, rules });
    sameOutcome({ cards: ["8", "A", "8", "3", "K", "9"], actions: ["split"], mode: Modes.EU, rules });
  });

  it("a split bet the server refuses while the hand waits lowers that hand's stake to 0; it still gets its card and pays nothing", () => {
    const r = one({ cards: ["8", "10", "8", "7", "3", "K"], actions: ["split"], refuse: [1] });
    expect(r.hands[1]).toMatchObject({ bet: 0, payout: 0 });
    expect(ranks(r)).toEqual(["83", "8k"]);
    expect(r.payout).toBe(0); // 8-3 loses, and the 8-K win had no stake
  });
});

describe("multi-hand (#59): up to 3 spots a round", () => {
  const { SURRENDER } = HandResult;
  const { DEALING, OFFERS, PEEK, PLAYER_TURN, DEALER_TURN, PRE_DEAL, POST_ROUND } = GamePhases;
  const step = (state, ...actions) => actions.reduce((s, a) => gameReducer(s, { refill: outOfCards, credits: 1e9, ...a }), state);
  const MODES = [["US peek", Modes.PEEK], ["US no peek", Modes.NO_PEEK], ["EU", Modes.EU]];
  const NO_PEEK_MODES = [["US no peek", Modes.NO_PEEK], ["EU", Modes.EU]];

  // The shoe for the spots dealt, left to right: a first card each, the up card, a second card each; then the hole card (US) or, in EU,
  // the players' draws before the dealer's second card. `draws` are the players' draws, `more` the dealer's further ones.
  const table = (mode, spots, up, hole, draws = [], more = []) => {
    const first = spots.map((c) => c[0]);
    const second = spots.map((c) => c[1]);
    return mode === Modes.EU
      ? [...first, up, ...second, ...draws, ...(hole ? [hole] : []), ...more]
      : [...first, up, ...second, hole, ...draws, ...more];
  };
  const ranks = (hands) => hands.map((h) => h.cards.map((c) => c.rank).join(","));
  const bySpot = (hands) => hands.map((h) => h.spot);
  const bets = (r) => r.ledger.filter((e) => e.kind === "bet").map((e) => [e.amount, e.newRound, e.alreadyDeducted, e.handTag, e.side]);
  const SPARES = ["2", "2"]; // a draw that should not happen shows in cardsLeft

  describe.each(MODES)("%s: the deal (criterion 2)", (_name, mode) => {
    it("3 spots: a card to each left to right, the up card, a second card each; the hints follow that order", () => {
      const r = playRound({ mode, bets: [10, 10, 10], cards: ["10", "9", "6", "9", "7", "8", "K", "8"] });
      expect(ranks(r.dealt.hands)).toEqual(["10,7", "9,8", "6,king"]);
      expect(r.dealt.hands.map((h) => h.cards.map((c) => c.dealOrder))).toEqual([[0, 4], [1, 5], [2, 6]]);
      expect(r.dealt.dealer.cards.map((c) => [c.rank, c.dealOrder])).toEqual([["9", 3]]);
      expect(r.dealt.dealerHole.cards.map((c) => c.rank)).toEqual(mode === Modes.EU ? [] : ["8"]);
      expect(r.dealt.phase).toBe(DEALING);
      expect([r.results, r.payout, r.accepted, r.net]).toEqual([[PUSH, PUSH, LOSE], 20, 30, -10]); // 17, 17, 16 against 17
      expect(r.cardsLeft).toBe(0);
    });

    it("spots 1 and 3 with an empty middle spot: no hand for spot 2, and each hand keeps its spot number", () => {
      const r = playRound({ mode, bets: [10, 0, 20], cards: table(mode, [["10", "9"], ["10", "7"]], "10", "8") });
      expect([bySpot(r.dealt.hands), ranks(r.dealt.hands)]).toEqual([[0, 2], ["10,9", "10,7"]]);
      expect(r.dealt.hands.map((h) => h.cards.map((c) => c.dealOrder))).toEqual([[0, 3], [1, 4]]);
      expect(r.dealt.dealer.cards[0].dealOrder).toBe(2);
      expect(r.dealt.hands.map((h) => [h.bet, h.baseStake])).toEqual([[10, 10], [20, 20]]);
      expect([r.results, r.payout, r.accepted]).toEqual([[WIN, LOSE], 20, 30]);
    });
  });

  it.each([[[10]], [[10, 10]], [[10, 10, 10]], [[0, 10, 10]]])("a hole card shown by the peek is dealt after every second card (bets %j: order 2n+1)", (amounts) => {
    const n = amounts.filter(Boolean).length;
    const r = playRound({ bets: amounts, cards: table(Modes.PEEK, Array(n).fill(["10", "7"]), "K", "A") });
    expect(r.dealt.dealer.cards.map((c) => [c.dealOrder, c.revealed])).toEqual([[n, undefined], [2 * n + 1, true]]);
    expect([r.dealt.dealerHole.cards, r.results, r.payout]).toEqual([[], Array(n).fill(LOSE), 0]);
  });

  describe.each(["one", "both"])("splits stay in their spot, splitDeal %s (criterion 3)", (splitDeal) => {
    it.each(MODES)("%s: the new hand is inserted after its parent, in the same spot, with its own tag", (_name, mode) => {
      const r = playRound({
        mode, bets: [10, 10, 10], rules: { splitDeal }, spotActions: { 1: ["split"] },
        cards: table(mode, [["10", "7"], ["8", "8"], ["10", "9"]], "10", "7", ["3", "10"]),
      });
      expect([bySpot(r.hands), ranks(r.hands)]).toEqual([[0, 1, 1, 2], ["10,7", "8,3", "8,10", "10,9"]]);
      expect(r.hands.map((h) => h.tag)).toEqual([r.dealt.hands[0].tag, r.dealt.hands[1].tag, r.dealt.hands[2].tag + 1, r.dealt.hands[2].tag]);
      expect([r.results, r.payout, r.accepted]).toEqual([[PUSH, LOSE, WIN, WIN], 50, 40]);
    });

    it("two spots can each reach maxSplitHands 2: the limit counts per spot, and a third hand in a spot is refused", () => {
      const mine = ["split", "split", "stand", "split", "stand"];
      const r = playRound({
        bets: [10, 10], rules: { splitDeal, maxSplitHands: 2 }, spotActions: { 0: mine, 1: mine },
        cards: table(Modes.PEEK, [["8", "8"], ["8", "8"]], "10", "7", ["8", "8", "8", "8"], SPARES),
      });
      expect([bySpot(r.hands), ranks(r.hands)]).toEqual([[0, 0, 1, 1], ["8,8", "8,8", "8,8", "8,8"]]);
      expect([r.accepted, r.cardsLeft]).toEqual([40, 2]); // the refused splits staked and drew nothing
    });

    it("two spots can each reach maxSplitHands 3", () => {
      // Per spot: split (the first hand pairs again), split the first again, then every further split is refused.
      const mine = ["split", "split", "split", "stand", "split", "stand", "split", "stand"];
      const each = splitDeal === "one" ? ["8", "8", "3", "2"] : ["8", "2", "8", "3"];
      const r = playRound({
        bets: [10, 10], rules: { splitDeal, maxSplitHands: 3 }, spotActions: { 0: mine, 1: mine },
        cards: table(Modes.PEEK, [["8", "8"], ["8", "8"]], "10", "7", [...each, ...each], SPARES),
      });
      expect(bySpot(r.hands)).toEqual([0, 0, 0, 1, 1, 1]);
      expect([r.accepted, r.cardsLeft, r.state.phase]).toEqual([60, 2, POST_ROUND]);
    });
  });

  describe("split aces with resplitAces at the limit (criterion 3)", () => {
    const aces = (rules) => playRound({
      bets: [10, 10], rules: { splitDeal: "both", resplitAces: true, ...rules }, spotActions: { 0: ["split"], 1: ["split"] },
      cards: table(Modes.PEEK, [["A", "A"], ["A", "A"]], "10", "7", ["A", "5", "A", "6"]),
    });

    it("both spots split their aces to the limit", () => {
      const r = aces({ maxSplitHands: 2 });
      expect([bySpot(r.hands), ranks(r.hands)]).toEqual([[0, 0, 1, 1], ["ace,ace", "ace,5", "ace,ace", "ace,6"]]);
      expect(r.hands.every((h) => h.status === HandStatus.DONE)).toBe(true);
      expect(r.accepted).toBe(40);
    });

    it("spot 1 reaching its limit finishes only its own dead aces: spot 2's pair of aces still plays and can split", () => {
      const start = aces({ maxSplitHands: 2 }).afterOffers;
      const first = step(start, { type: "SPLIT", handIdx: 0, refill: () => { throw new Error("no refill expected"); } });
      expect(first.hands.map((h) => [h.spot, h.status])).toEqual([[0, HandStatus.DONE], [0, HandStatus.DONE], [1, HandStatus.PLAYING]]);
      expect([first.phase, first.selectedHandIndex]).toEqual([PLAYER_TURN, 2]);
      expect(canSplit(first.hands[2], 1, 2, true)).toBe(true);
    });

    it("a spot below its limit keeps a resplittable ace hand although the whole round holds that many hands", () => {
      // maxSplitHands 3: spot 1 holds 2 hands while the table holds 3. A round-wide count would refuse the resplit.
      const r = playRound({
        bets: [10, 10], rules: { splitDeal: "both", maxSplitHands: 3, resplitAces: true }, spotActions: { 0: ["split", "split"] },
        cards: table(Modes.PEEK, [["A", "A"], ["10", "9"]], "10", "7", ["5", "A", "6", "4"]),
      });
      expect([bySpot(r.hands), ranks(r.hands)]).toEqual([[0, 0, 0, 1], ["ace,5", "ace,6", "ace,4", "10,9"]]);
      expect(r.accepted).toBe(40);
    });

    it("waiting split aces at the limit (splitDeal one): the pair is dead, the waiting hand gets its card, then spot 2 plays", () => {
      const r = playRound({
        bets: [10, 10], rules: { splitDeal: "one", maxSplitHands: 2, resplitAces: true }, spotActions: { 0: ["split"], 1: ["hit"] },
        cards: table(Modes.PEEK, [["A", "A"], ["10", "2"]], "10", "7", ["A", "A", "5"]),
      });
      expect(ranks(r.hands)).toEqual(["ace,ace", "ace,ace", "10,2,5"]);
      expect([r.state.phase, r.cardsLeft]).toEqual([POST_ROUND, 0]);
    });
  });

  it("two waiting split hands in a row each get their card in turn, then the next spot plays (criterion 3)", () => {
    const r = playRound({
      bets: [10, 10], rules: { splitDeal: "one", resplitAces: true }, spotActions: { 0: ["split", "split"], 1: ["hit"] },
      cards: table(Modes.PEEK, [["A", "A"], ["10", "2"]], "10", "7", ["A", "2", "3", "4", "5"]),
    });
    expect([bySpot(r.hands), ranks(r.hands)]).toEqual([[0, 0, 0, 1], ["ace,2", "ace,3", "ace,4", "10,2,5"]]);
    expect(r.hands.some((h) => h.awaitingCard)).toBe(false);
    expect([r.state.phase, r.cardsLeft]).toEqual([POST_ROUND, 0]);
  });

  describe.each(MODES)("%s: double, triple and surrender on their own spots (criterion 7)", (_name, mode) => {
    it("pays each spot by what it did", () => {
      const r = playRound({
        mode, bets: [10, 10, 10], rules: { tripleDown: true, surrender: "late" }, spotActions: { 0: ["double"], 1: ["triple"], 2: ["surrender"] },
        cards: table(mode, [["5", "6"], ["4", "5"], ["10", "6"]], "10", "7", ["10", "5", "3"]),
      });
      expect(r.hands.map((h) => [h.spot, h.bet, h.result, h.payout])).toEqual([[0, 20, WIN, 40], [1, 30, PUSH, 30], [2, 10, SURRENDER, 5]]);
      expect([r.settled, r.accepted, r.net]).toEqual([75, 60, 15]);
      const [a, b] = r.dealt.hands.map((h) => h.tag);
      expect(bets(r).slice(3)).toEqual([[10, false, false, a, undefined], [20, false, false, b, undefined]]);
      expect(r.cardsLeft).toBe(0);
    });

    it("face-down doubles on spots 1 and 3 stay hidden until one reveal turns both over", () => {
      const r = playRound({
        mode, bets: [10, 10, 10], rules: { doubleFaceDown: true }, spotActions: { 0: ["double"], 2: ["double"] },
        cards: table(mode, [["5", "6"], ["10", "7"], ["4", "5"]], "10", "7", ["10", "8"]),
      });
      const before = r.beforeReveal;
      expect(before.hands.map((h) => [h.hiddenCards.length, h.cards.length, h.total])).toEqual([[1, 2, 11], [0, 2, 17], [1, 2, 9]]);
      const hidden = before.hands.flatMap((h) => h.hiddenCards.map((c) => c.id));
      expect(hidden.filter((id) => before.seenIds.includes(id))).toEqual([]);
      expect(r.hands.map((h) => [h.hiddenCards.length, h.total, h.result, h.payout])).toEqual([[0, 21, WIN, 40], [0, 17, PUSH, 10], [0, 17, PUSH, 20]]);
      expect(hidden.every((id) => r.state.seenIds.includes(id))).toBe(true);
      expect(r.state.runningCount).toBe([...r.hands.flatMap((h) => h.cards), ...r.dealer.cards].reduce((sum, c) => sum + c.count, 0));
      expect([r.settled, r.accepted]).toEqual([70, 50]);
    });

    it("every spot face-down doubled, one a hidden bust: the dealer still plays and each settles after the reveal", () => {
      const r = playRound({
        mode, bets: [10, 10, 10], rules: { doubleFaceDown: true }, spotActions: { 0: ["double"], 1: ["double"], 2: ["double"] },
        cards: table(mode, [["10", "2"], ["5", "6"], ["4", "5"]], "10", "6", ["K", "9", "10"], ["2"]),
      });
      expect(r.beforeReveal.dealer.cards).toHaveLength(3); // 16 hit a 2
      expect([r.results, r.settled, r.accepted]).toEqual([[LOSE, WIN, WIN], 80, 60]);
    });
  });

  describe("blackjacks among the spots", () => {
    it.each([0, 1, 2])("one blackjack spot (index %i): paid 3:2 at once under a peek, and play passes over it", (at) => {
      const spots = [["10", "7"], ["10", "7"], ["10", "7"]];
      spots[at] = ["A", "K"];
      const r = playRound({ bets: [10, 10, 10], cards: table(Modes.PEEK, spots, "9", "8", [], SPARES) });
      expect(r.dealt.hands[at]).toMatchObject({ isBlackjack: true, result: WIN, status: HandStatus.DONE });
      expect(r.afterOffers.selectedHandIndex).toBe(at === 0 ? 1 : 0);
      expect([r.hands[at].payout, r.settled, r.cardsLeft]).toEqual([25, 45, 2]);
    });

    it("every spot a blackjack: no player turn, no dealer draw, and 3:2 on all three is exactly the 2.5x cap", () => {
      const r = playRound({ bets: [10, 10, 10], cards: table(Modes.PEEK, [["A", "K"], ["A", "Q"], ["A", "J"]], "9", "8", [], SPARES) });
      expect(r.afterOffers.phase).toBe(DEALER_TURN);
      expect([r.settled, r.accepted, r.cardsLeft]).toEqual([75, 30, 2]);
    });

    it("a dealer blackjack the peek finds at the deal ends every spot: a blackjack pushes, the others lose", () => {
      const r = playRound({ bets: [10, 10, 10], spotActions: { 1: ["hit"], 2: ["double"] }, cards: table(Modes.PEEK, [["A", "K"], ["10", "7"], ["10", "10"]], "K", "A", [], SPARES) });
      expect(r.afterOffers.phase).toBe(DEALER_TURN);
      expect([r.results, r.settled, r.accepted, r.cardsLeft]).toEqual([[PUSH, LOSE, LOSE], 10, 30, 2]);
    });

    it("a dealer blackjack the peek finds after the offers spares the even-money and surrendered spots; insurance pays on its own spot", () => {
      const r = playRound({
        bets: [10, 10, 10], rules: { insurance: true, surrender: "early" },
        offers: ["even_money", "surrender", "decline_offers", "take_insurance", "decline_offers"],
        cards: table(Modes.PEEK, [["A", "K"], ["10", "6"], ["10", "9"]], "A", "K", [], SPARES),
      });
      expect(r.hands.map((h) => [h.result, h.payout, h.insurance ?? 0])).toEqual([[WIN, 20, 0], [SURRENDER, 5, 0], [LOSE, 15, 5]]);
      expect([r.settled, r.accepted, r.net, r.cardsLeft]).toEqual([40, 35, 5, 2]);
      expect(r.afterOffers.phase).toBe(DEALER_TURN);
    });
  });

  describe.each(NO_PEEK_MODES)("%s: noHoleCardLoss across spots (criterion 7)", (_name, mode) => {
    const play = (noHoleCardLoss) => playRound({
      mode, bets: [10, 10, 10], rules: { noHoleCardLoss, splitDeal: "both" }, spotActions: { 0: ["double"], 1: ["split"], 2: ["hit"] },
      cards: table(mode, [["5", "6"], ["8", "8"], ["10", "6"]], "10", "A", ["9", "10", "9", "K"]),
    });

    it("original: a late dealer blackjack takes each spot's first bet; the double and split stakes come back, a busted spot loses all", () => {
      const r = play("original");
      expect(r.dealer.isBlackjack).toBe(true);
      expect(r.hands.map((h) => [h.spot, h.baseStake, h.bet, h.payout])).toEqual([[0, 10, 20, 10], [1, 10, 10, 0], [1, 0, 10, 10], [2, 10, 10, 0]]);
      expect([r.settled, r.accepted, r.net]).toEqual([20, 50, -30]);
    });

    it("all: it takes every stake", () => {
      const r = play("all");
      expect([r.settled, r.accepted]).toEqual([0, 50]);
    });
  });

  describe("EU with dealerDrawsOnPlayerBlackjack off (criterion 5)", () => {
    const off = { dealerDrawsOnPlayerBlackjack: false };
    const eu = (spots, { rules = {}, spotActions, draws = [], hole = null } = {}) => playRound({
      mode: Modes.EU, bets: spots.map(() => 10), rules: { ...off, ...rules }, spotActions,
      cards: table(Modes.EU, spots, "9", hole, draws, SPARES),
    });

    it.each([2, 3])("%i spots, all blackjack: each pays at once and the dealer skips its second card", (n) => {
      const r = eu(Array(n).fill(["A", "K"]));
      expect(r.dealt.hands.map((h) => h.result)).toEqual(Array(n).fill(WIN));
      expect(r.dealt.dealer.status).toBe(HandStatus.DONE);
      expect([r.dealer.cards.length, r.cardsLeft, r.settled]).toEqual([1, 2, 25 * n]);
    });

    it("with the toggle on, all blackjacks still get the dealer's second card", () => {
      const r = eu([["A", "K"], ["A", "Q"]], { rules: { dealerDrawsOnPlayerBlackjack: true }, hole: "7" });
      expect([r.dealer.cards.length, r.settled]).toEqual([2, 50]);
    });

    it.each([0, 1])("a blackjack (index %i) beside an 18: it pays at once and the dealer still draws for the other", (at) => {
      const spots = [["10", "8"], ["10", "8"]];
      spots[at] = ["A", "K"];
      const r = eu(spots, { hole: "8" }); // dealer 9 + 8 = 17
      expect(r.dealt.hands[at].result).toBe(WIN);
      expect(r.dealt.dealer.status).toBe(HandStatus.DRAW_HOLE);
      expect([r.dealer.cards.length, r.dealer.total, r.settled]).toEqual([2, 17, 45]);
    });

    it("the paid blackjack stays paid when the dealer then draws a blackjack against the other spot", () => {
      const r = playRound({ mode: Modes.EU, bets: [10, 10], rules: off, cards: table(Modes.EU, [["A", "K"], ["10", "8"]], "10", "A", [], SPARES) });
      expect([r.results, r.settled]).toEqual([[WIN, LOSE], 25]);
    });

    it("a blackjack beside a busted spot: nothing depends on the dealer, which stays on one card", () => {
      const r = eu([["A", "K"], ["10", "6"]], { spotActions: { 1: ["hit"] }, draws: ["K"] });
      expect([r.results, r.dealer.cards.length, r.cardsLeft, r.settled]).toEqual([[WIN, LOSE], 1, 2, 25]);
    });

    it("a blackjack beside a surrender: the dealer takes its second card and stops at two", () => {
      const r = eu([["A", "K"], ["10", "6"]], { rules: { surrender: "late" }, spotActions: { 1: ["surrender"] }, hole: "2" });
      expect([r.dealer.cards.length, r.settled]).toEqual([2, 30]);
    });
  });

  describe("EU and no-peek toggles with several spots", () => {
    it.each([[true, 2], [false, 1]])("EU dealerDrawsOnPlayerBust %s with every spot busted: the dealer holds %i card(s)", (on, count) => {
      const r = playRound({
        mode: Modes.EU, bets: [10, 10], rules: { dealerDrawsOnPlayerBust: on }, spotActions: { 0: ["hit"], 1: ["hit"] },
        cards: table(Modes.EU, [["10", "6"], ["10", "6"]], "5", null, ["K", "Q"], ["6", "2"]),
      });
      expect([r.dealer.cards.length, r.settled]).toEqual([count, 0]);
    });

    it("EU dealerDrawsOnceOn21: a 21 spot and a blackjack spot need only the dealer's second card", () => {
      const r = playRound({
        mode: Modes.EU, bets: [10, 10], rules: { dealerDrawsOnceOn21: true }, spotActions: { 0: ["hit"] },
        cards: table(Modes.EU, [["10", "6"], ["A", "K"]], "5", "6", ["5"], SPARES),
      });
      expect([r.dealer.cards.length, r.cardsLeft, r.results]).toEqual([2, 2, [WIN, WIN]]);
    });

    it("EU dealerDrawsOnceOn21: an 18 spot beside the 21 makes the dealer play its hand out", () => {
      const r = playRound({
        mode: Modes.EU, bets: [10, 10], rules: { dealerDrawsOnceOn21: true }, spotActions: { 0: ["hit"] },
        cards: table(Modes.EU, [["10", "6"], ["10", "8"]], "5", "6", ["5"], ["8"]),
      });
      expect([r.dealer.cards.length, r.dealer.total, r.results]).toEqual([3, 19, [WIN, LOSE]]);
    });

    it("no peek, blackjackPaysImmediately: a blackjack spot keeps its 3:2 although the dealer's hidden blackjack takes the other spot", () => {
      const r = playRound({ mode: Modes.NO_PEEK, bets: [10, 10], rules: { blackjackPaysImmediately: true }, cards: table(Modes.NO_PEEK, [["A", "K"], ["10", "9"]], "10", "A") });
      expect([r.results, r.settled]).toEqual([[WIN, LOSE], 25]);
    });

    it("no peek, blackjack waiting: against the dealer's hidden blackjack it pushes and the other spot loses", () => {
      const r = playRound({ mode: Modes.NO_PEEK, bets: [10, 10], cards: table(Modes.NO_PEEK, [["A", "K"], ["10", "9"]], "10", "A") });
      expect([r.results, r.settled]).toEqual([[PUSH, LOSE], 10]);
    });
  });

  describe("a 3-spot round with a split, a double and an insured spot: exact money (criterion 7)", () => {
    const play = (mode, hole, noHoleCardLoss = "all") => playRound({
      mode, bets: [10, 10, 10], rules: { insurance: true, splitDeal: "both", noHoleCardLoss },
      offers: ["decline_offers", "decline_offers", "take_insurance"], spotActions: { 0: ["split"], 1: ["double"] },
      cards: table(mode, [["8", "8"], ["6", "5"], ["10", "10"]], "A", hole, ["10", "3", "K"], SPARES),
    });

    it.each(MODES)("%s, dealer soft 18: payout 70 on 55 staked, balance +15", (_name, mode) => {
      const r = play(mode, "7");
      expect(r.hands.map((h) => [h.spot, h.bet, h.result, h.payout])).toEqual([[0, 10, PUSH, 10], [0, 10, LOSE, 0], [1, 20, WIN, 40], [2, 10, WIN, 20]]);
      expect([r.settled, r.accepted, r.net, r.cardsLeft]).toEqual([70, 55, 15, 2]);
      const [a, b, c] = r.dealt.hands.map((h) => h.tag);
      expect(bets(r)).toEqual([
        [10, true, true, null, undefined], [10, false, true, b, "spot"], [10, false, true, c, "spot"],
        [5, false, false, c, "insurance"], [10, false, false, c + 1, undefined], [10, false, false, b, undefined],
      ]);
      expect(a).not.toBe(b);
      expect(r.ledger.filter((e) => e.kind === "settle")).toHaveLength(1);
    });

    it("US peek, dealer blackjack: only the insurance pays; no split or double ever happens", () => {
      const r = play(Modes.PEEK, "K");
      expect([r.settled, r.accepted, r.net]).toEqual([15, 35, -20]);
    });

    it.each(NO_PEEK_MODES)("%s, late dealer blackjack: all takes every stake, original gives back the split and double stakes", (_name, mode) => {
      expect([play(mode, "K", "all").settled, play(mode, "K", "original").settled]).toEqual([15, 35]);
    });
  });

  describe("the ledger's bets at the deal (criterion 6)", () => {
    it("3 spots: the first opens the round with no tag; the others add to it, tagged side spot; all alreadyDeducted", () => {
      const r = playRound({ bets: [10, 20, 30], cards: table(Modes.PEEK, [["10", "7"], ["10", "7"], ["10", "7"]], "9", "8") });
      const [, b, c] = r.dealt.hands.map((h) => h.tag);
      const sent = r.dealt.creditEvents.filter((e) => e.kind === "bet").map((e) => { const copy = { ...e }; delete copy.seq; return copy; });
      expect(sent).toEqual([
        { kind: "bet", amount: 10, newRound: true, alreadyDeducted: true, handTag: null },
        { kind: "bet", amount: 20, newRound: false, alreadyDeducted: true, handTag: b, side: "spot" },
        { kind: "bet", amount: 30, newRound: false, alreadyDeducted: true, handTag: c, side: "spot" },
      ]);
      expect(r.dealt.pendingBets).toHaveLength(3);
    });

    it("an empty first spot: the first betting spot opens the round", () => {
      const r = playRound({ bets: [0, 20, 30], cards: table(Modes.PEEK, [["10", "7"], ["10", "7"]], "9", "8") });
      expect(bets(r)).toEqual([[20, true, true, null, undefined], [30, false, true, r.dealt.hands[1].tag, "spot"]]);
    });

    it("while any spot bet is unanswered the round stays in DEALING, and no action of any kind adds a stake or moves it", () => {
      const r = playRound({ bets: [10, 10, 10], rules: { insurance: true, surrender: "early", tripleDown: true }, cards: table(Modes.PEEK, [["8", "8"], ["5", "6"], ["10", "6"]], "A", "7") });
      const [opening, second, third] = r.dealt.pendingBets;
      let s = r.dealt;
      for (const confirmed of [null, opening, second]) {
        if (confirmed) s = step(s, { type: "BET_CONFIRMED", seq: confirmed.seq });
        expect(nextAutoAction(s)).toBeNull();
        expect(step(s, { type: "DEAL_DONE" })).toBe(s);
        for (const type of ["HIT", "STAND", "DOUBLE", "TRIPLE", "SPLIT", "SURRENDER"]) {
          for (const handIdx of [0, 1, 2]) expect(step(s, { type, handIdx })).toBe(s);
        }
        for (const type of ["TAKE_INSURANCE", "EVEN_MONEY", "DECLINE_OFFERS", "PEEK", "DEAL", "UNDO_BET", "CLEAR_BET", "DEAL_SPLIT_CARD"]) expect(step(s, { type })).toBe(s);
        expect(step(s, { type: "ADD_BET", amount: 10 })).toBe(s);
        expect(step(s, { type: "ADD_BET", spots: [10, 10, 10] })).toBe(s);
      }
      s = step(s, { type: "BET_CONFIRMED", seq: third.seq });
      expect(nextAutoAction(s)).toBe("DEAL_DONE");
      expect(step(s, { type: "DEAL_DONE" }).phase).toBe(OFFERS);
    });

    it("the order of the answers does not matter: the opening bet may still be unanswered once the spot bets are in", () => {
      const r = playRound({ bets: [10, 10], cards: table(Modes.PEEK, [["10", "7"], ["10", "7"]], "9", "8") });
      const s = step(r.dealt, { type: "BET_CONFIRMED", seq: r.dealt.pendingBets[1].seq });
      expect(nextAutoAction(s)).toBe("DEAL_DONE");
    });

    it("with one spot nothing waits: DEAL_DONE moves on with the opening bet unanswered", () => {
      const r = playRound({ bets: [0, 10, 0], cards: table(Modes.PEEK, [["10", "7"]], "9", "8") });
      expect(r.dealt.pendingBets).toHaveLength(1);
      expect(nextAutoAction(r.dealt)).toBe("DEAL_DONE");
      expect(r.afterDeal.phase).toBe(PLAYER_TURN);
    });
  });

  describe("a refused spot bet (criterion 6)", () => {
    const three = (extra = {}) => playRound({ bets: [10, 10, 10], cards: table(Modes.PEEK, [["10", "9"], ["8", "8"], ["10", "10"]], "10", "8", [], SPARES), ...extra });
    const reject = (state, handAt) => step(state, { type: "BET_REJECTED", seq: state.pendingBets.find((b) => b.handTag === state.hands[handAt].tag).seq });

    it("spot 1 (the opening bet): the round is void and every circle is empty; the later answers change nothing", () => {
      const r = three({ refuse: [0] });
      expect(r.state).toMatchObject({ phase: PRE_DEAL, hands: [], betCircle: 0, betSpots: [0, 0, 0], betHistory: [], pendingBets: [], offers: null });
      expect(r.state.notice).toBe("The server refused your bet, so the round was cancelled.");
      expect(r.ledger.filter((e) => e.kind === "settle")).toEqual([]);
      for (const { seq } of r.dealt.pendingBets) expect(step(r.state, { type: "BET_REJECTED", seq })).toBe(r.state);
    });

    it("spot 2: its stake and first bet drop to 0, the total is recomputed, the notice names it, and the hand stays", () => {
      const r = three();
      const s = reject(r.dealt, 1);
      expect(s.hands.map((h) => [h.spot, h.bet, h.baseStake, h.offer])).toEqual([[0, 10, 10, null], [1, 0, 0, null], [2, 10, 10, null]]);
      expect([s.betCircle, s.phase, s.offers, s.selectedHandIndex]).toEqual([20, DEALING, null, 0]);
      expect(s.notice).toBe("The server refused your $10 bet on spot 2; it plays for nothing.");
      expect(s.pendingBets.map((b) => b.amount)).toEqual([10, 10]);
      expect(s.creditEvents).toBe(r.dealt.creditEvents); // the balance is PlayerProvider's job
    });

    it("the notice names the spot, not the hand's position, when an earlier spot is empty", () => {
      const r = playRound({ bets: [0, 10, 25], cards: table(Modes.PEEK, [["10", "9"], ["10", "9"]], "10", "8") });
      expect(reject(r.dealt, 1).notice).toBe("The server refused your $25 bet on spot 3; it plays for nothing.");
    });

    it("it can only be stood or hit: never doubled, tripled or split, and it pays nothing", () => {
      const r = three({ refuse: [1], rules: { tripleDown: true }, spotActions: { 1: ["double", "split", "triple", "stand"] } });
      expect([r.hands.length, r.hands[1].bet, r.hands[1].payout]).toEqual([3, 0, 0]);
      expect(r.ledger.filter((e) => e.kind === "bet")).toHaveLength(3);
      expect([r.settled, r.accepted, r.cardsLeft]).toEqual([40, 20, 2]); // 19 and 20 beat 18
    });

    it.each(NO_PEEK_MODES)("%s, original-bet-only against a late dealer blackjack: the refused spot is paid 0, never a negative sum", (_name, mode) => {
      const r = playRound({ mode, bets: [10, 10, 10], refuse: [1], rules: { noHoleCardLoss: "original" }, cards: table(mode, [["10", "9"], ["10", "8"], ["10", "7"]], "10", "A") });
      expect([r.dealer.isBlackjack, r.hands.map((h) => h.payout), r.settled]).toEqual([true, [0, 0, 0], 0]);
    });

    it("a refused blackjack spot pays nothing", () => {
      const r = playRound({ bets: [10, 10], refuse: [1], cards: table(Modes.PEEK, [["10", "8"], ["A", "K"]], "10", "8") });
      expect(r.hands.map((h) => [h.result, h.payout])).toEqual([[PUSH, 10], [WIN, 0]]);
    });

    it("two refused spots: both play for nothing and only the first spot's money is in the round", () => {
      const r = three({ refuse: [1, 2] });
      expect(r.hands.map((h) => [h.bet, h.baseStake])).toEqual([[10, 10], [0, 0], [0, 0]]);
      expect([r.answered.betCircle, r.accepted, r.settled]).toEqual([10, 10, 20]);
      expect(r.answered.notice).toBe("The server refused your $10 bet on spot 3; it plays for nothing.");
    });

    const offered = (mode, extra) => playRound({ mode, rules: { insurance: true }, ...extra });

    it("the only offered spot refused (spot 1 hard 20 and short of insurance), peek game: the deferred peek runs with no input", () => {
      // 5 credits after the bets: spot 1's insurance (10) is unaffordable, spot 2's (5) is offered.
      const r = offered(Modes.PEEK, { bets: [20, 10], credits: 5, refuse: [1], cards: table(Modes.PEEK, [["10", "K"], ["10", "5"]], "A", "7") });
      expect(r.dealt.offers).toEqual({ insurance: true, evenMoney: false, surrender: false, peek: true });
      expect(r.dealt.hands.map((h) => h.offer?.insurance ?? false)).toEqual([false, true]);
      expect(r.answered.offers).toEqual({ insurance: false, evenMoney: false, surrender: false, peek: true });
      expect(r.afterDeal.phase).toBe(PEEK); // never OFFERS with nothing to answer
      expect(nextAutoAction(r.afterDeal)).toBe("PEEK");
      expect(r.afterOffers).toMatchObject({ phase: PLAYER_TURN, offers: null, selectedHandIndex: 0 });
      expect(r.ledger.some((e) => e.side === "insurance")).toBe(false);
    });

    it("the same with a dealer blackjack under the ace: the peek shows it and ends the round", () => {
      const r = offered(Modes.PEEK, { bets: [20, 10], credits: 5, refuse: [1], cards: table(Modes.PEEK, [["10", "K"], ["10", "5"]], "A", "K") });
      expect(r.afterOffers.phase).toBe(DEALER_TURN);
      expect([r.results, r.settled]).toEqual([[LOSE, LOSE], 0]);
    });

    it.each(NO_PEEK_MODES)("%s: the only offered spot (even money) refused: no peek, play goes straight on", (_name, mode) => {
      const r = offered(mode, { bets: [20, 10], credits: 0, refuse: [1], cards: table(mode, [["10", "9"], ["A", "K"]], "A", "7") });
      expect(r.dealt.offers).toEqual({ insurance: false, evenMoney: true, surrender: false, peek: false });
      expect(r.afterDeal).toMatchObject({ phase: PLAYER_TURN, offers: null, selectedHandIndex: 0 });
      expect([r.hands[1].bet, r.hands[1].payout, r.hands[1].evenMoney]).toEqual([0, 0, undefined]);
    });

    it("the refused spot was the first one offered and a later one still is: that later spot is asked", () => {
      const r = offered(Modes.PEEK, { bets: [20, 10, 4], credits: 5, refuse: [1], cards: table(Modes.PEEK, [["10", "K"], ["10", "5"], ["10", "6"]], "A", "7") });
      expect(r.answered).toMatchObject({ selectedHandIndex: 2, offers: { insurance: true, evenMoney: false, surrender: false, peek: true } });
      expect(r.afterDeal).toMatchObject({ phase: OFFERS, selectedHandIndex: 2 });
    });

    it("a refused spot behind an offered one leaves that offer as it was", () => {
      const r = offered(Modes.PEEK, { bets: [10, 10], refuse: [1], cards: table(Modes.PEEK, [["A", "K"], ["10", "5"]], "A", "7") });
      expect(r.answered).toMatchObject({ offers: { evenMoney: true, insurance: false, peek: true }, selectedHandIndex: 0 });
      expect(r.afterDeal).toMatchObject({ phase: OFFERS, selectedHandIndex: 0 });
      expect(r.afterOffers.phase).not.toBe(OFFERS);
    });

    it("a refused middle offered spot: the walk goes from spot 1 straight to spot 3, then the one peek", () => {
      const r = offered(Modes.PEEK, { bets: [10, 10, 10], refuse: [1], cards: table(Modes.PEEK, [["10", "9"], ["10", "5"], ["10", "6"]], "A", "7") });
      expect(r.afterDeal).toMatchObject({ phase: OFFERS, selectedHandIndex: 0 });
      const next = step(r.afterDeal, { type: "DECLINE_OFFERS" });
      expect(next).toMatchObject({ phase: OFFERS, selectedHandIndex: 2 });
      expect(step(next, { type: "DECLINE_OFFERS" }).phase).toBe(PEEK);
    });

    it("a refused insurance on spot 3 voids only that insurance (the multi-spot round keeps its spot bets)", () => {
      const r = offered(Modes.PEEK, { bets: [10, 10, 10], offers: ["decline_offers", "decline_offers", "take_insurance"], refuse: [3], cards: table(Modes.PEEK, [["10", "9"], ["10", "9"], ["10", "9"]], "A", "7") });
      expect(r.hands.map((h) => [h.bet, h.insurance ?? 0])).toEqual([[10, 0], [10, 0], [10, 0]]);
      expect([r.accepted, r.settled]).toEqual([30, 60]);
    });
  });

  describe("offers walk the spots (criterion 4)", () => {
    const rules = { insurance: true };
    const deal = (spots, up = "A", hole = "7", extra = {}, mode = Modes.PEEK) => playRound({ mode, bets: spots.map(() => 10), rules, cards: table(mode, spots, up, hole, [], SPARES), ...extra });

    it("blackjack then hard 15 against an ace: even money, then insurance, then exactly one peek", () => {
      const start = deal([["A", "K"], ["10", "5"]]).afterDeal;
      expect(start).toMatchObject({ phase: OFFERS, selectedHandIndex: 0, offers: { evenMoney: true, insurance: false, surrender: false, peek: true } });
      expect(nextAutoAction(start)).toBeNull();
      expect(step(start, { type: "TAKE_INSURANCE" })).toBe(start); // not offered to this spot
      const second = step(start, { type: "EVEN_MONEY" });
      expect(second).toMatchObject({ phase: OFFERS, selectedHandIndex: 1, offers: { evenMoney: false, insurance: true, surrender: false, peek: true } });
      expect(nextAutoAction(second)).toBeNull();
      expect(step(second, { type: "EVEN_MONEY" })).toBe(second);
      const peek = step(second, { type: "TAKE_INSURANCE" });
      expect([peek.phase, nextAutoAction(peek)]).toEqual([PEEK, "PEEK"]);
      const after = step(peek, { type: "PEEK" });
      expect(after).toMatchObject({ phase: PLAYER_TURN, offers: null, selectedHandIndex: 1 }); // the even-money hand is done
      expect(after.hands.map((h) => [h.evenMoney ?? false, h.insurance ?? 0, h.result])).toEqual([[true, 0, WIN], [false, 5, HandResult.NONE]]);
      expect(step(after, { type: "PEEK" })).toBe(after);
    });

    it.each([
      ["first", [["A", "K"], ["10", "6"], ["9", "7"]], [1, 2]],
      ["middle", [["10", "6"], ["A", "K"], ["9", "7"]], [0, 2]],
      ["last", [["10", "6"], ["9", "7"], ["A", "K"]], [0, 1]],
    ])("early surrender against a ten: the %s spot qualifies for nothing and is skipped", (_where, spots, asked) => {
      let s = deal(spots, "10", "7", { rules: { surrender: "early" } }).afterDeal;
      const visited = [];
      while (s.phase === OFFERS) {
        visited.push(s.selectedHandIndex);
        expect(s.offers).toEqual({ insurance: false, evenMoney: false, surrender: true, peek: true });
        s = step(s, { type: "SURRENDER" });
      }
      expect([visited, s.phase]).toEqual([asked, PEEK]);
      expect(asked.map((i) => s.hands[i].result)).toEqual([SURRENDER, SURRENDER]);
      const natural = [0, 1, 2].find((i) => !asked.includes(i));
      expect(s.hands[natural].result).toBe(HandResult.NONE); // not offered anything, but its blackjack still waits for the one peek
      const peeked = step(s, { type: "PEEK" });
      expect([peeked.phase, peeked.hands[natural].result]).toEqual([DEALER_TURN, WIN]);
    });

    it("early surrender per spot: surrendering one leaves the other to be asked and to play", () => {
      const r = deal([["10", "6"], ["10", "6"]], "10", "7", { rules: { surrender: "early" }, offers: ["decline_offers", "surrender"] });
      expect(r.hands.map((h) => h.surrendered ?? false)).toEqual([false, true]);
      expect(r.afterOffers).toMatchObject({ phase: PLAYER_TURN, selectedHandIndex: 0 });
      expect([r.results, r.settled]).toEqual([[LOSE, SURRENDER], 5]);
    });

    it("DECLINE_OFFERS closes only the current spot's offers, and the selection follows the spot asked", () => {
      const start = deal([["10", "6"], ["10", "5"], ["10", "4"]], "A", "7", { rules: { insurance: true, surrender: "early" } }).afterDeal;
      const both = { insurance: true, evenMoney: false, surrender: true, peek: true };
      expect(start).toMatchObject({ selectedHandIndex: 0, offers: both });
      const second = step(start, { type: "DECLINE_OFFERS" });
      expect(second).toMatchObject({ phase: OFFERS, selectedHandIndex: 1, offers: both });
      const insured = step(second, { type: "TAKE_INSURANCE" });
      expect(insured).toMatchObject({ phase: OFFERS, selectedHandIndex: 1, offers: { insurance: false, surrender: true } }); // this spot's other offer stays
      const surrendered = step(insured, { type: "SURRENDER" });
      expect(surrendered).toMatchObject({ phase: OFFERS, selectedHandIndex: 2, offers: both });
      expect(surrendered.hands.map((h) => [h.insurance ?? 0, h.surrendered ?? false])).toEqual([[0, false], [5, true], [0, false]]);
    });

    it("TAKE_INSURANCE is checked against the balance at each take", () => {
      const start = deal([["10", "6"], ["10", "5"], ["10", "4"]], "A", "7", { credits: 5 }).afterDeal;
      expect(start.hands.map((h) => h.offer?.insurance)).toEqual([true, true, true]); // each alone is affordable at the deal
      const second = step(start, { type: "TAKE_INSURANCE", credits: 5 });
      expect(second.selectedHandIndex).toBe(1);
      expect(step(second, { type: "TAKE_INSURANCE", credits: 0 })).toBe(second);
      const third = step(second, { type: "DECLINE_OFFERS" });
      expect(step(third, { type: "TAKE_INSURANCE", credits: 4.99 })).toBe(third);
      const done = step(third, { type: "TAKE_INSURANCE", credits: 5 });
      expect(done.phase).toBe(PEEK);
      expect(done.creditEvents.filter((e) => e.side === "insurance").map((e) => e.handTag)).toEqual([start.hands[0].tag, start.hands[2].tag]);
    });

    it.each(NO_PEEK_MODES)("%s: after the last spot's offer play starts at the first unfinished hand, with no peek", (_name, mode) => {
      const r = deal([["A", "K"], ["10", "5"], ["10", "4"]], "A", "7", { offers: ["even_money", "take_insurance", "decline_offers"] }, mode);
      expect(r.afterOffers).toMatchObject({ phase: PLAYER_TURN, offers: null, selectedHandIndex: 1 });
    });

    it.each(NO_PEEK_MODES)("%s: every spot even money: the dealer's turn", (_name, mode) => {
      const r = deal([["A", "K"], ["A", "Q"]], "A", "7", { offers: ["even_money", "even_money"] }, mode);
      expect(r.afterOffers.phase).toBe(DEALER_TURN);
      expect([r.settled, r.accepted]).toEqual([40, 20]);
    });
  });
});
