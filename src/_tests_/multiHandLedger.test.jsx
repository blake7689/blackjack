import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlayerProvider } from "../providers/PlayerProvider";
import { GameProvider } from "../providers/GameProvider";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import { GamePhases } from "../utils/constants/gamePhases";
import { stackedShoe } from "../utils/_tests_/stackedShoe";

// #59: a multi-spot deal through the real PlayerProvider, GameProvider, playerEngine and api.js; only fetch is fake. The fake ledger
// keeps the server's rules that matter here: a round is opened by newRound, later bets add to its open stake, a bet over the balance
// is refused, and a settle may pay at most 2.5x the open stake.
const shoes = vi.hoisted(() => ({ next: null }));
vi.mock("../utils/cards", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createShoe: (...args) => (shoes.next ? [...shoes.next] : actual.createShoe(...args)) };
});

const { PRE_DEAL, DEALING, OFFERS, PEEK, PLAYER_TURN, POST_ROUND } = GamePhases;
let server;

const reply = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body ?? {}) });

function ledger(path, sent) {
  server.requests.push({ path, ...sent });
  if (server.fail.has(server.requests.length)) return reply(server.fail.get(server.requests.length), { message: "refused" });
  if (path === "/ledger/bet") {
    if (!sent.newRound && server.openStake === 0) return reply(422, { message: "No open round." });
    if (sent.amount > server.balance) return reply(400, { message: "Insufficient credits." });
    server.openStake = (sent.newRound ? 0 : server.openStake) + sent.amount;
    server.balance -= sent.amount;
  } else {
    if (server.openStake === 0 || sent.payout > server.openStake * 2.5) return reply(422, { message: "Over the cap." });
    server.balance += sent.payout;
    server.openStake = 0;
  }
  return reply(200, { credits: server.balance, openStake: server.openStake });
}

async function fakeFetch(url, { method, body }) {
  const path = url.match(/\/(auth|player|ledger)\/.*$/)[0];
  const sent = body === undefined ? undefined : JSON.parse(body);
  switch (`${method} ${path}`) {
    case "POST /auth/login":
      return reply(200, { accessToken: sent.usernameOrEmail });
    case "GET /player/me":
      return reply(200, { userName: "alice", email: "alice@t.test", credits: server.balance });
    case "GET /player/me/settings":
      return reply(200, server.settings);
    case "PUT /player/me/settings":
      return reply(204, null);
    case "POST /ledger/bet":
    case "POST /ledger/settle":
      if (!server.hold) return ledger(path, sent);
      return new Promise((resolve) => server.waiting.push(() => resolve(ledger(path, sent))));
    default:
      throw new Error(`no fake for ${method} ${path}`);
  }
}

const flush = () => act(async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); });
const tick = async (ms = 1000) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await flush(); };
const release = async () => { await act(async () => { server.waiting.shift()(); }); await flush(); };

async function setup({ balance = 1000, settings = {}, cards }) {
  server.balance = balance;
  server.settings = { v: 5, handSpots: 3, splitDeal: "both", ...settings };
  shoes.next = stackedShoe(cards);
  const ctx = {};
  function Probe() {
    ctx.player = usePlayer();
    ctx.state = useGameState();
    ctx.actions = useGameActions();
    return null;
  }
  render(<MemoryRouter initialEntries={["/login"]}><PlayerProvider><GameProvider><Probe /></GameProvider></PlayerProvider></MemoryRouter>);
  await act(async () => { await ctx.player.login({ usernameOrEmail: "alice", password: "dummy" }); });
  await flush();
  ctx.bet = async (...amounts) => {
    for (const [spot, amount] of amounts.entries()) if (amount > 0) act(() => ctx.actions.addBet(amount, spot));
    await flush();
  };
  ctx.deal = async () => { act(() => ctx.actions.deal()); await flush(); };
  // Runs the automatic steps to the results, standing wherever the player is asked.
  ctx.finish = async () => {
    for (let i = 0; i < 40 && ctx.state.phase !== POST_ROUND; i++) {
      if (ctx.state.phase === PLAYER_TURN && !ctx.state.hands[ctx.state.selectedHandIndex].awaitingCard) act(() => ctx.actions.stand(ctx.state.selectedHandIndex));
      await tick();
    }
    expect(ctx.state.phase).toBe(POST_ROUND);
  };
  ctx.shown = () => ctx.player.player.credits;
  return ctx;
}

