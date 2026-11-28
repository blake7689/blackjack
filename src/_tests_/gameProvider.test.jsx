import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { GameProvider } from "../providers/GameProvider";
import Game from "../pages/Game";
import { useGameState, useGameActions } from "../hooks/useGame";
import { PlayerContext } from "../context/PlayerContext";
import { GamePhases } from "../utils/constants/gamePhases";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import * as cards from "../utils/cards";
import { queue } from "../utils/cardAnimation";
import { money, setCurrency } from "../utils/money";

// Saved settings on the server (#36), controlled per test.
const remote = vi.hoisted(() => ({ getSettings: vi.fn(), saveSettings: vi.fn(), token: null }));
vi.mock("../utils/playerEngine", () => ({ getSettings: remote.getSettings, saveSettings: remote.saveSettings }));
vi.mock("../utils/api", () => ({ getToken: () => remote.token }));

// The table itself is not under test here: Game decides whether to show it.
vi.mock("../components/GameBoard/GameBoard", () => ({ default: () => <div>the table</div> }));

// Every new shoe comes from the next stacked list, so rounds are scripted.
const shoes = [];
vi.mock("../utils/cards", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createShoe: vi.fn((...args) => (shoes.length ? shoes.shift() : actual.createShoe(...args))) };
});

function Probe({ ctx }) {
  ctx.state = useGameState();
  ctx.actions = useGameActions();
  ctx.navigate = useNavigate();
  ctx.pathname = useLocation().pathname;
  return null;
}

// The fake server answers each bet at once with `answer(event)`; with answer = null the test answers by hand
// through player.reports[seq](outcome).
function setup({ signedIn = false, answer = () => "confirmed", path = "/game", credits: startCredits = 100 } = {}) {
  const credits = { value: startCredits };
  const reports = {};
  const player = {
    player: signedIn ? { userName: "alice" } : null,
    getCredits: vi.fn(() => credits.value),
    reports,
    applyCreditEvent: vi.fn((event, report) => {
      credits.value += event.kind === "bet" && !event.alreadyDeducted ? -event.amount : event.kind === "bet" ? 0 : event.amount;
      if (event.kind !== "bet") return;
      reports[event.seq] = (outcome) => act(() => report(event.seq, outcome));
      if (answer) report(event.seq, answer(event));
    }),
  };
  const ctx = {};
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <PlayerContext.Provider value={player}>
        <GameProvider><Probe ctx={ctx} /></GameProvider>
      </PlayerContext.Provider>
    </MemoryRouter>
  );
  return { ctx, player, ...utils };
}

const events = (player) => player.applyCreditEvent.mock.calls.map(([e]) => { const copy = { ...e }; delete copy.seq; return copy; });
const tick = () => act(() => { vi.advanceTimersByTime(1000); });

beforeEach(() => {
  vi.useFakeTimers();
  shoes.length = 0;
  cards.createShoe.mockClear();
  remote.getSettings.mockReset().mockResolvedValue({});
  remote.saveSettings.mockReset().mockResolvedValue(undefined);
  remote.token = null;
});

const flush = () => act(async () => {});
afterEach(() => vi.useRealTimers());

describe("GameProvider", () => {
  it("an automatic step waits for a card still in the air, then a beat of 0.3 x Rate of Play", () => {
    shoes.push(stackedShoe(["10", "10", "9", "6", "K", "2"]));
    const { ctx } = setup();
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    queue.free = performance.now() + 3000; // the cards of this deal are still flying
    act(() => ctx.actions.deal());
    expect(ctx.state.phase).toBe(GamePhases.DEALING);
    act(() => { vi.advanceTimersByTime(3299); }); // 3000 + 0.3 * 1000, not the plain 1000
    expect(ctx.state.phase).toBe(GamePhases.DEALING);
    act(() => { vi.advanceTimersByTime(1); });
    expect(ctx.state.phase).toBe(GamePhases.PLAYER_TURN);
  });

  it("plays a round end to end, applying each credit change exactly once", () => {
    shoes.push(stackedShoe(["10", "10", "9", "6", "K", "2"]));
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    expect(ctx.state.phase).toBe(GamePhases.DEALING); // the cards sit there for one step
    tick();
    expect(ctx.state.phase).toBe(GamePhases.PLAYER_TURN);
    act(() => ctx.actions.stand(0));
    expect(ctx.actions.getPhase()).toBe(GamePhases.DEALER_TURN);
    tick(); // reveal
    tick(); // dealer draws K and busts
    expect(ctx.state.dealer.isBusted).toBe(true);
    tick(); // settle
    tick(); // results
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    expect(events(player)).toEqual([{ kind: "local", amount: -10 }, { kind: "bet", amount: 10, newRound: true, alreadyDeducted: true, handTag: null }, { kind: "settle", amount: 20 }]);
    act(() => ctx.actions.continueRound());
    tick();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(player.applyCreditEvent).toHaveBeenCalledTimes(3);
  });

  it("cancels pending dealer steps when the game is reset mid-round", () => {
    shoes.push(stackedShoe(["A", "10", "K", "6", "5"]), stackedShoe(["2"]));
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick(); // player blackjack: the dealer's turn is scheduled
    expect(ctx.state.phase).toBe(GamePhases.DEALER_TURN);
    act(() => ctx.actions.resetGame());
    for (let i = 0; i < 5; i++) tick();
    expect(ctx.state.phase).toBe(GamePhases.NONE);
    expect(ctx.state.dealer.cards).toEqual([]);
    expect(events(player)).toEqual([{ kind: "local", amount: -10 }, { kind: "bet", amount: 10, newRound: true, alreadyDeducted: true, handTag: null }]);
  });

  it("stops its timer on unmount", () => {
    shoes.push(stackedShoe(["A", "10", "K", "6"]));
    const { ctx, unmount } = setup();
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal()); // DEALING: the DEAL_DONE timer is pending
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("undoBet takes back the last chip locally (the balance, the circle, the history); the ledger sees one opening bet at the deal", () => {
    shoes.push(stackedShoe(["10", "10", "9", "7"]));
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(25));
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.undoBet());
    expect([ctx.state.betCircle, ctx.state.betHistory]).toEqual([25, [25]]);
    expect(events(player).filter((e) => e.kind === "local").map((e) => e.amount)).toEqual([-25, -10, 10]);
    act(() => ctx.actions.deal());
    expect(events(player).filter((e) => e.kind === "bet")).toEqual([{ kind: "bet", amount: 25, newRound: true, alreadyDeducted: true, handTag: null }]);
    act(() => ctx.actions.undoBet()); // dealt: nothing to undo
    expect(ctx.state.betCircle).toBe(25);
  });

  it("passes the player's balance to bets, doubles and splits", () => {
    shoes.push(stackedShoe(["8", "10", "8", "7", "3", "10", "2"])); // dealt by the rule change, which starts the table
    const { ctx, player } = setup();
    act(() => { ctx.actions.changeSetting("splitDeal", "both"); }); // both split hands dealt at once, the rule this scenario was written for
    act(() => ctx.actions.addBet(500)); // more than the balance
    expect(ctx.state.betCircle).toBe(0);
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.clearBet());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    act(() => ctx.actions.split(0));
    expect(ctx.state.hands).toHaveLength(2);
    act(() => ctx.actions.double(0));
    act(() => ctx.actions.hit(1));
    expect(ctx.state.hands[1].cards).toHaveLength(3);
    expect(events(player)).toContainEqual({ kind: "bet", amount: 10, newRound: false, alreadyDeducted: false, handTag: 2 }); // the split-off hand
    expect(events(player)).toContainEqual({ kind: "bet", amount: 10, newRound: false, alreadyDeducted: false, handTag: 1 }); // the double
  });

  it("passes the player's balance to a triple and sends one bet of two stakes", () => {
    shoes.push(stackedShoe(["5", "10", "6", "7", "4", "5"]));
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    act(() => { ctx.actions.changeSetting("tripleDown", true); });
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    act(() => ctx.actions.triple(0));
    expect(ctx.state.hands[0]).toMatchObject({ bet: 30 });
    expect(events(player)).toContainEqual({ kind: "bet", amount: 20, newRound: false, alreadyDeducted: false, handTag: 1 });
  });

  it("runs a face-down double through the timer: one reveal step, then settle, with one bet of one stake", () => {
    shoes.push(stackedShoe(["6", "10", "5", "7", "K"]));
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    act(() => { ctx.actions.changeSetting("doubleFaceDown", true); });
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    act(() => ctx.actions.double(0));
    expect(ctx.state.hands[0]).toMatchObject({ total: 11, bet: 20, isBusted: false });
    expect(ctx.state.hands[0].hiddenCards).toHaveLength(1);
    tick(); // dealer reveals the hole card
    expect(ctx.state.phase).toBe(GamePhases.SETTLING_HANDS); // 17 stands
    expect(ctx.state.hands[0].hiddenCards).toHaveLength(1);
    tick(); // the face-down card turns over
    expect(ctx.state.hands[0]).toMatchObject({ total: 21, hiddenCards: [] });
    expect(ctx.state.phase).toBe(GamePhases.SETTLING_HANDS);
    tick(); // settle
    tick(); // results
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    expect(events(player)).toEqual([{ kind: "local", amount: -10 }, { kind: "bet", amount: 10, newRound: true, alreadyDeducted: true, handTag: null },
      { kind: "bet", amount: 10, newRound: false, alreadyDeducted: false, handTag: 1 }, { kind: "settle", amount: 40 }]);
  });

  it("waits at settling until the server has answered every bet, then carries on", () => {
    shoes.push(stackedShoe(["10", "10", "9", "6", "K", "2"]));
    const { ctx, player } = setup({ answer: null });
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    act(() => ctx.actions.stand(0));
    tick(); // reveal
    tick(); // dealer draws K and busts
    expect(ctx.state.phase).toBe(GamePhases.SETTLING_HANDS);
    for (let i = 0; i < 5; i++) tick();
    expect(ctx.state.phase).toBe(GamePhases.SETTLING_HANDS); // still waiting for the opening bet's answer
    expect(ctx.state.pendingBets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(events(player).some((e) => e.kind === "settle")).toBe(false);

    player.reports[ctx.state.pendingBets[0].seq]("confirmed");
    expect(ctx.state.pendingBets).toEqual([]);
    tick(); // settle
    tick(); // results
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    expect(events(player).at(-1)).toEqual({ kind: "settle", amount: 20 });
  });

  it("a refused double lowers the bet, shows a notice and settles at the single stake", () => {
    shoes.push(stackedShoe(["5", "10", "6", "7", "K"]));
    const { ctx, player } = setup({ answer: (event) => (event.newRound ? "confirmed" : "rejected") });
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    act(() => ctx.actions.double(0));
    expect(ctx.state.hands[0]).toMatchObject({ bet: 10, total: 21, isDouble: true });
    expect(ctx.state.betCircle).toBe(10);
    expect(ctx.state.notice).toMatch(/refused \$10/);
    for (let i = 0; i < 4; i++) tick();
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    expect(ctx.state.hands[0]).toMatchObject({ bet: 10, payout: 20 });
    expect(events(player).at(-1)).toEqual({ kind: "settle", amount: 20 }); // not 40: the server holds a single stake
  });

  it("a refused opening bet voids the round: back to betting, no timer, no settle", () => {
    shoes.push(stackedShoe(["10", "10", "9", "7"]));
    const { ctx, player } = setup({ answer: () => "rejected" });
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle: 0, hands: [], pendingBets: [] });
    expect(ctx.state.notice).toMatch(/round was cancelled/);
    for (let i = 0; i < 4; i++) tick();
    expect(events(player).some((e) => e.kind === "settle")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an answer that arrives after the table was reset is ignored", () => {
    shoes.push(stackedShoe(["10", "10", "9", "7"]), stackedShoe(["2"]));
    const { ctx, player } = setup({ answer: null });
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    const { seq } = ctx.state.pendingBets[0];
    act(() => ctx.actions.resetGame());
    expect(ctx.state.pendingBets).toEqual([]);
    const after = ctx.state;
    player.reports[seq]("rejected");
    player.reports[seq]("confirmed");
    expect(ctx.state).toBe(after);
    expect(ctx.state.notice).toBeNull();
  });

  it("deals a fresh shoe for table settings and just updates the others", () => {
    const { ctx } = setup();
    act(() => { ctx.actions.changeSetting("deckCount", 3); });
    expect(ctx.state.shoe.filter((c) => c.type === "card")).toHaveLength(156);
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(cards.createShoe).toHaveBeenLastCalledWith(3, true);
    act(() => { ctx.actions.changeSetting("playTimeout", 500); });
    expect(ctx.state.settings.playTimeout).toBe(500);
    expect(cards.createShoe).toHaveBeenCalledTimes(1);
  });

  it("changes several settings in one step, dealing one fresh shoe (rule presets)", () => {
    const { ctx } = setup();
    act(() => { ctx.actions.changeSettings({ dealerHoleBehaviour: "drawAfter", blackjackPaysImmediately: false }); });
    expect(ctx.state.settings).toMatchObject({ dealerHoleBehaviour: "drawAfter", blackjackPaysImmediately: false });
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(cards.createShoe).toHaveBeenCalledTimes(1);
    act(() => { ctx.actions.changeSettings({ playTimeout: 750 }); });
    expect(ctx.state.settings.playTimeout).toBe(750);
    expect(cards.createShoe).toHaveBeenCalledTimes(1);
  });

  it("loads the player's saved settings on sign-in, cleaned of unknown or bad values", async () => {
    remote.getSettings.mockResolvedValue({ v: 1, deckCount: 4, resetInitialBet: true, dealerHoleBehaviour: "drawAfter_noDraw21", bogus: 1 });
    const { ctx } = setup({ signedIn: true });
    await flush();
    expect(ctx.state.settings).toMatchObject({ deckCount: 4, resetInitialBet: true, dealerHoleBehaviour: "drawEarly_Check" });
    expect(ctx.state.settings).not.toHaveProperty("bogus");
  });

  it("keeps the defaults when loading fails, and loads nothing when signed out", async () => {
    remote.getSettings.mockRejectedValue(new Error("offline"));
    const { ctx } = setup({ signedIn: true });
    await flush();
    expect(ctx.state.settings.deckCount).toBe(6);
    setup();
    expect(remote.getSettings).toHaveBeenCalledTimes(1);
  });

  it("ignores saved settings that arrive after signing out", async () => {
    let answer;
    remote.getSettings.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { ctx, rerender } = setup({ signedIn: true });
    rerender(
      <MemoryRouter initialEntries={["/game"]}>
        <PlayerContext.Provider value={{ player: null, getCredits: () => 0, applyCreditEvent: () => {} }}>
          <GameProvider><Probe ctx={ctx} /></GameProvider>
        </PlayerContext.Provider>
      </MemoryRouter>
    );
    await act(async () => answer({ deckCount: 5 }));
    expect(ctx.state.settings.deckCount).toBe(6);
  });

  it("saves the whole settings object when signed in, and nothing when signed out", async () => {
    const { ctx } = setup({ signedIn: true });
    await flush(); // the saved settings have loaded
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 500); });
    expect(remote.saveSettings).not.toHaveBeenCalled();
    remote.token = "token";
    await act(async () => { await ctx.actions.changeSetting("deckCount", 3); });
    expect(remote.saveSettings).toHaveBeenCalledWith({ v: 5, ...ctx.state.settings });
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ deckCount: 3, playTimeout: 500 });
  });

  it("saves chipValues as a flat comma-separated string, without resetting the game", async () => {
    remote.token = "token";
    const { ctx } = setup({ signedIn: true });
    await flush();
    cards.createShoe.mockClear(); // the sign-in load built its own shoe
    await act(async () => { await ctx.actions.changeSettings({ chipValues: "5,25" }); });
    const saved = remote.saveSettings.mock.calls[0][0];
    expect(saved.chipValues).toBe("5,25");
    expect(Object.values(saved).every((v) => ["string", "number", "boolean"].includes(typeof v))).toBe(true);
    await act(async () => { await ctx.actions.changeSetting("chipValues", "1,5"); });
    expect(remote.saveSettings.mock.calls[1][0].chipValues).toBe("1,5");
    expect(ctx.state.settings.chipValues).toBe("1,5");
    expect(cards.createShoe).not.toHaveBeenCalled();
  });

  it("applies saved chipValues on sign-in, cleaning an out-of-order or bad value", async () => {
    remote.getSettings.mockResolvedValue({ v: 1, chipValues: "25,5,5" });
    const { ctx } = setup({ signedIn: true });
    await flush();
    expect(ctx.state.settings.chipValues).toBe("5,25");
    remote.getSettings.mockResolvedValue({ v: 1, chipValues: 5 });
    const second = setup({ signedIn: true });
    await flush();
    expect(second.ctx.state.settings.chipValues).toBe("1,5,10,25,50,100,1000,5000,10000,20000,50000,100000");
  });
});

