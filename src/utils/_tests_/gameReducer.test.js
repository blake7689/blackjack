import { describe, it, expect } from "vitest";
import { gameReducer, initialGameState, nextAutoAction } from "../gameReducer";
import { GamePhases } from "../constants/gamePhases";
import { stackedShoe, outOfCards, playRound } from "./stackedShoe";

const run = (state, ...actions) => actions.reduce((s, a) => gameReducer(s, { refill: outOfCards, credits: 1000, ...a }), state);
const started = (cards) => run(initialGameState, { type: "START_GAME", shoe: stackedShoe(cards) });
const dealt = (cards, bet = 10) => run(started(cards), { type: "ADD_BET", amount: bet }, { type: "DEAL" });
const events = (s) => s.creditEvents.map(({ delta, persist }) => [delta, persist]);

describe("betting", () => {
  it("takes a bet from the balance locally and refunds it on clear", () => {
    const s = run(started(["5"]), { type: "ADD_BET", amount: 10 }, { type: "ADD_BET", amount: 5 }, { type: "CLEAR_BET" });
    expect(s.betCircle).toBe(0);
    expect(events(s)).toEqual([[-10, false], [-5, false], [15, false]]);
  });

  it("refuses a bet above the balance, outside PRE_DEAL, and an empty clear", () => {
    const s = started(["5"]);
    expect(run(s, { type: "ADD_BET", amount: 10, credits: 5 })).toBe(s);
    expect(run(initialGameState, { type: "ADD_BET", amount: 1 })).toBe(initialGameState);
    expect(run(s, { type: "CLEAR_BET" })).toBe(s);
    expect(run(initialGameState, { type: "CLEAR_BET" })).toBe(initialGameState);
  });

  it("deals only in PRE_DEAL with a bet, and persists the balance", () => {
    expect(run(started(["5"]), { type: "DEAL" }).phase).toBe(GamePhases.PRE_DEAL);
    const s = dealt(["10", "10", "9", "7"]);
    expect(s.phase).toBe(GamePhases.PLAYER_TURN);
    expect(s.initialBet).toBe(10);
    expect(events(s).at(-1)).toEqual([0, true]);
    expect(run(s, { type: "DEAL" })).toBe(s);
  });
});

describe("player actions", () => {
  it("ignores actions out of turn, on the wrong hand, or on a finished hand (double clicks)", () => {
    const s = dealt(["10", "10", "9", "7", "2"]);
    expect(run(s, { type: "HIT", handIdx: 1 })).toBe(s);
    const stood = run(s, { type: "STAND", handIdx: 0 });
    expect(run(stood, { type: "STAND", handIdx: 0 })).toBe(stood);
    expect(run(initialGameState, { type: "HIT", handIdx: 0 })).toBe(initialGameState);
  });

  it("double and split need the stake in the balance and the right cards", () => {
    const pair = dealt(["8", "10", "8", "7"]);
    expect(run(pair, { type: "DOUBLE", handIdx: 0, credits: 5 })).toBe(pair);
    expect(run(pair, { type: "SPLIT", handIdx: 0, credits: 5 })).toBe(pair);
    const noPair = dealt(["8", "10", "9", "7", "2"]);
    expect(run(noPair, { type: "SPLIT", handIdx: 0 })).toBe(noPair);
    const threeCards = run(noPair, { type: "HIT", handIdx: 0 });
    expect(run(threeCards, { type: "DOUBLE", handIdx: 0 })).toBe(threeCards);
  });

  it("double and split take the extra stake once and persist it", () => {
    const doubled = run(dealt(["5", "10", "6", "7", "10"]), { type: "DOUBLE", handIdx: 0 });
    expect(events(doubled).at(-1)).toEqual([-10, true]);
    expect(doubled.betCircle).toBe(20);
    const split = run(dealt(["8", "10", "8", "7", "3", "10"]), { type: "SPLIT", handIdx: 0 });
    expect(events(split).at(-1)).toEqual([-10, true]);
    expect(split.betCircle).toBe(20);
    expect(split.hands).toHaveLength(2);
    expect(split.selectedHandIndex).toBe(0);
  });

  it("moves to the next hand, then to the dealer", () => {
    const split = run(dealt(["8", "10", "8", "7", "3", "10"]), { type: "SPLIT", handIdx: 0 });
    const second = run(split, { type: "STAND", handIdx: 0 });
    expect(second.selectedHandIndex).toBe(1);
    expect(second.phase).toBe(GamePhases.PLAYER_TURN);
    const dealerTurn = run(second, { type: "STAND", handIdx: 1 });
    expect(dealerTurn.phase).toBe(GamePhases.DEALER_TURN);
    expect(dealerTurn.selectedHandIndex).toBe(0);
  });
});

describe("dealer and settlement steps", () => {
  it("runs reveal, steps, settle and results in order, then pays once", () => {
    let s = run(dealt(["10", "10", "9", "6", "K"]), { type: "STAND", handIdx: 0 });
    const order = [];
    while (s.phase !== GamePhases.POST_ROUND) {
      order.push(nextAutoAction(s));
      s = run(s, { type: nextAutoAction(s) });
    }
    expect(order).toEqual(["DEALER_REVEAL", "DEALER_STEP", "SETTLE", "FINISH_RESULTS"]);
    expect(events(s).at(-1)).toEqual([20, true]);
  });

  it("goes straight to settling when the revealed dealer stands", () => {
    const s = run(dealt(["10", "10", "9", "7"]), { type: "STAND", handIdx: 0 }, { type: "DEALER_REVEAL" });
    expect(s.phase).toBe(GamePhases.SETTLING_HANDS);
    expect(s.dealer.cards).toHaveLength(2);
  });

  it("queues no credit when nothing is won", () => {
    const r = playRound({ cards: ["10", "10", "6", "7", "K"], actions: ["stand"] });
    expect(r.payout).toBe(0);
    expect(events(r.state).at(-1)).toEqual([0, true]);
  });

  it("has no automatic step while waiting for the player", () => {
    expect(nextAutoAction(initialGameState)).toBeNull();
    expect(nextAutoAction({ ...initialGameState, phase: GamePhases.POST_ROUND })).toBeNull();
    expect(nextAutoAction({ ...initialGameState, phase: GamePhases.END_ROUND })).toBe("END_ROUND");
  });
});

