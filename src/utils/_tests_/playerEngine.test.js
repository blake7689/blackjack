import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizePlayer, getMe, loginPlayer, registerPlayer, updateProfile, changePassword,
  deleteMe, logoutPlayer, placeBet, settleRound, getSettings, saveSettings,
} from "../playerEngine";
import { getToken, setToken } from "../api";

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

describe("account changes", () => {
  it("updateProfile sends the profile without a password or balance", async () => {
    const p = await updateProfile({ userName: "renamed", email: "r@example.com", firstName: "R", lastName: "" });

    expect(call()).toMatchObject({ method: "PUT", body: { userName: "renamed", email: "r@example.com", firstName: "R", lastName: null } });
    expect(p.userName).toBe("tester");
    await updateProfile({ userName: "renamed", email: "r@example.com", firstName: "", lastName: "L" });
    expect(call().body).toMatchObject({ firstName: null, lastName: "L" });
  });

  it("changePassword sends the current and the new password", async () => {
    fetchMock.mockResolvedValueOnce(respond(null, 204));
    await changePassword("old-pass", "new-pass");

    expect(call()).toMatchObject({ method: "PUT", body: { currentPassword: "old-pass", newPassword: "new-pass" } });
    expect(call().url).toMatch(/\/player\/me\/password$/);
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
