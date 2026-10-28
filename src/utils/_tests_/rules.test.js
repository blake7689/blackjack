import { describe, it, expect } from "vitest";
import { playRound, stackedShoe, outOfCards, confirmBets, Modes, HandResult, HandStatus } from "./stackedShoe";
import { gameReducer, nextAutoAction } from "../gameReducer";
import { GamePhases } from "../constants/gamePhases";
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
