import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiGet, apiPost, apiPut, apiDelete, getToken, setToken, clearToken, setUnauthorizedHandler, swapToken, COLD_START_TIMEOUT_MS } from "../api";

const respond = (res) => {
  const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: 1 }), text: async () => "", ...res }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setUnauthorizedHandler(() => {});
});

describe("requests", () => {
  it("sends JSON and returns the parsed body", async () => {
    const fetch = respond({});
    expect(await apiPost("/x", { a: 1 })).toEqual({ ok: 1 });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: '{"a":1}' });
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });

  it("returns null for 204 or a body that is not JSON", async () => {
    respond({ status: 204 });
    expect(await apiPut("/x", {})).toBeNull();
    respond({ json: async () => { throw new Error("empty"); } });
    expect(await apiGet("/x")).toBeNull();
  });

  it("sends no body for GET and DELETE", async () => {
    const fetch = respond({});
    await apiGet("/x");
    await apiDelete("/x");
    expect(fetch.mock.calls.map(([, init]) => [init.method, init.body])).toEqual([["GET", undefined], ["DELETE", undefined]]);
  });

  it("a DELETE sends its body as JSON when given one (the account delete, BlackJackAPI#71)", async () => {
    const fetch = respond({});
    await apiDelete("/x", { currentPassword: " p w " });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "DELETE", body: '{"currentPassword":" p w "}' });
    expect(fetch.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
  });

  it("adds the bearer token when signed in", async () => {
    const fetch = respond({});
    setToken("tok-1");
    await apiGet("/x");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-1");
  });
});

describe("timeout", () => {
  it("gives every request a 10 s abort signal, so a call with no answer fails instead of hanging", async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetch = respond({});
    for (const send of [apiGet, apiDelete, (url) => apiPost(url, {}), (url) => apiPut(url, {})]) await send("/x");
    expect(timeout).toHaveBeenCalledTimes(4);
    expect(timeout.mock.calls).toEqual([[10000], [10000], [10000], [10000]]);
    expect(fetch.mock.calls.map(([, init]) => init.signal)).toEqual([signal, signal, signal, signal]);
  });

  it("a call can ask for a longer timeout, and the cold-start one is 90 s", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    respond({});
    await apiGet("/x", COLD_START_TIMEOUT_MS);
    await apiPost("/x", {}, 5000);
    expect(COLD_START_TIMEOUT_MS).toBe(90000);
    expect(timeout.mock.calls).toEqual([[90000], [5000]]);
  });

  it("a timed-out or dropped request rejects without a status, which callers treat as unknown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("signal timed out", "TimeoutError"); }));
    const error = await apiPost("/x", {}).catch((e) => e);
    expect(error.name).toBe("TimeoutError");
    expect(error.status).toBeUndefined();
  });
});

describe("errors", () => {
  it("carries the HTTP status on the error, so a refusal can be told from a network failure", async () => {
    for (const status of [400, 401, 409, 422, 500, 503]) {
      respond({ ok: false, status, text: async () => JSON.stringify({ message: "no" }) });
      const error = await apiPost("/x", {}).catch((e) => e);
      expect([error.message, error.status]).toEqual(["no", status]);
    }
  });

  it("a 429 also carries the Retry-After header as retryAfter; other statuses do not (#90)", async () => {
    const headers = (v) => ({ get: (name) => (name === "Retry-After" ? v : null) });
    respond({ ok: false, status: 429, headers: headers("600"), text: async () => "{}" });
    expect(await apiPost("/x", {}).catch((e) => e)).toMatchObject({ status: 429, retryAfter: "600" });

    respond({ ok: false, status: 429, headers: headers(null), text: async () => "{}" });
    const bare = await apiPost("/x", {}).catch((e) => e);
    expect([bare.status, bare.retryAfter]).toEqual([429, null]);

    for (const status of [400, 409, 500]) {
      respond({ ok: false, status, headers: headers("600"), text: async () => "{}" });
      expect(await apiPost("/x", {}).catch((e) => e)).not.toHaveProperty("retryAfter");
    }
  });

  it("shows the API's specific errors, then its message, then the raw text, then a default", async () => {
    respond({ ok: false, status: 400, text: async () => JSON.stringify({ message: "Registration failed.", errors: ["Username 'x' is already taken."] }) });
    await expect(apiPost("/x", {})).rejects.toThrow("Username 'x' is already taken.");

    respond({ ok: false, status: 400, text: async () => JSON.stringify({ message: "Validation failed.", errors: [{ field: "Email", errors: ["Invalid email format."] }, { field: "X" }] }) });
    await expect(apiPost("/x", {})).rejects.toThrow("Invalid email format.");

    respond({ ok: false, status: 400, text: async () => JSON.stringify({ message: "Insufficient credits." }) });
    await expect(apiPost("/x", {})).rejects.toThrow("Insufficient credits.");

    respond({ ok: false, status: 401, text: async () => "Invalid username/email or password." });
    await expect(apiPost("/x", {})).rejects.toThrow("Invalid username/email or password.");

    respond({ ok: false, status: 500 });
    await expect(apiDelete("/Player/1")).rejects.toThrow("DELETE /Player/1 failed");
  });

  it("signs out on a 401 to a signed-in request, but not on a failed login", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    respond({ ok: false, status: 401 });
    await expect(apiPost("/auth/login", {})).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();

    setToken("expired");
    await expect(apiGet("/player/me")).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
  });
});

