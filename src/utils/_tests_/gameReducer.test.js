import { describe, it, expect } from "vitest";
import { gameReducer, initialGameState, nextAutoAction, sanitizeSettings } from "../gameReducer";
import { GamePhases } from "../constants/gamePhases";
import { stackedShoe, outOfCards, playRound, confirmBets, HandResult, HandStatus } from "./stackedShoe";

const run = (state, ...actions) => actions.reduce((s, a) => gameReducer(s, { refill: outOfCards, credits: 1000, ...a }), state);
const started = (cards) => run(initialGameState, { type: "START_GAME", shoe: stackedShoe(cards) });
const dealing = (cards, bet = 10) => run(started(cards), { type: "ADD_BET", amount: bet }, { type: "DEAL" });
const dealt = (cards, bet = 10) => run(dealing(cards, bet), { type: "DEAL_DONE" });
const withoutSeq = (e) => { const copy = { ...e }; delete copy.seq; delete copy.handTag; return copy; };
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

describe("dealing phase", () => {
  it("DEAL puts the cards on the table and waits in DEALING, whose next step is DEAL_DONE", () => {
    const s = dealing(["10", "10", "9", "7"]);
    expect(s.phase).toBe(GamePhases.DEALING);
    expect(s.hands[0].cards).toHaveLength(2);
    expect(s.dealer.cards).toHaveLength(1);
    expect(nextAutoAction(s)).toBe("DEAL_DONE");
  });

  it("DEAL_DONE hands over to the player, or to the dealer when the first hand is already done", () => {
    expect(run(dealing(["10", "10", "9", "7"]), { type: "DEAL_DONE" }).phase).toBe(GamePhases.PLAYER_TURN);
    const blackjack = run(dealing(["A", "5", "K", "6"]), { type: "DEAL_DONE" });
    expect(blackjack.phase).toBe(GamePhases.DEALER_TURN);
    expect(nextAutoAction(blackjack)).toBe("DEALER_REVEAL");
  });

  it("the player cannot act while dealing", () => {
    const s = dealing(["10", "10", "9", "7", "2"]);
    expect(run(s, { type: "HIT", handIdx: 0 })).toBe(s);
    expect(run(s, { type: "STAND", handIdx: 0 })).toBe(s);
  });

  it("DEAL_DONE outside DEALING does nothing, even with no hands", () => {
    const playing = dealt(["10", "10", "9", "7"]);
    expect(run(playing, { type: "DEAL_DONE" })).toBe(playing);
    expect(run(initialGameState, { type: "DEAL_DONE" })).toBe(initialGameState);
    const s = dealing(["10", "10", "9", "7"]);
    const voided = run(s, { type: "BET_REJECTED", seq: s.pendingBets[0].seq });
    expect(voided.phase).toBe(GamePhases.PRE_DEAL);
    expect(run(voided, { type: "DEAL_DONE" })).toBe(voided);
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
    const blackjack = run({ ...started(["A", "5", "K", "6"]), settings: on.settings }, { type: "ADD_BET", amount: 10 }, { type: "DEAL" }, { type: "DEAL_DONE" });
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

describe("face-down double", () => {
  const faceDown = (cards, bet = 10) => {
    const s = dealt(cards, bet);
    return run({ ...s, settings: { ...s.settings, doubleFaceDown: true } }, { type: "DOUBLE", handIdx: 0 });
  };
  const autoSteps = (state) => {
    const order = [];
    let s = confirmBets(state);
    while (s.phase !== GamePhases.POST_ROUND) { order.push(nextAutoAction(s)); s = run(s, { type: nextAutoAction(s) }); }
    return { order, s };
  };

  it("keeps the card out of the hand, the total and the count, and still takes the extra stake", () => {
    const s = faceDown(["6", "10", "5", "7", "3"]);
    const [hand] = s.hands;
    expect(hand.cards).toHaveLength(2);
    expect(hand.hiddenCards.map((c) => c.rank)).toEqual(["3"]);
    expect([hand.total, hand.totals, hand.isBusted, hand.result, hand.status, hand.bet]).toEqual([11, [11], false, HandResult.NONE, HandStatus.DONE, 20]);
    expect(s.seenIds).toHaveLength(3); // the hidden card is not counted
    expect(events(s).at(-1)).toEqual(bet(10, false, false));
    expect(s.phase).toBe(GamePhases.DEALER_TURN);
  });

  it("reveals every hand in one step before SETTLE, then settles on the revealed total", () => {
    const { order, s } = autoSteps(faceDown(["6", "10", "5", "7", "3"]));
    expect(order).toEqual(["DEALER_REVEAL", "REVEAL_HIDDEN", "SETTLE", "FINISH_RESULTS"]);
    expect(s.hands[0]).toMatchObject({ total: 14, totals: [14], hiddenCards: [], result: HandResult.LOSE, payout: 0 });
    expect(s.seenIds).toHaveLength(5);
  });

  it("a hidden bust shows no bust until the reveal, then loses the doubled stake", () => {
    const s = faceDown(["10", "10", "2", "6", "K", "5"]);
    expect([s.hands[0].total, s.hands[0].isBusted, s.hands[0].result]).toEqual([12, false, HandResult.NONE]);
    const revealed = run(run(s, { type: "DEALER_REVEAL" }, { type: "DEALER_STEP" }), { type: "REVEAL_HIDDEN" });
    expect(revealed.hands[0]).toMatchObject({ total: 22, isBusted: true, result: HandResult.LOSE, status: HandStatus.DONE, bet: 20 });
    expect(revealed.phase).toBe(GamePhases.SETTLING_HANDS);
  });

  it("an ace hand keeps both totals, and is not a blackjack, after the reveal", () => {
    const s = faceDown(["A", "10", "5", "9", "5"]);
    expect(s.hands[0].totals).toEqual([16, 6]);
    const revealed = run(s, { type: "REVEAL_HIDDEN" });
    expect(revealed.hands[0]).toMatchObject({ totals: [21, 11], isBlackjack: false, status: HandStatus.DONE });
  });

  it("reveals both split hands at once and leaves a hand with no hidden card alone", () => {
    const split = run(dealt(["8", "10", "8", "7", "3", "2", "4", "5"]), { type: "SPLIT", handIdx: 0 });
    const on = { ...split, settings: { ...split.settings, doubleFaceDown: true } };
    const doubled = run(on, { type: "DOUBLE", handIdx: 0 }, { type: "DOUBLE", handIdx: 1 });
    expect(doubled.hands.map((h) => h.hiddenCards.length)).toEqual([1, 1]);
    const revealed = run(doubled, { type: "REVEAL_HIDDEN" });
    expect(revealed.hands.map((h) => [h.cards.length, h.hiddenCards.length])).toEqual([[3, 0], [3, 0]]);
    const mixed = run(on, { type: "DOUBLE", handIdx: 0 }, { type: "STAND", handIdx: 1 });
    const mixedRevealed = run(mixed, { type: "REVEAL_HIDDEN" });
    expect(mixedRevealed.hands[1]).toEqual(mixed.hands[1]);
  });

  it("goes straight to SETTLE when the option is on but nothing was doubled face down", () => {
    const s = dealt(["10", "10", "9", "7"]);
    const on = run({ ...s, settings: { ...s.settings, doubleFaceDown: true } }, { type: "STAND", handIdx: 0 });
    expect(autoSteps(on).order).toEqual(["DEALER_REVEAL", "SETTLE", "FINISH_RESULTS"]);
  });

  it("still reveals when the option is turned off mid-round", () => {
    const s = faceDown(["6", "10", "5", "7", "3"]);
    const off = run(s, { type: "SET_SETTING", key: "doubleFaceDown", value: false });
    expect(autoSteps(off).order).toEqual(["DEALER_REVEAL", "REVEAL_HIDDEN", "SETTLE", "FINISH_RESULTS"]);
  });

  it("is off by default, so a double shows its card at once", () => {
    expect(initialGameState.settings.doubleFaceDown).toBe(false);
    const s = run(dealt(["6", "10", "5", "7", "3"]), { type: "DOUBLE", handIdx: 0 });
    expect([s.hands[0].cards, s.hands[0].hiddenCards].map((c) => c.length)).toEqual([3, 0]);
  });

  it("ignores every player action on a hand that was doubled face down", () => {
    const split = run(dealt(["8", "10", "8", "7", "3", "2", "4"]), { type: "SPLIT", handIdx: 0 });
    const on = { ...split, settings: { ...split.settings, doubleFaceDown: true, tripleDown: true } };
    const doubled = run(on, { type: "DOUBLE", handIdx: 0 });
    expect(doubled.selectedHandIndex).toBe(1);
    for (const type of ["HIT", "STAND", "DOUBLE", "TRIPLE", "SPLIT"]) expect(run(doubled, { type, handIdx: 0 })).toBe(doubled);
    // ...and once the dealer's turn starts, on every hand
    const all = run(doubled, { type: "STAND", handIdx: 1 });
    for (const type of ["HIT", "STAND", "DOUBLE", "TRIPLE", "SPLIT"]) expect(run(all, { type, handIdx: 0 })).toBe(all);
  });

  it("a plain double stays hidden, but a triple stays face up, with both options on", () => {
    const s = dealt(["2", "10", "3", "7", "4", "5", "K"]);
    const on = { ...s, settings: { ...s.settings, doubleFaceDown: true, tripleDown: true } };
    const tripled = run(on, { type: "TRIPLE", handIdx: 0 });
    expect([tripled.hands[0].cards.length, tripled.hands[0].hiddenCards.length, tripled.hands[0].bet]).toEqual([4, 0, 30]);
    expect(run(on, { type: "DOUBLE", handIdx: 0 }).hands[0].hiddenCards).toHaveLength(1);
  });

  it("a second REVEAL_HIDDEN changes nothing, and does not count the card twice", () => {
    const once = run(faceDown(["6", "10", "5", "7", "3"]), { type: "REVEAL_HIDDEN" });
    const twice = run(once, { type: "REVEAL_HIDDEN" });
    expect(twice.hands).toEqual(once.hands);
    expect([twice.seenIds, twice.runningCount]).toEqual([once.seenIds, once.runningCount]);
  });

  it("a reset or a new round never carries a hidden card over", () => {
    const s = faceDown(["6", "10", "5", "7", "3"]);
    expect(run(s, { type: "RESET_GAME", shoe: stackedShoe(["2"]), phase: GamePhases.NONE }).hands).toEqual([]);
    const { s: finished } = autoSteps(s);
    expect(finished.hands[0].hiddenCards).toEqual([]);
    const next = run(finished, { type: "CONTINUE" }, { type: "END_ROUND" }, { type: "ADD_BET", amount: 10 });
    expect(next.hands).toEqual([]);
    expect(run({ ...next, shoe: stackedShoe(["9", "10", "9", "7"]) }, { type: "DEAL" }).hands[0].hiddenCards).toEqual([]);
  });
});

describe("dealer and settlement steps", () => {
  it("runs reveal, steps, settle and results in order, then pays once", () => {
    let s = confirmBets(run(dealt(["10", "10", "9", "6", "K"]), { type: "STAND", handIdx: 0 }));
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

describe("server answers to bets (#23)", () => {
  const seqOf = (s, i) => s.pendingBets[i].seq;
  const rejectAt = (s, i) => run(s, { type: "BET_REJECTED", seq: seqOf(s, i) });
  const confirmAt = (s, i) => run(s, { type: "BET_CONFIRMED", seq: seqOf(s, i) });
  const tripleOn = (s) => ({ ...s, settings: { ...s.settings, tripleDown: true } });
  // 8 8 against a 10: the split gives the first hand a 3 and the split-off hand an 8, so both can act.
  const splitCards = ["8", "10", "8", "7", "3", "8", "K", "K", "K", "K"];
  const resplitCards = ["8", "10", "8", "7", "8", "8", "3", "K", "2", "K"];

  describe("hand tags and pending bets", () => {
    it("tags the dealt hand, and the opening bet waits for an answer with no hand tag", () => {
      const s = dealt(["10", "10", "9", "7"]);
      expect(s.hands.map((h) => h.tag)).toEqual([1]);
      expect(s.nextHandTag).toBe(2);
      expect(s.creditEvents.at(-1)).toMatchObject({ kind: "bet", newRound: true, handTag: null });
      expect(s.pendingBets).toEqual([{ seq: s.creditEvents.at(-1).seq, handTag: null, amount: 10, newRound: true }]);
    });

    it("never reuses a tag across rounds", () => {
      const first = dealt(["10", "10", "9", "7"]);
      const next = run(first, { type: "RESET_GAME", shoe: stackedShoe(["9", "10", "8", "7"]), phase: GamePhases.PRE_DEAL },
        { type: "ADD_BET", amount: 10 }, { type: "DEAL" });
      expect(next.hands.map((h) => h.tag)).toEqual([2]);
    });

    it("double and triple bet events carry the tag of the hand that took the stake", () => {
      const doubled = run(dealt(["5", "10", "6", "7", "10"]), { type: "DOUBLE", handIdx: 0 });
      expect(doubled.creditEvents.at(-1)).toMatchObject({ amount: 10, newRound: false, handTag: 1 });
      expect(doubled.pendingBets.at(-1)).toEqual({ seq: doubled.creditEvents.at(-1).seq, handTag: 1, amount: 10, newRound: false });
      const tripled = run(tripleOn(dealt(["5", "10", "6", "7", "4", "5"])), { type: "TRIPLE", handIdx: 0 });
      expect(tripled.pendingBets.at(-1)).toMatchObject({ handTag: 1, amount: 20, newRound: false });
    });

    it("a split keeps the parent's tag on the first hand and gives the split-off hand a new one, which takes the stake", () => {
      const s = run(dealt(splitCards), { type: "SPLIT", handIdx: 0 });
      expect(s.hands.map((h) => h.tag)).toEqual([1, 2]);
      expect(s.nextHandTag).toBe(3);
      expect(s.pendingBets.map((b) => [b.handTag, b.amount, b.newRound])).toEqual([[null, 10, true], [2, 10, false]]);
    });

    it("a resplit gives yet another new tag, even though the hands moved along", () => {
      const s = run(dealt(resplitCards), { type: "SPLIT", handIdx: 0 }, { type: "SPLIT", handIdx: 0 });
      expect(s.hands.map((h) => h.tag)).toEqual([1, 3, 2]);
      expect(s.pendingBets.map((b) => b.handTag)).toEqual([null, 2, 3]);
      const stood = run(s, { type: "STAND", handIdx: 0 }, { type: "STAND", handIdx: 1 }, { type: "SPLIT", handIdx: 2 });
      expect(stood.hands.map((h) => h.tag)).toEqual([1, 3, 2, 4]);
      expect(stood.pendingBets.at(-1)).toMatchObject({ handTag: 4, amount: 10 });
    });

    it("a confirmed bet leaves pendingBets; an unknown or repeated answer changes nothing", () => {
      const s = run(dealt(splitCards), { type: "SPLIT", handIdx: 0 });
      const first = confirmAt(s, 0);
      expect(first.pendingBets.map((b) => b.handTag)).toEqual([2]);
      expect(first.hands).toBe(s.hands);
      expect(run(first, { type: "BET_CONFIRMED", seq: s.pendingBets[0].seq })).toBe(first);
      expect(run(first, { type: "BET_CONFIRMED", seq: 999 })).toBe(first);
      expect(confirmAt(first, 0).pendingBets).toEqual([]);
    });

    it("RESET_GAME and a resetting setting clear pendingBets; a setting that does not reset the table leaves them", () => {
      const s = dealt(["10", "10", "9", "7"]);
      expect(s.pendingBets).toHaveLength(1);
      expect(run(s, { type: "RESET_GAME", shoe: [], phase: GamePhases.NONE }).pendingBets).toEqual([]);
      expect(run(s, { type: "SET_SETTING", key: "deckCount", value: 3, shoe: stackedShoe(["2"]) }).pendingBets).toEqual([]);
      expect(run(s, { type: "SET_SETTING", key: "playTimeout", value: 500 }).pendingBets).toBe(s.pendingBets);
    });

    it("a late confirm or reject after a reset is ignored (RESET_GAME and a resetting setting)", () => {
      const s = run(dealt(splitCards), { type: "SPLIT", handIdx: 0 });
      const seqs = s.pendingBets.map((b) => b.seq);
      const resets = [
        run(s, { type: "RESET_GAME", shoe: stackedShoe(["9", "10", "8", "7"]), phase: GamePhases.PRE_DEAL }),
        run(s, { type: "SET_SETTING", key: "deckCount", value: 3, shoe: stackedShoe(["9", "10", "8", "7"]) }),
      ];
      for (const reset of resets) {
        for (const seq of seqs) {
          expect(run(reset, { type: "BET_CONFIRMED", seq })).toBe(reset);
          expect(run(reset, { type: "BET_REJECTED", seq })).toBe(reset);
        }
        expect(reset.phase).toBe(GamePhases.PRE_DEAL);
        expect(reset.notice).toBeNull();
      }
    });

    it("a late answer cannot change the next round either: its bets have other seq numbers", () => {
      const old = dealt(["10", "10", "9", "7"]);
      const oldSeq = old.pendingBets[0].seq;
      const reset = run(old, { type: "RESET_GAME", shoe: stackedShoe(["9", "10", "8", "7"]), phase: GamePhases.PRE_DEAL });
      const next = run(reset, { type: "ADD_BET", amount: 10 }, { type: "DEAL" });
      expect(next.pendingBets[0].seq).not.toBe(oldSeq);
      expect(run(next, { type: "BET_REJECTED", seq: oldSeq })).toBe(next);
      expect(run(next, { type: "BET_CONFIRMED", seq: oldSeq })).toBe(next);
    });
  });

  describe("a refused extra stake", () => {
    it("a refused double keeps the cards, drops the bet by the double's amount and says so", () => {
      const doubled = run(dealt(["5", "10", "6", "7", "10"]), { type: "DOUBLE", handIdx: 0 });
      const s = rejectAt(doubled, 1);
      expect(s.hands[0].cards).toBe(doubled.hands[0].cards);
      expect(s.hands[0]).toMatchObject({ bet: 10, status: HandStatus.DONE, isDouble: true });
      expect(s.betCircle).toBe(10);
      expect(s.notice).toBe("The server refused $10 of your stake; that hand plays for less.");
      expect(s.pendingBets.map((b) => b.newRound)).toEqual([true]); // only the opening bet still waits
      expect(s.phase).toBe(doubled.phase);
      expect(s.creditEvents).toBe(doubled.creditEvents); // the shown balance is the provider's job
    });

    it("a refused triple drops the bet by two stakes", () => {
      const tripled = run(tripleOn(dealt(["5", "10", "6", "7", "4", "5"])), { type: "TRIPLE", handIdx: 0 });
      expect(tripled.hands[0].bet).toBe(30);
      const s = rejectAt(tripled, 1);
      expect(s.hands[0].bet).toBe(10);
      expect(s.betCircle).toBe(10);
      expect(s.notice).toContain("$20");
    });

    it("a refused split lowers the split-off hand only, and betCircle becomes the sum of the hand bets", () => {
      const split = run(dealt(splitCards), { type: "SPLIT", handIdx: 0 });
      expect(split.betCircle).toBe(20);
      const s = rejectAt(split, 1);
      expect(s.hands.map((h) => [h.tag, h.bet])).toEqual([[1, 10], [2, 0]]);
      expect(s.betCircle).toBe(10);
      expect(s.notice).not.toBeNull();
    });

    it("finds the hand by its tag when the hands have moved since the bet (two splits and a resplit)", () => {
      let s = run(dealt(resplitCards), { type: "SPLIT", handIdx: 0 }, { type: "SPLIT", handIdx: 0 });
      s = run(s, { type: "STAND", handIdx: 0 }, { type: "STAND", handIdx: 1 }, { type: "SPLIT", handIdx: 2 });
      expect(s.hands.map((h) => h.tag)).toEqual([1, 3, 2, 4]); // tag 2 sat at index 1 when its split bet was made
      expect(s.pendingBets.map((b) => b.handTag)).toEqual([null, 2, 3, 4]);

      const first = rejectAt(s, 1); // the first split's stake
      expect(first.hands.map((h) => [h.tag, h.bet])).toEqual([[1, 10], [3, 10], [2, 0], [4, 10]]);
      const both = run(first, { type: "BET_REJECTED", seq: seqOf(s, 2) }); // the second split's stake
      expect(both.hands.map((h) => [h.tag, h.bet])).toEqual([[1, 10], [3, 0], [2, 0], [4, 10]]);
      expect(both.betCircle).toBe(20);
      expect(both.pendingBets.map((b) => b.handTag)).toEqual([null, 4]);
    });

    it("ignores an answer for a bet that is not pending, and a second refusal of the same bet", () => {
      const doubled = run(dealt(["5", "10", "6", "7", "10"]), { type: "DOUBLE", handIdx: 0 });
      const once = rejectAt(doubled, 1);
      expect(run(once, { type: "BET_REJECTED", seq: doubled.pendingBets[1].seq })).toBe(once);
      expect(run(once, { type: "BET_REJECTED", seq: 999 })).toBe(once);
      const confirmed = confirmAt(doubled, 1);
      expect(run(confirmed, { type: "BET_REJECTED", seq: doubled.pendingBets[1].seq })).toBe(confirmed);
    });

    it("a refusal that arrives mid-turn leaves the other hands and the selection alone", () => {
      const split = run(dealt(splitCards), { type: "SPLIT", handIdx: 0 });
      const mid = run(split, { type: "HIT", handIdx: 0 });
      const s = rejectAt(mid, 1);
      expect(s.selectedHandIndex).toBe(mid.selectedHandIndex);
      expect(s.hands[0]).toBe(mid.hands[0]);
      expect(s.phase).toBe(mid.phase);
    });
  });

  describe("a refused opening bet", () => {
    it("voids the round back to betting, with nothing on the table, no settle and no refund event", () => {
      const doubled = run(dealt(["5", "10", "6", "7", "10"]), { type: "DOUBLE", handIdx: 0 });
      const s = rejectAt(doubled, 0);
      expect(s).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle: 0, hands: [], pendingBets: [], dealerRevealed: false, selectedHandIndex: 0 });
      expect(s.dealer.cards).toEqual([]);
      expect(s.dealerHole.cards).toEqual([]);
      expect(s.notice).toBe("The server refused your bet, so the round was cancelled.");
      expect(s.creditEvents).toBe(doubled.creditEvents); // no local refund: the chips never left the server balance
      expect(s.creditEvents.some((e) => e.kind === "settle")).toBe(false);
      expect(nextAutoAction(s)).toBeNull();
    });

    it("a later answer for a bet of the voided round is ignored", () => {
      const doubled = run(dealt(["5", "10", "6", "7", "10"]), { type: "DOUBLE", handIdx: 0 });
      const voided = rejectAt(doubled, 0);
      expect(run(voided, { type: "BET_REJECTED", seq: doubled.pendingBets[1].seq })).toBe(voided);
      expect(run(voided, { type: "BET_CONFIRMED", seq: doubled.pendingBets[1].seq })).toBe(voided);
    });

    it("lets the player bet and deal again, and the notice goes away with the new deal", () => {
      const voided = rejectAt(dealt(["10", "10", "9", "7"]), 0);
      const again = run({ ...voided, shoe: stackedShoe(["9", "10", "8", "7"]) }, { type: "ADD_BET", amount: 10 });
      expect(again.notice).not.toBeNull(); // still showing until the next deal
      expect(run(again, { type: "DEAL" }).notice).toBeNull();
    });
  });

  describe("settling waits for the server", () => {
    const settling = (s) => run(s, { type: "STAND", handIdx: 0 }, { type: "DEALER_REVEAL" });

    it("has no automatic step in SETTLING_HANDS while a bet is unanswered, then SETTLE once it clears", () => {
      const s = settling(dealt(["10", "10", "9", "7"]));
      expect(s.phase).toBe(GamePhases.SETTLING_HANDS);
      expect(nextAutoAction(s)).toBeNull();
      expect(nextAutoAction(confirmAt(s, 0))).toBe("SETTLE");
    });

    it("waits for a face-down reveal too, and it still reveals first once the bets are answered", () => {
      const base = dealt(["6", "10", "5", "7", "3"]);
      const s = run({ ...base, settings: { ...base.settings, doubleFaceDown: true } }, { type: "DOUBLE", handIdx: 0 }, { type: "DEALER_REVEAL" });
      expect(s.phase).toBe(GamePhases.SETTLING_HANDS);
      expect(nextAutoAction(s)).toBeNull();
      expect(nextAutoAction(confirmAt(s, 0))).toBeNull(); // the double's bet is still unanswered
      expect(nextAutoAction(confirmAt(confirmAt(s, 0), 0))).toBe("REVEAL_HIDDEN");
    });

    it("a refused bet also releases the wait, and the hand settles on the lower stake", () => {
      const doubled = run(dealt(["5", "10", "6", "7", "10"]), { type: "DOUBLE", handIdx: 0 }, { type: "DEALER_REVEAL" });
      const refused = confirmAt(rejectAt(doubled, 1), 0);
      expect(nextAutoAction(refused)).toBe("SETTLE");
      expect(run(refused, { type: "SETTLE" }).hands[0]).toMatchObject({ bet: 10, payout: 20 });
    });

    it("does not hold back the dealer's turn, only the settlement", () => {
      const s = run(dealt(["10", "10", "9", "7"]), { type: "STAND", handIdx: 0 });
      expect(s.pendingBets).toHaveLength(1);
      expect(nextAutoAction(s)).toBe("DEALER_REVEAL");
    });
  });

  describe("a hand with no stake left", () => {
    // Hand 2 (the split-off 8 8) has bet 0 after its split bet was refused; hand 1 is done.
    const unstaked = () => {
      const split = run(dealt(splitCards), { type: "SPLIT", handIdx: 0 });
      return tripleOn(run(rejectAt(split, 1), { type: "STAND", handIdx: 0 }));
    };

    it("cannot double, triple or split, even with plenty of credits", () => {
      const s = unstaked();
      expect(s.selectedHandIndex).toBe(1);
      expect(s.hands[1]).toMatchObject({ bet: 0, status: HandStatus.PLAYING });
      expect(s.hands[1].cards.map((c) => c.rank)).toEqual(["8", "8"]); // a pair, so a split would otherwise be fine
      for (const type of ["DOUBLE", "TRIPLE", "SPLIT"]) expect(run(s, { type, handIdx: 1, credits: 1e6 })).toBe(s);
    });

    it("can still hit and stand", () => {
      const s = unstaked();
      expect(run(s, { type: "HIT", handIdx: 1 }).hands[1].cards).toHaveLength(3);
      expect(run(s, { type: "STAND", handIdx: 1 }).phase).toBe(GamePhases.DEALER_TURN);
    });
  });

  describe("the notice", () => {
    it("is cleared by a reset, and by the end of the round", () => {
      const refused = playRound({ cards: ["5", "10", "6", "7", "K"], actions: ["double"], refuse: [1] }).state;
      expect(refused.notice).not.toBeNull();
      expect(refused.phase).toBe(GamePhases.POST_ROUND);
      expect(run(refused, { type: "RESET_GAME", shoe: [], phase: GamePhases.NONE }).notice).toBeNull();
      expect(run(refused, { type: "CONTINUE" }).notice).not.toBeNull();
      expect(run(refused, { type: "CONTINUE" }, { type: "END_ROUND" }).notice).toBeNull();
    });
  });
});
