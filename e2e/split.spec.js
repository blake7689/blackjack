import { test, expect, stubApi, seedRandom, login, VEGAS } from './fixtures';

// Split deal (#133). Seed 262 (mulberry32), found by the same script as seed 183 and the offers seeds (see smoke.spec.js: 4 router keys, the settings-load shoe,
// then the Start Game shoe, Vegas 6 decks), keeping a round with a pair, a 7 up (no peek, no offers) and the next two cards different and not finishing a hand:
//   player 4 of hearts + 4 of diamonds against a 7 of diamonds up, king of spades in the hole (17).
//   Split: the first hand draws the king of hearts (14); the second hand's card, the 8 of spades (12), is next in the shoe.
// If the app's use of Math.random changes, the card assertions fail first and the seed needs re-picking.
async function splitAt262(page, settings) {
  const api = await stubApi(page, settings ? { settings } : {});
  await seedRandom(page, 262);
  await login(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Add 10', exact: true }).click();
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('img', { name: '4 of hearts' })).toBeVisible();
  await expect(page.getByRole('img', { name: '4 of diamonds' })).toBeVisible();
  await expect(page.getByRole('img', { name: '7 of diamonds' })).toBeVisible();
  await page.getByRole('button', { name: 'Split' }).click({ timeout: 15_000 }); // hidden while the cards fly
  return api;
}

test('split, one at a time: the second hand holds one card with no buttons until the first is finished, then its card is dealt (#133)', async ({ page }) => {
  const api = await splitAt262(page);
  const hands = page.locator('.player-hand');
  await expect(hands).toHaveCount(2);
  await expect(page.getByRole('img', { name: 'king of hearts' })).toBeVisible(); // the first hand's card
  await expect(page.getByRole('button', { name: 'Stay' })).toBeVisible({ timeout: 15_000 }); // the first hand to play (hidden while its card flies)
  await expect(hands.nth(0).locator('.fly-card')).toHaveCount(2);
  await expect(hands.nth(1).locator('.fly-card')).toHaveCount(1); // only the card that moved
  await expect(page.getByRole('img', { name: '8 of spades' })).toHaveCount(0); // the second hand's card is still in the shoe: it must not be on the page
  expect(await page.content()).not.toContain('8 of spades');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'two split hands must not scroll the board sideways').toBe(true); // matters at phone size

  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByRole('img', { name: '8 of spades' })).toBeVisible(); // dealt to the second hand as play reaches it
  await expect(hands.nth(1).locator('.fly-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Stay' })).toBeVisible({ timeout: 15_000 }); // the second hand is now in play
  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByText('Click anywhere to continue...')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'king of spades' })).toBeVisible(); // the dealer played: 17 beats 14 and 12

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toEqual([
    { amount: 10, newRound: true, requestId: expect.any(String) },
    { amount: 10, newRound: false, requestId: expect.any(String) }, // the split stake, taken at the split
  ]);
  expect(api.settles).toEqual([{ payout: 0, requestId: expect.any(String) }]);
});

test('split, both at once: the second hand has its card straight away (#133)', async ({ page }) => {
  const api = await splitAt262(page, { ...VEGAS, splitDeal: 'both' });
  await expect(page.locator('.player-hand')).toHaveCount(2);
  await expect(page.getByRole('img', { name: 'king of hearts' })).toBeVisible();
  await expect(page.getByRole('img', { name: '8 of spades' })).toBeVisible(); // no waiting
  await expect(page.getByRole('button', { name: 'Stay' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.player-hand').nth(1).locator('.fly-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Stay' }).click();
  await page.getByRole('button', { name: 'Stay' }).click({ timeout: 15_000 });
  await expect(page.getByText('Click anywhere to continue...')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toHaveLength(2);
});