describe("GameProvider auto deal (#88)", () => {
  const DELAY = 2500; // not a multiple of the 1000 ms Rate of Play, so the three timers cannot be confused
  const AUTO = { resetInitialBet: true, autoDeal: true, autoDealDelay: DELAY };
  // Round 1 (a win for the player), round 2 (the same), round 3 (stops on the player's turn).
  const WIN = ["10", "10", "9", "6", "K"];
  const threeRounds = () => stackedShoe([...WIN, ...WIN, "8", "10", "9", "7", "K", "2"]);
  const newRoundBets = (player) => events(player).filter((e) => e.kind === "bet" && e.newRound);

  // Starts a game with auto deal on, bets $10 and deals by hand: the only manual deal of the tests.
  function startAuto({ settings = AUTO, ...options } = {}) {
    const result = setup(options);
    act(() => result.ctx.actions.startGame());
    act(() => { result.ctx.actions.changeSettings(settings); });
    act(() => result.ctx.actions.addBet(10));
    act(() => result.ctx.actions.deal());
    return result;
  }
  // From DEALING to the results screen: the player stands and the automatic dealer steps run.
  const playOut = (ctx) => {
    tick(); // DEAL_DONE
    act(() => ctx.actions.stand(0));
    for (let i = 0; i < 10 && ctx.state.phase !== GamePhases.POST_ROUND; i++) tick();
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
  };
  // From the results screen to the armed deal: CONTINUE, then END_ROUND, one Rate of Play each.
  const toArmed = (ctx) => {
    tick();
    expect(ctx.state.phase).toBe(GamePhases.END_ROUND);
    tick();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
  };
  const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

  it("continues, rebets and deals by itself after exactly the delay, through the ledger like a manual deal", () => {
    shoes.push(threeRounds());
    const { ctx, player, container } = startAuto();
    playOut(ctx);
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    tick(); // no click: the results move on after one step
    expect(ctx.state.phase).toBe(GamePhases.END_ROUND);
    tick(); // END_ROUND rebets
    expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle: 10, autoDealPending: true });
    advance(DELAY - 1);
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(newRoundBets(player)).toHaveLength(1);
    advance(1);
    expect(ctx.state.phase).toBe(GamePhases.DEALING);
    expect(ctx.state.autoDealPending).toBe(false);
    expect(container.textContent).toBe(""); // no countdown or other text of its own

    const all = events(player);
    expect(all).toEqual([
      { kind: "local", amount: -10 }, { kind: "bet", amount: 10, newRound: true, alreadyDeducted: true, handTag: null }, { kind: "settle", amount: 20 },
      { kind: "local", amount: -10 }, { kind: "bet", amount: 10, newRound: true, alreadyDeducted: true, handTag: null },
    ]);
    expect(all[4]).toEqual(all[1]); // the auto deal's opening bet has the shape of the manual one
    expect(newRoundBets(player)).toHaveLength(2);
    expect(ctx.state.hands[0].cards).toHaveLength(2);
  });

  it("with a delay of 0 deals right after the CONTINUE and END_ROUND steps", () => {
    shoes.push(threeRounds());
    const { ctx, player } = startAuto({ settings: { ...AUTO, autoDealDelay: 0 } });
    playOut(ctx);
    toArmed(ctx);
    expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, autoDealPending: true });
    advance(0);
    expect(ctx.state.phase).toBe(GamePhases.DEALING);
    expect(newRoundBets(player)).toHaveLength(2);
  });

  it("a card still in the air holds the automatic deal until it lands, plus a beat of 0.3 x the delay", () => {
    shoes.push(threeRounds());
    const { ctx } = startAuto();
    playOut(ctx);
    toArmed(ctx);
    queue.free = performance.now() + 6000; // the table is still busy
    act(() => { ctx.actions.changeSettings({ autoDealDelay: 2000 }); }); // re-arms the DEAL timer with the new delay
    expect(ctx.state.autoDealPending).toBe(true);
    advance(6000 + 600 - 1); // max(2000, 6000 + 0.3 * 2000)
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    advance(1);
    expect(ctx.state.phase).toBe(GamePhases.DEALING);
  });

  it("deals two rounds in a row (the timer re-arms each time)", () => {
    shoes.push(threeRounds());
    const { ctx, player } = startAuto();
    playOut(ctx);
    toArmed(ctx);
    advance(DELAY);
    expect(newRoundBets(player)).toHaveLength(2);
    playOut(ctx);
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    toArmed(ctx);
    advance(DELAY - 1);
    expect(newRoundBets(player)).toHaveLength(2);
    advance(1);
    expect(ctx.state.phase).toBe(GamePhases.DEALING);
    expect(newRoundBets(player)).toHaveLength(3);
    expect(ctx.state.hands[0].cards.map((c) => c.rank)).toEqual(["8", "9"]); // round 3 came off the stacked shoe
  });

  it("with auto deal off, the results wait for the click and no extra timer runs", () => {
    shoes.push(threeRounds());
    const { ctx, player } = startAuto({ settings: { resetInitialBet: true } });
    playOut(ctx);
    expect(vi.getTimerCount()).toBe(0);
    advance(60_000);
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    act(() => ctx.actions.continueRound());
    tick(); // END_ROUND
    expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle: 10, autoDealPending: false });
    expect(vi.getTimerCount()).toBe(0);
    advance(60_000);
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(newRoundBets(player)).toHaveLength(1);
  });

  describe("an unaffordable rebet", () => {
    // $1,000 bet, lost (18 against 19): the balance is 0 at the end of the round.
    const loseBig = () => {
      shoes.push(stackedShoe(["10", "10", "8", "9", "5", "5"]));
      const result = setup({ credits: 1000 });
      act(() => result.ctx.actions.startGame());
      act(() => { result.ctx.actions.changeSettings(AUTO); });
      act(() => result.ctx.actions.addBet(1000));
      act(() => result.ctx.actions.deal());
      playOut(result.ctx);
      return result;
    };

    it("pauses with the notice, places no bet and never schedules a deal", () => {
      const { ctx, player } = loseBig();
      const before = events(player).length;
      tick(); // CONTINUE
      tick(); // END_ROUND: 0 < $1,000
      expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle: 0, autoDealPending: false, autoDealPaused: true });
      expect(ctx.state.notice).toBe("Not enough credits to rebet $1,000: auto deal paused");
      expect(vi.getTimerCount()).toBe(0);
      advance(60_000);
      expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
      expect(events(player)).toHaveLength(before);
    });

    it("keeps the old behaviour (no notice, no pause) with auto deal off", () => {
      shoes.push(stackedShoe(["10", "10", "8", "9", "5", "5"]));
      const { ctx } = setup({ credits: 1000 });
      act(() => ctx.actions.startGame());
      act(() => { ctx.actions.changeSettings({ resetInitialBet: true }); });
      act(() => ctx.actions.addBet(1000));
      act(() => ctx.actions.deal());
      playOut(ctx);
      act(() => ctx.actions.continueRound());
      tick(); // END_ROUND
      expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle: 0, autoDealPaused: false, notice: null });
    });
  });

  describe("cancelling", () => {
    // Everything here starts from the armed deal, DELAY away.
    const armedGame = (options) => {
      shoes.push(threeRounds());
      const result = startAuto(options);
      playOut(result.ctx);
      toArmed(result.ctx);
      expect(result.ctx.state.autoDealPending).toBe(true);
      return result;
    };
    // Nothing deals, however long it waits.
    const staysUndealt = (ctx, player) => {
      expect(vi.getTimerCount()).toBe(0);
      advance(60_000);
      expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
      expect(newRoundBets(player)).toHaveLength(1);
    };

    it("Pause cancels the pending deal; Resume re-arms it with the bet still on the table", () => {
      const { ctx, player } = armedGame();
      act(() => ctx.actions.pauseAutoDeal());
      expect(ctx.state).toMatchObject({ autoDealPaused: true, autoDealPending: false, betCircle: 10 });
      staysUndealt(ctx, player);
      act(() => ctx.actions.resumeAutoDeal());
      expect(ctx.state).toMatchObject({ autoDealPaused: false, autoDealPending: true });
      advance(DELAY);
      expect(ctx.state.phase).toBe(GamePhases.DEALING);
      expect(newRoundBets(player)).toHaveLength(2);
    });

    it("Pause on the results screen stops the chain there; Resume carries on", () => {
      shoes.push(threeRounds());
      const { ctx } = startAuto();
      playOut(ctx);
      act(() => ctx.actions.pauseAutoDeal());
      expect(vi.getTimerCount()).toBe(0);
      advance(60_000);
      expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
      act(() => ctx.actions.resumeAutoDeal());
      toArmed(ctx);
      advance(DELAY);
      expect(ctx.state.phase).toBe(GamePhases.DEALING);
    });

    it("betting or clearing cancels it, but a refused chip does not", () => {
      const first = armedGame();
      act(() => first.ctx.actions.addBet(10_000)); // more than the balance: refused
      expect(first.ctx.state.autoDealPending).toBe(true);
      act(() => first.ctx.actions.addBet(5));
      expect(first.ctx.state).toMatchObject({ betCircle: 15, autoDealPending: false });
      staysUndealt(first.ctx, first.player);
      cleanup();

      const second = armedGame();
      act(() => second.ctx.actions.clearBet());
      expect(second.ctx.state).toMatchObject({ betCircle: 0, autoDealPending: false });
      staysUndealt(second.ctx, second.player);
    });

    it("a manual Deal during the wait deals once, and no second automatic deal follows", () => {
      const { ctx, player } = armedGame();
      advance(DELAY - 1);
      act(() => ctx.actions.deal());
      expect(ctx.state.phase).toBe(GamePhases.DEALING);
      expect(newRoundBets(player)).toHaveLength(2);
      advance(1); // where the automatic deal would have fired
      advance(1000); // DEAL_DONE
      expect(ctx.state.phase).toBe(GamePhases.PLAYER_TURN);
      advance(60_000);
      expect(ctx.state.phase).toBe(GamePhases.PLAYER_TURN);
      expect(newRoundBets(player)).toHaveLength(2);
    });

    it("resetGame cancels it, and startGame leaves a started table alone", () => {
      const reset = armedGame();
      act(() => reset.ctx.actions.resetGame());
      expect(reset.ctx.state.phase).toBe(GamePhases.NONE);
      expect(vi.getTimerCount()).toBe(0);
      advance(60_000);
      expect(reset.ctx.state.phase).toBe(GamePhases.NONE);
      expect(newRoundBets(reset.player)).toHaveLength(1);
      cleanup();

      const restart = armedGame();
      act(() => restart.ctx.actions.pauseAutoDeal());
      const { betCircle, shoe } = restart.ctx.state;
      act(() => restart.ctx.actions.startGame()); // Home's Play on a live table (#196)
      expect(restart.ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle, autoDealPending: false, autoDealPaused: true });
      expect(restart.ctx.state.shoe).toBe(shoe);
      staysUndealt(restart.ctx, restart.player);
    });

    it("unmounting cancels the timer", () => {
      const { unmount, player } = armedGame();
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
      advance(60_000);
      expect(newRoundBets(player)).toHaveLength(1);
    });

    it("turning auto deal off in settings drops the pending deal", () => {
      const { ctx, player } = armedGame();
      act(() => { ctx.actions.changeSettings({ resetInitialBet: false, autoDeal: false }); });
      expect(ctx.state.autoDealPending).toBe(false);
      staysUndealt(ctx, player);
    });
  });

  describe("leaving the game page", () => {
    it("navigating away cancels the pending deal without pausing; coming back does not deal it", () => {
      shoes.push(threeRounds());
      const { ctx, player } = startAuto();
      playOut(ctx);
      toArmed(ctx);
      advance(DELAY - 1);
      act(() => ctx.navigate("/settings"));
      expect(ctx.state).toMatchObject({ autoDealPending: false, autoDealPaused: false, betCircle: 10 });
      expect(vi.getTimerCount()).toBe(0);
      advance(60_000);
      expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
      act(() => ctx.navigate("/game"));
      expect(ctx.state).toMatchObject({ autoDealPending: false, autoDealPaused: false });
      advance(60_000);
      expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
      expect(newRoundBets(player)).toHaveLength(1);
      act(() => ctx.actions.deal()); // the player's own Deal still works
      expect(newRoundBets(player)).toHaveLength(2);
    });

    it("the next round is automatic again after coming back (leaving is not a pause)", () => {
      shoes.push(threeRounds());
      const { ctx, player } = startAuto();
      playOut(ctx);
      toArmed(ctx);
      act(() => ctx.navigate("/"));
      act(() => ctx.navigate("/game"));
      act(() => ctx.actions.deal());
      playOut(ctx);
      toArmed(ctx);
      advance(DELAY);
      expect(newRoundBets(player)).toHaveLength(3);
    });

    it("the results screen waits off the page and carries on when the player is back", () => {
      shoes.push(threeRounds());
      const { ctx, player } = startAuto();
      playOut(ctx);
      act(() => ctx.navigate("/settings"));
      expect(vi.getTimerCount()).toBe(0);
      advance(60_000);
      expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
      act(() => ctx.navigate("/game"));
      toArmed(ctx);
      advance(DELAY);
      expect(ctx.state.phase).toBe(GamePhases.DEALING);
      expect(newRoundBets(player)).toHaveLength(2);
    });

    it("auto deal switched on in Settings mid-round neither continues nor deals until the player is back on /game", () => {
      shoes.push(threeRounds());
      const { ctx, player } = setup();
      act(() => ctx.actions.startGame());
      act(() => ctx.actions.addBet(10));
      act(() => ctx.actions.deal());
      tick();
      act(() => ctx.navigate("/settings"));
      act(() => { ctx.actions.changeSettings(AUTO); }); // Save on the Settings page
      act(() => ctx.actions.stand(0)); // (the round itself finishes on its own timers)
      for (let i = 0; i < 6; i++) tick();
      expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
      const sent = events(player).length;
      advance(60_000);
      expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
      expect(events(player)).toHaveLength(sent);
      expect(vi.getTimerCount()).toBe(0);
      act(() => ctx.navigate("/game"));
      toArmed(ctx);
      advance(DELAY);
      expect(ctx.state.phase).toBe(GamePhases.DEALING);
      expect(newRoundBets(player)).toHaveLength(2);
    });

    it("a game first opened off the page stays quiet", () => {
      const { ctx } = setup({ path: "/settings" });
      expect(ctx.state.autoDealPending).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("saved settings", () => {
    it("loads and cleans the delay and the switch on sign-in", async () => {
      remote.getSettings.mockResolvedValue({ v: 1, resetInitialBet: true, autoDeal: true, autoDealDelay: 99999 });
      const high = setup({ signedIn: true });
      await flush();
      expect(high.ctx.state.settings).toMatchObject({ autoDeal: true, autoDealDelay: 10000 });
      cleanup();
      remote.getSettings.mockResolvedValue({ v: 1, resetInitialBet: true, autoDeal: true, autoDealDelay: -5 });
      const low = setup({ signedIn: true });
      await flush();
      expect(low.ctx.state.settings.autoDealDelay).toBe(0);
      cleanup();
      remote.getSettings.mockResolvedValue({ v: 1, resetInitialBet: true, autoDeal: true, autoDealDelay: "soon" });
      const bad = setup({ signedIn: true });
      await flush();
      expect(bad.ctx.state.settings.autoDealDelay).toBe(3000);
      cleanup();
      remote.getSettings.mockResolvedValue({ v: 1, autoDeal: true }); // no Reset Bet: auto deal cannot run
      const off = setup({ signedIn: true });
      await flush();
      expect(off.ctx.state.settings.autoDeal).toBe(false);
    });

    it("saves the flat object with both new keys, and a table setting is not reset by them", async () => {
      remote.token = "token";
      const { ctx } = setup({ signedIn: true });
      await flush();
      cards.createShoe.mockClear(); // the sign-in load built its own shoe
      await act(async () => { await ctx.actions.changeSettings({ resetInitialBet: true, autoDeal: true, autoDealDelay: 500 }); });
      const saved = remote.saveSettings.mock.calls[0][0];
      expect(saved).toMatchObject({ v: 5, resetInitialBet: true, autoDeal: true, autoDealDelay: 500 });
      expect(Object.values(saved).every((v) => ["string", "number", "boolean"].includes(typeof v))).toBe(true);
      expect(cards.createShoe).not.toHaveBeenCalled();
    });
  });

  describe("the remembered look (no flash before the saved settings load)", () => {
    const html = document.documentElement;

    it("remembers the look it applies, and starts with it on the next load, signed out or not yet loaded", () => {
      const first = setup();
      act(() => { first.ctx.actions.changeSettings({ feltTheme: "red", accent: "ember", mode: "light", showTotals: false }); });
      expect(JSON.parse(localStorage.getItem("bj.look"))).toEqual({ feltTheme: "red", accent: "ember", mode: "light", showTotals: false });
      cleanup();
      const second = setup();
      expect(second.ctx.state.settings).toMatchObject({ feltTheme: "red", accent: "ember", mode: "light", showTotals: false });
      expect(html.dataset).toMatchObject({ felt: "red", accent: "ember", mode: "light" });
      expect(html.classList.contains("no-totals")).toBe(true);
    });

    it("a saved look that arrives with the settings replaces it and is remembered", async () => {
      localStorage.setItem("bj.look", JSON.stringify({ feltTheme: "red" }));
      remote.getSettings.mockResolvedValue({ v: 5, feltTheme: "blue" });
      const { ctx } = setup({ signedIn: true });
      expect(ctx.state.settings.feltTheme).toBe("red"); // the stored look until the load answers
      await flush();
      expect(ctx.state.settings.feltTheme).toBe("blue");
      expect(JSON.parse(localStorage.getItem("bj.look")).feltTheme).toBe("blue");
    });
  });

  // The next DEAL wipes a refused payout's notice, so the automatic one leaves time to read it (#207).
  describe("a refused payout holds the automatic deal for at least 4 s (#207)", () => {
    // The settle of the round just played is refused, as PlayerProvider reports it.
    const refusePayout = (player) => {
      const [event, report] = player.applyCreditEvent.mock.calls.filter(([e]) => e.kind === "settle").at(-1);
      act(() => report(event.seq, "rejected"));
    };
    // On the results screen of round 1, auto deal on.
    const atResults = (autoDealDelay) => {
      shoes.push(threeRounds());
      const result = startAuto({ settings: { ...AUTO, autoDealDelay } });
      playOut(result.ctx);
      return result;
    };
    const dealsAfterExactly = (ctx, ms) => {
      expect(ctx.state.autoBar).toMatchObject({ type: "DEAL", ms });
      advance(ms - 1);
      expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
      advance(1);
      expect(ctx.state.phase).toBe(GamePhases.DEALING);
    };

    it.each([[0, 4000], [DELAY, 4000], [10000, 10000]])("with a delay of %i ms it waits %i ms, does not pause, and the deal clears the notice", (delay, wait) => {
      const { ctx, player } = atResults(delay);
      refusePayout(player);
      toArmed(ctx);
      expect(ctx.state).toMatchObject({ payoutNotice: "The server refused your $20 payout; it was not paid.", autoDealPaused: false, autoDealPending: true });
      dealsAfterExactly(ctx, wait);
      expect(ctx.state.payoutNotice).toBeNull();
    });

    it("the next round, with no notice, waits only its own delay again", () => {
      const { ctx, player } = atResults(DELAY);
      refusePayout(player);
      toArmed(ctx);
      advance(4000);
      playOut(ctx);
      toArmed(ctx);
      dealsAfterExactly(ctx, DELAY);
    });

    it.each([[0, 4000], [DELAY, 4000], [10000, 10000]])("a refusal part-way through a pending wait (delay %i ms) starts a wait of %i ms over", (delay, wait) => {
      const { ctx, player } = atResults(delay);
      toArmed(ctx);
      const first = ctx.state.autoBar;
      if (delay) advance(delay - 100); // nearly dealt
      refusePayout(player);
      expect(ctx.state.autoBar).not.toBe(first);
      expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, autoDealPaused: false, autoDealPending: true });
      dealsAfterExactly(ctx, wait);
    });

    it("the Deal key's own action still deals at once", () => {
      const { ctx, player } = atResults(0);
      refusePayout(player);
      toArmed(ctx);
      act(() => ctx.actions.deal());
      expect(ctx.state.phase).toBe(GamePhases.DEALING);
    });

    it("the CONTINUE step keeps its own timing, and a refusal during it does not restart it", () => {
      const { ctx, player } = atResults(0);
      advance(600);
      const bar = ctx.state.autoBar;
      refusePayout(player);
      expect(ctx.state.autoBar).toBe(bar);
      expect(bar).toMatchObject({ type: "CONTINUE", ms: 1000 });
      advance(399);
      expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
      advance(1);
      expect(ctx.state.phase).toBe(GamePhases.END_ROUND);
      tick(); // the sweep too is one Rate of Play
      expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    });
  });

  // The countdown bar's data (L2-4): GameProvider gives `autoBar` while the DEAL or CONTINUE step waits, with the real length of that wait.
  describe("the countdown bar's data (L2-4)", () => {
    it("is null until an automatic deal waits, then { DEAL, the wait, when it began } for the delay, and null again once it deals", () => {
      shoes.push(threeRounds());
      const { ctx } = startAuto();
      expect(ctx.state.autoBar).toBeNull();
      playOut(ctx);
      expect(ctx.state.autoBar).toMatchObject({ type: "CONTINUE", ms: 1000 }); // the results move on after one Rate of Play
      toArmed(ctx);
      expect(ctx.state.autoBar).toMatchObject({ type: "DEAL", ms: DELAY });
      const began = ctx.state.autoBar.at;
      expect(typeof began).toBe("number");
      advance(DELAY);
      expect(ctx.state.phase).toBe(GamePhases.DEALING);
      expect(ctx.state.autoBar).toBeNull();
    });

    it("the wait is the real one: a card still in the air makes the DEAL wait (and its bar) longer, and a restarted timer is a new bar", () => {
      shoes.push(threeRounds());
      const { ctx } = startAuto();
      playOut(ctx);
      toArmed(ctx);
      const first = ctx.state.autoBar;
      queue.free = performance.now() + 6000;
      act(() => { ctx.actions.changeSettings({ autoDealDelay: 2000 }); }); // re-arms the DEAL timer
      expect(ctx.state.autoBar).not.toBe(first);
      expect(ctx.state.autoBar.ms).toBe(6000 + 600); // max(2000, 6000 + 0.3 x 2000), as the timer itself waits
    });

    it("goes when auto deal is paused, a bet changes or the player leaves the table, and has none without auto deal", () => {
      shoes.push(threeRounds());
      const { ctx } = startAuto();
      playOut(ctx);
      toArmed(ctx);
      expect(ctx.state.autoBar).not.toBeNull();
      act(() => ctx.actions.pauseAutoDeal());
      expect(ctx.state.autoBar).toBeNull();
      act(() => ctx.actions.resumeAutoDeal());
      act(() => ctx.navigate("/settings"));
      expect(ctx.state.autoBar).toBeNull();
      shoes.push(threeRounds());
      cleanup();
      const manual = startAuto({ settings: { resetInitialBet: true } });
      playOut(manual.ctx);
      expect(manual.ctx.state.autoBar).toBeNull();
    });

    it("the step timers that are not auto deal's (the dealer, settling) have no bar", () => {
      shoes.push(threeRounds());
      const { ctx } = startAuto();
      tick(); // DEAL_DONE
      act(() => ctx.actions.stand(0));
      expect(ctx.state.phase).not.toBe(GamePhases.POST_ROUND);
      expect(ctx.state.autoBar).toBeNull();
    });
  });
});

