import { test, expect, stubApi, seedRandom, VEGAS } from './fixtures';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Auto deal (#88): after the first round the table continues, rebets and deals the next round by itself. The test clicks Deal once,
// for round 1; every later click is a card action. Cards are the smoke test's (seed 183, see smoke.spec.js): player 14, dealer 6 up and a jack in the hole; round 2 deals a player hand that can Hit.
test('auto deal continues, rebets and deals the next round with no click (#88)', async ({ page }) => {
  const api = await stubApi(page, { settings: { ...VEGAS, playTimeout: 250, resetInitialBet: true, autoDeal: true, autoDealDelay: 300 } });
  await seedRandom(page, 183);
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await page.goto('/');
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByPlaceholder('Username or Email').fill('tester');
  await page.getByPlaceholder('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await (await settingsLoaded).finished();
  await page.getByRole('button', { name: 'Start Game' }).click();

  await expect(page.getByRole('button', { name: 'Pause auto deal' })).toBeVisible(); // the setting reached the table
  await page.getByRole('button', { name: 'Add 10', exact: true }).click();
  await page.getByRole('button', { name: 'Deal', exact: true }).click(); // the only Deal click of the test
  await expect(page.getByRole('img', { name: 'king of diamonds' })).toBeVisible();
  await page.getByRole('button', { name: 'Hit' }).click({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: '5 of hearts' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay' }).click({ timeout: 15_000 });

  // Round 1 settles, then the second opening bet reaches the ledger with no further click.
  await expect.poll(() => api.bets.length, { timeout: 30_000 }).toBe(2);
  expect(api.settles).toHaveLength(1);
  expect(api.bets).toEqual([
    { amount: 10, newRound: true, requestId: expect.stringMatching(V4) },
    { amount: 10, newRound: true, requestId: expect.stringMatching(V4) },
  ]);
  expect(api.bets[1].requestId).not.toBe(api.bets[0].requestId);
  await expect(page.getByRole('button', { name: 'Hit' })).toBeVisible({ timeout: 15_000 }); // round 2 is on the table, on the player's turn
  expect(api.failed).toEqual([]);
});
