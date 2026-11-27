import { test as base, expect } from '@playwright/test';
import { VEGAS } from './vegas.js';

const API = 'http://api.e2e.test/**';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After', // without it a cross-origin page cannot read the lockout time
};
const PLAYER = { userName: 'tester', email: 'tester@e2e.test', firstName: 'Test', lastName: 'Er' };
const hold = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The one password the stubbed PUT and DELETE /player/me accept (BlackJackAPI#71); any other is "Incorrect password.".
export const ACCOUNT_PASSWORD = 'e2e-account-password';

export { VEGAS }; // the Vegas rules live in ./vegas.js (no Playwright import, so vitest can load them)

const stubs = new WeakMap(); // page -> stub, so the auto fixture below can check it after the test

// Answers every API call the app makes. The deliberate holds live here, in the handler, not in the tests.
// Returns what the tests assert on: the ledger calls, the saved settings, requests that failed, endpoints nobody stubbed.
// PUT and DELETE /player/me follow the real API (BlackJackAPI#71): a changed username or email, and every delete, need ACCOUNT_PASSWORD, else 400
// { status, message, errors }. `profiles` records the PUT bodies, `deletes` the DELETE bodies and Content-Type. A good PUT is what GET /player/me answers next.
// deleteGate: a promise the DELETE answer waits for, so a spec can look at the dialog while the request is in flight.
// startCredits: the balance /player/me answers with. topUps: the replies to POST /ledger/topup, one per call, in order:
// { status: 200, credits } sets the balance; any other status sends { message } (and headers, e.g. Retry-After).
// loginError: { status, message } makes POST /auth/login fail with it (a sign-in refusal).
// reloginError: { status, message } makes only the 2nd and later logins fail (the sign-in after a password change, #171).
// Each login after the first answers with a new token ('e2e-token-2', ...); `requests` lists every call with its Authorization header.
// meFailures: how many GET /player/me calls answer 503 before it answers normally (a restore that gets no answer: the Error screen, #87).
// #196: settingsFailures: how many GET /player/me/settings calls answer 503 first; settingsGate: a promise every later answer to it waits for.
// settleRefusal: { status, message } makes POST /ledger/settle refuse (the balance does not move); once: only the first settle; gate: a promise the refusal waits for.
// passwordGate: a promise the first PUT /player/me/password
// answer waits for; any further PUT answers 401, as the API does once the first change has revoked the token.
// settings: what GET /player/me/settings answers with (the fastest Rate of Play by default, so a round runs quickly but the flights are real). Whatever is passed,
// the account's saved settings carry tableMessages "all" (every prompt shows at once, so the specs can wait on "Place your bets" and "Your move", L2-1) and currency "USD"
// (the "$10 chip" names do not depend on the runner's locale, L2-2) unless a spec sets its own.
export async function stubApi(page, { loginDelayMs = 0, loginError = null, reloginError = null, meDelayMs = 0, meFailures = 0, startCredits = 1000, topUps = [], deleteGate = null, settingsFailures = 0, settingsGate = null, settleRefusal = null, passwordGate = null, settings = { ...VEGAS, playTimeout: 250 } } = {}) {
  let credits = startCredits;
  let meFailuresLeft = meFailures;
  let settingsFailuresLeft = settingsFailures;
  const replies = [...topUps];
  const stub = { bets: [], settles: [], topups: [], saves: [], logins: [], passwords: [], profiles: [], deletes: [], requests: [], failed: [], unknown: [] };
  let profile = { ...PLAYER };
  stubs.set(page, stub);
  page.on('requestfailed', (r) => { if (r.url().startsWith('http://api.e2e.test')) stub.failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`); });

  await page.route(API, async (route) => {
    const req = route.request();
    const json = (body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
    // The API's re-auth answer: null when the password is right.
    const refusal = (message, password, missing) => (password === ACCOUNT_PASSWORD ? null : json({ status: 400, message, errors: [password ? 'Incorrect password.' : missing] }, 400));
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS }); // CORS preflight (Authorization / Content-Type)
    const endpoint = `${req.method()} ${new URL(req.url()).pathname.replace(/^\/api/, '')}`;
    stub.requests.push({ endpoint, auth: req.headers().authorization });
    switch (endpoint) {
      case 'POST /auth/login': {
        await hold(loginDelayMs);
        stub.logins.push(req.postDataJSON());
        const n = stub.logins.length;
        const error = n > 1 && reloginError ? reloginError : loginError;
        if (error) return json({ message: error.message }, error.status);
        return json({ accessToken: n > 1 ? `e2e-token-${n}` : 'e2e-token' });
      }
      case 'PUT /player/me/password':
        stub.passwords.push(req.postDataJSON());
        if (passwordGate) {
          if (stub.passwords.length > 1) return json({ message: 'Unauthorized' }, 401);
          await passwordGate;
        }
        return route.fulfill({ status: 204, headers: CORS });
      case 'GET /player/me':
        await hold(meDelayMs);
        if (meFailuresLeft-- > 0) return json({ message: 'e2e stub: the API is unavailable' }, 503);
        return json({ ...profile, credits });
      case 'PUT /player/me': {
        const body = req.postDataJSON();
        stub.profiles.push(body);
        const [userName, email] = [body.userName.trim(), body.email.trim()];
        if (userName !== profile.userName || email !== profile.email) {
          const refused = refusal('Profile update failed.', body.currentPassword, 'Enter your current password to change your username or email.');
          if (refused) return refused;
        }
        profile = { userName, email, firstName: body.firstName, lastName: body.lastName };
        return json({ ...profile, credits });
      }
      case 'DELETE /player/me': {
        const body = req.postDataJSON();
        stub.deletes.push({ body, contentType: req.headers()['content-type'] });
        await deleteGate;
        return refusal('Account deletion failed.', body?.currentPassword, 'Enter your current password to delete your account.') ?? route.fulfill({ status: 204, headers: CORS });
      }
      case 'GET /player/me/settings':
        if (settingsFailuresLeft-- > 0) return json({ message: 'e2e stub: the settings are unavailable' }, 503);
        await settingsGate;
        return json({ tableMessages: 'all', currency: 'USD', ...settings });
      case 'PUT /player/me/settings':
        stub.saves.push(req.postDataJSON());
        return json({});
      case 'POST /ledger/bet': {
        const body = req.postDataJSON();
        stub.bets.push(body);
        credits -= body.amount;
        return json({ credits });
      }
      case 'POST /ledger/settle': {
        const body = req.postDataJSON();
        stub.settles.push(body);
        if (settleRefusal && !(settleRefusal.once && stub.settles.length > 1)) {
          await settleRefusal.gate;
          return json({ message: settleRefusal.message }, settleRefusal.status);
        }
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

// Fills in the login form and submits it. No waits: the cold-start tests use it alone.
export async function submitLogin(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByPlaceholder('Username or Email').fill('tester');
  await page.getByPlaceholder('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

// Signs in and sits at the table: a signed-in player lands on it (DESIGN section 8), once the settings have loaded (each settings load builds a shoe: seed 183, see smoke.spec.js).
export async function login(page) {
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await submitLogin(page);
  await (await settingsLoaded).finished();
  // idle, before the deal. The table opens with its shuffle (#83: 4.5 s at Normal speed, 1.5 s on the fixture's fastest), the line says Shuffling until it is over.
  await page.locator('.felt').dispatchEvent('click'); // a tap on the felt skips the opening shuffle (#83), so no test pays its 1.5 s on a slow CI runner
  await expect(page.getByText(/^(Place your bets|Out of credits)$/)).toBeVisible({ timeout: 15_000 }); // a table with no credits says Out of credits (L1-18)
}

export const openTable = login;

// Bets a chip the way a player does (#82): pick it in the rack, then tap the bet circle (the circle bets the selected chip).
export async function placeBet(page, chip = 10) {
  await page.getByRole('button', { name: `$${chip} chip`, exact: true }).click();
  await page.getByRole('button', { name: /^Bet spot 1,/ }).click();
}

// Any endpoint the stub does not know fails the test (the 501 alone could be swallowed by the app).
export const test = base.extend({
  noUnknownEndpoints: [async ({ page }, use) => {
    await use();
    expect(stubs.get(page)?.unknown ?? []).toEqual([]);
  }, { auto: true }],
});
export { expect };