let error;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fakeFetch);
  sessionStorage.clear();
  server = { balance: 0, openStake: 0, requests: [], waiting: [], fail: new Map(), hold: false, settings: {} };
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  error.mockRestore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a 3-spot round against the ledger (#59)", () => {
  // spots 8,8 / 6,5 / 10,10 against an ace with a 7 under it (soft 18); draws 10 and 3 for the split, K for the double
  const CARDS = ["8", "6", "10", "A", "8", "5", "10", "7", "10", "3", "K"];

  it("waits in DEALING for every spot bet while the shown balance stays right, then settles to the server's balance after a split, a double and an insured spot", async () => {
    const ctx = await setup({ balance: 100, cards: CARDS });
    await ctx.bet(10, 10, 10);
    server.hold = true;
    await ctx.deal();
    for (let answered = 0; answered < 3; answered++) {
      await tick(10_000);
      expect([ctx.state.phase, ctx.shown(), server.waiting.length]).toEqual([DEALING, 70, 1]); // one call at a time
      await release();
    }
    server.hold = false;
    expect([server.balance, ctx.shown()]).toEqual([70, 70]);
    await tick();
    expect([ctx.state.phase, ctx.state.selectedHandIndex]).toEqual([OFFERS, 0]);
    act(() => ctx.actions.declineOffers());
    act(() => ctx.actions.declineOffers());
    act(() => ctx.actions.takeInsurance());
    await flush();
    await tick();
    expect(ctx.state.phase).toBe(PLAYER_TURN);
    act(() => ctx.actions.split(0));
    await flush();
    await tick();
    act(() => ctx.actions.stand(0));
    act(() => ctx.actions.stand(1));
    await tick();
    act(() => ctx.actions.double(2));
    await flush();
    await ctx.finish();
    expect(server.requests.map((r) => [r.path, r.amount ?? r.payout, r.newRound])).toEqual([
      ["/ledger/bet", 10, true], ["/ledger/bet", 10, false], ["/ledger/bet", 10, false],
      ["/ledger/bet", 5, false], ["/ledger/bet", 10, false], ["/ledger/bet", 10, false], ["/ledger/settle", 70, undefined],
    ]);
    expect(new Set(server.requests.map((r) => r.requestId)).size).toBe(7);
    expect([server.balance, ctx.shown(), server.openStake]).toEqual([115, 115, 0]);
    expect(error).not.toHaveBeenCalled();
  });

  it("every spot a blackjack: the 75 settle on 30 staked is accepted by the 2.5x cap", async () => {
    const ctx = await setup({ balance: 100, cards: ["A", "A", "A", "9", "K", "K", "K", "8"] });
    await ctx.bet(10, 10, 10);
    await ctx.deal();
    await ctx.finish();
    expect([server.balance, ctx.shown()]).toEqual([145, 145]);
    expect(error).not.toHaveBeenCalled();
  });

  // three 19s against 17
  const NINETEENS = ["10", "10", "10", "10", "9", "9", "9", "7"];

  it.each([[2, "spot 2"], [3, "spot 3"]])("the server refuses request %i (%s): that hand plays for nothing and the balance matches the server after the settle", async (nth, name) => {
    server.fail.set(nth, 400);
    const ctx = await setup({ balance: 100, cards: NINETEENS });
    await ctx.bet(10, 10, 10);
    await ctx.deal();
    expect(ctx.state.notice).toBe(`The server refused your $10 bet on ${name}; it plays for nothing.`);
    expect(ctx.state.hands.map((h) => h.bet)).toEqual([0, 1, 2].map((i) => (i === nth - 1 ? 0 : 10)));
    expect([server.balance, ctx.shown(), ctx.state.betCircle]).toEqual([80, 80, 20]);
    await ctx.finish();
    expect([server.balance, ctx.shown()]).toEqual([120, 120]);
    expect(server.requests.at(-1)).toMatchObject({ path: "/ledger/settle", payout: 40 });
    expect(ctx.state.payoutNotice).toBeNull();
  });

  it("the server refuses the opening bet: the round is void, the other spot bets are never sent and nothing is left on the table", async () => {
    server.fail.set(1, 400);
    const ctx = await setup({ balance: 100, cards: NINETEENS });
    await ctx.bet(10, 10, 10);
    await ctx.deal();
    await tick(5000);
    expect(ctx.state).toMatchObject({ phase: PRE_DEAL, hands: [], betCircle: 0, betSpots: [0, 0, 0], pendingBets: [] });
    expect([ctx.shown(), server.balance, server.requests.length]).toEqual([100, 100, 1]);
  });

  it("another tab spent the balance: spots 2 and 3 are refused by the ledger and the shown balance follows the server", async () => {
    const ctx = await setup({ balance: 100, cards: NINETEENS });
    await ctx.bet(10, 10, 10);
    server.balance = 15; // enough for the opening bet only
    await ctx.deal();
    expect(ctx.state.hands.map((h) => h.bet)).toEqual([10, 0, 0]);
    expect([server.balance, ctx.shown()]).toEqual([5, 5]);
    await ctx.finish();
    expect([server.balance, ctx.shown()]).toEqual([25, 25]);
  });

  it("no answer (500) to a spot bet keeps the table in DEALING, then the retry moves it on, charged once", async () => {
    server.fail.set(2, 500);
    const ctx = await setup({ balance: 100, cards: NINETEENS });
    await ctx.bet(10, 10, 10);
    await ctx.deal();
    expect([ctx.state.phase, ctx.player.reconnecting, ctx.shown()]).toEqual([DEALING, true, 70]);
    await tick(1000);
    await tick(1000);
    expect([ctx.state.phase, ctx.player.reconnecting]).toEqual([PLAYER_TURN, false]);
    expect(server.requests[2].requestId).toBe(server.requests[1].requestId);
    await ctx.finish();
    expect([server.balance, ctx.shown()]).toEqual([130, 130]);
  });

  it("the only offered spot refused (spot 1 cannot afford insurance): the peek runs with no player input", async () => {
    // 35: 20 + 10 down leaves 5; spot 1's insurance is 10, spot 2's is 5. Spot 1 K,K, spot 2 10,5 against an ace over a 7.
    server.fail.set(2, 400);
    const ctx = await setup({ balance: 35, cards: ["10", "10", "A", "K", "5", "7"] });
    await ctx.bet(20, 10);
    await ctx.deal();
    const seen = [ctx.state.phase];
    for (let i = 0; i < 2; i++) { await tick(); seen.push(ctx.state.phase); }
    expect(seen).toEqual([DEALING, PEEK, PLAYER_TURN]);
    expect([ctx.shown(), server.balance, ctx.state.offers]).toEqual([15, 15, null]);
  });

  it("signing out with spot bets still queued sends no more of them and leaves a clean table", async () => {
    const ctx = await setup({ balance: 100, cards: NINETEENS });
    await ctx.bet(10, 10, 10);
    server.hold = true;
    await ctx.deal();
    act(() => { ctx.actions.resetGame(); ctx.player.logout(); });
    await flush();
    await release(); // the opening bet's answer arrives after the sign-out
    await tick(10_000);
    expect([server.waiting.length, server.requests.length]).toEqual([0, 1]);
    expect(ctx.player.player).toBeNull();
    expect(ctx.state).toMatchObject({ betCircle: 0, betSpots: [0, 0, 0], initialSpots: [0, 0, 0], hands: [], pendingBets: [] });
  });
});
