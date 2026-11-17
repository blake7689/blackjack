import { test, expect, stubApi } from './fixtures';

// Routing guards for the react-router-dom upgrade (#112): hard deep links, ?tab=, Back to game, browser back/forward.
// The preview server falls back to index.html for any path, so page.goto('/settings?...') loads the app at that route.
test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.addInitScript(() => sessionStorage.setItem('bj.token', 'e2e-token')); // signed in without the login form
});

const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const settingsButton = (page) => page.getByRole('button', { name: 'Settings', exact: true });

// A signed-in player opens straight on the table (the saved session is restored, then the game starts and / is replaced by /game).
async function openGame(page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();
}

test('a hard deep link to /settings?tab= opens that tab, an unknown tab falls back to Player, and a reload keeps the tab (#112)', async ({ page }) => {
  await page.goto('/settings?tab=dev');
  await expect(tab(page, 'Dev')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Player')).toHaveAttribute('aria-selected', 'false');

  await page.reload();
  await expect(tab(page, 'Dev')).toHaveAttribute('aria-selected', 'true');

  await page.goto('/settings?tab=game');
  await expect(tab(page, 'Game')).toHaveAttribute('aria-selected', 'true');

  await page.goto('/settings?tab=nope');
  await expect(tab(page, 'Player')).toHaveAttribute('aria-selected', 'true');
});

test('Back to game returns to the game, and the header Settings reopens the same tab (#112)', async ({ page }) => {
  await openGame(page);
  await settingsButton(page).click();
  await tab(page, 'Dev').click();
  await expect(page).toHaveURL(/\/settings\?tab=dev$/);

  await page.getByRole('button', { name: 'Back to game' }).click();
  await expect(page).toHaveURL(/\/game$/);

  await settingsButton(page).click();
  await expect(page).toHaveURL(/\/settings\?tab=dev$/);
  await expect(tab(page, 'Dev')).toHaveAttribute('aria-selected', 'true');
});

test('browser back and forward move between the game and Settings without reloading the page (#112)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__noReload = true; }); // a reload would drop it
  await settingsButton(page).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(tab(page, 'Player')).toHaveAttribute('aria-selected', 'true');

  await page.goBack();
  await expect(page).toHaveURL(/\/game$/);
  await expect(settingsButton(page)).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(tab(page, 'Player')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
});

test('Home from the menu stays on Home, the table is one click away, and nothing bounces back (#81)', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveURL(/\/$/);
  const start = page.getByRole('button', { name: 'Start Game' });
  await expect(start).toBeVisible();
  await expect(page.getByText('Shuffling up...')).toHaveCount(0);
  await expect(start).toBeVisible(); // still Home a moment later: once per restore or sign-in, never on every visit to /
  await start.click();
  await expect(page).toHaveURL(/\/game$/);
});

test('/game without a started game goes to Home, and a signed-out / stays Home: no redirect loop (#81)', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.removeItem('bj.token'));
  await page.goto('/game');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Please log in to start playing.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/$/);
});
