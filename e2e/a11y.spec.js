import { test, expect, stubApi, seedRandom, login, submitLogin, openTable, placeBet } from './fixtures';
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
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('img', { name: 'king of diamonds' })).toBeVisible();
  await expect(page.getByRole('img', { name: '6 of clubs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hit' })).toBeEnabled({ timeout: 15_000 }); // the keys wake up once the cards have landed
  await expect(page.locator('.board.busy')).toHaveCount(0);
  await expectNoSeriousA11y(page, 'board, mid-round');
});

// Settings is one page (#84): scan it closed, then once per section opened. Opening and the switches ease for a moment (chevron, switch track),
// so wait until every running animation or transition has finished before axe reads the colours.
const settled = (page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await login(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    // Scan only once the loaded table shows (the fixture's Rate of Play), as settings.spec.js does.
    await expect(page.getByRole('button', { name: /^Gameplay/ })).toContainText('Very fast');
  });

  test('Settings with every section closed has no serious accessibility violations (#84)', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^Table rules/ })).toHaveAttribute('aria-expanded', 'false');
    await settled(page);
    await expectNoSeriousA11y(page, 'settings, closed');
  });

  for (const name of ['Table rules', 'Gameplay', 'Chips', 'Appearance', 'Account']) {
    test(`Settings with ${name} open has no serious accessibility violations (#84)`, async ({ page }) => {
      await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-expanded', 'true');
      await settled(page);
      await expectNoSeriousA11y(page, `settings, ${name} open`);
    });
  }

  test('Settings with unsaved changes and the Save bar has no serious accessibility violations (#84)', async ({ page }) => {
    await page.getByRole('button', { name: /^Table rules/ }).click();
    await page.getByRole('radiogroup', { name: 'Surrender', exact: true }).getByRole('radio', { name: /^None/ }).click();
    await expect(page.getByRole('region', { name: 'Save bar' })).toBeVisible();
    await settled(page);
    await expectNoSeriousA11y(page, 'settings, unsaved changes');
  });

  test('Settings preset dropdown open has no serious accessibility violations (#84)', async ({ page }) => {
    await page.getByRole('button', { name: /^Table rules/ }).click();
    await page.getByRole('button', { name: /^Preset/ }).click();
    await expect(page.getByRole('listbox')).toBeFocused();
    await settled(page);
    await expectNoSeriousA11y(page, 'settings, preset dropdown');
  });

  test('Settings confirm dialog (Discard your changes?) has no serious accessibility violations (#84)', async ({ page }) => {
    await page.getByRole('button', { name: /^Gameplay/ }).click();
    await page.locator('label.sw', { hasText: 'Show the count' }).click(); // the checkbox sits under its track: tap the row
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Discard your changes?' })).toBeVisible();
    await settled(page);
    await expectNoSeriousA11y(page, 'settings, discard dialog');
  });
});

test('top-up dialog has no serious accessibility violations (#120)', async ({ page }) => {
  await stubApi(page, { startCredits: 40 });
  await openTable(page);
  const balance = page.getByText('Balance', { exact: true });
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
  const balance = page.getByText('Balance', { exact: true });
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
  const balance = page.getByText('Balance', { exact: true });
  for (let i = 0; i < 7; i++) await balance.click();
  await expect(page.getByRole('dialog', { name: 'Enter code' }).getByLabel('Code')).toBeFocused();
  await expectNoSeriousA11y(page, 'top-up dialog, Code focused');
});

test('offers dialog (insurance) has no serious accessibility violations (#125)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 207); // the smoke test's insurance deal: 10 of clubs against an ace of diamonds
  await openTable(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Offers' }).getByRole('button', { name: 'Insurance $5' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.board.busy')).toHaveCount(0);
  await expectNoSeriousA11y(page, 'offers (insurance)');
});

test('hovered and keyboard-focused controls while betting have no serious accessibility violations (#125)', async ({ page }) => {
  await stubApi(page);
  await openTable(page);
  const chip = page.getByRole('button', { name: '$10 chip', exact: true });
  await chip.hover();
  await expectNoSeriousA11y(page, 'board, chip hovered');
  await chip.dblclick(); // a double click selects the chip and bets it
  // the bet's "-$10" badge pops in over 420 ms (opacity 0 to 1): axe must not scan its blended colour mid-pop
  await expect(page.locator('.delta.down')).toHaveCSS('opacity', '1');
  const deal = page.getByRole('button', { name: 'Deal', exact: true });
  await deal.hover();
  await expectNoSeriousA11y(page, 'board, Deal hovered');
  await page.keyboard.press('Tab'); // real keyboard focus, so :focus-visible styles apply
  await expect(page.locator(':focus-visible')).toHaveCount(1);
  await expectNoSeriousA11y(page, 'board, keyboard focus');
});
