import { test, expect, stubApi, seedRandom, login, VEGAS } from './fixtures';

// Three spots (#59). Seed 8956 (mulberry32; 4 router keys, the settings-load shoe, then the game-start shoe, Vegas 6 decks; found by replaying dealRound):
// spot 1: 8,8; spot 2: 2,9; spot 3: 3,6; dealer ace up with a 5 in the hole, so insurance is offered spot by spot and the peek finds nothing.
const btn = (page, name) => page.getByRole('button', { name, exact: true });
const circle = (page, n) => page.getByRole('button', { name: new RegExp(`^Bet spot ${n},`) });

async function sit(page) {
  const api = await stubApi(page, { startCredits: 5000, settings: { ...VEGAS, handSpots: 3, playTimeout: 250 } });
  await seedRandom(page, 8956);
  await login(page);
  await btn(page, '$10 chip').click();
  return api;
}

async function stayToTheResults(page) {
  for (let i = 0; i < 8; i++) {
    await expect(btn(page, 'Stay').or(btn(page, 'Next hand'))).toBeEnabled({ timeout: 25_000 });
    if (await btn(page, 'Next hand').count()) return;
    await btn(page, 'Stay').click();
  }
}

test('three spots: insurance spot by spot, a split on spot 1, one ledger bet per spot, and the rebet', async ({ page }) => {
  const api = await sit(page);
  for (const n of [1, 2, 3]) await circle(page, n).click();
  await expect(circle(page, 3)).toHaveAttribute('aria-pressed', 'true');
  await btn(page, 'Deal').click();
  const offers = page.getByRole('group', { name: 'Offers' });
  for (const [n, answer] of [[1, /^No thanks/], [2, /^Insurance/], [3, /^No thanks/]]) {
    await expect(page.getByText(`Spot ${n}: insurance?`, { exact: true })).toBeVisible({ timeout: 20_000 });
    await offers.getByRole('button', { name: answer }).click();
  }
  await expect(btn(page, 'Split')).toBeEnabled({ timeout: 20_000 });
  await btn(page, 'Split').click();
  await expect(page.getByRole('group', { name: /^Spot \d, hand \d/ })).toHaveCount(4);
  await expect(page.locator('.spot-name')).toHaveText(['Spot 1', 'Spot 2', 'Spot 3']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await stayToTheResults(page);
  expect(api.bets.map((b) => [b.amount, b.newRound])).toEqual([[10, true], [10, false], [10, false], [5, false], [10, false]]);
  expect(api.settles).toHaveLength(1);
  await btn(page, 'Next hand').click();
  await expect(btn(page, 'Rebet')).toBeVisible();
  await btn(page, 'Rebet').click();
  for (const n of [1, 2, 3]) await expect(circle(page, n)).toHaveAccessibleName(new RegExp(`^Bet spot ${n}, .10`));
});

test('an empty middle spot is not dealt', async ({ page }) => {
  const api = await sit(page);
  await circle(page, 1).click();
  await circle(page, 3).click();
  await btn(page, 'Deal').click();
  await expect(page.getByRole('group', { name: /^Spot [13], hand [12]/ })).toHaveCount(2, { timeout: 20_000 });
  await expect(page.locator('.spot-name')).toHaveText(['Spot 1', 'Spot 3']);
  expect(api.bets.map((b) => b.newRound)).toEqual([true, false]);
});
