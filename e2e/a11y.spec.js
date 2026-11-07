import { test, expect, stubApi, seedRandom, login, submitLogin, openTable } from './fixtures';
import { expectNoSeriousA11y } from './a11y';

// Automated accessibility scans (#120): axe on each screen; serious and critical violations fail (see e2e/a11y.js).

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
    // Scan only once the loaded table shows (the fixture's Rate of Play), as settings.spec.js does.
    await page.getByRole('tab', { name: 'Dev' }).click();
    await expect(page.getByLabel('playTimeout', { exact: true })).toHaveValue('250');
    await page.getByRole('tab', { name: 'Player' }).click();
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

// Error, dialog, hover and focus states (#125).
test('sign-in error has no serious accessibility violations (#125)', async ({ page }) => {
  await stubApi(page, { loginError: { status: 401, message: 'Invalid username or password.' } });
  await submitLogin(page);
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
  await expectNoSeriousA11y(page, 'sign-in, error');
});

test('top-up dialog error has no serious accessibility violations (#125)', async ({ page }) => {
  await stubApi(page, { startCredits: 40, topUps: [{ status: 400, message: "That didn't work." }] });
  await openTable(page);
  const balance = page.getByText('Credits:');
  for (let i = 0; i < 7; i++) await balance.click();
  const dialog = page.getByRole('dialog', { name: 'Enter code' });
  await dialog.getByLabel('Code').fill('wrong-dummy-code');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog.getByRole('alert')).toHaveText("That didn't work.");
  await expectNoSeriousA11y(page, 'top-up dialog, error');
});

test('top-up dialog with the Code input focused has no serious accessibility violations (#125)', async ({ page }) => {
  await stubApi(page, { startCredits: 40 });
  await openTable(page);
  const balance = page.getByText('Credits:');
  for (let i = 0; i < 7; i++) await balance.click();
  await expect(page.getByRole('dialog', { name: 'Enter code' }).getByLabel('Code')).toBeFocused();
  await expectNoSeriousA11y(page, 'top-up dialog, Code focused');
});

test('offers dialog (insurance) has no serious accessibility violations (#125)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 207); // the smoke test's insurance deal: 10 of clubs against an ace of diamonds
  await openTable(page);
  await page.getByRole('button', { name: 'Add 10', exact: true }).click();
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Offers' }).getByRole('button', { name: 'Insurance $5' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.board.busy')).toHaveCount(0);
  await expectNoSeriousA11y(page, 'offers (insurance)');
});

test('hovered and keyboard-focused controls while betting have no serious accessibility violations (#125)', async ({ page }) => {
  await stubApi(page);
  await openTable(page);
  const chip = page.getByRole('button', { name: 'Add 10', exact: true });
  await chip.hover();
  await expectNoSeriousA11y(page, 'board, chip hovered');
  await chip.click();
  const deal = page.getByRole('button', { name: 'Deal', exact: true });
  await deal.hover();
  await expectNoSeriousA11y(page, 'board, Deal hovered');
  await page.keyboard.press('Tab'); // real keyboard focus, so :focus-visible styles apply
  await expect(page.locator(':focus-visible')).toHaveCount(1);
  await expectNoSeriousA11y(page, 'board, keyboard focus');
});
