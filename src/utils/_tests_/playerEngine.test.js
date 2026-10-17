import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizePlayer, loginPlayer, updatePlayerApi, updateCreditsApi } from "../playerEngine";

const player = {
  playerId: 7, userName: "player", email: "p@example.com",
  firstName: "P", lastName: "Q", credits: 100, inActive: null,
};

let fetchMock;
const sentBody = () => JSON.parse(fetchMock.mock.calls.at(-1)[1].body);

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...player, password: "leaked" }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("password is never kept or re-sent", () => {
  it("normalizePlayer drops any password the API returns", () => {
    expect(normalizePlayer({ ...player, password: "leaked" })).not.toHaveProperty("password");
  });

  it("loginPlayer sends the typed password but does not keep it", async () => {
    const p = await loginPlayer({ usernameOrEmail: "player", password: "secret1" });
    expect(sentBody()).toEqual({ usernameOrEmail: "player", password: "secret1" });
    expect(p).not.toHaveProperty("password");
  });

  it("updateCreditsApi omits the password", async () => {
    await updateCreditsApi(player, 90);
    expect(sentBody()).not.toHaveProperty("password");
    expect(sentBody().credits).toBe(90);
  });

  it("updatePlayerApi omits an empty password", async () => {
    await updatePlayerApi(player, { userName: "renamed", password: "" });
    expect(sentBody()).not.toHaveProperty("password");
    expect(sentBody().userName).toBe("renamed");
  });

  it("updatePlayerApi sends a new password once, without keeping it", async () => {
    const p = await updatePlayerApi(player, { password: "newpass" });
    expect(sentBody().password).toBe("newpass");
    expect(p).not.toHaveProperty("password");
  });
});