describe("GameProvider saved table rules (#91)", () => {
  const legacy = {
    dealerHitsSoft17: false, blackjackPayout: "3:2", doubleOn: "any", doubleAfterSplit: true, resplitAces: false, hitSplitAces: false,
    noHoleCardLoss: "all", deckCount: 2, maxSplitHands: 0, insurance: false, splitDeal: "both",
  };
  const vegas = {
    dealerHitsSoft17: true, blackjackPayout: "3:2", doubleOn: "any", doubleAfterSplit: true, resplitAces: false, hitSplitAces: false,
    noHoleCardLoss: "original", deckCount: 6, maxSplitHands: 4,
  };
  const cardsIn = (ctx) => ctx.state.shoe.filter((c) => c.type === "card").length;

  it("a player who never saved ({}) signs in on Vegas, with a six-deck shoe", async () => {
    remote.getSettings.mockResolvedValue({});
    const { ctx } = setup({ signedIn: true });
    await flush();
    expect(ctx.state.settings).toMatchObject(vegas);
    expect(cards.createShoe).toHaveBeenLastCalledWith(6, true);
    act(() => ctx.actions.startGame());
    expect(cardsIn(ctx)).toBe(312);
  });

  it("a v: 4 object without the rule keys also signs in on Vegas", async () => {
    remote.getSettings.mockResolvedValue({ v: 4, playTimeout: 500 });
    const { ctx } = setup({ signedIn: true });
    await flush();
    expect(ctx.state.settings).toMatchObject({ ...vegas, playTimeout: 500 });
  });

  it("a v: 1 object loads the legacy rules, and the shoe has the legacy two decks", async () => {
    remote.getSettings.mockResolvedValue({ v: 1, playTimeout: 500 });
    const { ctx } = setup({ signedIn: true });
    await flush();
    expect(ctx.state.settings).toMatchObject({ ...legacy, playTimeout: 500 });
    expect(cards.createShoe).toHaveBeenLastCalledWith(2, true);
    act(() => ctx.actions.startGame());
    expect(cardsIn(ctx)).toBe(104);
  });

  it("a v: 1 object with its own deck count and split limit keeps them, and the shoe is that size", async () => {
    remote.getSettings.mockResolvedValue({ v: 1, deckCount: 3, maxSplitHands: 2 });
    const { ctx } = setup({ signedIn: true });
    await flush();
    expect(ctx.state.settings).toMatchObject({ ...legacy, deckCount: 3, maxSplitHands: 2 });
    expect(cards.createShoe).toHaveBeenLastCalledWith(3, true);
  });

  it("a setting change saves { v: 5, ...every setting }", async () => {
    remote.token = "token";
    remote.getSettings.mockResolvedValue({});
    const { ctx } = setup({ signedIn: true });
    await flush();
    await act(async () => { await ctx.actions.changeSetting("blackjackPayout", "6:5"); });
    const saved = remote.saveSettings.mock.calls[0][0];
    expect(saved.v).toBe(5);
    expect(Object.keys(saved).sort()).toEqual(["v", ...Object.keys(ctx.state.settings)].sort());
    expect(saved).toMatchObject({ ...vegas, blackjackPayout: "6:5" });
  });

  it("a v: 1 table that changes one setting is saved as v: 5 with its legacy rule values (no silent payout change)", async () => {
    remote.token = "token";
    remote.getSettings.mockResolvedValue({ v: 1, dealerHoleBehaviour: "drawAfter", deckCount: 3 });
    const { ctx } = setup({ signedIn: true });
    await flush();
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 750); });
    const saved = remote.saveSettings.mock.calls[0][0];
    expect(saved).toMatchObject({ v: 5, ...legacy, deckCount: 3, dealerHoleBehaviour: "drawAfter", playTimeout: 750 });
    expect(saved.dealerHitsSoft17).toBe(false);
    expect(saved.noHoleCardLoss).toBe("all");
  });

  it("a rule change is a table setting: it deals a fresh shoe and resets the table", async () => {
    const { ctx } = setup();
    act(() => { ctx.actions.changeSetting("dealerHitsSoft17", false); });
    expect(ctx.state.settings.dealerHitsSoft17).toBe(false);
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(cards.createShoe).toHaveBeenCalledTimes(1);
  });
});

