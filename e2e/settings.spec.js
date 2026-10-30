import { test, expect, stubApi } from './fixtures';

// Table rules on the Settings page (#91): the controls come from the saved settings, and a save writes version 4 with the whole key set.
async function openGameSettings(page) {
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await page.goto('/');
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByPlaceholder('Username or Email').fill('tester');
  await page.getByPlaceholder('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await (await settingsLoaded).finished();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  // A save before the load is applied is refused (it would overwrite the stored table): wait until the loaded table shows (the fixture's Rate of Play).
  await page.getByRole('tab', { name: 'Dev' }).click();
  await expect(page.getByLabel('playTimeout', { exact: true })).toHaveValue('250');
  await page.getByRole('tab', { name: 'Game' }).click();
}

const control = (page, key) => page.getByLabel(key, { exact: true });

test('a new player sees the Vegas rules, and changing one saves version 4 with every setting (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openGameSettings(page);
  await expect(control(page, 'dealerHitsSoft17')).toBeChecked();
  await expect(control(page, 'blackjackPayout')).toHaveValue('3:2');
  await expect(control(page, 'doubleOn')).toHaveValue('any');
  await expect(control(page, 'deckCount')).toHaveValue('6');
  await expect(control(page, 'noHoleCardLoss')).toHaveCount(0); // a peek finds a dealer blackjack before any extra stake

  await control(page, 'blackjackPayout').selectOption('6:5');
  await expect(page.getByText(/A \$10 blackjack wins only \$12/)).toBeVisible();
  await control(page, 'Save blackjackPayout').click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 4, blackjackPayout: '6:5', dealerHitsSoft17: true, noHoleCardLoss: 'original', deckCount: 6, maxSplitHands: 4 });
  expect(Object.keys(api.saves[0])).toEqual(expect.arrayContaining(['dealerHoleBehaviour', 'doubleOn', 'doubleAfterSplit', 'resplitAces', 'hitSplitAces', 'playTimeout']));
});

test('a table saved before #91 keeps its payout rules, and the next save upgrades it to version 4 with them (#91)', async ({ page }) => {
  const api = await stubApi(page, { settings: { v: 1, playTimeout: 250, dealerHoleBehaviour: 'drawAfter' } });
  await openGameSettings(page);
  await expect(control(page, 'dealerHitsSoft17')).not.toBeChecked(); // the old table stood on soft 17
  await expect(control(page, 'deckCount')).toHaveValue('2');
  await expect(control(page, 'maxSplitHands')).toHaveValue('0');
  await expect(control(page, 'noHoleCardLoss')).toHaveValue('all'); // with no hole card, a dealer blackjack still takes everything
  await expect(control(page, 'surrender')).toHaveValue('none'); // an old table never gains surrender
  await expect(control(page, 'insurance')).not.toBeChecked(); // nor insurance

  await control(page, 'resplitAces').check();
  await control(page, 'Save resplitAces').click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({
    v: 4, resplitAces: true, surrender: 'none', insurance: false, dealerHitsSoft17: false, noHoleCardLoss: 'all', blackjackPayout: '3:2', deckCount: 2, maxSplitHands: 0, dealerHoleBehaviour: 'drawAfter',
  });
});

test('Surrender is a rule: the hint follows the choice, and saving it writes version 4 with surrender early (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openGameSettings(page);
  await expect(control(page, 'surrender')).toHaveValue('late');
  await expect(page.getByText(/Give up half your bet on your first two cards/)).toBeVisible();

  await control(page, 'surrender').selectOption('early');
  await expect(page.getByText(/You keep the half even if the dealer has one/)).toBeVisible();
  await control(page, 'Save surrender').click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 4, surrender: 'early', dealerHoleBehaviour: 'drawEarly_Check', deckCount: 6 });
});

test('Insurance and Even Money is on for a new player, and unticking it saves version 4 with insurance off (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openGameSettings(page);
  await expect(control(page, 'insurance')).toBeChecked();
  await expect(page.getByText(/insure for half your bet; it pays 2:1 if the dealer has blackjack/)).toBeVisible();
  await expect(control(page, 'rulePreset')).toHaveValue('Vegas');

  await control(page, 'insurance').uncheck();
  await control(page, 'Save insurance').click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 4, insurance: false, surrender: 'late', deckCount: 6 });
  await expect(control(page, 'rulePreset')).toHaveValue('Custom'); // every preset has insurance on
});
