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

// Seed 183 (mulberry32), the Vegas table of the fixture (US peek, 6 decks, dealer hits soft 17). Before the deal the page uses 4 random numbers (router keys),
// the settings load builds one shoe and Start Game a second one; the deal draws from that. The shuffle consumes Math.random in proportion to the shoe
// size, so a change of the fixture's deck count means a new seed. To re-pick: replay those steps over createShoe (src/utils/cards.js) and keep a round whose
// cards are all different, with no pair, no blackjack, no ace or ten up, a Hit that neither busts nor makes 21, and a dealer that has to draw.
//   player king of diamonds + 4 of clubs = 14, dealer 6 of clubs up + jack of hearts in the hole (16, no blackjack).
//   Hit draws the 5 of hearts (19); Stay; the dealer flips the hole card and draws the 3 of diamonds (19: a push).
// If the app's use of Math.random changes, these card assertions fail first and the seed needs re-picking.
test('options stay hidden while cards move through a whole round (#72)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 183);
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
  await expect(page.getByRole('img', { name: 'king of diamonds' })).toBeVisible();
  await expect(page.getByRole('img', { name: '4 of clubs' })).toBeVisible();
  await expect(page.getByRole('img', { name: '6 of clubs' })).toBeVisible();
  await page.getByRole('button', { name: 'Hit' }).click({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: '5 of hearts' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay' }).click({ timeout: 15_000 });
  await expect(page.getByText('Click anywhere to continue...')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'jack of hearts' })).toBeVisible(); // the hole card was flipped
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

// The same seed-183 deal (14 against a 6, jack in the hole, Vegas peek): Surrender gives half the bet back in one settle, and the dealer draws nothing.
test('surrendering a hand returns half the bet, in one settle (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 183);
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await submitLogin(page);
  await (await settingsLoaded).finished();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Add 10', exact: true }).click();
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('img', { name: 'king of diamonds' })).toBeVisible();
  await expect(page.getByRole('img', { name: '6 of clubs' })).toBeVisible();

  await page.getByRole('button', { name: 'Surrender' }).click({ timeout: 15_000 });
  await expect(page.locator('.hand-total > span:not(.ht-size) .hand-result.Surrendered')).toHaveText('Surrendered') // the live text, not its invisible size copy;
  await expect(page.getByText('Click anywhere to continue...')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'jack of hearts' })).toBeVisible(); // the hole card is shown
  await expect(page.getByRole('img', { name: '3 of diamonds' })).toHaveCount(0); // the dealer did not play on (16)
  await expect(page.getByRole('button', { name: 'Surrender' })).toHaveCount(0);

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toEqual([{ amount: 10, newRound: true, requestId: expect.stringMatching(V4) }]);
  expect(api.settles).toEqual([{ payout: 5, requestId: expect.stringMatching(V4) }]);
});
