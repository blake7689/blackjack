import { test, expect, stubApi, seedRandom, login, submitLogin, openTable, placeBet, VEGAS } from './fixtures';
import { expectNoSeriousA11y } from './a11y';

// Automated accessibility scans (#120): axe on each screen; serious and critical violations fail (see e2e/a11y.js).

test('sign-in page has no serious accessibility violations (#120)', async ({ page }) => {
  await stubApi(page);
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  await expectNoSeriousA11y(page, 'sign-in');
});

test('Create an account has no serious accessibility violations, empty and with its errors showing (#87)', async ({ page }) => {
  await stubApi(page);
  await page.goto('/signup');
  await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible();
  await expectNoSeriousA11y(page, 'create an account');
  await page.getByLabel('Username', { exact: true }).fill('ab');
  await page.getByLabel('Email', { exact: true }).fill('nope');
  await expect(page.getByText('Invalid email format.')).toBeVisible();
  await expectNoSeriousA11y(page, 'create an account, with errors');
});

test('Home, signed out and signed in, and the Error screen have no serious accessibility violations (#87)', async ({ page }) => {
  await stubApi(page, { meFailures: 1 });
  await page.goto('/');
  await expect(page.getByText('Please log in to start playing.')).toBeVisible();
  await expectNoSeriousA11y(page, 'home, signed out');

  await page.addInitScript(() => sessionStorage.setItem('bj.token', 'e2e-token'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Can\'t reach the table' })).toBeVisible();
  await expectNoSeriousA11y(page, 'error screen');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Home' }).click();
  await expect(page.getByText('Signed in as tester')).toBeVisible();
  await expect(page.locator('main.page.home')).toBeVisible(); // Home has no hero any more (L2-5): nothing on it pops in
  await expectNoSeriousA11y(page, 'home, signed in');
});

test('the Table rules sheet has no serious accessibility violations, over the table and over Home (#87)', async ({ page }) => {
  await stubApi(page);
  await openTable(page);
  await page.getByRole('button', { name: 'Table rules' }).click();
  const sheet = page.getByRole('dialog', { name: 'Table rules' });
  await expect(sheet).toBeVisible();
  await expectNoSeriousA11y(page, 'rules sheet, over the table');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Rules' }).click();
  await expect(sheet).toBeVisible();
  await expectNoSeriousA11y(page, 'rules sheet, over Home');
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
  await expect(page.locator('.bal-lbl')).toHaveCSS('opacity', '1'); // on a phone the bet badge hides the label for 3 s: axe skips a hidden one
  await expectNoSeriousA11y(page, 'board, mid-round');
});

test('game board at the results has no serious accessibility violations, and announces them (#85)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 183); // the smoke test's deal: Hit makes 19, Stay, the dealer draws to 19 (a push)
  await openTable(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await page.getByRole('button', { name: 'Hit', exact: true }).click({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: '5 of hearts' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay', exact: true }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.board.busy')).toHaveCount(0);
  await expect(page.locator('.msg .verdict')).toBeVisible();
  await expect(page.locator('.bal .delta')).toHaveCSS('opacity', '1'); // the balance badge is on show for the scan: axe skips a faded-out one
  await expect(page.getByText('Hand 1: push, 19. Dealer: 19.')).toBeAttached(); // what a screen reader hears
  await expect(page.locator('[aria-live]')).toHaveCount(1); // one live region on the table
  await expectNoSeriousA11y(page, 'board, results');
});

// Touch targets (#85): 44 px or more, in both directions, on the table's top bar (and its open menu), the dock's keys in every face, and the sign-in form.
const tooSmall = (locator) => locator.evaluateAll((els) => els
  .filter((el) => el.checkVisibility())
  .map((el) => [el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20) || el.placeholder, Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)])
  .filter(([, w, h]) => w < 44 || h < 44));

