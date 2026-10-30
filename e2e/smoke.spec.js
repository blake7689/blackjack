import { test, expect, stubApi, seedRandom } from './fixtures';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function submitLogin(page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByPlaceholder('Username or Email').fill('tester');
  await page.getByPlaceholder('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

test('cold-start sign-in waits out a slow API (#75)', async ({ page }) => {
  const api = await stubApi(page, { loginDelayMs: 15_000, meDelayMs: 11_000 }); // both past the old 10 s limit
  await submitLogin(page);
  await expect(page.getByText(/waking up/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible({ timeout: 35_000 });
  expect(api.failed).toEqual([]); // no request was aborted early
});

test('cold-start session restore waits out a slow API (#75)', async ({ page }) => {
  const api = await stubApi(page, { meDelayMs: 11_000 });
  await page.addInitScript(() => sessionStorage.setItem('bj.token', 'e2e-token'));
  await page.goto('/');
  await expect(page.getByText('Please log in to start playing.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('button', { name: 'tester' })).toBeVisible();
  expect(api.failed).toEqual([]);
});

// Seed 6 (mulberry32), the Vegas table of the fixture (US peek, 6 decks, dealer hits soft 17; STALE until the seed is re-picked for 6 decks: it was
// picked for 2 decks, so the cards below no longer match #91 Step A). Before the deal the page uses 4 random numbers (router keys), the settings load builds
// one shoe and Start Game a second one; the deal draws from that.
//   player jack of clubs + 4 of diamonds = 14, dealer 8 of clubs up + 7 of spades in the hole (15, no blackjack).
//   Hit draws the 3 of spades (17); Stay; the dealer flips the hole card and draws.
// If the app's use of Math.random changes, these card assertions fail first and the seed needs re-picking.
test('options stay hidden while cards move through a whole round (#72)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 6);
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await submitLogin(page);
  await (await settingsLoaded).finished(); // each settings load builds a shoe, so the shoe is settled before Start Game
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Add 10', exact: true }).click();

  // Count frames where the buttons are visible while a card is still moving; also record that both states were seen.
  await page.evaluate(() => {
    const w = (window.__watch = { violations: 0, sawHidden: false, hiddenToVisible: false, motionFrames: 0, focused: document.hasFocus() });
    const sample = () => {
      const wrap = document.querySelector('.options-wrap');
      const layer = document.querySelector('.flight-layer');
      const moving = (layer?.children.length ?? 0) > 0
        || document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.closest?.('.flight-layer, .fly-inner'));
      if (moving) w.motionFrames++;
      if (!wrap) return;
      const visible = getComputedStyle(wrap).visibility === 'visible';
      if (!visible) w.sawHidden = true;
      else if (w.sawHidden) w.hiddenToVisible = true;
      if (visible && moving) w.violations++;
    };
    new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, attributes: true });
    const frame = () => { sample(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });

  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('img', { name: 'jack of clubs' })).toBeVisible();
  await expect(page.getByRole('img', { name: '4 of diamonds' })).toBeVisible();
  await expect(page.getByRole('img', { name: '8 of clubs' })).toBeVisible();
  await page.getByRole('button', { name: 'Hit' }).click({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: '3 of spades' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay' }).click({ timeout: 15_000 });
  await expect(page.getByText('Click anywhere to continue...')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: '7 of spades' })).toBeVisible(); // the hole card was flipped
  await page.getByText('Click anywhere to continue...').click();
  await expect(page.getByText('Place your bets!')).toBeVisible();

  const watch = await page.evaluate(() => window.__watch);
  expect(watch.focused, 'the page must have focus for realistic animation timing').toBe(true);
  expect(watch.violations, 'frames with visible options while a card moved').toBe(0);
  expect(watch.sawHidden && watch.hiddenToVisible, 'watcher saw the buttons go hidden then visible').toBe(true);
  expect(watch.motionFrames, 'watcher saw cards moving').toBeGreaterThan(0);

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toEqual([{ amount: 10, newRound: true, requestId: expect.stringMatching(V4) }]);
  expect(api.settles).toEqual([{ payout: expect.any(Number), requestId: expect.stringMatching(V4) }]);
  expect(api.bets[0].requestId).not.toBe(api.settles[0].requestId);
});
