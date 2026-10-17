import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizePlayer, loginPlayer, updatePlayerApi, updateCreditsApi, addPlayerApi, deletePlayerApi } from "../playerEngine";

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

describe("player calls", () => {
  it("normalizePlayer turns missing names into empty strings and credits into a number", () => {
    expect(normalizePlayer({ playerId: 1, userName: "u", email: "e", firstName: null, credits: "12.5" }))
      .toEqual({ playerId: 1, userName: "u", email: "e", firstName: "", lastName: "", credits: 12.5 });
  });

  it("addPlayerApi sends blank names as null with the starting credits", async () => {
    await addPlayerApi({ userName: "n", password: "secret1", email: "n@example.com", firstName: "", lastName: "L", credits: 500 });
    expect(sentBody()).toEqual({ playerId: 0, userName: "n", password: "secret1", email: "n@example.com", firstName: null, lastName: "L", credits: 500 });
    await addPlayerApi({ userName: "n", password: "secret1", email: "n@example.com", firstName: "F", lastName: "", credits: 0 });
    expect(sentBody()).toMatchObject({ firstName: "F", lastName: null });
  });

  it("deletePlayerApi deletes by id", async () => {
    await deletePlayerApi(player);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/Player\/7$/);
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});