describe("GameProvider: no save before the saved settings have loaded (#91)", () => {
  const stored = { v: 1, dealerHoleBehaviour: "drawAfter", deckCount: 3 };
  const legacyRules = { dealerHitsSoft17: false, blackjackPayout: "3:2", noHoleCardLoss: "all", maxSplitHands: 0, insurance: false, splitDeal: "both" };
  const signInOut = (ctx, player, signedIn) => (
    <MemoryRouter initialEntries={["/game"]}>
      <PlayerContext.Provider value={signedIn ? player : { player: null, getCredits: () => 0, applyCreditEvent: () => {} }}>
        <GameProvider><Probe ctx={ctx} /></GameProvider>
      </PlayerContext.Provider>
    </MemoryRouter>
  );

  it("a change made before the load returns applies here, is rejected, and never overwrites the stored table", async () => {
    remote.token = "token";
    remote.getSettings.mockReturnValue(new Promise(() => {})); // never answers
    const { ctx } = setup({ signedIn: true });
    let outcome;
    await act(async () => { outcome = await ctx.actions.changeSetting("playTimeout", 750).then(() => "saved", (e) => e.message); });
    expect(outcome).toBe("Settings have not loaded yet");
    expect(ctx.state.settings.playTimeout).toBe(750); // still applied locally
    expect(remote.saveSettings).not.toHaveBeenCalled();
  });

  it("once the load resolves, the same change saves v: 5 with the loaded values, and a v: 1 table's legacy rules are written, not Vegas", async () => {
    remote.token = "token";
    let answer;
    remote.getSettings.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { ctx } = setup({ signedIn: true });
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 750).catch(() => {}); });
    expect(remote.saveSettings).not.toHaveBeenCalled();
    await act(async () => answer(stored));
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 750); });
    expect(remote.saveSettings).toHaveBeenCalledTimes(1);
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ v: 5, ...legacyRules, deckCount: 3, dealerHoleBehaviour: "drawAfter", playTimeout: 750 });
  });

  it("a failed load keeps rejecting saves, while the change still applies here", async () => {
    remote.token = "token";
    remote.getSettings.mockRejectedValue(new Error("offline"));
    const { ctx } = setup({ signedIn: true });
    await flush();
    for (const value of [600, 700]) {
      await act(async () => { await expect(ctx.actions.changeSetting("playTimeout", value)).rejects.toThrow("Settings have not loaded yet"); });
      expect(ctx.state.settings.playTimeout).toBe(value);
    }
    expect(remote.saveSettings).not.toHaveBeenCalled();
  });

  it("signing out and back in needs a second load before saves work again", async () => {
    remote.token = "token";
    remote.getSettings.mockResolvedValue(stored);
    const { ctx, player, rerender } = setup({ signedIn: true });
    await flush();
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 600); });
    expect(remote.saveSettings).toHaveBeenCalledTimes(1);

    rerender(signInOut(ctx, player, false));
    let second;
    remote.getSettings.mockReturnValue(new Promise((resolve) => { second = resolve; }));
    rerender(signInOut(ctx, player, true));
    await act(async () => { await expect(ctx.actions.changeSetting("playTimeout", 700)).rejects.toThrow("Settings have not loaded yet"); });
    expect(remote.saveSettings).toHaveBeenCalledTimes(1);
    expect(remote.getSettings).toHaveBeenCalledTimes(2);
    await act(async () => second(stored));
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 700); });
    expect(remote.saveSettings).toHaveBeenCalledTimes(2);
  });

  it("signed out (no token) resolves with no save, loaded or not", async () => {
    const { ctx } = setup();
    await act(async () => { await expect(ctx.actions.changeSetting("playTimeout", 500)).resolves.toBeUndefined(); });
    expect(ctx.state.settings.playTimeout).toBe(500);
    expect(remote.saveSettings).not.toHaveBeenCalled();
  });
});

