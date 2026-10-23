import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { newRequestId, sendLedgerCall } from "../ledgerCall";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const failure = (status) => Object.assign(new Error(`failed ${status}`), { status });

describe("newRequestId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses crypto.randomUUID when it exists", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555" });
    expect(newRequestId()).toBe("11111111-2222-4333-8444-555555555555");
    vi.unstubAllGlobals();
    expect(newRequestId()).toMatch(V4);
  });

  it("falls back to a v4 id from getRandomValues where randomUUID is missing (plain http on a LAN address)", () => {
    const bytes = (fill) => (array) => array.fill(fill);
    vi.stubGlobal("crypto", { getRandomValues: bytes(0xff) });
    expect(newRequestId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff"); // version and variant bits forced
    vi.stubGlobal("crypto", { getRandomValues: bytes(0x00) });
    expect(newRequestId()).toBe("00000000-0000-4000-8000-000000000000");
    vi.stubGlobal("crypto", { getRandomValues: (array) => array.map((_, i) => i * 17) });
    expect(newRequestId()).toMatch(V4);
  });

  it("makes a different id each time", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });
});

describe("sendLedgerCall", () => {
  let onReconnecting;
  let stop;
  const send = (call) => sendLedgerCall(call, { shouldStop: () => stop, onReconnecting });
  // Lets the call and its follow-ups run, then moves the fake clock.
  const after = (ms) => vi.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    vi.useFakeTimers();
    onReconnecting = vi.fn();
    stop = false;
  });
  afterEach(() => vi.useRealTimers());

  it("200 is confirmed, with the server's answer, after one attempt", async () => {
    const call = vi.fn().mockResolvedValue({ credits: 990, openStake: 10 });
    expect(await send(call)).toEqual({ outcome: "confirmed", res: { credits: 990, openStake: 10 } });
    expect(call).toHaveBeenCalledTimes(1);
    expect(onReconnecting).not.toHaveBeenCalled();
  });

  it.each([400, 404, 422, 403])("%i is a definite no: rejected at once, never retried", async (status) => {
    const call = vi.fn().mockRejectedValue(failure(status));
    expect(await send(call)).toEqual({ outcome: "rejected" });
    expect(call).toHaveBeenCalledTimes(1);
    expect(onReconnecting).not.toHaveBeenCalled();
  });

  it.each([408, 429])("%i means try again later, so it is unknown and never rejected", async (status) => {
    const call = vi.fn().mockRejectedValueOnce(failure(status)).mockResolvedValue({ credits: 1 });
    const result = send(call);
    await after(1000);
    expect(await result).toEqual({ outcome: "confirmed", res: { credits: 1 } });
    expect(onReconnecting).toHaveBeenCalledWith(true);
  });

  it("a 409 is retried after 1, 2, 4 and 8 s and is rejected when the fifth attempt still clashes", async () => {
    const call = vi.fn().mockRejectedValue(failure(409));
    const result = send(call);
    const outcome = vi.fn();
    result.then(outcome);
    await after(0);
    expect(call).toHaveBeenCalledTimes(1);
    for (const [wait, calls] of [[999, 1], [1, 2], [2000, 3], [4000, 4], [7999, 4], [1, 5]]) {
      await after(wait);
      expect(call).toHaveBeenCalledTimes(calls);
    }
    expect(outcome).toHaveBeenCalledWith({ outcome: "rejected" });
    expect(onReconnecting).not.toHaveBeenCalled(); // a clash is an answer, not silence
    await after(60000);
    expect(call).toHaveBeenCalledTimes(5);
  });

  it("a 409 that clears on a retry is confirmed", async () => {
    const call = vi.fn().mockRejectedValueOnce(failure(409)).mockResolvedValue({ credits: 5 });
    const result = send(call);
    await after(1000);
    expect(await result).toEqual({ outcome: "confirmed", res: { credits: 5 } });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a 5xx", failure(503)],
    ["a network error", new TypeError("Failed to fetch")],
    ["a timeout", new DOMException("signal timed out", "TimeoutError")],
  ])("%s keeps retrying after 1, 2, 4, 8, 8, 8 s with Reconnecting, and is never rejected", async (_name, error) => {
    const call = vi.fn().mockRejectedValue(error);
    const outcome = vi.fn();
    send(call).then(outcome);
    await after(0);
    expect(call).toHaveBeenCalledTimes(1);
    expect(onReconnecting).toHaveBeenCalledWith(true);
    for (const [wait, calls] of [[999, 1], [1, 2], [1999, 2], [1, 3], [4000, 4], [8000, 5], [7999, 5], [1, 6], [8000, 7], [8000, 8]]) {
      await after(wait);
      expect(call).toHaveBeenCalledTimes(calls);
    }
    expect(outcome).not.toHaveBeenCalled();

    call.mockResolvedValue({ credits: 7 }); // the server is back; the next attempt answers
    await after(8000);
    expect(outcome).toHaveBeenCalledWith({ outcome: "confirmed", res: { credits: 7 } });
  });

  it("a clash and silence are counted separately, each with its own schedule", async () => {
    const call = vi.fn().mockRejectedValueOnce(failure(409)).mockRejectedValueOnce(failure(500)).mockResolvedValue({ credits: 2 });
    const result = send(call);
    await after(1000); // the 409's wait
    await after(1000); // the first silence waits 1 s as well
    expect(await result).toEqual({ outcome: "confirmed", res: { credits: 2 } });
  });

  it("401 signs out as today: dropped at once, never retried", async () => {
    const call = vi.fn().mockRejectedValue(failure(401));
    expect(await send(call)).toEqual({ outcome: "dropped" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("401 while retrying stops the retries", async () => {
    const call = vi.fn().mockRejectedValueOnce(failure(500)).mockRejectedValue(failure(401));
    const result = send(call);
    await after(1000);
    expect(await result).toEqual({ outcome: "dropped" });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("is dropped without calling when the player already changed", async () => {
    stop = true;
    const call = vi.fn();
    expect(await send(call)).toEqual({ outcome: "dropped" });
    expect(call).not.toHaveBeenCalled();
  });

  it("stops retrying when the player changes while it waits", async () => {
    const call = vi.fn().mockRejectedValue(failure(500));
    const result = send(call);
    await after(0);
    stop = true;
    await after(1000);
    expect(await result).toEqual({ outcome: "dropped" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("does not report an answer that arrives after the player changed", async () => {
    let answer;
    const call = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    const result = send(call);
    stop = true;
    answer({ credits: 1 });
    expect(await result).toEqual({ outcome: "dropped" });
  });
});
