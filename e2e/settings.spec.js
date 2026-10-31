import { test, expect, stubApi } from './fixtures';

// Table rules on the Settings page (#91): the rules section applies a click at once, and a save writes version 4 with the whole key set.
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
const group = (page, name) => page.getByRole('group', { name, exact: true });
// An option reads "6:5 +1.39% house edge": match the label at the start of the name; the lookahead stops "Early" matching "Early (not against an ace)".
const option = (page, name, label) => group(page, name).getByRole('button', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}(?= [+-]\\d|$)`) });
const tile = (page, name, pressed = true) => page.getByRole('button', { name: new RegExp(`^${name}`), pressed });
const customTile = (page) => page.locator('[aria-current="true"]');
// Customize, House variations and Advanced start closed: open one by its summary.
const openDetails = (page, title) => page.locator('summary', { hasText: title }).click();

test('a new player sees the Vegas tile chosen, and changing a rule saves version 4 with every setting at once (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openGameSettings(page);
  await expect(tile(page, 'Vegas')).toBeVisible();
  await expect(customTile(page)).toHaveCount(0);
  await openDetails(page, 'Customize rules');
  await expect(option(page, 'Soft 17', 'Hits')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'Blackjack Pays', '3:2')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'Double On', 'Any two cards')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'Deck size: 6', '6')).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, 'If the Dealer Has Blackjack, You Lose')).toHaveCount(0); // a peek finds a dealer blackjack before any extra stake

  await option(page, 'Blackjack Pays', '6:5').click();
  await expect(page.getByText(/A \$10 blackjack wins only \$12/)).toBeVisible();
  await expect(customTile(page)).toContainText('Custom');

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 4, blackjackPayout: '6:5', dealerHitsSoft17: true, noHoleCardLoss: 'original', deckCount: 6, maxSplitHands: 4 });
  expect(Object.keys(api.saves[0])).toEqual(expect.arrayContaining(['dealerHoleBehaviour', 'doubleOn', 'doubleAfterSplit', 'resplitAces', 'hitSplitAces', 'playTimeout']));
});

test('a table saved before #91 keeps its payout rules, shows Custom, and the next change upgrades it to version 4 with them (#91)', async ({ page }) => {
  const api = await stubApi(page, { settings: { v: 1, playTimeout: 250, dealerHoleBehaviour: 'drawAfter' } });
  await openGameSettings(page);
  await expect(customTile(page)).toContainText('Custom');
  await openDetails(page, 'Customize rules');
  await expect(option(page, 'Soft 17', 'Stands')).toHaveAttribute('aria-pressed', 'true'); // the old table stood on soft 17
  await expect(option(page, 'Deck size: 2', '2')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'Max Hands After Splits: Unlimited', 'Unlimited')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'If the Dealer Has Blackjack, You Lose', 'Everything you staked')).toHaveAttribute('aria-pressed', 'true'); // with no hole card a dealer blackjack still takes everything
  await expect(option(page, 'Surrender', 'None')).toHaveAttribute('aria-pressed', 'true'); // an old table never gains surrender
  await expect(option(page, 'Insurance and Even Money', 'Off')).toHaveAttribute('aria-pressed', 'true'); // nor insurance

  await option(page, 'Resplit Aces', 'On').click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({
    v: 4, resplitAces: true, surrender: 'none', insurance: false, dealerHitsSoft17: false, noHoleCardLoss: 'all', blackjackPayout: '3:2', deckCount: 2, maxSplitHands: 0, dealerHoleBehaviour: 'drawAfter',
  });
});

test('Surrender is a rule: the hint follows the choice, and choosing Early saves version 4 with surrender early (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openGameSettings(page);
  await openDetails(page, 'Customize rules');
  await expect(option(page, 'Surrender', 'Late')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Give up half your bet on your first two cards/)).toBeVisible();

  await option(page, 'Surrender', 'Early').click();
  await expect(page.getByText(/You keep the half even if the dealer has one/)).toBeVisible();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 4, surrender: 'early', dealerHoleBehaviour: 'drawEarly_Check', deckCount: 6 });
});

test('Insurance and Even Money is on for a new player, and switching it off saves version 4 with insurance off and shows Custom (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openGameSettings(page);
  await openDetails(page, 'Customize rules');
  await expect(option(page, 'Insurance and Even Money', 'On')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/insure for half your bet; it pays 2:1 if the dealer has blackjack/)).toBeVisible();
  await expect(tile(page, 'Vegas')).toBeVisible();

  await option(page, 'Insurance and Even Money', 'Off').click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 4, insurance: false, surrender: 'late', deckCount: 6 });
  await expect(customTile(page)).toContainText('Custom'); // every preset has insurance on
});

test('choosing a preset tile applies the whole preset at once and saves it (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openGameSettings(page);
  await expect(tile(page, 'Europe', false)).toContainText('house edge');
  await tile(page, 'Europe', false).click();

  await expect(tile(page, 'Europe')).toBeVisible();
  await expect(tile(page, 'Vegas', false)).toBeVisible();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({
    v: 4, deckCount: 6, dealerHoleBehaviour: 'drawAfter', dealerHitsSoft17: false, doubleOn: '9-11', maxSplitHands: 0, noHoleCardLoss: 'all',
    surrender: 'none', insurance: true, blackjackPaysImmediately: false, playTimeout: 250,
  });
  await expect(page.locator('[aria-live="polite"]')).toContainText('This table:');
});

test('a change in Advanced makes the table Custom, and putting it back shows the preset again (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openGameSettings(page);
  await openDetails(page, 'Advanced');
  await control(page, 'blackJackOnSplit').check();
  await expect(customTile(page)).toContainText('Custom');
  await expect(tile(page, 'Vegas', false)).toBeVisible();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 4, blackJackOnSplit: true });

  await control(page, 'blackJackOnSplit').uncheck();
  await expect(customTile(page)).toHaveCount(0);
  await expect(tile(page, 'Vegas')).toBeVisible();
  await expect.poll(() => api.saves.length).toBe(2);
});

test('on a phone the rules section does not scroll sideways and every control is at least 44px high (#91)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await stubApi(page);
  await openGameSettings(page);
  await expect(tile(page, 'Vegas')).toBeVisible();
  for (const title of ['Customize rules', 'House variations', 'Advanced']) await openDetails(page, title);
  await expect(option(page, 'Surrender', 'Late')).toBeVisible();

  const [scrollWidth, clientWidth] = await page.locator('.page-bg').evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  const targets = page.locator('.rule-tile, .seg-btn, .rules-section summary, .toggle-row');
  const count = await targets.count();
  expect(count).toBeGreaterThan(30);
  const tooSmall = [];
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox();
    if (!box || box.height < 44) tooSmall.push(`${await targets.nth(i).innerText()} ${box?.height}`);
  }
  expect(tooSmall).toEqual([]);
});