describe("GameProvider surrender (#91)", () => {
  it("surrender(handIdx) gives up the hand: half the bet comes back in the one settle, and the dealer takes no card", () => {
    shoes.push(stackedShoe(["10", "6", "6", "K", "2"])); // Vegas: late surrender, the dealer peeks, 6 + K = 16
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    expect(ctx.state.phase).toBe(GamePhases.PLAYER_TURN);
    act(() => { ctx.actions.surrender(0); });
    expect(ctx.state.hands[0]).toMatchObject({ surrendered: true, result: "Surrendered" });
    expect(ctx.state.phase).toBe(GamePhases.DEALER_TURN);
    for (let i = 0; i < 8 && ctx.state.phase !== GamePhases.POST_ROUND; i++) tick();
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    expect(ctx.state.dealer.cards).toHaveLength(2);
    expect(events(player)).toEqual([{ kind: "local", amount: -10 }, { kind: "bet", amount: 10, newRound: true, alreadyDeducted: true, handTag: null }, { kind: "settle", amount: 5 }]);
  });

  it("an ignored surrender (setting none) changes nothing", () => {
    shoes.push(stackedShoe(["10", "6", "6", "K", "2"]));
    const { ctx } = setup();
    act(() => ctx.actions.startGame());
    act(() => { ctx.actions.changeSetting("surrender", "none"); });
    shoes.push(stackedShoe(["10", "6", "6", "K", "2"]));
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    const before = ctx.state;
    act(() => { ctx.actions.surrender(0); });
    expect(ctx.state).toBe(before);
  });

  it("saves surrender in the version 5 object, and a change deals a new shoe like any table rule", async () => {
    remote.token = "token";
    const { ctx } = setup({ signedIn: true });
    await flush();
    cards.createShoe.mockClear();
    await act(async () => { await ctx.actions.changeSetting("surrender", "early"); });
    expect(remote.saveSettings).toHaveBeenCalledWith({ v: 5, ...ctx.state.settings });
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ v: 5, surrender: "early" });
    expect(cards.createShoe).toHaveBeenCalledTimes(1);
  });

  it("loads a saved version 2 object (no surrender key) as none, and a version 3 one as saved", async () => {
    remote.getSettings.mockResolvedValue({ v: 2, dealerHitsSoft17: true, deckCount: 6 });
    const { ctx } = setup({ signedIn: true });
    await flush();
    expect(ctx.state.settings.surrender).toBe("none");
    remote.getSettings.mockResolvedValue({ v: 3, surrender: "earlyNoAce" });
    const second = setup({ signedIn: true });
    await flush();
    expect(second.ctx.state.settings.surrender).toBe("earlyNoAce");
  });
});

