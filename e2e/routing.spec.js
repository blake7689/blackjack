import { test, expect, stubApi } from './fixtures';

// Routing guards for the react-router-dom upgrade (#112): hard deep links, ?tab=, Back to game, browser back/forward.
// The preview server falls back to index.html for any path, so page.goto('/settings?...') loads the app at that route.
test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.addInitScript(() => sessionStorage.setItem('bj.token', 'e2e-token')); // signed in without the login form
});

const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const settingsButton = (page) => page.getByRole('button', { name: 'Settings', exact: true });

async function openGame(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page).toHaveURL(/\/game$/);
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
