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
vi.mock("../utils/api", () => ({ getToken: vi.fn(), setUnauthorizedHandler: vi.fn(), COLD_START_TIMEOUT_MS: 90000 }));

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// An API error as api.js throws it: the status tells a definite refusal from no answer at all.
const refusal = (status, message = "refused") => Object.assign(new Error(message), { status });

// Lets queued ledger calls and their follow-ups finish.
const settleQueue = () => act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });

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

  it("waits out a slow restore on a cold API start instead of signing the player out (#75)", async () => {
    vi.useFakeTimers();
    api.getToken.mockReturnValue("tok");
    engine.getMe.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(player), 60000)));
    const { ctx } = setup();
    await act(async () => { await vi.advanceTimersByTimeAsync(59000); });
    expect(ctx.player).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(ctx.player).toEqual(player);
    expect(engine.getMe).toHaveBeenCalledWith(90000);
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
  it("ignores credit events when signed out, and tells the game they are done so it never waits", () => {
    const { ctx } = setup();
    const report = vi.fn();
    act(() => ctx.applyCreditEvent({ seq: 1, kind: "local", amount: -10 }, report));
    act(() => ctx.applyCreditEvent({ seq: 2, kind: "bet", amount: 10, newRound: true, alreadyDeducted: true, handTag: null }, report));
    act(() => ctx.applyCreditEvent({ seq: 3, kind: "settle", amount: 20 }, report));
    expect(ctx.getCredits()).toBe(0);
    expect(report.mock.calls).toEqual([[1, "confirmed"], [2, "confirmed"], [3, "confirmed"]]);
    expect(engine.placeBet).not.toHaveBeenCalled();
    expect(engine.settleRound).not.toHaveBeenCalled();
  });

  it("moves chips locally, then stakes them on the server without moving the balance twice", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.placeBet.mockResolvedValue({ credits: 990, openStake: 10 });

    act(() => ctx.applyCreditEvent({ seq: 1, kind: "local", amount: -10 }, report));
    expect(ctx.getCredits()).toBe(990);
    act(() => ctx.applyCreditEvent({ seq: 2, kind: "bet", amount: 10, newRound: true, alreadyDeducted: true, handTag: null }, report));
    expect(ctx.getCredits()).toBe(990);
    await settleQueue();

    expect(engine.placeBet).toHaveBeenCalledWith(10, true, expect.stringMatching(UUID));
    expect(ctx.player.credits).toBe(990);
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(2, "confirmed");
  });

  it("takes a double at once, then shows the server's answer", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.placeBet.mockResolvedValue({ credits: 980, openStake: 20 });

    act(() => ctx.applyCreditEvent({ seq: 4, kind: "bet", amount: 10, newRound: false, alreadyDeducted: false, handTag: 1 }, report));
    expect(ctx.getCredits()).toBe(990);
    expect(ctx.creditChange.delta).toBe(-10);
    await settleQueue();

    expect(engine.placeBet).toHaveBeenCalledWith(10, false, expect.stringMatching(UUID));
    expect(ctx.player.credits).toBe(980);
    expect(report).toHaveBeenCalledWith(4, "confirmed");
  });

  it("sends ledger calls one at a time, and keeps chips placed meanwhile", async () => {
    const { ctx } = await signedIn();
    const bet = deferred();
    engine.placeBet.mockReturnValue(bet.promise);
    engine.settleRound.mockResolvedValue({ credits: 1015, openStake: 0 });

    act(() => ctx.applyCreditEvent({ seq: 1, kind: "bet", amount: 10, newRound: true, alreadyDeducted: false, handTag: null }, vi.fn()));
    act(() => ctx.applyCreditEvent({ seq: 2, kind: "settle", amount: 25 }, vi.fn()));
    await settleQueue();
    expect(engine.settleRound).not.toHaveBeenCalled();
    expect(ctx.getCredits()).toBe(1015);

    // Chips for the next round go down while the server is still answering.
    act(() => ctx.applyCreditEvent({ seq: 3, kind: "local", amount: -5 }, vi.fn()));
    await act(async () => { bet.resolve({ credits: 990, openStake: 10 }); });
    await settleQueue();

    expect(engine.settleRound).toHaveBeenCalledWith(25, expect.stringMatching(UUID));
    expect(ctx.player.credits).toBe(1010); // server 1015 - 5 still on the table
  });

  it("reloads the balance from the server after a refused ledger call, and tells the game it was refused", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.placeBet.mockRejectedValueOnce(refusal(400, "Insufficient credits."));
    engine.getMe.mockResolvedValueOnce({ ...player, credits: 1000 });

    act(() => ctx.applyCreditEvent({ seq: 7, kind: "bet", amount: 10, newRound: false, alreadyDeducted: false, handTag: 1 }, report));
    expect(ctx.getCredits()).toBe(990);
    await settleQueue();

    expect(ctx.player.credits).toBe(1000);
    expect(error).toHaveBeenCalledWith("Ledger call refused; the game drops it", 7);
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(7, "rejected");
    error.mockRestore();
  });

  it("gives a refused bet's stake back on screen even when the balance reload fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx } = await signedIn();
    engine.placeBet.mockRejectedValueOnce(refusal(400, "insufficient"));
    engine.getMe.mockRejectedValueOnce(new Error("offline"));

    act(() => ctx.applyCreditEvent({ seq: 1, kind: "bet", amount: 50, newRound: false, alreadyDeducted: false }, vi.fn()));
    await settleQueue();

    expect(ctx.player.credits).toBe(1000);
    error.mockRestore();
  });

  it("logs when reloading the balance also fails, and does not touch the balance if signed out meanwhile", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx } = await signedIn();
    engine.settleRound.mockRejectedValueOnce(refusal(422, "no open round"));
    engine.getMe.mockRejectedValueOnce(new Error("still offline"));

    act(() => ctx.applyCreditEvent({ seq: 1, kind: "settle", amount: 0 }, vi.fn()));
    await settleQueue();
    expect(error).toHaveBeenCalledWith("Reloading the balance failed", expect.any(Error));

    const bet = deferred();
    engine.placeBet.mockReturnValueOnce(bet.promise);
    act(() => ctx.applyCreditEvent({ seq: 2, kind: "bet", amount: 10, newRound: true, alreadyDeducted: false, handTag: null }, vi.fn()));
    await settleQueue(); // the call is on its way
    act(() => ctx.logout());
    await act(async () => { bet.reject(refusal(400, "refused")); });
    await settleQueue();
    expect(ctx.player).toBeNull();
    error.mockRestore();
  });

  it("ignores a balance answer that arrives after signing out, and tells the game it is done", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    const bet = deferred();
    engine.placeBet.mockReturnValueOnce(bet.promise);

    act(() => ctx.applyCreditEvent({ seq: 3, kind: "bet", amount: 10, newRound: true, alreadyDeducted: false, handTag: null }, report));
    await settleQueue(); // the call is on its way
    act(() => ctx.logout());
    await act(async () => { bet.resolve({ credits: 990, openStake: 10 }); });
    await settleQueue();

    expect(ctx.player).toBeNull();
    expect(report).toHaveBeenCalledWith(3, "confirmed");
  });

  it("shows the last change as a badge that fades, and none for a zero change", async () => {
    const { ctx } = await signedIn();
    engine.settleRound.mockResolvedValue({ credits: 1000, openStake: 0 });
    vi.useFakeTimers();
    act(() => ctx.applyCreditEvent({ seq: 1, kind: "settle", amount: 0 }, vi.fn()));
    expect(ctx.creditChange).toBeNull();
    act(() => ctx.applyCreditEvent({ seq: 2, kind: "local", amount: 20 }, vi.fn()));
    expect(ctx.creditChange).toEqual({ delta: 20, seq: 1 });
    act(() => ctx.applyCreditEvent({ seq: 3, kind: "local", amount: 20 }, vi.fn()));
    expect(ctx.creditChange).toEqual({ delta: 20, seq: 2 });
    act(() => { vi.advanceTimersByTime(2500); });
    expect(ctx.creditChange).toBeNull();
  });
});