describe("GameProvider offers (#91)", () => {
  const { OFFERS, PEEK, PLAYER_TURN, POST_ROUND } = GamePhases;
  // Vegas: the dealer peeks and insurance is on. Player 10-6 against an ace; the hole card is `hole`; a 9 behind it.
  const aceUp = (hole = "K") => stackedShoe(["10", "A", "6", hole, "9", "9"]);
  const toOffers = (options, hole) => {
    shoes.push(aceUp(hole));
    const result = setup(options);
    act(() => result.ctx.actions.startGame());
    act(() => result.ctx.actions.addBet(10));
    act(() => result.ctx.actions.deal());
    tick(); // DEAL_DONE
    return result;
  };
  const bets = (player) => events(player).filter((e) => e.kind === "bet");

  it("deal passes the balance after the bet: the insurance is offered only when half the bet is left", () => {
    const poor = toOffers({ credits: 14 }); // 4 left
    expect(poor.ctx.state.phase).not.toBe(OFFERS);
    expect(poor.ctx.state.offers).toBeNull();
    cleanup();
    const exact = toOffers({ credits: 15 }); // 5 left
    expect(exact.ctx.state.phase).toBe(OFFERS);
  });

  it("stops at OFFERS and stays there however long it takes: no timer, no decline, no deal", () => {
    const { ctx, player } = toOffers();
    expect(ctx.state).toMatchObject({ phase: OFFERS, offers: { insurance: true, peek: true } });
    expect(vi.getTimerCount()).toBe(0);
    const logged = player.applyCreditEvent.mock.calls.length;
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
    expect(ctx.state.phase).toBe(OFFERS);
    expect(player.applyCreditEvent).toHaveBeenCalledTimes(logged);
  });

  it("auto deal waits at the offers: it neither declines nor pauses, and the round carries on after the player answers", () => {
    shoes.push(aceUp("5"));
    const { ctx } = setup();
    act(() => ctx.actions.startGame());
    act(() => { ctx.actions.changeSettings({ resetInitialBet: true, autoDeal: true, autoDealDelay: 500 }); });
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    expect(ctx.state.phase).toBe(OFFERS);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(ctx.state).toMatchObject({ phase: OFFERS, autoDealPaused: false, autoDealPending: false });
    act(() => { ctx.actions.declineOffers(); });
    expect(ctx.state.phase).toBe(PEEK);
    tick();
    expect(ctx.state.phase).toBe(PLAYER_TURN);
  });

  it("takeInsurance books half the bet as a ledger bet (newRound false, tagged side insurance) and the peek follows on its own timer", () => {
    const { ctx, player } = toOffers();
    act(() => { ctx.actions.takeInsurance(); });
    expect(ctx.state.hands[0].insurance).toBe(5);
    expect(ctx.state.phase).toBe(PEEK);
    expect(bets(player).at(-1)).toEqual({ kind: "bet", amount: 5, newRound: false, alreadyDeducted: false, handTag: ctx.state.hands[0].tag, side: "insurance" });
    expect(player.getCredits()).toBe(85); // 100 - 10 - 5
    expect(vi.getTimerCount()).toBe(1);
    tick();
    expect(ctx.state.phase).toBe(GamePhases.DEALER_TURN); // the hole card was a king
    expect(ctx.state.dealer.isBlackjack).toBe(true);
  });

  it("takeInsurance sends the current balance: one that fell below the stake since the deal is refused by the reducer", () => {
    const { ctx, player } = toOffers();
    player.getCredits.mockReturnValue(4);
    const before = ctx.state;
    act(() => { ctx.actions.takeInsurance(); });
    expect(ctx.state).toBe(before);
    expect(bets(player)).toHaveLength(1);
  });

  it("evenMoney pays the blackjack 1:1 with no ledger bet, whatever the dealer's hole card", () => {
    shoes.push(stackedShoe(["A", "A", "K", "K", "9", "9"]));
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    expect(ctx.state.offers).toMatchObject({ evenMoney: true });
    act(() => { ctx.actions.evenMoney(); });
    expect(ctx.state.hands[0]).toMatchObject({ evenMoney: true, result: "Win" });
    expect(bets(player)).toHaveLength(1);
    for (let i = 0; i < 6 && ctx.state.phase !== POST_ROUND; i++) tick();
    expect(ctx.state.phase).toBe(POST_ROUND);
    expect(events(player).filter((e) => e.kind === "settle")).toEqual([{ kind: "settle", amount: 20 }]); // the dealer's blackjack does not push it
  });

  it("a whole insured round against a dealer blackjack: one bet, one insurance bet, one settle of 15, each event applied once", () => {
    const { ctx, player } = toOffers();
    act(() => { ctx.actions.takeInsurance(); });
    for (let i = 0; i < 8 && ctx.state.phase !== POST_ROUND; i++) tick();
    expect(ctx.state.phase).toBe(POST_ROUND);
    expect(events(player).map((e) => [e.kind, e.amount, e.side])).toEqual([["local", -10, undefined], ["bet", 10, undefined], ["bet", 5, "insurance"], ["settle", 15, undefined]]);
    expect(ctx.state.hands[0]).toMatchObject({ insurancePayout: 15, payout: 15 });
    expect(player.getCredits()).toBe(100); // net 0: the insurance paid for the hand
  });

  it("a refused insurance bet voids only the insurance: notice, the hand keeps its stake, and the settle carries no insurance", () => {
    const { ctx, player } = toOffers({ answer: (event) => (event.side === "insurance" ? "rejected" : "confirmed") });
    act(() => { ctx.actions.takeInsurance(); });
    expect(ctx.state.hands[0]).toMatchObject({ insurance: 0, bet: 10 });
    expect(ctx.state.notice).toMatch(/insurance bet/);
    for (let i = 0; i < 8 && ctx.state.phase !== POST_ROUND; i++) tick();
    expect(events(player).filter((e) => e.kind === "settle")).toEqual([{ kind: "settle", amount: 0 }]);
  });

  it("settling waits for an insurance bet the server has not answered, then sends the settle with the insurance in it", () => {
    const { ctx, player } = toOffers({ answer: null });
    player.reports[ctx.state.pendingBets[0].seq]("confirmed"); // the opening bet
    act(() => { ctx.actions.takeInsurance(); });
    for (let i = 0; i < 8; i++) tick();
    expect(ctx.state.phase).toBe(GamePhases.SETTLING_HANDS);
    expect(ctx.state.pendingBets.map((b) => b.side)).toEqual(["insurance"]);
    expect(events(player).some((e) => e.kind === "settle")).toBe(false);
    player.reports[ctx.state.pendingBets[0].seq]("confirmed");
    for (let i = 0; i < 4 && ctx.state.phase !== POST_ROUND; i++) tick();
    expect(events(player).at(-1)).toEqual({ kind: "settle", amount: 15 });
  });

  it("early surrender at the offers goes through surrender(0): half the bet in the one settle, kept against a dealer blackjack", () => {
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    shoes.push(stackedShoe(["10", "K", "6", "A", "9", "9"])); // for the round: the settings change deals it
    act(() => { ctx.actions.changeSettings({ surrender: "early", insurance: false }); });
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    expect(ctx.state.offers).toMatchObject({ surrender: true });
    act(() => { ctx.actions.surrender(0); });
    for (let i = 0; i < 8 && ctx.state.phase !== POST_ROUND; i++) tick();
    expect(ctx.state.dealer.isBlackjack).toBe(true);
    expect(events(player).filter((e) => e.kind === "settle")).toEqual([{ kind: "settle", amount: 5 }]);
  });

  it("saves insurance in the version 5 object, and a change deals a new shoe like any table rule", async () => {
    remote.token = "token";
    const { ctx } = setup({ signedIn: true });
    await flush();
    cards.createShoe.mockClear();
    await act(async () => { await ctx.actions.changeSetting("insurance", false); });
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ v: 5, insurance: false });
    expect(remote.saveSettings).toHaveBeenCalledWith({ v: 5, ...ctx.state.settings });
    expect(cards.createShoe).toHaveBeenCalledTimes(1);
  });

  it("loads insurance off from a version 3 object and on from a version 4 one", async () => {
    remote.getSettings.mockResolvedValue({ v: 3, surrender: "late" });
    const old = setup({ signedIn: true });
    await flush();
    expect(old.ctx.state.settings.insurance).toBe(false);
    cleanup();
    remote.getSettings.mockResolvedValue({ v: 4, insurance: true });
    const current = setup({ signedIn: true });
    await flush();
    expect(current.ctx.state.settings.insurance).toBe(true);
  });
});

describe("GameProvider split deal (#133)", () => {
  const ranks = (hand) => hand.cards.map((c) => c.rank[0]).join("");
  // Starts a round and splits the first hand; `cards` is the whole shoe, `settings` any table rule to change first.
  const splitRound = (cards, settings) => {
    shoes.push(stackedShoe(cards)); // a rule change deals it and starts the table; else startGame does
    const { ctx, player } = setup();
    if (settings) act(() => { ctx.actions.changeSettings(settings); });
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick(); // DEAL_DONE
    act(() => ctx.actions.split(0));
    return { ctx, player };
  };

  it("deals the second hand's card by itself, one beat after the first hand is finished, and not before", () => {
    const { ctx, player } = splitRound(["8", "10", "8", "7", "3", "K", "9"]);
    expect(ctx.state.hands.map(ranks)).toEqual(["83", "8"]);
    expect(vi.getTimerCount()).toBe(0); // the player is playing hand 1: nothing is scheduled
    act(() => ctx.actions.stand(0));
    expect(ctx.state.hands[1].awaitingCard).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    act(() => { vi.advanceTimersByTime(100); });
    expect(ctx.state.hands[1].awaitingCard).toBe(true);
    tick();
    expect(ctx.state.hands.map(ranks)).toEqual(["83", "8k"]);
    expect(ctx.state.hands[1].awaitingCard).toBe(false);
    expect([ctx.state.phase, ctx.state.selectedHandIndex]).toEqual([GamePhases.PLAYER_TURN, 1]);
    expect(vi.getTimerCount()).toBe(0); // now the player acts
    expect(events(player).filter((e) => e.kind === "bet")).toHaveLength(2); // the late card adds no bet
  });

  it("two waiting hands in a row each get their card: the timer is set again for the second hand", () => {
    const { ctx } = splitRound(["A", "10", "A", "7", "A", "K", "5", "9", "3", "4"], { resplitAces: true });
    expect(ctx.state.hands.map(ranks)).toEqual(["aa", "a"]);
    act(() => ctx.actions.split(0)); // [A-K][A waiting][A waiting]
    expect(ctx.state.hands.map((h) => !!h.awaitingCard)).toEqual([false, true, true]);
    expect(ctx.state.selectedHandIndex).toBe(1);
    tick();
    expect(ctx.state.hands.map(ranks)).toEqual(["ak", "a5", "a"]);
    expect(ctx.state.selectedHandIndex).toBe(2); // same step, dealer and phase as before: only the hand changed
    tick();
    expect(ctx.state.hands.map(ranks)).toEqual(["ak", "a5", "a9"]);
    expect(ctx.state.phase).toBe(GamePhases.DEALER_TURN);
  });

  it("leaving the game page does not stop the late card (it is a step of the round, not of auto deal)", () => {
    const { ctx } = splitRound(["8", "10", "8", "7", "3", "K", "9"]);
    act(() => ctx.actions.stand(0));
    act(() => ctx.navigate("/settings"));
    tick();
    expect(ctx.state.hands[1].awaitingCard).toBe(false);
  });

  it("resetting the game while a hand waits cancels the late card", () => {
    const { ctx } = splitRound(["8", "10", "8", "7", "3", "K", "9"]);
    act(() => ctx.actions.stand(0));
    shoes.push(stackedShoe(["2"])); // the new shoe of the reset
    act(() => ctx.actions.resetGame());
    expect(vi.getTimerCount()).toBe(0);
    for (let i = 0; i < 3; i++) tick();
    expect(ctx.state.hands).toEqual([]);
  });

  it("is a table rule: it is saved in the version 5 object and a change deals a new shoe", async () => {
    remote.token = "token";
    const { ctx } = setup({ signedIn: true });
    await flush();
    cards.createShoe.mockClear();
    await act(async () => { await ctx.actions.changeSetting("splitDeal", "both"); });
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ v: 5, splitDeal: "both" });
    expect(remote.saveSettings).toHaveBeenCalledWith({ v: 5, ...ctx.state.settings });
    expect(cards.createShoe).toHaveBeenCalledTimes(1);
  });

  it("loads 'both' from a version 4 object and 'one' from a version 5 one", async () => {
    remote.getSettings.mockResolvedValue({ v: 4, insurance: true });
    const old = setup({ signedIn: true });
    await flush();
    expect(old.ctx.state.settings.splitDeal).toBe("both");
    cleanup();
    remote.getSettings.mockResolvedValue({ v: 5, splitDeal: "one" });
    const current = setup({ signedIn: true });
    await flush();
    expect(current.ctx.state.settings.splitDeal).toBe("one");
  });
});