test('the top bar, its menu and the dock keys are at least 44 px, in every face of the dock (#85)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 65); // the layout test's round: offers (insurance), your move, the results
  await openTable(page);
  const bar = page.getByRole('banner').getByRole('button');
  const dock = page.getByRole('contentinfo', { name: 'Controls' }).getByRole('button');
  const small = async (label) => expect({ label, found: [...await tooSmall(bar), ...await tooSmall(dock)] }, `${label}: targets under 44 px`).toEqual({ label, found: [] });
  await placeBet(page);
  await small('betting');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Menu' })).toBeVisible();
  expect(await tooSmall(page.getByRole('navigation', { name: 'Menu' }).getByRole('button')), 'the open menu').toEqual([]);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  const offers = page.getByRole('group', { name: 'Offers' });
  await expect(offers.getByRole('button', { name: 'Insurance $5' })).toBeEnabled({ timeout: 15_000 });
  await small('offers');
  await offers.getByRole('button', { name: 'No thanks' }).click();
  await expect(page.getByRole('button', { name: 'Hit', exact: true })).toBeEnabled({ timeout: 15_000 });
  await small('your move');
  await page.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await small('results');
});

test('the sign-in form has 44 px targets (#85)', async ({ page }) => {
  await stubApi(page);
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  expect(await tooSmall(page.locator('main').getByRole('textbox').or(page.locator('main input')).or(page.locator('main').getByRole('button'))), 'sign-in').toEqual([]);
});

// Settings is one page (#84): scan it closed, then once per section opened.

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
    await expectNoSeriousA11y(page, 'settings, closed');
  });

  for (const name of ['Table rules', 'Gameplay', 'Chips', 'Appearance', 'Sound & haptics', 'Account']) {
    test(`Settings with ${name} open has no serious accessibility violations (#84)`, async ({ page }) => {
      await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-expanded', 'true');
      await expectNoSeriousA11y(page, `settings, ${name} open`);
    });
  }

  test('Settings with Sound & haptics open and Sound on (Volume enabled) has no serious accessibility violations (#86)', async ({ page }) => {
    await page.getByRole('button', { name: /^Sound & haptics/ }).click();
    await page.locator('label.sw', { hasText: 'Sound' }).click(); // the checkbox sits under its track: tap the row
    await expect(page.getByRole('slider', { name: 'Volume' })).toBeEnabled();
    await expectNoSeriousA11y(page, 'settings, Sound & haptics open, Sound on');
  });

  test('Settings with unsaved changes and the save bar has no serious accessibility violations (#84)', async ({ page }) => {
    await page.getByRole('button', { name: /^Table rules/ }).click();
    await page.getByRole('radiogroup', { name: 'Surrender', exact: true }).getByRole('radio', { name: /^None/ }).click();
    await expect(page.getByRole('region', { name: 'Unsaved changes', exact: true })).toBeVisible();
    await expectNoSeriousA11y(page, 'settings, unsaved changes');
  });

  test('Settings preset dropdown open has no serious accessibility violations (#84)', async ({ page }) => {
    await page.getByRole('button', { name: /^Table rules/ }).click();
    await page.getByRole('button', { name: /^Preset/ }).click();
    await expect(page.getByRole('listbox')).toBeFocused();
    await expectNoSeriousA11y(page, 'settings, preset dropdown');
  });

  test('Settings confirm dialog (Discard your changes?) has no serious accessibility violations (#84)', async ({ page }) => {
    await page.getByRole('button', { name: /^Gameplay/ }).click();
    await page.locator('label.sw', { hasText: 'Show the count' }).click(); // the checkbox sits under its track: tap the row
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Discard your changes?' })).toBeVisible();
    await expectNoSeriousA11y(page, 'settings, discard dialog');
  });
});

