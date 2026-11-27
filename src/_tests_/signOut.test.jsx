import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerProvider } from "../providers/PlayerProvider";
import { GameProvider } from "../providers/GameProvider";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import { GamePhases } from "../utils/constants/gamePhases";

// #195: the real PlayerProvider, GameProvider, playerEngine and api.js (so the real 401 handler); only fetch is fake.
// The fake server has one balance per account, and the token is the account's name.
let server;

const reply = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body ?? {}) });

async function fakeFetch(url, { method, headers, body }) {
  const path = url.match(/\/(auth|player|ledger)\/.*$/)[0]; // whatever VITE_API_URL is (unset under vitest)
  const sent = body === undefined ? undefined : JSON.parse(body);
  const name = headers.Authorization?.replace("Bearer ", "");
  switch (`${method} ${path}`) {
    case "POST /auth/login":
      return server.refuseLogin ? reply(500, { message: "unavailable" }) : reply(200, { accessToken: sent.usernameOrEmail });
    case "GET /player/me":
      return reply(200, { userName: name, email: `${name}@t.test`, credits: server.balances[name] });
    case "GET /player/me/settings":
      return reply(200, {});
    case "PUT /player/me": // the session was revoked
      return reply(401, { message: "Unauthorized" });
    case "PUT /player/me/password":
    case "DELETE /player/me":
      return reply(204, null);
    case "POST /ledger/bet":
      server.ledger.push(sent);
      server.balances[name] -= sent.amount;
      return reply(200, { credits: server.balances[name] });
    default:
      throw new Error(`no fake for ${method} ${path}`);
  }
}

const flush = () => act(async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); });

async function setup() {
  const ctx = {};
  function Probe() {
    ctx.player = usePlayer();
    ctx.state = useGameState();
    ctx.actions = useGameActions();
    return null;
  }
  render(<MemoryRouter initialEntries={["/login"]}><PlayerProvider><GameProvider><Probe /></GameProvider></PlayerProvider></MemoryRouter>);
  ctx.signIn = async (name) => {
    await act(async () => { await ctx.player.login({ usernameOrEmail: name, password: "dummy" }); });
    await flush();
  };
  await ctx.signIn("alice");
  return ctx;
}

const SIGN_OUTS = {
  "a 401 on a signed-in request": async (ctx) => {
    await act(async () => { await expect(ctx.player.updatePlayer({ userName: "alice" })).rejects.toThrow("Unauthorized"); });
  },
  // what useNavActions' Log out does
  "Log out": async (ctx) => { act(() => { ctx.actions.resetGame(); ctx.player.logout(); }); },
  "a password change whose re-sign-in fails": async (ctx) => {
    server.refuseLogin = true;
    await act(async () => { await ctx.player.changePassword("dummy-old", "dummy-new"); });
    server.refuseLogin = false;
  },
  "deleting the profile": async (ctx) => {
    await act(async () => { await ctx.player.deletePlayer("dummy"); });
  },
};

beforeEach(() => {
  vi.useFakeTimers(); // the table's automatic steps must not run on their own mid-test
  vi.stubGlobal("fetch", fakeFetch);
  sessionStorage.clear();
  server = { balances: { alice: 1000, bob: 500 }, ledger: [], refuseLogin: false };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each(["alice", "bob"])("signing in as %s after a sign-out shows that account's server balance and a clean table (#195)", (nextAccount) => {
  const expectCleanTable = (ctx) => {
    expect(ctx.player.player.userName).toBe(nextAccount);
    expect(ctx.state.phase).toBe(GamePhases.PRE_DEAL);
    expect(ctx.player.player.credits).toBe(server.balances[nextAccount]);
    expect(ctx.state).toMatchObject({ betCircle: 0, betHistory: [], initialBet: 0, pendingBets: [], hands: [] });
  };

  it.each(Object.keys(SIGN_OUTS))("100 in the circle, then %s", async (path) => {
    const ctx = await setup();
    act(() => ctx.actions.addBet(100));
    expect([ctx.state.betCircle, ctx.player.player.credits]).toEqual([100, 900]);

    await SIGN_OUTS[path](ctx);
    await flush();
    expect(ctx.player.player).toBeNull();
    await ctx.signIn(nextAccount);

    expectCleanTable(ctx);
    expect(server.ledger).toEqual([]);
    // the new session's table still works: its first chip moves the balance
    act(() => ctx.actions.addBet(10));
    expect([ctx.state.betCircle, ctx.player.player.credits]).toEqual([10, server.balances[nextAccount] - 10]);
  });

  it("a 401 mid-round: no hand and no Rebet amount is carried over", async () => {
    const ctx = await setup();
    act(() => ctx.actions.addBet(100));
    act(() => ctx.actions.deal());
    await flush();
    expect([ctx.state.initialBet, server.balances.alice]).toEqual([100, 900]);

    await SIGN_OUTS["a 401 on a signed-in request"](ctx);
    await flush();
    await ctx.signIn(nextAccount);

    expectCleanTable(ctx);
    expect(server.ledger).toHaveLength(1);
  });
});