describe("ledger retries and refusals (#23)", () => {
  // Moves the fake clock, then lets every follow-up promise of the queue finish.
  const tick = (ms) => act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
  const betEvent = (seq, extra = {}) => ({ seq, kind: "bet", amount: 10, newRound: false, alreadyDeducted: false, handTag: 1, ...extra });
  const openingBet = (seq) => betEvent(seq, { newRound: true, alreadyDeducted: true, handTag: null });
  const chips = (seq) => ({ seq, kind: "local", amount: -10 }); // the chips go to the table before the deal
  let error;

  beforeEach(() => {
    vi.useFakeTimers();
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => error.mockRestore());

  it("makes one requestId per bet or settle event, different for each", async () => {
    const { ctx } = await signedIn();
    engine.placeBet.mockResolvedValue({ credits: 990 });
    engine.settleRound.mockResolvedValue({ credits: 990 });
    act(() => ctx.applyCreditEvent(openingBet(1), vi.fn()));
    act(() => ctx.applyCreditEvent(betEvent(2), vi.fn()));
    act(() => ctx.applyCreditEvent({ seq: 3, kind: "settle", amount: 20 }, vi.fn()));
    await tick(0);

    const ids = [engine.placeBet.mock.calls[0][2], engine.placeBet.mock.calls[1][2], engine.settleRound.mock.calls[0][1]];
    ids.forEach((id) => expect(id).toMatch(UUID));
    expect(new Set(ids).size).toBe(3);
  });

  it("a bet that fails once and then succeeds is charged once: the retry carries the same requestId", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    // A server that applies each requestId once and replays its answer; the first answer is lost on the way back.
    const server = { credits: 1000, applied: new Map(), lostAnswers: 1 };
    engine.placeBet.mockImplementation(async (amount, _newRound, requestId) => {
      if (!server.applied.has(requestId)) {
        server.credits -= amount;
        server.applied.set(requestId, { credits: server.credits, openStake: amount });
      }
      if (server.lostAnswers-- > 0) throw new TypeError("Failed to fetch");
      return server.applied.get(requestId);
    });

    act(() => ctx.applyCreditEvent(betEvent(5), report));
    await tick(0);
    expect(engine.placeBet).toHaveBeenCalledTimes(1);
    expect(ctx.reconnecting).toBe(true);
    expect(report).not.toHaveBeenCalled();
    expect(ctx.getCredits()).toBe(990); // shown as taken while the answer is unknown

    await tick(1000);
    expect(engine.placeBet).toHaveBeenCalledTimes(2);
    expect(engine.placeBet.mock.calls[1][2]).toBe(engine.placeBet.mock.calls[0][2]);
    expect(server.credits).toBe(990); // charged once
    expect(server.applied.size).toBe(1);
    expect(ctx.player.credits).toBe(990);
    expect(ctx.reconnecting).toBe(false);
    expect(report.mock.calls).toEqual([[5, "confirmed"]]);
  });

  it("an unknown outcome (5xx, network error, timeout) retries at 1, 2, 4, 8 s then every 8 s with Reconnecting, and is never refused", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    const failures = [refusal(503), new TypeError("Failed to fetch"), new DOMException("timed out", "TimeoutError"), refusal(500)];
    let n = 0;
    engine.placeBet.mockImplementation(async () => { throw failures[n++ % failures.length]; });

    act(() => ctx.applyCreditEvent(betEvent(1), report));
    await tick(0);
    const calls = () => engine.placeBet.mock.calls.length;
    expect([calls(), ctx.reconnecting]).toEqual([1, true]);
    // elapsed 0 s, 1, 3, 7, 15, 23, 31, 39: the attempts come at exactly these times
    for (const [wait, expected] of [[999, 1], [1, 2], [1999, 2], [1, 3], [3999, 3], [1, 4], [7999, 4], [1, 5], [7999, 5], [1, 6], [8000, 7], [8000, 8]]) {
      await tick(wait);
      expect(calls()).toBe(expected);
    }
    expect(new Set(engine.placeBet.mock.calls.map((c) => c[2])).size).toBe(1); // always the same requestId
    expect(report).not.toHaveBeenCalled(); // never refused, however long it takes
    expect(ctx.reconnecting).toBe(true);
    expect(ctx.getCredits()).toBe(990);
    expect(error).not.toHaveBeenCalled();

    engine.placeBet.mockResolvedValue({ credits: 990, openStake: 10 }); // the server is back
    await tick(8000);
    expect(report.mock.calls).toEqual([[1, "confirmed"]]);
    expect([ctx.reconnecting, ctx.player.credits]).toEqual([false, 990]);
  });

  it("408 and 429 are treated as no answer too", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.placeBet.mockRejectedValueOnce(refusal(408)).mockRejectedValueOnce(refusal(429)).mockResolvedValue({ credits: 990 });
    act(() => ctx.applyCreditEvent(betEvent(1), report));
    await tick(0);
    expect(ctx.reconnecting).toBe(true);
    await tick(3000);
    expect(report.mock.calls).toEqual([[1, "confirmed"]]);
  });

  it("a 409 is retried 4 times (1, 2, 4, 8 s) and then refused, without showing Reconnecting", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.placeBet.mockRejectedValue(refusal(409, "request in progress"));
    engine.getMe.mockResolvedValue({ ...player, credits: 1000 });

    act(() => ctx.applyCreditEvent(betEvent(9), report));
    await tick(0);
    for (const [wait, expected] of [[1000, 2], [2000, 3], [4000, 4], [8000, 5]]) {
      expect(report).not.toHaveBeenCalled();
      expect(ctx.reconnecting).toBe(false);
      await tick(wait - 1);
      expect(engine.placeBet).toHaveBeenCalledTimes(expected - 1);
      await tick(1);
      expect(engine.placeBet).toHaveBeenCalledTimes(expected);
    }
    expect(report.mock.calls).toEqual([[9, "rejected"]]);
    expect(new Set(engine.placeBet.mock.calls.map((c) => c[2])).size).toBe(1);
    expect(ctx.player.credits).toBe(1000); // the optimistic stake is undone: the balance came back from the server
    await tick(60000);
    expect(engine.placeBet).toHaveBeenCalledTimes(5);
  });

  it("a 409 that clears is confirmed", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.placeBet.mockRejectedValueOnce(refusal(409)).mockResolvedValue({ credits: 990 });
    act(() => ctx.applyCreditEvent(betEvent(1), report));
    await tick(1000);
    expect(report.mock.calls).toEqual([[1, "confirmed"]]);
  });

  it.each([[400], [422], [403]])("a %i refuses the bet at once: no retry, balance reloaded, game told", async (status) => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.placeBet.mockRejectedValue(refusal(status));
    engine.getMe.mockResolvedValue({ ...player, credits: 1000 });
    act(() => ctx.applyCreditEvent(betEvent(1), report));
    await tick(0);
    await tick(60000);
    expect(engine.placeBet).toHaveBeenCalledTimes(1);
    expect(report.mock.calls).toEqual([[1, "rejected"]]);
    expect(ctx.player.credits).toBe(1000);
    expect(ctx.reconnecting).toBe(false);
  });

  it("a refused settle reloads the balance and reports the refusal", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.settleRound.mockRejectedValue(refusal(422, "Request id reused for a different request."));
    engine.getMe.mockResolvedValue({ ...player, credits: 1000 });
    act(() => ctx.applyCreditEvent({ seq: 4, kind: "settle", amount: 20 }, report));
    expect(ctx.getCredits()).toBe(1020);
    await tick(0);
    expect(report.mock.calls).toEqual([[4, "rejected"]]);
    expect(ctx.player.credits).toBe(1000);
  });

  it("a 401 signs out as today and reports confirmed, so the round never freezes", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.placeBet.mockImplementation(async () => {
      api.setUnauthorizedHandler.mock.calls[0][0](); // what api.js does on a 401 to a signed-in request
      throw refusal(401);
    });
    act(() => ctx.applyCreditEvent(betEvent(1), report));
    await tick(0);
    expect(engine.placeBet).toHaveBeenCalledTimes(1);
    expect(ctx.player).toBeNull();
    expect(report.mock.calls).toEqual([[1, "confirmed"]]);
    expect(engine.getMe).not.toHaveBeenCalled();
    expect(ctx.reconnecting).toBe(false);
  });

  it("a 401 while retrying stops the retries and reports confirmed", async () => {
    const { ctx } = await signedIn();
    const report = vi.fn();
    engine.placeBet.mockRejectedValueOnce(refusal(502)).mockImplementation(async () => {
      api.setUnauthorizedHandler.mock.calls[0][0]();
      throw refusal(401);
    });
    act(() => ctx.applyCreditEvent(betEvent(1), report));
    await tick(1000);
    expect(report.mock.calls).toEqual([[1, "confirmed"]]);
    expect(ctx.reconnecting).toBe(false);
    await tick(30000);
    expect(engine.placeBet).toHaveBeenCalledTimes(2);
  });

  it("the queue stays serial: a retrying bet holds back the settle behind it until it is confirmed", async () => {
    const { ctx } = await signedIn();
    const order = [];
    engine.placeBet.mockRejectedValueOnce(refusal(503)).mockImplementation(async () => { order.push("bet"); return { credits: 980 }; });
    engine.settleRound.mockImplementation(async () => { order.push("settle"); return { credits: 1020 }; });
    act(() => ctx.applyCreditEvent(betEvent(1), vi.fn()));
    act(() => ctx.applyCreditEvent({ seq: 2, kind: "settle", amount: 40 }, vi.fn()));
    await tick(0);
    await tick(999);
    expect(engine.settleRound).not.toHaveBeenCalled();
    await tick(1);
    expect(order).toEqual(["bet", "settle"]);
    expect(ctx.player.credits).toBe(1020);
  });

  describe("after a refused opening bet", () => {
    it("later queued bets of that round are reported refused without being sent, and their stakes are undone", async () => {
      const { ctx } = await signedIn();
      const report = vi.fn();
      engine.placeBet.mockRejectedValue(refusal(400, "Insufficient credits."));
      engine.getMe.mockResolvedValue({ ...player, credits: 1000 });

      act(() => ctx.applyCreditEvent({ seq: 1, kind: "local", amount: -10 }, report));
      act(() => ctx.applyCreditEvent(openingBet(2), report));
      act(() => ctx.applyCreditEvent(betEvent(3), report)); // a double
      act(() => ctx.applyCreditEvent(betEvent(4, { amount: 20 }), report)); // and a split, say
      expect(ctx.getCredits()).toBe(960);
      await tick(0);

      expect(engine.placeBet).toHaveBeenCalledTimes(1);
      expect(report.mock.calls).toEqual([[2, "rejected"], [3, "rejected"], [4, "rejected"]]);
      expect(ctx.player.credits).toBe(1000); // the chips were never taken and the later stakes are undone
      expect(ctx.getCredits()).toBe(1000);
    });

    it("also rejects a bet that is queued after the refusal was handled, until the next round's opening bet", async () => {
      const { ctx } = await signedIn();
      const report = vi.fn();
      engine.placeBet.mockRejectedValueOnce(refusal(400)).mockResolvedValue({ credits: 980, openStake: 20 });
      engine.getMe.mockResolvedValue({ ...player, credits: 1000 });
      act(() => ctx.applyCreditEvent(chips(0), report));
      act(() => ctx.applyCreditEvent(openingBet(1), report));
      await tick(0);
      act(() => ctx.applyCreditEvent(betEvent(2), report));
      await tick(0);
      expect(engine.placeBet).toHaveBeenCalledTimes(1);
      expect(report.mock.calls).toEqual([[1, "rejected"], [2, "rejected"]]);
      expect(ctx.player.credits).toBe(1000);

      // the next round starts with a new opening bet, which clears the flag
      act(() => ctx.applyCreditEvent(chips(0), report));
      act(() => ctx.applyCreditEvent(openingBet(3), report));
      act(() => ctx.applyCreditEvent(betEvent(4), report));
      await tick(0);
      expect(engine.placeBet).toHaveBeenCalledTimes(3);
      expect(report.mock.calls.slice(2)).toEqual([[3, "confirmed"], [4, "confirmed"]]);
    });

    it("a settle is still sent (the flag only stops stakes), and a refused newRound:false bet does not set it", async () => {
      const { ctx } = await signedIn();
      const report = vi.fn();
      engine.placeBet.mockRejectedValueOnce(refusal(400)).mockResolvedValue({ credits: 990 });
      engine.settleRound.mockResolvedValue({ credits: 1000 });
      engine.getMe.mockResolvedValue({ ...player, credits: 1000 });
      act(() => ctx.applyCreditEvent(betEvent(1), report)); // a double refused: the round goes on
      act(() => ctx.applyCreditEvent(betEvent(2), report));
      act(() => ctx.applyCreditEvent({ seq: 3, kind: "settle", amount: 20 }, report));
      await tick(0);
      expect(engine.placeBet).toHaveBeenCalledTimes(2);
      expect(engine.settleRound).toHaveBeenCalledOnce();
      expect(report.mock.calls).toEqual([[1, "rejected"], [2, "confirmed"], [3, "confirmed"]]);
    });

    it("stops quietly if the player signs out before a skipped bet's turn", async () => {
      const { ctx } = await signedIn();
      const report = vi.fn();
      const opening = deferred();
      engine.placeBet.mockReturnValueOnce(opening.promise);
      act(() => ctx.applyCreditEvent(chips(0), report));
      act(() => ctx.applyCreditEvent(openingBet(1), report));
      act(() => ctx.applyCreditEvent(betEvent(2), report));
      await tick(0); // the opening bet is on its way
      act(() => ctx.logout());
      await act(async () => { opening.reject(refusal(400)); });
      await tick(0);
      expect(engine.placeBet).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledWith(2, "confirmed"); // dropped, not refused
      expect(ctx.player).toBeNull();
    });
  });

  describe("when the player changes", () => {
    it("drops a queued call, reporting confirmed, if the token changed before its turn", async () => {
      const { ctx } = await signedIn();
      const report = vi.fn();
      const first = deferred();
      api.getToken.mockReturnValue("token-a");
      engine.placeBet.mockReturnValueOnce(first.promise).mockResolvedValue({ credits: 1 });
      act(() => ctx.applyCreditEvent(betEvent(1), report));
      act(() => ctx.applyCreditEvent(betEvent(2), report));
      await tick(0); // the first call is on its way
      api.getToken.mockReturnValue("token-b"); // somebody else signed in
      await act(async () => { first.resolve({ credits: 990 }); });
      await tick(0);

      expect(engine.placeBet).toHaveBeenCalledOnce(); // A's second bet is never charged to B
      expect(report.mock.calls).toEqual([[1, "confirmed"], [2, "confirmed"]]);
      expect(ctx.player.credits).toBe(980); // neither answer was applied: only the two optimistic stakes show
    });

    it("stops retrying and reports confirmed when the token changes while it waits", async () => {
      const { ctx } = await signedIn();
      const report = vi.fn();
      api.getToken.mockReturnValue("token-a");
      engine.placeBet.mockRejectedValue(refusal(503));
      act(() => ctx.applyCreditEvent(betEvent(1), report));
      await tick(0);
      expect(ctx.reconnecting).toBe(true);
      api.getToken.mockReturnValue("token-b");
      await tick(1000);
      expect(engine.placeBet).toHaveBeenCalledTimes(1);
      expect(report.mock.calls).toEqual([[1, "confirmed"]]);
      expect(ctx.reconnecting).toBe(false);
    });

    it("stops retrying when the player signs out while it waits", async () => {
      const { ctx } = await signedIn();
      const report = vi.fn();
      engine.placeBet.mockRejectedValue(refusal(503));
      act(() => ctx.applyCreditEvent(betEvent(1), report));
      await tick(0);
      act(() => ctx.logout());
      await tick(1000);
      await tick(30000);
      expect(engine.placeBet).toHaveBeenCalledTimes(1);
      expect(report.mock.calls).toEqual([[1, "confirmed"]]);
    });

    // BUG (source, PlayerProvider.enqueue / ledgerCall): a definite refusal (4xx) skips the shouldStop check, so A's
    // answer arriving after B signed in still runs `pendingRef -= optimistic` on B's session and shows B a wrong balance.
    it("a refusal for the previous player's call, arriving after somebody else signed in, leaves the new balance alone", async () => {
      const { ctx } = await signedIn();
      const bet = deferred();
      api.getToken.mockReturnValue("token-a");
      engine.placeBet.mockReturnValueOnce(bet.promise);
      act(() => ctx.applyCreditEvent(betEvent(1), vi.fn())); // A's double: -10 optimistic
      await tick(0); // the call is on its way
      act(() => ctx.logout());
      api.getToken.mockReturnValue("token-b");
      engine.loginPlayer.mockResolvedValue({ ...player, userName: "other", credits: 500 });
      await act(async () => { await ctx.login({}); });
      await act(async () => { bet.reject(refusal(400)); });
      await tick(0);

      engine.settleRound.mockResolvedValue({ credits: 500 });
      act(() => ctx.applyCreditEvent({ seq: 2, kind: "settle", amount: 0 }, vi.fn()));
      await tick(0);
      expect(ctx.player.credits).toBe(500);
    });
  });

  it("exposes reconnecting only while a call has no answer", async () => {
    const { ctx } = await signedIn();
    expect(ctx.reconnecting).toBe(false);
    engine.placeBet.mockRejectedValueOnce(refusal(500)).mockResolvedValue({ credits: 990 });
    act(() => ctx.applyCreditEvent(betEvent(1), vi.fn()));
    await tick(0);
    expect(ctx.reconnecting).toBe(true);
    await tick(1000);
    expect(ctx.reconnecting).toBe(false);
  });
});