// A fetch whose answers the test hands out one by one: calls[i].resolve(res) answers the i-th request.
function controlled() {
  const calls = [];
  const fetch = vi.fn((url, init) => new Promise((resolve) => { calls.push({ init, resolve }); }));
  vi.stubGlobal("fetch", fetch);
  return { fetch, calls };
}
const ok = (body = { ok: 1 }) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });
const unauthorized = { ok: false, status: 401, text: async () => "{}" };
const gate = () => {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
};
const auth = (call) => call.init.headers.Authorization;

describe("password change token swap (#171)", () => {
  it("makes requests wait while the swap runs, then sends them with the new token", async () => {
    const fetch = respond({});
    setToken("old");
    const hold = gate();
    const swap = swapToken(async () => { await hold.promise; setToken("new"); return "swapped"; });

    const waiting = apiGet("/x");
    await Promise.resolve();
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled(); // gated: nothing goes out with the old token
    hold.open();
    expect(await swap).toBe("swapped");
    await waiting;
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer new");
  });

  it("lets the swap's own calls (ungated) through, and requests pass freely once it is over", async () => {
    const fetch = respond({});
    setToken("old");
    const hold = gate();
    const swap = swapToken(async () => {
      await apiPut("/p", {}, true);
      await apiPost("/q", {}, undefined, true);
      await hold.promise;
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls.map(([url]) => url.split("/").pop())).toEqual(["p", "q"]);
    hold.open();
    await swap;
    await apiGet("/x");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("releases the gate when the swap throws, and passes the error on", async () => {
    const fetch = respond({});
    await expect(swapToken(async () => { throw new Error("nope"); })).rejects.toThrow("nope");
    await apiGet("/x");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("a 401 for the old token that arrives during the swap waits and retries once with the new token, without signing out", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const { calls, fetch } = controlled();
    setToken("old");
    const sent = apiGet("/x");
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(auth(calls[0])).toBe("Bearer old");

    const hold = gate();
    const swap = swapToken(async () => { await hold.promise; setToken("new"); });
    calls[0].resolve(unauthorized); // the revoked token was refused while the swap runs
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledOnce(); // still waiting for the swap
    hold.open();
    await swap;
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(auth(calls[1])).toBe("Bearer new");
    calls[1].resolve(ok({ done: true }));

    expect(await sent).toEqual({ done: true });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(getToken()).toBe("new");
  });

  it("a 401 for the old token that arrives after the swap is over retries once with the new token", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const { calls } = controlled();
    setToken("old");
    const sent = apiPut("/x", { a: 1 });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await swapToken(async () => setToken("new"));
    calls[0].resolve(unauthorized);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(auth(calls[1])).toBe("Bearer new");
    expect(calls[1].init.body).toBe('{"a":1}'); // the retry repeats the same request
    calls[1].resolve(ok());

    await sent;
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(getToken()).toBe("new");
  });

  it("when the swap ends with no new token, the request throws and neither clears nor signs out again", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const { calls, fetch } = controlled();
    setToken("old");
    const sent = apiGet("/x");
    sent.catch(() => {});
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const hold = gate();
    const swap = swapToken(async () => { await hold.promise; clearToken(); });
    calls[0].resolve(unauthorized);
    hold.open();
    await swap;

    await expect(sent).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledOnce(); // no retry
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("a swap that leaves the token unchanged is a normal 401: no retry, token cleared, signed out", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const { calls, fetch } = controlled();
    setToken("old");
    const sent = apiGet("/x");
    sent.catch(() => {});
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const hold = gate();
    const swap = swapToken(() => hold.promise);
    calls[0].resolve(unauthorized);
    hold.open();
    await swap;

    await expect(sent).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
  });

  it("a 401 on the retry itself signs out (it retries only once)", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const { calls, fetch } = controlled();
    setToken("old");
    const sent = apiGet("/x");
    sent.catch(() => {});
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await swapToken(async () => setToken("new"));
    calls[0].resolve(unauthorized);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1].resolve(unauthorized);

    await expect(sent).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
  });

  it("the swap's own ungated calls are never retried on a 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const fetch = respond({ ok: false, status: 401, text: async () => "{}" });
    setToken("old");
    await expect(swapToken(() => apiPut("/p", {}, true))).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("a 401 outside any swap still clears the token and signs out (no retry)", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const fetch = respond({ ok: false, status: 401, text: async () => "{}" });
    setToken("tok");
    await expect(apiGet("/x")).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
  });
});

describe("default 401 handler", () => {
  it("clears the token even when nothing is listening", async () => {
    vi.resetModules();
    const fresh = await import("../api");
    respond({ ok: false, status: 401 });
    fresh.setToken("expired");
    await expect(fresh.apiGet("/player/me")).rejects.toThrow();
    expect(fresh.getToken()).toBeNull();
  });
});

describe("token storage", () => {
  it("keeps the token in sessionStorage", () => {
    setToken("tok-2");
    expect(getToken()).toBe("tok-2");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("copes when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });

    expect(() => setToken("tok-3")).not.toThrow();
    expect(getToken()).toBeNull();
    expect(() => clearToken()).not.toThrow();
  });
});
