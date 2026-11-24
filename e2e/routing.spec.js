import { test, expect, stubApi } from './fixtures';

// Routing guards for the react-router-dom upgrade (#112): hard deep links, the Settings hash (#84), Table, browser back/forward.
// The preview server falls back to index.html for any path, so page.goto('/settings#...') loads the app at that route.
test.beforeEach(async ({ page }) => {
  await stubApi(page);
  await page.addInitScript(() => sessionStorage.setItem('bj.token', 'e2e-token')); // signed in without the login form
});

const section = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) });
const settingsButton = (page) => page.getByRole('button', { name: 'Settings', exact: true });

// A signed-in player opens straight on the table (the saved session is restored, then the game starts and / is replaced by /game).
async function openGame(page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();
}

test('a hard deep link to /settings#section opens that section, an unknown hash or the old ?tab opens none, and a reload keeps the section (#84)', async ({ page }) => {
  await page.goto('/settings#chips');
  await expect(section(page, 'Chips')).toHaveAttribute('aria-expanded', 'true');
  await expect(section(page, 'Table rules')).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await expect(section(page, 'Chips')).toHaveAttribute('aria-expanded', 'true');

  await page.goto('/settings#rules'); // a hash change on the page itself is not a new visit; the reload makes it one
  await page.reload();
  await expect(section(page, 'Table rules')).toHaveAttribute('aria-expanded', 'true');

  for (const url of ['/settings#nope', '/settings?tab=dev', '/settings']) {
    await page.goto(url);
    await page.reload(); // a fresh visit, even when only the hash differs from the page before
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    for (const name of ['Table rules', 'Gameplay', 'Chips', 'Appearance', 'Account']) await expect(section(page, name), `${url} ${name}`).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('Table returns to the game, and Settings opens with every section closed again (#84)', async ({ page }) => {
  await openGame(page);
  await settingsButton(page).click();
  await expect(page).toHaveURL(/\/settings$/);
  await section(page, 'Gameplay').click();
  await expect(section(page, 'Gameplay')).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByRole('button', { name: 'Back to game' })).toHaveCount(0);

  await settingsButton(page).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(section(page, 'Gameplay')).toHaveAttribute('aria-expanded', 'false');
});

test('the Table rules item of the table menu opens the rules sheet, and Change rules goes to Settings on the Table rules section (#84, #87)', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Table rules' }).click();
  await expect(page.getByRole('dialog', { name: 'Table rules' })).toBeVisible();
  await page.getByRole('link', { name: 'Change rules' }).click();
  await expect(page).toHaveURL(/\/settings#rules$/);
  await expect(section(page, 'Table rules')).toHaveAttribute('aria-expanded', 'true');
});

test('browser back and forward move between the game and Settings without reloading the page (#112)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.__noReload = true; }); // a reload would drop it
  await settingsButton(page).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/game$/);
  await expect(settingsButton(page)).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
});

test('Home from the menu stays on Home, the table is one click away, and nothing bounces back (#81)', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveURL(/\/$/);
  const start = page.getByRole('link', { name: 'Play' });
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

// L1-14: a reload on /game while signed in lands on the table, whether the saved settings answer at once or late (WebKit used to land on Home when they were instant).
for (const delay of [0, 300]) {
  test(`a reload on /game lands on the table, never on Home, with the settings answering after ${delay} ms (L1-14)`, async ({ page }) => {
    await page.route('http://api.e2e.test/**', async (route) => {
      if (delay && route.request().method() === 'GET' && route.request().url().endsWith('/player/me/settings')) await new Promise((resolve) => setTimeout(resolve, delay));
      return route.fallback();
    });
    await openGame(page);
    await page.reload();
    await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByRole('link', { name: 'Play' })).toHaveCount(0);
  });
}
