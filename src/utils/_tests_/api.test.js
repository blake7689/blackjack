import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiGet, apiPost, apiPut, apiDelete, getToken, setToken, clearToken, setUnauthorizedHandler } from "../api";

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

  it("adds the bearer token when signed in", async () => {
    const fetch = respond({});
    setToken("tok-1");
    await apiGet("/x");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-1");
  });
});

describe("errors", () => {
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
