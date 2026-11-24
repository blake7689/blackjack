import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizePlayer, getMe, loginPlayer, registerPlayer, updateProfile, changePassword,
  deleteMe, logoutPlayer, placeBet, settleRound, topUp, getSettings, saveSettings,
} from "../playerEngine";
import { getToken, setToken, clearToken, apiGet } from "../api";

const profile = { userName: "tester", email: "t@example.com", firstName: "T", lastName: null, credits: 1000 };

let fetchMock;
const call = (i = -1) => {
  const [url, init] = fetchMock.mock.calls.at(i);
  return { url, method: init.method, body: init.body && JSON.parse(init.body), auth: init.headers.Authorization };
};
const respond = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(() => {
  sessionStorage.clear();
  // Token endpoints answer with a bearer token; everything else with the profile.
  fetchMock = vi.fn(async (url) => respond(url.includes("/auth/") ? { tokenType: "Bearer", accessToken: "tok-1" } : profile));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("profile", () => {
  it("normalizePlayer turns missing names into empty strings and credits into a number", () => {
    expect(normalizePlayer({ userName: "u", email: "e", firstName: null, credits: "12.5" }))
      .toEqual({ userName: "u", email: "e", firstName: "", lastName: "", credits: 12.5 });
  });

  it("getMe reads the signed-in player's profile with the token", async () => {
    setToken("tok-9");
    expect(await getMe()).toEqual({ ...profile, lastName: "" });
    expect(call()).toMatchObject({ method: "GET", auth: "Bearer tok-9" });
    expect(call().url).toMatch(/\/player\/me$/);
  });
});

describe("signing in", () => {
  it("loginPlayer stores the token, then loads the profile with it", async () => {
    const p = await loginPlayer({ usernameOrEmail: "tester", password: "secret1" });

    expect(call(0)).toMatchObject({ method: "POST", body: { usernameOrEmail: "tester", password: "secret1" } });
    expect(call(0).url).toMatch(/\/auth\/login$/);
    expect(getToken()).toBe("tok-1");
    expect(call(1).auth).toBe("Bearer tok-1");
    expect(p).not.toHaveProperty("password");
    expect(p.credits).toBe(1000);
  });

  it("registerPlayer never sends a balance and sends blank names as null", async () => {
    await registerPlayer({ userName: "n", email: "n@example.com", password: "secret1", firstName: "", lastName: "L", credits: 1e9 });

    expect(call(0).url).toMatch(/\/auth\/register$/);
    expect(call(0).body).toEqual({ userName: "n", email: "n@example.com", password: "secret1", firstName: null, lastName: "L" });
    expect(getToken()).toBe("tok-1");
    await registerPlayer({ userName: "m", email: "m@example.com", password: "secret1", firstName: "F", lastName: "" });
    expect(call(-2).body).toMatchObject({ firstName: "F", lastName: null });
  });

  it("logoutPlayer and deleteMe drop the token", async () => {
    setToken("tok-2");
    logoutPlayer();
    expect(getToken()).toBeNull();

    setToken("tok-3");
    fetchMock.mockResolvedValueOnce(respond(null, 204));
    await deleteMe();
    expect(call()).toMatchObject({ method: "DELETE", auth: "Bearer tok-3" });
    expect(getToken()).toBeNull();
  });
});

describe("timeouts (#75)", () => {
  // Every fetch gets one AbortSignal.timeout(ms); the list is the timeout each call asked for, in order.
  const timeouts = async (run) => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    await run();
    const ms = spy.mock.calls.map(([t]) => t);
    spy.mockRestore();
    return ms;
  };

  it("session restore, login and signup wait 90 s (post and follow-up getMe), for a cold API start", async () => {
    expect(await timeouts(() => getMe(90000))).toEqual([90000]);
    expect(await timeouts(() => getMe())).toEqual([10000]); // a balance reload inside the ledger queue
    expect(await timeouts(() => loginPlayer({ usernameOrEmail: "t", password: "secret1" }))).toEqual([90000, 90000]);
    expect(await timeouts(() => registerPlayer({ userName: "n", email: "n@example.com", password: "secret1", firstName: "F", lastName: "L" }))).toEqual([90000, 90000]);
  });

  it("ledger, settings and account calls keep the 10 s default", async () => {
    expect(await timeouts(() => placeBet(10, true, "id-1"))).toEqual([10000]);
    expect(await timeouts(() => settleRound(25, "id-2"))).toEqual([10000]);
    expect(await timeouts(getSettings)).toEqual([10000]);
    expect(await timeouts(() => saveSettings({ v: 1 }))).toEqual([10000]);
    expect(await timeouts(() => updateProfile({ userName: "r", email: "r@example.com", firstName: "R", lastName: "" }))).toEqual([10000]);
  });
});

describe("account changes", () => {
  it("updateProfile sends the profile without a password or balance", async () => {
    const p = await updateProfile({ userName: "renamed", email: "r@example.com", firstName: "R", lastName: "" });

    expect(call()).toMatchObject({ method: "PUT", body: { userName: "renamed", email: "r@example.com", firstName: "R", lastName: null } });
    expect(p.userName).toBe("tester");
    await updateProfile({ userName: "renamed", email: "r@example.com", firstName: "", lastName: "L" });
    expect(call().body).toMatchObject({ firstName: null, lastName: "L" });
  });

  it("changePassword sends the current and the new password", async () => {
    setToken("tok-old");
    fetchMock.mockResolvedValueOnce(respond(null, 204));
    await changePassword("old-pass", "new-pass1", "tester");

    expect(call(0)).toMatchObject({ method: "PUT", body: { currentPassword: "old-pass", newPassword: "new-pass1" }, auth: "Bearer tok-old" });
    expect(call(0).url).toMatch(/\/player\/me\/password$/);
  });
});

describe("changePassword signs in again (#171)", () => {
  const gate = () => {
    let open;
    const promise = new Promise((resolve) => { open = resolve; });
    return { promise, open };
  };

  it("logs in with the new password and keeps the new token; resolves false", async () => {
    setToken("tok-old");
    fetchMock
      .mockResolvedValueOnce(respond(null, 204))
      .mockResolvedValueOnce(respond({ tokenType: "Bearer", accessToken: "tok-new" }));

    expect(await changePassword("old-pass", "new-pass1", "tester")).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call(1)).toMatchObject({ method: "POST", body: { usernameOrEmail: "tester", password: "new-pass1" } });
    expect(call(1).url).toMatch(/\/auth\/login$/);
    expect(getToken()).toBe("tok-new");
  });

  it("the login waits as long as a cold start, and the PUT keeps the 10 s default", async () => {
    setToken("tok-old");
    const spy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValueOnce(respond(null, 204)).mockResolvedValueOnce(respond({ accessToken: "tok-new" }));
    await changePassword("old-pass", "new-pass1", "tester");
    expect(spy.mock.calls.map(([t]) => t)).toEqual([10000, 90000]);
    spy.mockRestore();
  });

  it("a failed login clears the token and resolves true, so the caller signs out", async () => {
    setToken("tok-old");
    fetchMock.mockResolvedValueOnce(respond(null, 204)).mockResolvedValueOnce(respond({ message: "down" }, 500));

    expect(await changePassword("old-pass", "new-pass1", "tester")).toBe(true);
    expect(getToken()).toBeNull();
  });

  it("a refused password change throws, keeps the old token, and releases the gate", async () => {
    setToken("tok-old");
    fetchMock.mockResolvedValueOnce(respond({ message: "Incorrect password." }, 400));

    await expect(changePassword("wrong", "new-pass1", "tester")).rejects.toThrow("Incorrect password.");
    expect(fetchMock).toHaveBeenCalledOnce(); // no login attempt
    expect(getToken()).toBe("tok-old");
    fetchMock.mockResolvedValueOnce(respond(profile));
    await apiGet("/player/me"); // not held by a stuck gate
    expect(call().auth).toBe("Bearer tok-old");
  });

  it("signing out while the change is in flight: no login, no token", async () => {
    setToken("tok-old");
    const put = gate();
    fetchMock.mockImplementationOnce(async () => { await put.promise; return respond(null, 204); });

    const changing = changePassword("old-pass", "new-pass1", "tester");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    clearToken(); // logout (or a 401) meanwhile
    put.open();

    expect(await changing).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce(); // never signed in again
    expect(getToken()).toBeNull();
  });

  it("holds other requests until the new token is stored, then sends them with it", async () => {
    setToken("tok-old");
    const put = gate();
    fetchMock
      .mockImplementationOnce(async () => { await put.promise; return respond(null, 204); })
      .mockResolvedValueOnce(respond({ accessToken: "tok-new" }));
    const changing = changePassword("old-pass", "new-pass1", "tester");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    fetchMock.mockResolvedValueOnce(respond({ credits: 990 }));
    const queued = placeBet(10, false, "id-1");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce(); // the bet is waiting
    put.open();
    await changing;
    await queued;

    expect(call(2).url).toMatch(/\/ledger\/bet$/);
    expect(call(2).auth).toBe("Bearer tok-new");
  });
});

