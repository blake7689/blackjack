import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerProvider } from "../providers/PlayerProvider";
import { GameProvider } from "../providers/GameProvider";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import { GamePhases } from "../utils/constants/gamePhases";
import { stackedShoe } from "../utils/_tests_/stackedShoe";

// A test that needs a scripted round sets shoes.next; every other shoe is a real one.
const shoes = vi.hoisted(() => ({ next: null }));
vi.mock("../utils/cards", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createShoe: (...args) => shoes.next ?? actual.createShoe(...args) };
});

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

async function setup({ signedIn = true } = {}) {
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
  if (signedIn) await ctx.signIn("alice");
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

// The real providers again: a settle the server refuses (#196).
describe("a refused payout and sign-out (#196)", () => {
  const advance = () => act(async () => { await vi.advanceTimersByTimeAsync(1000); for (let i = 0; i < 50; i++) await Promise.resolve(); });

  // Bets, deals and surrenders (half the stake back, so the payout is above 0). The settle is refused; with `hold`, the balance re-read after it waits for release().
  async function refusedSettle({ hold = false } = {}) {
    let refused = false;
    let release;
    vi.stubGlobal("fetch", async (url, init) => {
      if (url.endsWith("/ledger/settle")) {
        refused = true;
        return reply(400, { message: "over the cap" });
      }
      if (refused && hold && !release && url.endsWith("/player/me") && init.method === "GET") {
        await new Promise((resolve) => { release = resolve; });
      }
      return fakeFetch(url, init);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    // 10, 7 against a 9 up: a plain hand, no offers
    shoes.next = stackedShoe(["10", "9", "7", "8"]);
    const ctx = await setup();
    act(() => ctx.actions.addBet(10));
    act(() => ctx.actions.deal());
    await advance();
    expect(ctx.state.phase).toBe(GamePhases.PLAYER_TURN);
    act(() => ctx.actions.surrender(0));
    for (let i = 0; i < 20 && ctx.state.phase !== GamePhases.POST_ROUND; i++) await advance();
    await flush();
    expect(ctx.state.phase).toBe(GamePhases.POST_ROUND);
    expect(ctx.state.creditEvents.at(-1)).toMatchObject({ kind: "settle", amount: 5 });
    return { ctx, release: () => release() };
  }
  afterEach(() => { shoes.next = null; vi.restoreAllMocks(); });

  it("signed in, the notice names the payout and the balance is the server's", async () => {
    const { ctx } = await refusedSettle();
    expect(ctx.state.payoutNotice).toBe("The server refused your $5 payout; it was not paid.");
    expect(ctx.player.player.credits).toBe(990);
  });

  it("signed out and into another account while the balance re-read is pending: the new session sees no notice", async () => {
    const { ctx, release } = await refusedSettle({ hold: true });
    expect(ctx.state.payoutNotice).toBeNull(); // not reported until the re-read answers
    act(() => { ctx.actions.resetGame(); ctx.player.logout(); });
    await flush();
    await ctx.signIn("bob");
    await act(async () => { release(); });
    await flush();
    expect(ctx.player.player.userName).toBe("bob");
    expect(ctx.player.player.credits).toBe(500);
    expect(ctx.state.payoutNotice).toBeNull();
  });
});

// #204: a sign-in started while another is still waiting (a cold API start, then the sign-up page).
describe("one sign-in at a time (#204)", () => {
  const BUSY = "Another sign-in is still in progress. Please wait for it to finish.";
  const SAVED_DELAY = { alice: 1000, bob: 2000 }; // each account's saved autoDealDelay
  const logIn = (ctx, name) => () => ctx.player.login({ usernameOrEmail: name, password: "dummy" });
  const signUp = (ctx, name) => () => ctx.player.addPlayer({ userName: name, email: `${name}@t.test`, password: "dummy-password" });

  // In front of the fake server: logs every request as "METHOD path account" and holds the ones named in hold() until released.
  // release(response) answers with that response instead of the server's.
  function heldServer() {
    const gates = new Map();
    const sent = [];
    vi.stubGlobal("fetch", async (url, init) => {
      const path = url.match(/\/(auth|player|ledger)\/.*$/)[0];
      const body = init.body && JSON.parse(init.body);
      // a sign-in request is the account it names; any other is the account whose token it carries
      const name = path.startsWith("/auth/") ? body.usernameOrEmail ?? body.userName : init.headers.Authorization?.replace("Bearer ", "");
      const key = `${init.method} ${path} ${name}`;
      sent.push(key);
      const instead = await gates.get(key);
      if (instead) return instead;
      if (path === "/auth/register") return reply(200, { accessToken: name });
      if (init.method === "GET" && path === "/player/me/settings") return reply(200, { v: 5, autoDealDelay: SAVED_DELAY[name] });
      return fakeFetch(url, init);
    });
    const hold = (key) => {
      let open;
      gates.set(key, new Promise((resolve) => { open = resolve; }));
      return async (response) => { await act(async () => { open(response); }); await flush(); };
    };
    return { sent, hold };
  }

  // Starts a sign-in without waiting for it; `is` says how it ended.
  async function start(run) {
    const outcome = { is: "waiting" };
    await act(async () => { run().then(() => { outcome.is = "signed in"; }, (err) => { outcome.is = err.message; }); });
    await flush();
    return outcome;
  }

  const onScreen = (ctx) => ({
    user: ctx.player.player?.userName,
    token: sessionStorage.getItem("bj.token"),
    credits: ctx.player.player?.credits,
    betCircle: ctx.state.betCircle,
    autoDealDelay: ctx.state.settings.autoDealDelay,
  });

  it("a sign-up during a waiting log-in is refused and sends nothing: chips, balance, settings and bets stay the first account's", async () => {
    const net = heldServer();
    const ctx = await setup({ signedIn: false });
    const releaseAlice = net.hold("POST /auth/login alice");
    const releaseBob = net.hold("POST /auth/register bob");
    const first = await start(logIn(ctx, "alice"));
    const second = await start(signUp(ctx, "bob"));

    await releaseAlice();
    act(() => ctx.actions.addBet(100));
    await releaseBob(); // nothing waits on this once the second sign-in is refused

    expect({ first: first.is, second: second.is, bobRequests: net.sent.filter((key) => key.endsWith(" bob")), ...onScreen(ctx) })
      .toEqual({ first: "signed in", second: BUSY, bobRequests: [], user: "alice", token: "alice", credits: 900, betCircle: 100, autoDealDelay: 1000 });
    act(() => ctx.actions.deal());
    await flush();
    expect(net.sent.filter((key) => key.includes("/ledger/bet"))).toEqual(["POST /ledger/bet alice"]);
  });

  it("crossed replies: the profile on screen is always the stored token's account", async () => {
    const net = heldServer();
    const ctx = await setup({ signedIn: false });
    const releaseAliceProfile = net.hold("GET /player/me alice"); // her token is stored; her profile is still on its way
    await start(logIn(ctx, "alice"));
    const second = await start(logIn(ctx, "bob")); // every answer to this one would arrive first

    await releaseAliceProfile();

    expect({ second: second.is, ...onScreen(ctx) })
      .toEqual({ second: BUSY, user: "alice", token: "alice", credits: 1000, betCircle: 0, autoDealDelay: 1000 });
  });

  it("a log-in during a waiting sign-up is refused; once that sign-up fails, a new sign-in works", async () => {
    const net = heldServer();
    const ctx = await setup({ signedIn: false });
    const releaseBob = net.hold("POST /auth/register bob");
    const first = await start(signUp(ctx, "bob"));
    const second = await start(logIn(ctx, "alice"));
    expect(second.is).toBe(BUSY);
    expect(net.sent).toEqual(["POST /auth/register bob"]);

    await releaseBob(reply(500, { message: "unavailable" }));
    expect(first.is).toBe("unavailable");
    expect(ctx.player.player).toBeNull();
    await ctx.signIn("alice");
    expect(onScreen(ctx)).toMatchObject({ user: "alice", token: "alice", credits: 1000 });
  });

  // The clean table and balance after a sign-out are covered above (#195); this adds the saved settings.
  it("after a sign-out the next account gets its own saved settings", async () => {
    heldServer();
    const ctx = await setup();
    expect(ctx.state.settings.autoDealDelay).toBe(1000);
    await SIGN_OUTS["Log out"](ctx);
    await flush();
    await ctx.signIn("bob");
    expect(onScreen(ctx)).toMatchObject({ user: "bob", token: "bob", credits: 500, autoDealDelay: 2000 });
  });
});
