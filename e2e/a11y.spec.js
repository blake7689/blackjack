import { test, expect, stubApi, seedRandom } from './fixtures';
import { expectNoSeriousA11y } from './a11y';

// Automated accessibility scans (#120): axe on each screen; serious and critical violations fail (see e2e/a11y.js).
async function login(page) {
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await page.goto('/');
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByPlaceholder('Username or Email').fill('tester');
  await page.getByPlaceholder('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await (await settingsLoaded).finished(); // each settings load builds a shoe: settled before Start Game (seed 183, see smoke.spec.js)
}

async function openTable(page) {
  await login(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByText('Place your bets!')).toBeVisible();
}

test('sign-in page has no serious accessibility violations (#120)', async ({ page }) => {
  await stubApi(page);
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  await expectNoSeriousA11y(page, 'sign-in');
});

test('game board while betting has no serious accessibility violations (#120)', async ({ page }) => {
  await stubApi(page);
  await openTable(page);
  await expectNoSeriousA11y(page, 'board, betting');
});

test('game board mid-round has no serious accessibility violations (#120)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 183); // the smoke test's deal: king of diamonds + 4 of clubs against a 6 of clubs, a jack in the hole
  await openTable(page);
  await page.getByRole('button', { name: 'Add 10', exact: true }).click();
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('img', { name: 'king of diamonds' })).toBeVisible();
  await expect(page.getByRole('img', { name: '6 of clubs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hit' })).toBeVisible({ timeout: 15_000 }); // options appear once the cards have landed
  await expect(page.locator('.board.busy')).toHaveCount(0);
  await expectNoSeriousA11y(page, 'board, mid-round');
});

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await login(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  });

  test('Player tab has no serious accessibility violations (#120)', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Player', selected: true })).toBeVisible();
    await expectNoSeriousA11y(page, 'settings, Player');
  });

  test('Game tab (all sections open) has no serious accessibility violations (#120)', async ({ page }) => {
    await page.getByRole('tab', { name: 'Game' }).click();
    await expect(page.getByRole('tab', { name: 'Game', selected: true })).toBeVisible();
    await expectNoSeriousA11y(page, 'settings, Game');
    for (const title of ['Customize rules', 'House variations', 'Advanced']) {
      await page.locator('summary', { hasText: title }).click();
    }
    await expect(page.locator('details[open]')).toHaveCount(3);
    await expectNoSeriousA11y(page, 'settings, Game, sections open');
  });

  test('Dev tab has no serious accessibility violations (#120)', async ({ page }) => {
    await page.getByRole('tab', { name: 'Dev' }).click();
    await expect(page.getByLabel('playTimeout', { exact: true })).toBeVisible();
    await expectNoSeriousA11y(page, 'settings, Dev');
  });
});

test('top-up dialog has no serious accessibility violations (#120)', async ({ page }) => {
  await stubApi(page, { startCredits: 40 });
  await openTable(page);
  const balance = page.getByText('Credits:');
  for (let i = 0; i < 7; i++) await balance.click();
  await expect(page.getByRole('dialog', { name: 'Enter code' })).toBeVisible();
  await expectNoSeriousA11y(page, 'top-up dialog');
});