describe("the signed-in start on the table (DESIGN section 8)", () => {
  const swap = (rerender, ctx, player, path = "/") => rerender(
    <MemoryRouter initialEntries={[path]}>
      <PlayerContext.Provider value={{ player, getCredits: () => 0, applyCreditEvent: () => {} }}>
        <GameProvider><Probe ctx={ctx} /></GameProvider>
      </PlayerContext.Provider>
    </MemoryRouter>
  );

  it("waits for the saved settings, then starts the game and replaces / with /game", async () => {
    remote.getSettings.mockResolvedValue({ v: 5, deckCount: 4 });
    const { ctx } = setup({ signedIn: true, path: "/" });
    expect(ctx.state.starting).toBe(true); // Home shows Loading meanwhile
    expect(ctx.state.phase).toBe(GamePhases.NONE);
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(ctx.state.settings.deckCount).toBe(4);
    expect(ctx.state.starting).toBe(false);
    expect(ctx.pathname).toBe("/game");
  });

  it("starts with the settings it has when they cannot be loaded", async () => {
    remote.getSettings.mockRejectedValue(new Error("offline"));
    const { ctx } = setup({ signedIn: true, path: "/" });
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(ctx.pathname).toBe("/game");
  });

  it("leaves a player who is on another page where they are", async () => {
    const { ctx } = setup({ signedIn: true, path: "/settings" });
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(ctx.pathname).toBe("/settings");
  });

  it.each(["/login", "/signup"])("replaces %s with /game once signed in (#144)", async (path) => {
    const { ctx } = setup({ signedIn: true, path });
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(ctx.pathname).toBe("/game");
  });

  it("replaces /login with /game when the settings cannot be loaded (#144)", async () => {
    remote.getSettings.mockRejectedValue(new Error("offline"));
    const { ctx } = setup({ signedIn: true, path: "/login" });
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(ctx.pathname).toBe("/game");
  });

  it("the sign-in lands on /game while the ref still reads /login: Login's own navigate has not rendered (#144)", async () => {
    const { ctx, rerender } = setup({ path: "/login" });
    swap(rerender, ctx, { userName: "alice" }); // signed in, no route change yet
    await flush();
    expect(ctx.pathname).toBe("/game");
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
  });

  it("leaves a player already on /game where they are", async () => {
    const { ctx } = setup({ signedIn: true, path: "/game" });
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(ctx.pathname).toBe("/game");
  });

  it("signed out: nothing starts, nothing is loading, / stays Home", async () => {
    const { ctx } = setup({ path: "/" });
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.NONE);
    expect(ctx.state.starting).toBe(false);
    expect(ctx.pathname).toBe("/");
  });

  it("does it once per sign-in: Home opened later stays Home, and the next sign-in starts again", async () => {
    const { ctx, rerender } = setup({ signedIn: true, path: "/" });
    await flush();
    act(() => ctx.actions.resetGame());
    act(() => ctx.navigate("/"));
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.NONE); // no bounce back to the table
    expect(ctx.pathname).toBe("/");
    swap(rerender, ctx, null);
    expect(ctx.state.starting).toBe(false);
    swap(rerender, ctx, { userName: "bob" });
    expect(ctx.state.starting).toBe(true);
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
  });

  it("does not start a game for a sign-in that ended before its settings came back", async () => {
    remote.getSettings.mockRejectedValue(new Error("offline"));
    const { ctx, rerender } = setup({ signedIn: true, path: "/" });
    swap(rerender, ctx, null);
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.NONE);
  });
});

// L1-14: a reload on /game while signed in. The player is restored, the table is not started until the saved settings come back, and Game must wait for it
// instead of redirecting to "/" (which GameProvider's start, running on an older pathname, would then leave in place: Home instead of the table).
describe("a reload on /game while signed in (L1-14)", () => {
  const visited = [];
  function Pages({ ctx }) {
    const at = useLocation().pathname;
    if (visited.at(-1) !== at) visited.push(at);
    return (
      <>
        <Probe ctx={ctx} />
        <Routes><Route path="/game" element={<Game />} /><Route path="/" element={<div>home</div>} /></Routes>
      </>
    );
  }
  const reload = () => {
    visited.length = 0;
    const ctx = {};
    const utils = render(
      <MemoryRouter initialEntries={["/game"]}>
        <PlayerContext.Provider value={{ player: { userName: "alice" }, getCredits: () => 0, applyCreditEvent: () => {} }}>
          <GameProvider><Pages ctx={ctx} /></GameProvider>
        </PlayerContext.Provider>
      </MemoryRouter>
    );
    return { ctx, ...utils };
  };

  it("shows Loading while the settings load, then the table, and never leaves /game", async () => {
    let answer;
    remote.getSettings.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { ctx, container } = reload();
    expect(container.textContent).toContain("Shuffling up...");
    expect(ctx.pathname).toBe("/game");
    answer({});
    await flush();
    expect(container.textContent).toContain("the table");
    expect(visited).toEqual(["/game"]);
  });

  it("lands on the table when the settings answer at once", async () => {
    remote.getSettings.mockResolvedValue({});
    const { ctx, container } = reload();
    await flush();
    expect(ctx.pathname).toBe("/game");
    expect(container.textContent).toContain("the table");
    expect(visited).toEqual(["/game"]);
  });

  it("lands on the table when the settings cannot be loaded", async () => {
    remote.getSettings.mockRejectedValue(new Error("offline"));
    const { ctx, container } = reload();
    await flush();
    expect(ctx.pathname).toBe("/game");
    expect(container.textContent).toContain("the table");
  });
});

describe("GameProvider: the reload warning while a hand is in play (L2-12)", () => {
  // A page unload asks the browser's "Leave site?" through beforeunload: preventDefault and a returnValue. `asks` fires one and says whether it did.
  const asks = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const start = (codes = ["10", "10", "9", "6", "K"]) => {
    shoes.push(stackedShoe(codes));
    const view = setup();
    act(() => view.ctx.actions.startGame());
    return view;
  };

  it("does not ask before a hand is dealt, with a bet on the table, or on a table not started", () => {
    const view = setup();
    expect(asks()).toBe(false); // nothing started
    const { ctx } = start();
    expect(asks()).toBe(false);
    act(() => ctx.actions.addBet(10));
    expect(asks()).toBe(false); // a bet is only chips on the felt until it is dealt
    view.unmount();
  });

  it("asks from the deal until the round is settled: dealing, the turn, the dealer, the results", () => {
    const { ctx } = start();
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    expect(ctx.state.phase).toBe(GamePhases.DEALING);
    expect(asks()).toBe(true);
    tick(); // DEAL_DONE
    expect(ctx.state.phase).toBe(GamePhases.PLAYER_TURN);
    expect(asks()).toBe(true);
    act(() => ctx.actions.stand(0));
    expect(asks()).toBe(true); // the dealer plays
    for (let i = 0; i < 10 && ctx.state.phase !== GamePhases.POST_ROUND; i++) tick();
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    expect(asks()).toBe(false); // settled: between rounds
  });

  it("asks while the offers wait too, and stops when the round is swept away (Next hand)", () => {
    const { ctx } = start(["10", "A", "9", "6", "K"]);
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    expect(ctx.state.phase).toBe(GamePhases.OFFERS);
    expect(asks()).toBe(true);
    act(() => ctx.actions.declineOffers());
    for (let i = 0; i < 4 && ctx.state.phase !== GamePhases.PLAYER_TURN; i++) tick();
    act(() => ctx.actions.stand(0));
    for (let i = 0; i < 10 && ctx.state.phase !== GamePhases.POST_ROUND; i++) tick();
    act(() => ctx.actions.continueRound());
    expect(ctx.state.phase).toBe(GamePhases.END_ROUND);
    expect(asks()).toBe(false);
  });

  it("asks on any page (a hand left in play behind Settings is lost by a reload too), and the listener goes with the provider", () => {
    const view = start();
    act(() => view.ctx.actions.addBet(10));
    act(() => view.ctx.actions.deal());
    act(() => view.ctx.navigate("/settings"));
    expect(asks()).toBe(true);
    view.unmount();
    expect(asks()).toBe(false);
  });
});

describe("GameProvider: the currency setting reaches money() (L2-2)", () => {
  const SYMBOLS = (n) => `${money(n)}`;
  afterEach(() => setCurrency("USD"));

  it("a saved currency sets the symbol every amount shows, and changing it changes it at once", async () => {
    remote.getSettings.mockResolvedValue({ v: 5, currency: "GBP" });
    const { ctx } = setup({ signedIn: true });
    await flush();
    expect(ctx.state.settings.currency).toBe("GBP");
    expect(SYMBOLS(10)).toBe("£10");
    act(() => { ctx.actions.changeSettings({ currency: "EUR" }); });
    expect(SYMBOLS(10)).toBe("€10");
    act(() => { ctx.actions.changeSettings({ currency: "auto" }); });
    expect(SYMBOLS(10)).toBe("$10"); // jsdom\x27s language is en-US
  });
});