describe("end of round", () => {
  const finished = (settings = {}) => {
    const r = playRound({ cards: ["10", "10", "9", "7"] });
    return { ...r.state, settings: { ...r.state.settings, ...settings } };
  };

  it("continues only from POST_ROUND", () => {
    expect(run(finished(), { type: "CONTINUE" }).phase).toBe(GamePhases.END_ROUND);
    expect(run(initialGameState, { type: "CONTINUE" })).toBe(initialGameState);
  });

  it("clears the table for the next bet", () => {
    const s = run(finished(), { type: "CONTINUE" }, { type: "END_ROUND" });
    expect(s.phase).toBe(GamePhases.PRE_DEAL);
    expect(s.hands).toEqual([]);
    expect(s.betCircle).toBe(0);
  });

  it("re-places the last bet when the setting is on and it is affordable", () => {
    const s = run(finished({ resetInitialBet: true }), { type: "CONTINUE" }, { type: "END_ROUND" });
    expect(s.betCircle).toBe(10);
    expect(events(s).at(-1)).toEqual([-10, false]);
    const poor = run(finished({ resetInitialBet: true }), { type: "CONTINUE" }, { type: "END_ROUND", credits: 5 });
    expect(poor.betCircle).toBe(0);
  });

  it("switches to a fresh shoe and resets the count once the cut card was seen", () => {
    const seenCut = { ...finished(), cutCardFound: true };
    const fresh = stackedShoe(["2", "3"]);
    const s = run(seenCut, { type: "CONTINUE" }, { type: "END_ROUND", shoe: fresh });
    expect(s.shoe).toBe(fresh);
    expect(s.cutCardFound).toBe(false);
    expect(s.runningCount).toBe(0);
  });
});

describe("shoe, count and purity", () => {
  it("never mutates the shoe in state, so a repeated reducer call gives the same result", () => {
    const s = run(started(["10", "10", "9", "7"]), { type: "ADD_BET", amount: 10 });
    const before = [...s.shoe];
    const a = run(s, { type: "DEAL" });
    const b = run(s, { type: "DEAL" });
    expect(s.shoe).toEqual(before);
    expect(a.hands).toEqual(b.hands);
  });

  it("counts visible cards once, and not the hidden hole card", () => {
    const s = dealt(["2", "K", "3", "4"]);
    expect(s.runningCount).toBe(1); // 2 (+1), K (-1), 3 (+1); the hole 4 is hidden
    const revealed = run(s, { type: "STAND", handIdx: 0 }, { type: "DEALER_REVEAL" });
    expect(revealed.runningCount).toBe(2);
  });

  it("notes the cut card and refills an empty shoe mid-round, restarting the count", () => {
    const shoe = [...stackedShoe(["10", "10"]), { id: "CUT-1", type: "cut" }, ...stackedShoe(["9"])];
    const s = run({ ...initialGameState, phase: GamePhases.PRE_DEAL, shoe }, { type: "ADD_BET", amount: 10 },
      { type: "DEAL", refill: () => stackedShoe(["7", "5"]) });
    expect(s.cutCardFound).toBe(true);
    expect(s.shoe.map((c) => c.rank)).toEqual(["5"]);
    expect(s.seenIds).toHaveLength(3);
  });

  it("resetting refunds a bet still on the table, but not one in play", () => {
    const betting = run(started(["5"]), { type: "ADD_BET", amount: 10 });
    expect(events(run(betting, { type: "RESET_GAME", shoe: [], phase: GamePhases.NONE })).at(-1)).toEqual([10, false]);
    const playing = dealt(["10", "10", "9", "7"]);
    const reset = run(playing, { type: "RESET_GAME", shoe: [], phase: GamePhases.NONE });
    expect(reset.creditEvents).toEqual(playing.creditEvents);
    expect(reset.phase).toBe(GamePhases.NONE);
  });

  it("a table setting with a new shoe resets to PRE_DEAL; others just change", () => {
    const s = dealt(["10", "10", "9", "7"]);
    const decks = run(s, { type: "SET_SETTING", key: "deckCount", value: 3, shoe: stackedShoe(["2"]) });
    expect(decks.settings.deckCount).toBe(3);
    expect(decks.phase).toBe(GamePhases.PRE_DEAL);
    expect(decks.hands).toEqual([]);
    const speed = run(s, { type: "SET_SETTING", key: "playTimeout", value: 500 });
    expect(speed.settings.playTimeout).toBe(500);
    expect(speed.hands).toBe(s.hands);
  });

  it("keeps only the last 20 credit events", () => {
    let s = started(["5"]);
    for (let i = 0; i < 25; i++) s = run(s, { type: "ADD_BET", amount: 1 });
    expect(s.creditEvents).toHaveLength(20);
    expect(s.creditEvents.at(-1).seq).toBe(25);
  });

  it("rejects unknown actions", () => {
    expect(() => gameReducer(initialGameState, { type: "NOPE" })).toThrow("Unknown game action NOPE");
  });
});