describe("ledger", () => {
  it("placeBet and settleRound post to the ledger and return the server's balance", async () => {
    fetchMock.mockResolvedValueOnce(respond({ credits: 990, openStake: 10 }));
    expect(await placeBet(10, true, "id-1")).toEqual({ credits: 990, openStake: 10 });
    expect(call()).toMatchObject({ method: "POST", body: { amount: 10, newRound: true, requestId: "id-1" } });
    expect(call().url).toMatch(/\/ledger\/bet$/);

    fetchMock.mockResolvedValueOnce(respond({ credits: 1015, openStake: 0 }));
    expect(await settleRound(25, "id-2")).toEqual({ credits: 1015, openStake: 0 });
    expect(call().url).toMatch(/\/ledger\/settle$/);
    expect(call().body).toEqual({ payout: 25, requestId: "id-2" });
  });

  it("topUp posts the code and requestId to the ledger", async () => {
    fetchMock.mockResolvedValueOnce(respond({ credits: 10050 }));
    expect(await topUp("dummy-code-123", "id-3")).toEqual({ credits: 10050 });
    expect(call()).toMatchObject({ method: "POST", body: { code: "dummy-code-123", requestId: "id-3" } });
    expect(call().url).toMatch(/\/ledger\/topup$/);
  });
});

describe("settings", () => {
  it("getSettings reads and saveSettings replaces the signed-in player's saved settings", async () => {
    setToken("tok-9");
    fetchMock.mockResolvedValueOnce(respond({ v: 1, deckCount: 4 }));
    expect(await getSettings()).toEqual({ v: 1, deckCount: 4 });
    expect(call()).toMatchObject({ method: "GET", auth: "Bearer tok-9" });
    expect(call().url).toMatch(/\/player\/me\/settings$/);

    fetchMock.mockResolvedValueOnce(respond(null, 204));
    await saveSettings({ v: 1, deckCount: 3 });
    expect(call()).toMatchObject({ method: "PUT", body: { v: 1, deckCount: 3 }, auth: "Bearer tok-9" });
    expect(call().url).toMatch(/\/player\/me\/settings$/);
  });
});