describe("GameProvider: Home's Play keeps a live round (#196)", () => {
  it.each(["dealing", "the player's turn", "the results"])("startGame during %s changes nothing, and the round still settles once", (when) => {
    shoes.push(stackedShoe(["10", "10", "9", "6", "K"]));
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    if (when !== "dealing") tick();
    if (when === "the results") {
      act(() => ctx.actions.stand(0));
      for (let i = 0; i < 10 && ctx.state.phase !== GamePhases.POST_ROUND; i++) tick();
    }
    const { phase, hands, shoe, betCircle } = ctx.state;
    act(() => ctx.actions.startGame()); // browser Back to Home, then Play
    expect(ctx.state).toMatchObject({ phase, betCircle });
    expect(ctx.state.hands).toBe(hands);
    expect(ctx.state.shoe).toBe(shoe);
    if (ctx.state.phase === GamePhases.DEALING) tick();
    if (ctx.state.phase === GamePhases.PLAYER_TURN) act(() => ctx.actions.stand(0));
    for (let i = 0; i < 10 && ctx.state.phase !== GamePhases.POST_ROUND; i++) tick();
    expect(events(player).filter((e) => e.kind === "settle")).toEqual([{ kind: "settle", amount: 20 }]);
  });
});

describe("GameProvider: a failed settings load is retried (#196)", () => {
  const SAVED = { v: 5, blackjackPayout: "6:5", deckCount: 2 }; // two table rules differ from the defaults: a new shoe
  const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const ROUND = ["10", "10", "9", "6", "K"];
  const offline = () => Promise.reject(new Error("offline"));
  const cardsIn = (ctx) => ctx.state.shoe.filter((c) => c.type === "card").length;
  const tree = (ctx, player, signedIn) => (
    <MemoryRouter initialEntries={["/game"]}>
      <PlayerContext.Provider value={signedIn ? player : { player: null, getCredits: () => 0, applyCreditEvent: () => {} }}>
        <GameProvider><Probe ctx={ctx} /></GameProvider>
      </PlayerContext.Provider>
    </MemoryRouter>
  );
  // The first load fails and the table starts on the defaults; every later call is offline too until the test says otherwise.
  async function failedLoad(options) {
    remote.getSettings.mockImplementation(offline);
    const view = setup({ signedIn: true, ...options });
    await flush();
    return view;
  }

  it("starts the table anyway, says the settings are unloaded, and retries after 1, 2, 4, 8, 16, 30 and then every 30 s", async () => {
    const { ctx } = await failedLoad();
    expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, settingsUnloaded: true, starting: false });
    expect(remote.getSettings).toHaveBeenCalledTimes(1);
    for (const [i, seconds] of [1, 2, 4, 8, 16, 30, 30, 30].entries()) {
      await advance(seconds * 1000 - 1);
      expect(remote.getSettings, `before retry ${i + 1}`).toHaveBeenCalledTimes(i + 1);
      await advance(1);
      expect(remote.getSettings, `retry ${i + 1} after ${seconds} s`).toHaveBeenCalledTimes(i + 2);
      expect(vi.getTimerCount()).toBe(1); // one chain only
    }
    expect(ctx.state.settingsUnloaded).toBe(true);
  });

  it("a retry that answers between rounds is applied at once, with its new shoe; the notice goes, saving works and no timer is left", async () => {
    remote.token = "token";
    const { ctx } = await failedLoad();
    expect(cardsIn(ctx)).toBe(312);
    remote.getSettings.mockResolvedValue(SAVED);
    await advance(1000);
    expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, settingsUnloaded: false });
    expect(ctx.state.settings).toMatchObject({ blackjackPayout: "6:5", deckCount: 2 });
    expect(cardsIn(ctx)).toBe(104);
    expect(vi.getTimerCount()).toBe(0);
    await advance(120_000);
    expect(remote.getSettings).toHaveBeenCalledTimes(2);
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 750); });
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ blackjackPayout: "6:5", playTimeout: 750 });
  });

  it("a retry that answers mid-round is held until the next break: never under a hand, the results or the sweep; saves stay refused meanwhile", async () => {
    remote.token = "token";
    shoes.push(stackedShoe(ROUND));
    const { ctx, player } = await failedLoad();
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    remote.getSettings.mockResolvedValue(SAVED);
    const held = () => {
      expect(ctx.state.settingsUnloaded, ctx.state.phase).toBe(true);
      expect(ctx.state.settings, ctx.state.phase).toMatchObject({ blackjackPayout: "3:2", deckCount: 6 });
    };
    expect(ctx.state.phase).toBe(GamePhases.DEALING);
    await advance(1000); // the retry answers, and the deal is done
    expect(ctx.state.phase).toBe(GamePhases.PLAYER_TURN);
    held();
    await act(async () => { await expect(ctx.actions.changeSetting("playTimeout", 1000)).rejects.toThrow("Settings have not loaded yet"); });
    expect(ctx.state.hands[0].cards).toHaveLength(2);
    act(() => ctx.actions.stand(0));
    held();
    for (let i = 0; i < 10 && ctx.state.phase !== GamePhases.POST_ROUND; i++) { tick(); held(); }
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    act(() => ctx.actions.continueRound());
    expect(ctx.state.phase).toBe(GamePhases.END_ROUND);
    held();
    tick(); // the sweep ends: between rounds
    expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, settingsUnloaded: false });
    expect(ctx.state.settings).toMatchObject({ blackjackPayout: "6:5", deckCount: 2 });
    expect(remote.getSettings).toHaveBeenCalledTimes(2);
    expect(events(player).at(-1)).toEqual({ kind: "settle", amount: 20 });
    expect(remote.saveSettings).not.toHaveBeenCalled();
  });

  it("is applied with no table (left the game): the next table is built from the loaded settings", async () => {
    const { ctx } = await failedLoad();
    act(() => ctx.actions.resetGame());
    remote.getSettings.mockResolvedValue(SAVED);
    await advance(1000);
    expect(ctx.state).toMatchObject({ phase: GamePhases.NONE, settingsUnloaded: false });
    act(() => ctx.actions.startGame());
    expect(cardsIn(ctx)).toBe(104);
  });

  it("sign-out leaves no timer and asks no more", async () => {
    const { ctx, player, rerender } = await failedLoad();
    expect(vi.getTimerCount()).toBe(1);
    rerender(tree(ctx, player, false));
    expect(vi.getTimerCount()).toBe(0);
    expect(ctx.state.settingsUnloaded).toBe(false);
    await advance(120_000);
    expect(remote.getSettings).toHaveBeenCalledTimes(1);
  });

  it.each(["answers", "fails"])("a retry in flight at sign-out that later %s is ignored: nothing applied, no timer", async (how) => {
    const { ctx, player, rerender } = await failedLoad();
    let resolve, reject;
    remote.getSettings.mockReturnValue(new Promise((res, rej) => { resolve = res; reject = rej; }));
    await advance(1000); // the retry is on its way
    rerender(tree(ctx, player, false));
    await act(async () => { if (how === "answers") resolve(SAVED); else reject(new Error("offline")); });
    expect(ctx.state.settings).toMatchObject({ blackjackPayout: "3:2", deckCount: 6 });
    expect(ctx.state).toMatchObject({ phase: GamePhases.NONE, settingsUnloaded: false });
    expect(vi.getTimerCount()).toBe(0);
    await advance(120_000);
    expect(remote.getSettings).toHaveBeenCalledTimes(2);
  });

  it("an answer held mid-round is dropped by sign-out, and the next sign-in loads its own settings", async () => {
    shoes.push(stackedShoe(ROUND));
    const { ctx, player, rerender } = await failedLoad();
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    remote.getSettings.mockResolvedValue(SAVED);
    await advance(1000); // held: PLAYER_TURN
    rerender(tree(ctx, player, false)); // the table goes to NONE here: the held answer must not land on it
    await flush();
    expect(ctx.state.settings).toMatchObject({ blackjackPayout: "3:2", deckCount: 6 });
    remote.getSettings.mockResolvedValue({ v: 5, deckCount: 4 });
    rerender(tree(ctx, player, true));
    await flush();
    expect(ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, settingsUnloaded: false });
    expect(ctx.state.settings).toMatchObject({ blackjackPayout: "3:2", deckCount: 4 });
  });

  it.each(["waiting for a retry", "a retry in flight"])("unmounting while %s leaves no timer, and a late failure starts no new one", async (when) => {
    const { unmount } = await failedLoad();
    let reject;
    if (when === "a retry in flight") {
      remote.getSettings.mockReturnValue(new Promise((_, rej) => { reject = rej; }));
      await advance(1000);
    }
    unmount();
    await act(async () => { reject?.(new Error("offline")); });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a first load that succeeds is never 'unloaded' and retries nothing; signed out neither", async () => {
    const { ctx } = setup({ signedIn: true });
    expect(ctx.state.settingsUnloaded).toBe(false); // still loading: no notice yet
    await flush();
    expect(ctx.state.settingsUnloaded).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    cleanup();
    expect(setup().ctx.state.settingsUnloaded).toBe(false);
  });
});

describe("GameProvider: a refused settle (#196)", () => {
  // As setup(), but the ledger also answers the settle, through the report GameProvider hands it.
  function playToSettle(outcome, codes = ["10", "10", "9", "6", "K"]) {
    shoes.push(stackedShoe(codes));
    const view = setup();
    const inner = view.player.applyCreditEvent.getMockImplementation();
    let answer;
    view.player.applyCreditEvent.mockImplementation((event, report) => {
      inner(event, report);
      if (event.kind === "settle") answer = () => act(() => report(event.seq, outcome));
    });
    act(() => view.ctx.actions.startGame());
    act(() => view.ctx.actions.addBet(10));
    act(() => view.ctx.actions.deal());
    tick();
    act(() => view.ctx.actions.stand(0));
    for (let i = 0; i < 10 && view.ctx.state.phase !== GamePhases.POST_ROUND; i++) tick();
    answer();
    return view;
  }

  it("says which payout was not paid", () => {
    const { ctx } = playToSettle("rejected");
    expect(ctx.state.payoutNotice).toBe("The server refused your $20 payout; it was not paid.");
  });

  it("says nothing when the settle is confirmed, or when a lost round's 0 settle is refused", () => {
    expect(playToSettle("confirmed").ctx.state.payoutNotice).toBeNull();
    cleanup();
    const lost = playToSettle("rejected", ["10", "10", "7", "9"]);
    expect(lost.player.applyCreditEvent.mock.calls.at(-1)[0]).toMatchObject({ kind: "settle", amount: 0 });
    expect(lost.ctx.state.payoutNotice).toBeNull();
  });
});
