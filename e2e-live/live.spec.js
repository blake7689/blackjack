import { test, expect } from '@playwright/test';

// Post-deploy smoke test (#119): the live site and the real API, nothing stubbed. It plays one safe round
// (Stay only, offers declined) and checks the ledger: one bet, one settle, and a balance that adds up.
// Never log or attach the credentials or the token: nothing here prints them.

const COLD = 120_000; // sign-in and /me can each wait out a 30+ s Azure cold start

// The balance in the stats panel: its text nodes only, so the "+10" / "-10" change badge is left out.
const readBalance = (page) =>
  page.locator('.stats-panel > div:nth-child(2)').evaluate((el) =>
    Number(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/[^0-9.-]/g, '')));
const cents = (n) => Math.round(n * 100) / 100;

test('live site: sign in, play one round, the ledger and the balance agree (#119)', async ({ page }) => {
  for (const name of ['E2E_LIVE_USERNAME', 'E2E_LIVE_PASSWORD']) {
    if (!process.env[name]) throw new Error(`${name} is not set: the live smoke test needs a test account's sign-in in the environment`);
  }

  const bets = [];
  const settles = [];
  page.on('response', async (res) => {
    const { pathname } = new URL(res.url());
    const sink = res.request().method() === 'POST' && (pathname.endsWith('/ledger/bet') ? bets : pathname.endsWith('/ledger/settle') ? settles : null);
    if (!sink) return;
    const entry = { ok: res.ok(), status: res.status(), request: undefined, credits: undefined };
    try { entry.request = res.request().postDataJSON(); } catch { /* leave undefined: the asserts below fail with a clear message */ }
    try { entry.credits = (await res.json()).credits; } catch { /* same */ }
    sink.push(entry);
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByPlaceholder('Username or Email').fill(process.env.E2E_LIVE_USERNAME);
  await page.getByPlaceholder('Password').fill(process.env.E2E_LIVE_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Start Game' }).click({ timeout: COLD });

  const chips = page.getByRole('button', { name: /^Add \d+$/ });
  await expect(page.getByRole('button', { name: 'Deal', exact: true })).toBeVisible({ timeout: COLD }); // the table is up
  const start = await readBalance(page);
  const chipValues = (await chips.evaluateAll((els) => els.map((e) => Number(e.getAttribute('aria-label').slice(4))))).sort((a, b) => a - b);
  if (!chipValues.length || start < chipValues[0]) {
    throw new Error(`The test account has too little play money (balance ${start}, smallest bet ${chipValues[0] ?? 'none'}): top it up through the app's normal flow.`);
  }
  await page.getByRole('button', { name: `Add ${chipValues[0]}`, exact: true }).click();
  await page.getByRole('button', { name: 'Deal', exact: true }).click();

  // Live rules and shoe are unknown: decline every offer, Stay on every hand, never hit, double or split.
  const results = page.getByText('Click anywhere to continue...');
  await expect.poll(async () => {
    if (await results.isVisible()) return 'done';
    for (const button of [page.getByRole('group', { name: 'Offers' }).getByRole('button', { name: 'No thanks' }), page.getByRole('button', { name: 'Stay' })]) {
      if (await button.isVisible()) await button.click({ timeout: 5_000 }).catch(() => {}); // the buttons can vanish between check and click
    }
    return 'playing';
  }, { timeout: COLD, intervals: [250], message: 'the round never reached its results' }).toBe('done');

  await results.click();
  await expect(page.getByText('Place your bets!')).toBeVisible();
  await expect.poll(() => settles.length, { timeout: 30_000, message: 'the settle call never returned' }).toBe(1);

  expect(bets, 'exactly one ledger bet').toHaveLength(1);
  expect(bets[0].ok, `bet status ${bets[0].status}`).toBe(true);
  expect(settles[0].ok, `settle status ${settles[0].status}`).toBe(true);
  const payout = settles[0].request?.payout;
  expect(typeof payout, 'the settle request body carries a payout').toBe('number');
  expect(typeof settles[0].credits, 'the settle response carries credits').toBe('number');

  const expected = cents(start - bets[0].request.amount + payout);
  expect(cents(settles[0].credits), 'the server balance after the settle').toBe(expected);
  await expect.poll(() => readBalance(page).then(cents), { timeout: 30_000, message: 'the displayed balance' }).toBe(expected);
});
