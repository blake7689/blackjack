import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { PlayerProvider } from "../providers/PlayerProvider";
import { usePlayer } from "../hooks/usePlayer";
import * as engine from "../utils/playerEngine";
import * as api from "../utils/api";

vi.mock("../utils/playerEngine", () => ({
  getMe: vi.fn(), loginPlayer: vi.fn(), registerPlayer: vi.fn(), updateProfile: vi.fn(), changePassword: vi.fn(),
  deleteMe: vi.fn(), logoutPlayer: vi.fn(), placeBet: vi.fn(), settleRound: vi.fn(),
}));
vi.mock("../utils/api", () => ({ getToken: vi.fn(), setUnauthorizedHandler: vi.fn() }));

const player = { userName: "tester", email: "t@example.com", firstName: "T", lastName: "E", credits: 1000 };

// A promise the test resolves or rejects when it chooses, to control the ledger's timing.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup() {
  const ctx = {};
  function Probe() {
    Object.assign(ctx, usePlayer());
    return null;
  }
  const utils = render(<PlayerProvider><Probe /></PlayerProvider>);
  return { ctx, ...utils };
}

async function signedIn() {
  const result = setup();
  await act(async () => { await result.ctx.login({}); });
  return result;
}

// Lets queued ledger calls and their follow-ups finish.
const settleQueue = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

beforeEach(() => {
  vi.clearAllMocks();
  api.getToken.mockReturnValue(null);
  engine.loginPlayer.mockResolvedValue(player);
  engine.registerPlayer.mockResolvedValue(player);
  engine.getMe.mockResolvedValue(player);
});
afterEach(() => vi.useRealTimers());

describe("session", () => {
  it("restores a session from a stored token after a refresh", async () => {
    api.getToken.mockReturnValue("tok");
    const { ctx } = setup();
    await settleQueue();
    expect(ctx.player).toEqual(player);
  });

  it("stays signed out without a token, or when the stored token has expired", async () => {
    const { ctx } = setup();
    await settleQueue();
    expect(engine.getMe).not.toHaveBeenCalled();
    expect(ctx.player).toBeNull();

    api.getToken.mockReturnValue("expired");
    engine.getMe.mockRejectedValueOnce(new Error("401"));
    const second = setup();
    await settleQueue();
    expect(second.ctx.player).toBeNull();
  });

  it("ignores a late restore after logging out meanwhile", async () => {
    api.getToken.mockReturnValue("tok");
    const me = deferred();
    engine.getMe.mockReturnValueOnce(me.promise);
    const { ctx } = setup();

    api.getToken.mockReturnValue(null); // logged out: the token is gone
    await act(async () => { me.resolve(player); });
    await settleQueue();

    expect(ctx.player).toBeNull();
  });

  it("signs out when a signed-in request gets 401, and unhooks on unmount", async () => {
    const { ctx, unmount } = await signedIn();
    const handler = api.setUnauthorizedHandler.mock.calls[0][0];
    act(() => handler());
    expect(ctx.player).toBeNull();
    unmount();
    expect(() => api.setUnauthorizedHandler.mock.calls.at(-1)[0]()).not.toThrow();
  });
});

describe("account", () => {
  it("logs in, registers, and logs out", async () => {
    const { ctx } = setup();
    await act(async () => { await ctx.addPlayer({ userName: "tester" }); });
    expect(ctx.player).toEqual(player);
    act(() => ctx.logout());
    expect(engine.logoutPlayer).toHaveBeenCalled();
    expect(ctx.player).toBeNull();
  });

  it("updates the profile but keeps the balance shown locally", async () => {
    const { ctx } = await signedIn();
    act(() => ctx.applyCreditEvent({ kind: "local", amount: -10 }));
    engine.updateProfile.mockResolvedValue({ ...player, firstName: "New" });

    await act(async () => { await ctx.updatePlayer({ firstName: "New" }); });

    expect(ctx.player).toMatchObject({ firstName: "New", credits: 990 });
  });

  it("passes password changes through and signs out after deleting", async () => {
    const { ctx } = await signedIn();
    await act(async () => { await ctx.changePassword("old", "new"); });
    expect(engine.changePassword).toHaveBeenCalledWith("old", "new");
    await act(async () => { await ctx.deletePlayer(); });
    expect(engine.deleteMe).toHaveBeenCalled();
    expect(ctx.player).toBeNull();
  });
});

