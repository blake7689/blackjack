import { describe, it, expect } from "vitest";
import { gameReducer, initialGameState, nextAutoAction, sanitizeSettings } from "../gameReducer";
import { GamePhases } from "../constants/gamePhases";
import { stackedShoe, outOfCards, playRound } from "./stackedShoe";

const run = (state, ...actions) => actions.reduce((s, a) => gameReducer(s, { refill: outOfCards, credits: 1000, ...a }), state);
const started = (cards) => run(initialGameState, { type: "START_GAME", shoe: stackedShoe(cards) });
const dealt = (cards, bet = 10) => run(started(cards), { type: "ADD_BET", amount: bet }, { type: "DEAL" });
const withoutSeq = (e) => { const copy = { ...e }; delete copy.seq; return copy; };
const events = (s) => s.creditEvents.map(withoutSeq);
const local = (amount) => ({ kind: "local", amount });
const bet = (amount, newRound, alreadyDeducted) => ({ kind: "bet", amount, newRound, alreadyDeducted });
const settle = (amount) => ({ kind: "settle", amount });

describe("betting", () => {
  it("takes a bet from the balance locally and refunds it on clear", () => {
    const s = run(started(["5"]), { type: "ADD_BET", amount: 10 }, { type: "ADD_BET", amount: 5 }, { type: "CLEAR_BET" });
    expect(s.betCircle).toBe(0);
    expect(events(s)).toEqual([local(-10), local(-5), local(15)]);
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
    expect(events(s).at(-1)).toEqual(bet(10, true, true));
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
    expect(events(doubled).at(-1)).toEqual(bet(10, false, false));
    expect(doubled.betCircle).toBe(20);
    const split = run(dealt(["8", "10", "8", "7", "3", "10"]), { type: "SPLIT", handIdx: 0 });
    expect(events(split).at(-1)).toEqual(bet(10, false, false));
    expect(split.betCircle).toBe(20);
    expect(split.hands).toHaveLength(2);
    expect(split.selectedHandIndex).toBe(0);
  });

  it("triple is ignored when off (never a split), too short of credits, or not on two cards", () => {
    const pair = dealt(["8", "10", "8", "7", "3", "10"]);
    expect(run(pair, { type: "TRIPLE", handIdx: 0 })).toBe(pair);
    const on = (s) => ({ ...s, settings: { ...s.settings, tripleDown: true } });
    expect(run(on(pair), { type: "TRIPLE", handIdx: 0, credits: 19 })).toEqual(on(pair));
    const threeCards = run(on(dealt(["8", "10", "9", "7", "2"])), { type: "HIT", handIdx: 0 });
    expect(run(threeCards, { type: "TRIPLE", handIdx: 0 })).toBe(threeCards);
  });

  it("triple takes two more stakes in one ledger bet and counts both cards", () => {
    const start = dealt(["5", "10", "6", "7", "4", "5"]);
    const tripled = run({ ...start, settings: { ...start.settings, tripleDown: true } }, { type: "TRIPLE", handIdx: 0 });
    expect(events(tripled).at(-1)).toEqual(bet(20, false, false));
    expect(tripled.betCircle).toBe(30);
    expect(tripled.phase).toBe(GamePhases.DEALER_TURN);
    expect(tripled.seenIds).toHaveLength(start.seenIds.length + 2);
  });

  it("triple needs two stakes: a balance that affords a double but not a triple is refused, exactly two stakes is enough", () => {
    const start = dealt(["5", "10", "6", "7", "4", "5"]);
    const on = { ...start, settings: { ...start.settings, tripleDown: true } };
    expect(run(on, { type: "DOUBLE", handIdx: 0, credits: 19 }).hands[0].isDouble).toBe(true);
    expect(run(on, { type: "TRIPLE", handIdx: 0, credits: 19 })).toBe(on);
    expect(run(on, { type: "TRIPLE", handIdx: 0, credits: 20 }).hands[0].bet).toBe(30);
  });

  it("triple on a pair triples it (never splits) and a second triple, or one on a finished hand, is ignored", () => {
    const pair = dealt(["8", "10", "8", "7", "3", "10"]);
    const on = { ...pair, settings: { ...pair.settings, tripleDown: true } };
    const tripled = run(on, { type: "TRIPLE", handIdx: 0 });
    expect(tripled.hands).toHaveLength(1);
    expect(tripled.hands[0]).toMatchObject({ bet: 30 });
    expect(run(tripled, { type: "TRIPLE", handIdx: 0 })).toBe(tripled);
    const blackjack = run({ ...started(["A", "5", "K", "6"]), settings: on.settings }, { type: "ADD_BET", amount: 10 }, { type: "DEAL" });
    expect(run(blackjack, { type: "TRIPLE", handIdx: 0 })).toBe(blackjack);
  });

  it("triple on the wrong hand, or one that stood, is ignored; after a split the next hand plays", () => {
    const split = run(dealt(["8", "10", "8", "7", "3", "10", "2", "9", "4"]), { type: "SPLIT", handIdx: 0 });
    const on = { ...split, settings: { ...split.settings, tripleDown: true } };
    expect(run(on, { type: "TRIPLE", handIdx: 1 })).toBe(on);
    expect(run(on, { type: "TRIPLE", handIdx: 5 })).toBe(on);
    const stood = run(on, { type: "STAND", handIdx: 0 });
    expect(run(stood, { type: "TRIPLE", handIdx: 0 })).toBe(stood);
    const tripled = run(on, { type: "TRIPLE", handIdx: 0 });
    expect(tripled.hands.map((h) => h.bet)).toEqual([30, 10]);
    expect([tripled.phase, tripled.selectedHandIndex, tripled.betCircle]).toEqual([GamePhases.PLAYER_TURN, 1, 40]);
    expect(events(tripled).filter((e) => e.kind === "bet" && !e.newRound)).toEqual([bet(10, false, false), bet(20, false, false)]);
  });

  it("a refill between the two triple cards still draws the second card", () => {
    const start = dealt(["5", "10", "6", "7", "4"]);
    const on = { ...start, settings: { ...start.settings, tripleDown: true } };
    const tripled = run(on, { type: "TRIPLE", handIdx: 0, refill: () => stackedShoe(["5", "9"]) });
    expect(tripled.hands[0].cards.map((c) => c.rank)).toEqual(["5", "6", "4", "5"]);
    expect(tripled.hands[0].total).toBe(20);
    expect(tripled.shoe.map((c) => c.rank)).toEqual(["9"]);
    expect(start.shoe).toHaveLength(1);
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
    expect(events(s).at(-1)).toEqual(settle(20));
  });

  it("goes straight to settling when the revealed dealer stands", () => {
    const s = run(dealt(["10", "10", "9", "7"]), { type: "STAND", handIdx: 0 }, { type: "DEALER_REVEAL" });
    expect(s.phase).toBe(GamePhases.SETTLING_HANDS);
    expect(s.dealer.cards).toHaveLength(2);
  });

  it("still settles a total loss, so the server closes the round", () => {
    const r = playRound({ cards: ["10", "10", "6", "7", "K"], actions: ["stand"] });
    expect(r.payout).toBe(0);
    expect(events(r.state).at(-1)).toEqual(settle(0));
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
    expect(events(s).at(-1)).toEqual(local(-10));
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
    expect(events(run(betting, { type: "RESET_GAME", shoe: [], phase: GamePhases.NONE })).at(-1)).toEqual(local(10));
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

describe("saved settings (#36)", () => {
  const defaults = initialGameState.settings;

  it("keeps known keys of the right type and fills the rest from the defaults", () => {
    expect(sanitizeSettings({ v: 1, deckCount: 4, resetInitialBet: true, rigDeck: "x", bogus: 1 }))
      .toEqual({ ...defaults, deckCount: 4, resetInitialBet: true });
    expect(sanitizeSettings(undefined)).toEqual(defaults);
  });

  it("a saved triple down setting that is not a boolean falls back to off", () => {
    expect(sanitizeSettings({ tripleDown: "true", tripleDrawsOnBust: 1 })).toMatchObject({ tripleDown: false, tripleDrawsOnBust: false });
    expect(sanitizeSettings({ tripleDown: true, tripleDrawsOnBust: true })).toMatchObject({ tripleDown: true, tripleDrawsOnBust: true });
  });

  it("clamps and rounds numbers into range, but keeps maxSplitHands 0 (unlimited)", () => {
    expect(sanitizeSettings({ deckCount: 9, playTimeout: 10, maxSplitHands: 7 })).toMatchObject({ deckCount: 5, playTimeout: 250, maxSplitHands: 4 });
    expect(sanitizeSettings({ deckCount: 2.6, maxSplitHands: 0 })).toMatchObject({ deckCount: 3, maxSplitHands: 0 });
  });

  it("falls back to the default for a wrong type or an unknown dealer mode", () => {
    expect(sanitizeSettings({ includeCutCard: "yes", deckCount: "4", dealerHoleBehaviour: "drawAfter_noDraw21" }))
      .toMatchObject({ includeCutCard: true, deckCount: 2, dealerHoleBehaviour: defaults.dealerHoleBehaviour });
    expect(sanitizeSettings({ dealerHoleBehaviour: "drawAfter" }).dealerHoleBehaviour).toBe("drawAfter");
  });

  it("between rounds deals a new shoe when a table setting changed, otherwise just applies", () => {
    const table = gameReducer(initialGameState, { type: "START_GAME", shoe: stackedShoe(["2", "3"]) });
    const fresh = stackedShoe(["4", "5", "6"]);
    expect(gameReducer(table, { type: "LOAD_SETTINGS", saved: { deckCount: 3 }, shoe: fresh }).shoe).toBe(fresh);
    const sameTable = gameReducer(table, { type: "LOAD_SETTINGS", saved: { playTimeout: 500 }, shoe: fresh });
    expect([sameTable.shoe, sameTable.settings.playTimeout]).toEqual([table.shoe, 500]);
  });

  it("never resets a round in progress, or a table not started yet", () => {
    let s = gameReducer(initialGameState, { type: "START_GAME", shoe: stackedShoe(["10", "10", "9", "6", "K"]) });
    s = gameReducer(s, { type: "ADD_BET", amount: 10, credits: 100 });
    s = gameReducer(s, { type: "DEAL", refill: () => [] });
    const loaded = gameReducer(s, { type: "LOAD_SETTINGS", saved: { deckCount: 4 }, shoe: stackedShoe(["2"]) });
    expect([loaded.phase, loaded.hands, loaded.shoe, loaded.settings.deckCount]).toEqual([s.phase, s.hands, s.shoe, 4]);
    expect(gameReducer(initialGameState, { type: "LOAD_SETTINGS", saved: { deckCount: 4 }, shoe: stackedShoe(["2"]) }).shoe).toEqual([]);
  });
});
