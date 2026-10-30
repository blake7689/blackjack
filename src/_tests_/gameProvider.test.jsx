import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { GameProvider } from "../providers/GameProvider";
import { useGameState, useGameActions } from "../hooks/useGame";
import { PlayerContext } from "../context/PlayerContext";
import { GamePhases } from "../utils/constants/gamePhases";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import * as cards from "../utils/cards";
import { queue } from "../utils/cardAnimation";

// Saved settings on the server (#36), controlled per test.
const remote = vi.hoisted(() => ({ getSettings: vi.fn(), saveSettings: vi.fn(), token: null }));
vi.mock("../utils/playerEngine", () => ({ getSettings: remote.getSettings, saveSettings: remote.saveSettings }));
vi.mock("../utils/api", () => ({ getToken: () => remote.token }));

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

  it("passes the player's balance to bets, doubles and splits", () => {
    shoes.push(stackedShoe(["8", "10", "8", "7", "3", "10", "2"]));
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
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
    expect(remote.saveSettings).toHaveBeenCalledWith({ v: 4, ...ctx.state.settings });
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
      expect(ctx.state.notice).toBe(`Not enough credits to rebet $${(1000).toLocaleString()}: auto deal paused`);
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

    it("resetGame and startGame cancel it, and startGame also clears a pause", () => {
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
      act(() => restart.ctx.actions.startGame());
      expect(restart.ctx.state).toMatchObject({ phase: GamePhases.PRE_DEAL, betCircle: 0, autoDealPending: false, autoDealPaused: false });
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
      expect(saved).toMatchObject({ v: 4, resetInitialBet: true, autoDeal: true, autoDealDelay: 500 });
      expect(Object.values(saved).every((v) => ["string", "number", "boolean"].includes(typeof v))).toBe(true);
      expect(cards.createShoe).not.toHaveBeenCalled();
    });
  });
});

describe("GameProvider saved table rules (#91)", () => {
  const legacy = {
    dealerHitsSoft17: false, blackjackPayout: "3:2", doubleOn: "any", doubleAfterSplit: true, resplitAces: false, hitSplitAces: false,
    noHoleCardLoss: "all", deckCount: 2, maxSplitHands: 0, insurance: false,
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

  it("a setting change saves { v: 4, ...every setting }", async () => {
    remote.token = "token";
    remote.getSettings.mockResolvedValue({});
    const { ctx } = setup({ signedIn: true });
    await flush();
    await act(async () => { await ctx.actions.changeSetting("blackjackPayout", "6:5"); });
    const saved = remote.saveSettings.mock.calls[0][0];
    expect(saved.v).toBe(4);
    expect(Object.keys(saved).sort()).toEqual(["v", ...Object.keys(ctx.state.settings)].sort());
    expect(saved).toMatchObject({ ...vegas, blackjackPayout: "6:5" });
  });

  it("a v: 1 table that changes one setting is saved as v: 4 with its legacy rule values (no silent payout change)", async () => {
    remote.token = "token";
    remote.getSettings.mockResolvedValue({ v: 1, dealerHoleBehaviour: "drawAfter", deckCount: 3 });
    const { ctx } = setup({ signedIn: true });
    await flush();
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 750); });
    const saved = remote.saveSettings.mock.calls[0][0];
    expect(saved).toMatchObject({ v: 4, ...legacy, deckCount: 3, dealerHoleBehaviour: "drawAfter", playTimeout: 750 });
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
  const legacyRules = { dealerHitsSoft17: false, blackjackPayout: "3:2", noHoleCardLoss: "all", maxSplitHands: 0, insurance: false };
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

  it("once the load resolves, the same change saves v: 4 with the loaded values, and a v: 1 table's legacy rules are written, not Vegas", async () => {
    remote.token = "token";
    let answer;
    remote.getSettings.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { ctx } = setup({ signedIn: true });
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 750).catch(() => {}); });
    expect(remote.saveSettings).not.toHaveBeenCalled();
    await act(async () => answer(stored));
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 750); });
    expect(remote.saveSettings).toHaveBeenCalledTimes(1);
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ v: 4, ...legacyRules, deckCount: 3, dealerHoleBehaviour: "drawAfter", playTimeout: 750 });
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

  it("saves surrender in the version 4 object, and a change deals a new shoe like any table rule", async () => {
    remote.token = "token";
    const { ctx } = setup({ signedIn: true });
    await flush();
    cards.createShoe.mockClear();
    await act(async () => { await ctx.actions.changeSetting("surrender", "early"); });
    expect(remote.saveSettings).toHaveBeenCalledWith({ v: 4, ...ctx.state.settings });
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ v: 4, surrender: "early" });
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
    const { ctx } = setup();
    act(() => ctx.actions.startGame());
    act(() => { ctx.actions.changeSettings({ resetInitialBet: true, autoDeal: true, autoDealDelay: 500 }); });
    shoes.push(aceUp("5")); // the settings change dealt a new shoe; this one is for the round
    act(() => ctx.actions.startGame());
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
    act(() => { ctx.actions.changeSettings({ surrender: "early", insurance: false }); });
    shoes.push(stackedShoe(["10", "K", "6", "A", "9", "9"])); // for the round (the settings change dealt a shoe)
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    tick();
    expect(ctx.state.offers).toMatchObject({ surrender: true });
    act(() => { ctx.actions.surrender(0); });
    for (let i = 0; i < 8 && ctx.state.phase !== POST_ROUND; i++) tick();
    expect(ctx.state.dealer.isBlackjack).toBe(true);
    expect(events(player).filter((e) => e.kind === "settle")).toEqual([{ kind: "settle", amount: 5 }]);
  });

  it("saves insurance in the version 4 object, and a change deals a new shoe like any table rule", async () => {
    remote.token = "token";
    const { ctx } = setup({ signedIn: true });
    await flush();
    cards.createShoe.mockClear();
    await act(async () => { await ctx.actions.changeSetting("insurance", false); });
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ v: 4, insurance: false });
    expect(remote.saveSettings).toHaveBeenCalledWith({ v: 4, ...ctx.state.settings });
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
