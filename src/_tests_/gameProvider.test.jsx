import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { GameProvider } from "../providers/GameProvider";
import { useGameState, useGameActions } from "../hooks/useGame";
import { PlayerContext } from "../context/PlayerContext";
import { GamePhases } from "../utils/constants/gamePhases";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import * as cards from "../utils/cards";

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
  return null;
}

function setup({ signedIn = false } = {}) {
  const credits = { value: 100 };
  const player = {
    player: signedIn ? { userName: "alice" } : null,
    getCredits: vi.fn(() => credits.value),
    applyCreditEvent: vi.fn((event) => { credits.value += event.kind === "bet" && !event.alreadyDeducted ? -event.amount : event.kind === "bet" ? 0 : event.amount; }),
  };
  const ctx = {};
  const utils = render(
    <PlayerContext.Provider value={player}>
      <GameProvider><Probe ctx={ctx} /></GameProvider>
    </PlayerContext.Provider>
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
  it("plays a round end to end, applying each credit change exactly once", () => {
    shoes.push(stackedShoe(["10", "10", "9", "6", "K", "2"]));
    const { ctx, player } = setup();
    act(() => ctx.actions.startGame());
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    expect(ctx.state.phase).toBe(GamePhases.PLAYER_TURN);
    act(() => ctx.actions.stand(0));
    expect(ctx.actions.getPhase()).toBe(GamePhases.DEALER_TURN);
    tick(); // reveal
    tick(); // dealer draws K and busts
    expect(ctx.state.dealer.isBusted).toBe(true);
    tick(); // settle
    tick(); // results
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    expect(events(player)).toEqual([{ kind: "local", amount: -10 }, { kind: "bet", amount: 10, newRound: true, alreadyDeducted: true }, { kind: "settle", amount: 20 }]);
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
    act(() => ctx.actions.deal()); // player blackjack: the dealer's turn is scheduled
    expect(ctx.state.phase).toBe(GamePhases.DEALER_TURN);
    act(() => ctx.actions.resetGame());
    for (let i = 0; i < 5; i++) tick();
    expect(ctx.state.phase).toBe(GamePhases.NONE);
    expect(ctx.state.dealer.cards).toEqual([]);
    expect(events(player)).toEqual([{ kind: "local", amount: -10 }, { kind: "bet", amount: 10, newRound: true, alreadyDeducted: true }]);
  });

  it("stops its timer on unmount", () => {
    shoes.push(stackedShoe(["A", "10", "K", "6"]));
    const { ctx, unmount } = setup();
    act(() => ctx.actions.startGame());
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
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
    act(() => ctx.actions.split(0));
    expect(ctx.state.hands).toHaveLength(2);
    act(() => ctx.actions.double(0));
    act(() => ctx.actions.hit(1));
    expect(ctx.state.hands[1].cards).toHaveLength(3);
    expect(events(player)).toContainEqual({ kind: "bet", amount: 10, newRound: false, alreadyDeducted: false });
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
    expect(ctx.state.settings.deckCount).toBe(2);
    setup();
    expect(remote.getSettings).toHaveBeenCalledTimes(1);
  });

  it("ignores saved settings that arrive after signing out", async () => {
    let answer;
    remote.getSettings.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { ctx, rerender } = setup({ signedIn: true });
    rerender(
      <PlayerContext.Provider value={{ player: null, getCredits: () => 0, applyCreditEvent: () => {} }}>
        <GameProvider><Probe ctx={ctx} /></GameProvider>
      </PlayerContext.Provider>
    );
    await act(async () => answer({ deckCount: 5 }));
    expect(ctx.state.settings.deckCount).toBe(2);
  });

  it("saves the whole settings object when signed in, and nothing when signed out", async () => {
    const { ctx } = setup();
    await act(async () => { await ctx.actions.changeSetting("playTimeout", 500); });
    expect(remote.saveSettings).not.toHaveBeenCalled();
    remote.token = "token";
    await act(async () => { await ctx.actions.changeSetting("deckCount", 3); });
    expect(remote.saveSettings).toHaveBeenCalledWith({ v: 1, ...ctx.state.settings });
    expect(remote.saveSettings.mock.calls[0][0]).toMatchObject({ deckCount: 3, playTimeout: 500 });
  });
});