describe("credits", () => {
  it("ignores credit events when signed out", () => {
    const { ctx } = setup();
    act(() => ctx.applyCreditEvent({ kind: "local", amount: -10 }));
    expect(ctx.getCredits()).toBe(0);
  });

  it("moves chips locally, then stakes them on the server without moving the balance twice", async () => {
    const { ctx } = await signedIn();
    engine.placeBet.mockResolvedValue({ credits: 990, openStake: 10 });

    act(() => ctx.applyCreditEvent({ kind: "local", amount: -10 }));
    expect(ctx.getCredits()).toBe(990);
    act(() => ctx.applyCreditEvent({ kind: "bet", amount: 10, newRound: true, alreadyDeducted: true }));
    expect(ctx.getCredits()).toBe(990);
    await settleQueue();

    expect(engine.placeBet).toHaveBeenCalledWith(10, true);
    expect(ctx.player.credits).toBe(990);
  });

  it("takes a double at once, then shows the server's answer", async () => {
    const { ctx } = await signedIn();
    engine.placeBet.mockResolvedValue({ credits: 980, openStake: 20 });

    act(() => ctx.applyCreditEvent({ kind: "bet", amount: 10, newRound: false, alreadyDeducted: false }));
    expect(ctx.getCredits()).toBe(990);
    expect(ctx.creditChange.delta).toBe(-10);
    await settleQueue();

    expect(engine.placeBet).toHaveBeenCalledWith(10, false);
    expect(ctx.player.credits).toBe(980);
  });

  it("sends ledger calls one at a time, and keeps chips placed meanwhile", async () => {
    const { ctx } = await signedIn();
    const bet = deferred();
    engine.placeBet.mockReturnValue(bet.promise);
    engine.settleRound.mockResolvedValue({ credits: 1015, openStake: 0 });

    act(() => ctx.applyCreditEvent({ kind: "bet", amount: 10, newRound: true, alreadyDeducted: false }));
    act(() => ctx.applyCreditEvent({ kind: "settle", amount: 25 }));
    await settleQueue();
    expect(engine.settleRound).not.toHaveBeenCalled();
    expect(ctx.getCredits()).toBe(1015);

    // Chips for the next round go down while the server is still answering.
    act(() => ctx.applyCreditEvent({ kind: "local", amount: -5 }));
    await act(async () => { bet.resolve({ credits: 990, openStake: 10 }); });
    await settleQueue();

    expect(engine.settleRound).toHaveBeenCalledWith(25);
    expect(ctx.player.credits).toBe(1010); // server 1015 - 5 still on the table
  });

  it("reloads the balance from the server after a failed ledger call", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx } = await signedIn();
    engine.placeBet.mockRejectedValueOnce(new Error("Insufficient credits."));
    engine.getMe.mockResolvedValueOnce({ ...player, credits: 1000 });

    act(() => ctx.applyCreditEvent({ kind: "bet", amount: 10, newRound: false, alreadyDeducted: false }));
    await settleQueue();

    expect(ctx.player.credits).toBe(1000);
    expect(error).toHaveBeenCalledWith("Ledger call failed; reloading the balance", expect.any(Error));
    error.mockRestore();
  });

  it("logs when reloading the balance also fails, and stops if signed out meanwhile", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx } = await signedIn();
    engine.settleRound.mockRejectedValueOnce(new Error("offline"));
    engine.getMe.mockRejectedValueOnce(new Error("still offline"));

    act(() => ctx.applyCreditEvent({ kind: "settle", amount: 0 }));
    await settleQueue();
    expect(error).toHaveBeenCalledWith("Reloading the balance failed", expect.any(Error));

    const bet = deferred();
    engine.placeBet.mockReturnValueOnce(bet.promise);
    act(() => ctx.applyCreditEvent({ kind: "bet", amount: 10, newRound: true, alreadyDeducted: false }));
    act(() => ctx.logout());
    await act(async () => { bet.reject(new Error("401")); });
    await settleQueue();
    expect(engine.getMe).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("ignores a balance answer that arrives after signing out", async () => {
    const { ctx } = await signedIn();
    const bet = deferred();
    engine.placeBet.mockReturnValueOnce(bet.promise);

    act(() => ctx.applyCreditEvent({ kind: "bet", amount: 10, newRound: true, alreadyDeducted: false }));
    act(() => ctx.logout());
    await act(async () => { bet.resolve({ credits: 990, openStake: 10 }); });
    await settleQueue();

    expect(ctx.player).toBeNull();
  });

  it("shows the last change as a badge that fades, and none for a zero change", async () => {
    const { ctx } = await signedIn();
    engine.settleRound.mockResolvedValue({ credits: 1000, openStake: 0 });
    vi.useFakeTimers();
    act(() => ctx.applyCreditEvent({ kind: "settle", amount: 0 }));
    expect(ctx.creditChange).toBeNull();
    act(() => ctx.applyCreditEvent({ kind: "local", amount: 20 }));
    expect(ctx.creditChange).toEqual({ delta: 20, seq: 1 });
    act(() => ctx.applyCreditEvent({ kind: "local", amount: 20 }));
    expect(ctx.creditChange).toEqual({ delta: 20, seq: 2 });
    act(() => { vi.advanceTimersByTime(2500); });
    expect(ctx.creditChange).toBeNull();
  });
});
