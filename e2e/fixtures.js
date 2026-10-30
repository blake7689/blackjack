import { test as base, expect } from '@playwright/test';

const API = 'http://api.e2e.test/**';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After', // without it a cross-origin page cannot read the lockout time
};
const PLAYER = { userName: 'tester', email: 'tester@e2e.test', firstName: 'Test', lastName: 'Er' };
const hold = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The saved table rules the tests play with (version 2): the Vegas preset, written out so a later change to the defaults moves no test.
export const VEGAS = {
  v: 2, deckCount: 6, dealerHoleBehaviour: 'drawEarly_Check', dealerHitsSoft17: true, blackjackPayout: '3:2', doubleOn: 'any',
  doubleAfterSplit: true, maxSplitHands: 4, resplitAces: false, hitSplitAces: false, noHoleCardLoss: 'original',
  blackjackPaysImmediately: true, blackJackOnSplit: false, dealerDrawsOnPlayerBust: false, dealerDrawsOnceOn21: false,
  dealerDrawsOnPlayerBlackjack: true,
};

const stubs = new WeakMap(); // page -> stub, so the auto fixture below can check it after the test

// Answers every API call the app makes. The deliberate holds live here, in the handler, not in the tests.
// Returns what the tests assert on: the ledger calls, requests that failed, endpoints nobody stubbed.
// startCredits: the balance /player/me answers with. topUps: the replies to POST /ledger/topup, one per call, in order:
// { status: 200, credits } sets the balance; any other status sends { message } (and headers, e.g. Retry-After).
// settings: what GET /player/me/settings answers with (the fastest Rate of Play by default, so a round runs quickly but the flights are real).
export async function stubApi(page, { loginDelayMs = 0, meDelayMs = 0, startCredits = 1000, topUps = [], settings = { ...VEGAS, playTimeout: 250 } } = {}) {
  let credits = startCredits;
  const replies = [...topUps];
  const stub = { bets: [], settles: [], topups: [], failed: [], unknown: [] };
  stubs.set(page, stub);
  page.on('requestfailed', (r) => { if (r.url().startsWith('http://api.e2e.test')) stub.failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`); });

  await page.route(API, async (route) => {
    const req = route.request();
    const json = (body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS }); // CORS preflight (Authorization / Content-Type)
    const endpoint = `${req.method()} ${new URL(req.url()).pathname.replace(/^\/api/, '')}`;
    switch (endpoint) {
      case 'POST /auth/login':
        await hold(loginDelayMs);
        return json({ accessToken: 'e2e-token' });
      case 'GET /player/me':
        await hold(meDelayMs);
        return json({ ...PLAYER, credits });
      case 'GET /player/me/settings':
        return json(settings);
      case 'POST /ledger/bet': {
        const body = req.postDataJSON();
        stub.bets.push(body);
        credits -= body.amount;
        return json({ credits });
      }
      case 'POST /ledger/settle': {
        const body = req.postDataJSON();
        stub.settles.push(body);
        credits += body.payout;
        return json({ credits });
      }
      case 'POST /ledger/topup': {
        const reply = replies.shift();
        if (!reply) { stub.unknown.push(endpoint); return json({ message: 'e2e stub has no more top-up replies' }, 501); }
        stub.topups.push(req.postDataJSON());
        if (reply.status === 200) {
          credits = reply.credits;
          return json({ credits });
        }
        return route.fulfill({ status: reply.status, headers: { ...CORS, ...reply.headers }, contentType: 'application/json', body: JSON.stringify({ message: reply.message }) });
      }
      default:
        stub.unknown.push(endpoint);
        return json({ message: `e2e stub has no ${endpoint}` }, 501);
    }
  });
  return stub;
}

// mulberry32: the same Math.random sequence for a given seed. Installed before the app loads.
export async function seedRandom(page, seed) {
  await page.addInitScript((s) => {
    let a = s;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

// Any endpoint the stub does not know fails the test (the 501 alone could be swallowed by the app).
export const test = base.extend({
  noUnknownEndpoints: [async ({ page }, use) => {
    await use();
    expect(stubs.get(page)?.unknown ?? []).toEqual([]);
  }, { auto: true }],
});
export { expect };