// Re-auth for account changes (BlackJackAPI#71): the new Settings field and the Delete profile dialog, each with its errors showing, in both modes.
for (const mode of ['dark', 'light']) {
  test.describe(`settings re-auth, ${mode}`, () => {
    test.beforeEach(async ({ page }) => {
      await stubApi(page, { settings: { ...VEGAS, playTimeout: 250, mode } });
      await login(page);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('button', { name: /^Gameplay/ })).toContainText('Very fast');
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    });

    test('the password for a username change: shown, missing and wrong have no serious accessibility violations (BlackJackAPI#71)', async ({ page }) => {
      await page.getByRole('button', { name: /^Account/ }).click();
      await page.getByLabel('Username', { exact: true }).fill('renamed');
      const password = page.getByLabel('Password to save this change');
      await expect(password).toBeVisible();
      await expectNoSeriousA11y(page, 'settings, identity password field');

      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(password).toBeFocused();
      await expect(password).toHaveAttribute('aria-invalid', 'true');
      await expectNoSeriousA11y(page, 'settings, identity password missing');

      await password.fill('wrong-dummy-password');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByRole('alert')).toHaveText('Incorrect password.');
      await expect(password).toBeFocused();
      await expectNoSeriousA11y(page, 'settings, identity password wrong');
    });

    test('the Delete profile dialog, open, with the field empty and refused, has no serious accessibility violations (BlackJackAPI#71)', async ({ page }) => {
      await page.getByRole('button', { name: 'Delete profile' }).click();
      const dialog = page.getByRole('dialog', { name: 'Delete profile?' });
      await expect(dialog.getByLabel('Current password')).toBeVisible();
      await expectNoSeriousA11y(page, 'delete dialog, open');

      await dialog.getByRole('button', { name: 'Delete for good' }).click();
      await expect(dialog.getByRole('alert')).toHaveText('Enter your current password to delete your account.');
      await expectNoSeriousA11y(page, 'delete dialog, missing password');

      await dialog.getByLabel('Current password').fill('wrong-dummy-password');
      await dialog.getByRole('button', { name: 'Delete for good' }).click();
      await expect(dialog.getByRole('alert')).toHaveText('Incorrect password.');
      await expectNoSeriousA11y(page, 'delete dialog, wrong password');
    });
  });
}

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
  await expect(page.locator('.delta.down')).toHaveCSS('opacity', '1'); // the bet's "-$10" badge is on show for the next scan: axe skips a hidden one
  const deal = page.getByRole('button', { name: 'Deal', exact: true });
  await deal.hover();
  await expectNoSeriousA11y(page, 'board, Deal hovered');
  await page.keyboard.press('Tab'); // real keyboard focus, so :focus-visible styles apply
  await expect(page.locator(':focus-visible')).toHaveCount(1);
  await expectNoSeriousA11y(page, 'board, keyboard focus');
});

// The helper itself (#205). The fade lasts an hour, so it is certainly still running while axe reads: no timing involved.
test('the axe helper scans where a running fade ends: a good end colour passes, a low-contrast one still fails (#205)', async ({ page }) => {
  await page.setContent('<!doctype html><html lang="en"><title>fade</title><style>body { background: #000; color: #fff } p { opacity: .3; transition: opacity 3600s linear } p.on { opacity: 1 }</style><main><h1>Fade</h1><p>Balance</p></main></html>');
  const label = page.locator('p');
  const fade = (on) => label.evaluate((el, to) => { getComputedStyle(el).opacity; el.classList.toggle('on', to); }, on);
  await fade(true); // still about .3 (too faint), ending at 1
  await expectNoSeriousA11y(page, 'fading in');
  await expect(page.locator('style')).toHaveCount(1); // the helper took its own style away again
  await expect(label).toHaveCSS('transition-duration', '3600s');
  await fade(false); // still about 1 (readable), ending at .3
  await expect(expectNoSeriousA11y(page, 'fading out')).rejects.toThrow(/color-contrast/);
  await expect(page.locator('style')).toHaveCount(1); // after a failed scan too
});
