import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { GameProvider } from "../providers/GameProvider";
import { useGameState, useGameActions } from "../hooks/useGame";
import { PlayerContext } from "../context/PlayerContext";
import { GamePhases } from "../utils/constants/gamePhases";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import * as cards from "../utils/cards";

// Every new shoe comes from the next stacked list, so rounds are scripted.
const shoes = [];
vi.mock("../utils/cards", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createShoe: vi.fn((...args) => (shoes.length ? shoes.shift() : actual.createShoe(...args))) };
});

function setup() {
  const credits = { value: 100 };
  const player = {
    getCredits: vi.fn(() => credits.value),
    adjustCredits: vi.fn((delta) => { credits.value += delta; }),
  };
  const ctx = {};
  function Probe() {
    ctx.state = useGameState();
    ctx.actions = useGameActions();
    return null;
  }
  const utils = render(
    <PlayerContext.Provider value={player}>
      <GameProvider><Probe /></GameProvider>
    </PlayerContext.Provider>
  );
  return { ctx, player, ...utils };
}

const tick = () => act(() => { vi.advanceTimersByTime(1000); });

beforeEach(() => {
  vi.useFakeTimers();
  shoes.length = 0;
  cards.createShoe.mockClear();
});
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
    expect(player.adjustCredits.mock.calls).toEqual([[-10, false], [0, true], [20, true]]);
    act(() => ctx.actions.continueRound());
    tick();
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(player.adjustCredits).toHaveBeenCalledTimes(3);
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
    expect(player.adjustCredits.mock.calls).toEqual([[-10, false], [0, true]]);
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
    expect(player.adjustCredits).toHaveBeenCalledWith(-10, true);
  });

  it("deals a fresh shoe for table settings and just updates the others", () => {
    const { ctx } = setup();
    act(() => ctx.actions.changeSetting("deckCount", 3));
    expect(ctx.state.shoe.filter((c) => c.type === "card")).toHaveLength(156);
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(cards.createShoe).toHaveBeenLastCalledWith(3, true);
    act(() => ctx.actions.changeSetting("playTimeout", 500));
    expect(ctx.state.settings.playTimeout).toBe(500);
    expect(cards.createShoe).toHaveBeenCalledTimes(1);
  });
});
