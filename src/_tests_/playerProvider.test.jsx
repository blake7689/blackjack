import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { PlayerProvider } from "../providers/PlayerProvider";
import { usePlayer } from "../hooks/usePlayer";
import * as engine from "../utils/playerEngine";

vi.mock("../utils/playerEngine", () => ({
  loginPlayer: vi.fn(),
  addPlayerApi: vi.fn(),
  updatePlayerApi: vi.fn(),
  updateCreditsApi: vi.fn(),
  deletePlayerApi: vi.fn(),
}));

const player = { playerId: 7, userName: "tester", email: "t@example.com", firstName: "T", lastName: "E", credits: 100 };

function setup() {
  const ctx = {};
  function Probe() {
    Object.assign(ctx, usePlayer());
    return null;
  }
  render(<PlayerProvider><Probe /></PlayerProvider>);
  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
  engine.loginPlayer.mockResolvedValue(player);
  engine.addPlayerApi.mockResolvedValue(player);
  engine.updateCreditsApi.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("PlayerProvider", () => {
  it("logs in and logs out", async () => {
    const ctx = setup();
    expect(ctx.player).toBeNull();
    expect(ctx.getCredits()).toBe(0);
    await act(async () => { await ctx.login({ usernameOrEmail: "tester", password: "x" }); });
    expect(ctx.player).toEqual(player);
    act(() => ctx.logout());
    expect(ctx.player).toBeNull();
  });

  it("stays logged out when login fails", async () => {
    engine.loginPlayer.mockRejectedValueOnce(new Error("nope"));
    const ctx = setup();
    await act(async () => { await expect(ctx.login({})).rejects.toThrow("nope"); });
    expect(ctx.player).toBeNull();
  });

  it("signs up, updates the profile from the latest player, and deletes", async () => {
    const ctx = setup();
    await act(async () => { await ctx.addPlayer({ userName: "tester" }); });
    act(() => ctx.adjustCredits(-10, false));
    engine.updatePlayerApi.mockImplementation(async (p, profile) => ({ ...p, ...profile }));
    await act(async () => { await ctx.updatePlayer({ firstName: "New" }); });
    expect(engine.updatePlayerApi).toHaveBeenCalledWith({ ...player, credits: 90 }, { firstName: "New" });
    expect(ctx.player.firstName).toBe("New");
    await act(async () => { await ctx.deletePlayer(); });
    expect(engine.deletePlayerApi).toHaveBeenCalled();
    expect(ctx.player).toBeNull();
  });

  it("applies back-to-back credit changes to the latest balance and saves the result", async () => {
    const ctx = setup();
    await act(async () => { await ctx.login({}); });
    act(() => {
      ctx.adjustCredits(-10, true);
      ctx.adjustCredits(-10, true);
    });
    expect(ctx.player.credits).toBe(80);
    expect(ctx.getCredits()).toBe(80);
    expect(engine.updateCreditsApi.mock.calls.map(([, credits]) => credits)).toEqual([90, 80]);
  });

  it("keeps local-only changes off the server, and ignores changes when logged out", () => {
    const ctx = setup();
    act(() => ctx.adjustCredits(50, true));
    expect(ctx.player).toBeNull();
    expect(engine.updateCreditsApi).not.toHaveBeenCalled();
  });

  it("logs a failed save instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    engine.updateCreditsApi.mockRejectedValueOnce(new Error("offline"));
    const ctx = setup();
    await act(async () => { await ctx.login({}); });
    await act(async () => { ctx.adjustCredits(5, true); });
    expect(error).toHaveBeenCalledWith("Saving credits failed", expect.any(Error));
    error.mockRestore();
  });

  it("shows the last change as a badge that fades, and none for a sync", async () => {
    const ctx = setup();
    await act(async () => { await ctx.login({}); });
    vi.useFakeTimers();
    act(() => ctx.adjustCredits(0, true));
    expect(ctx.creditChange).toBeNull();
    act(() => ctx.adjustCredits(20, false));
    expect(ctx.creditChange).toEqual({ delta: 20, seq: 1 });
    act(() => ctx.adjustCredits(20, false));
    expect(ctx.creditChange).toEqual({ delta: 20, seq: 2 });
    act(() => { vi.advanceTimersByTime(2500); });
    expect(ctx.creditChange).toBeNull();
  });
});
