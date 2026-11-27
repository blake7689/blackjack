import { test, expect, stubApi, login, submitLogin, placeBet, ACCOUNT_PASSWORD } from './fixtures';

// BlackJackAPI#71: changing the username or email, and deleting the profile, need the current password. The stub follows the API's rules and records
// every body. Runs in all three projects: where the focused field ends up depends on the screen's size and engine.
const NEEDED = 'Enter your current password to change your username or email.';
const NAMES = { userName: 'tester', email: 'tester@e2e.test', firstName: 'Test', lastName: 'Er' };

async function openSettings(page) {
  await login(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Gameplay/ })).toContainText('Very fast'); // the saved settings are applied
}
const account = (page) => page.getByRole('button', { name: /^Account/ });
const username = (page) => page.getByLabel('Username', { exact: true });
const identityPassword = (page) => page.getByLabel('Password to save this change');
const save = (page) => page.getByRole('button', { name: 'Save changes' });
const dialogOf = (page) => page.getByRole('dialog', { name: 'Delete profile?' });
const savedNote = (page) => page.getByRole('status').filter({ hasText: /^Saved$/ });
const notSaved = (page) => page.getByRole('status').filter({ hasText: "Your profile isn't saved yet." });
const stored = (page) => page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));

// On screen and on top: nothing (the fixed save bar least of all) covers the field's top, middle or bottom.
const uncovered = (field) => field.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return [r.top + 2, r.top + r.height / 2, r.bottom - 2].every((y) => document.elementFromPoint(r.left + r.width / 2, y) === el);
});

test('a rename sends the current password with the new username, then the field goes away (BlackJackAPI#71)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  await account(page).click();
  await expect(identityPassword(page)).toHaveCount(0);

  await username(page).fill('renamed');
  await expect(identityPassword(page)).toHaveAttribute('type', 'password');
  await expect(identityPassword(page)).toHaveAttribute('autocomplete', 'current-password');
  await expect(identityPassword(page)).toHaveAccessibleDescription('Needed to change your username or email.');
  await identityPassword(page).fill(ACCOUNT_PASSWORD);
  await expect(page.getByRole('region', { name: 'Unsaved changes', exact: true })).toContainText('1 unsaved change');
  await save(page).click();

  await expect(savedNote(page)).toBeVisible();
  expect(api.profiles).toEqual([{ ...NAMES, userName: 'renamed', currentPassword: ACCOUNT_PASSWORD }]);
  await expect(identityPassword(page)).toHaveCount(0);
  await expect(username(page)).toHaveValue('renamed');
  expect(await stored(page)).not.toContain(ACCOUNT_PASSWORD);
});

test('Save with the password empty sends no username or email: the field says why, is focused and is not covered (BlackJackAPI#71)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  await account(page).click();
  await username(page).fill('renamed');
  await account(page).click(); // collapsed again: Save has to bring the player back
  await expect(save(page)).not.toHaveAttribute('aria-disabled', 'true');
  await save(page).click();

  await expect(account(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(identityPassword(page)).toBeFocused();
  await expect(identityPassword(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(identityPassword(page)).toHaveAccessibleDescription(`Needed to change your username or email. ${NEEDED}`);
  await expect(page.getByText(NEEDED)).toBeVisible();
  await expect(notSaved(page)).toBeVisible();
  await expect.poll(() => uncovered(identityPassword(page))).toBe(true);
  expect(api.profiles).toEqual([]);

  // with a name changed too, the name saves with the OLD username and no currentPassword key
  await page.getByLabel('First name').fill('Ada');
  await save(page).click();
  await expect.poll(() => api.profiles.length).toBe(1);
  expect(api.profiles[0]).toStrictEqual({ ...NAMES, firstName: 'Ada' });
  await expect(identityPassword(page)).toBeFocused();
  await expect.poll(() => uncovered(identityPassword(page))).toBe(true);
  await expect(username(page)).toHaveValue('renamed'); // the edit is kept
  await expect(page.getByRole('region', { name: 'Unsaved changes', exact: true })).toContainText('1 unsaved change');
});

test('a wrong password keeps the edit, clears and focuses the field, and the right one then saves (BlackJackAPI#71)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  await account(page).click();
  await page.getByLabel('Email', { exact: true }).fill('new@e2e.test');
  await identityPassword(page).fill('wrong-dummy-password');
  await save(page).click();

  await expect(page.getByRole('alert')).toHaveText('Incorrect password.');
  await expect(notSaved(page)).toBeVisible();
  await expect(identityPassword(page)).toHaveValue('');
  await expect(identityPassword(page)).toBeFocused();
  await expect(identityPassword(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(identityPassword(page)).toHaveAccessibleDescription('Needed to change your username or email. Incorrect password.');
  await expect.poll(() => uncovered(identityPassword(page))).toBe(true);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('new@e2e.test');
  await expect(page).toHaveURL(/\/settings$/); // a refusal is a 400: still signed in

  await identityPassword(page).fill(ACCOUNT_PASSWORD);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await save(page).click();
  await expect(savedNote(page)).toBeVisible();
  expect(api.profiles.map((b) => [b.email, b.currentPassword])).toEqual([['new@e2e.test', 'wrong-dummy-password'], ['new@e2e.test', ACCOUNT_PASSWORD]]);
});

test('Delete for good: a wrong password stays in the dialog, the right one deletes and ends signed out on Home (BlackJackAPI#71)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  await page.getByRole('button', { name: 'Delete profile' }).click();
  const dialog = dialogOf(page);
  const password = dialog.getByLabel('Current password');
  await password.fill('wrong-dummy-password');
  await dialog.getByRole('button', { name: 'Delete for good' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Incorrect password.');
  await expect(password).toHaveValue('');
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAccessibleDescription('Incorrect password.');
  await expect(page).toHaveURL(/\/settings$/);

  await password.fill(ACCOUNT_PASSWORD);
  await dialog.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('Please log in to start playing.')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog).toHaveCount(0);
  expect(api.deletes).toEqual([
    { body: { currentPassword: 'wrong-dummy-password' }, contentType: 'application/json' },
    { body: { currentPassword: ACCOUNT_PASSWORD }, contentType: 'application/json' },
  ]);
  expect(await page.evaluate(() => sessionStorage.getItem('bj.token'))).toBeNull();
});

test('the delete dialog by keyboard: safe button first, Tab stays inside, Enter in the field sends nothing, one DELETE while busy (BlackJackAPI#71)', async ({ page }) => {
  let release;
  const api = await stubApi(page, { deleteGate: new Promise((resolve) => { release = resolve; }) });
  await openSettings(page);
  await page.getByRole('button', { name: 'Delete profile' }).focus();
  await page.keyboard.press('Enter');

  const dialog = dialogOf(page);
  const field = dialog.getByLabel('Current password');
  const keep = dialog.getByRole('button', { name: 'Keep my profile' });
  const gone = dialog.getByRole('button', { name: 'Delete for good' });
  await expect(keep).toBeFocused();
  for (const [key, target] of [['Shift+Tab', field], ['Shift+Tab', gone], ['Tab', field], ['Tab', keep], ['Tab', gone], ['Tab', field]]) {
    await page.keyboard.press(key);
    await expect(target, `after ${key}`).toBeFocused();
  }

  await page.keyboard.type(ACCOUNT_PASSWORD);
  await page.keyboard.press('Enter'); // in the field: must not delete (the count below stays at one DELETE)
  await expect(dialog).toBeVisible();
  await expect(field).toHaveValue(ACCOUNT_PASSWORD);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(gone).toBeFocused();
  expect(api.deletes).toEqual([]);
  await page.keyboard.press('Enter');

  await expect.poll(() => api.deletes.length).toBe(1);
  await expect(keep).toHaveAttribute('aria-disabled', 'true');
  await expect(gone).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await keep.click({ force: true }); // aria-disabled: Playwright would otherwise wait for it to be enabled
  await gone.click({ force: true });
  await expect(dialog).toBeVisible();

  release();
  await expect(page.getByText('Please log in to start playing.')).toBeVisible();
  expect(api.deletes).toHaveLength(1);
});

for (const viewport of [{ width: 375, height: 667 }, { width: 320, height: 568 }]) {
  test(`at ${viewport.width}x${viewport.height} the password field and the delete dialog fit, with 44 px controls and no sideways scroll (BlackJackAPI#71)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await stubApi(page);
    await openSettings(page);
    const noSidewaysScroll = async (label) => {
      const widths = await page.evaluate(() => ['html', '.settings-screen'].map((s) => document.querySelector(s)).map((el) => el.scrollWidth - el.clientWidth));
      expect(widths, `${label}: sideways overflow of the page and Settings`).toEqual([0, 0]);
    };
    const fits = async (locator, label) => {
      const box = await locator.boundingBox();
      expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
      expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(viewport.width);
    };

    await account(page).click();
    await username(page).fill('renamed');
    await save(page).click();
    await expect(identityPassword(page)).toBeFocused();
    await expect.poll(() => uncovered(identityPassword(page))).toBe(true);
    await fits(identityPassword(page), 'identity password');
    await noSidewaysScroll('with the identity password error');

    await page.getByRole('button', { name: 'Discard' }).click();
    await page.getByRole('button', { name: 'Delete profile' }).click();
    const dialog = dialogOf(page);
    await dialog.getByRole('button', { name: 'Delete for good' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    for (const [locator, label] of [[dialog.getByLabel('Current password'), 'dialog field'], [dialog.getByRole('button', { name: 'Keep my profile' }), 'Keep'], [dialog.getByRole('button', { name: 'Delete for good' }), 'Delete']]) {
      await fits(locator, label);
      await expect(locator).toBeInViewport({ ratio: 1 });
    }
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await noSidewaysScroll('with the delete dialog open');
  });
}

// #195: the chips in the circle must not follow the player into the next session. All in one page load (a reload would clear the round by itself).
for (const [who, next] of [['the same account', { userName: 'tester', credits: 1000 }], ['another account', { userName: 'second', credits: 500 }]]) {
  test(`a 401 with $100 in the circle, then signing in to ${who}: that server balance and an empty circle (#195)`, async ({ page }) => {
    const api = await stubApi(page);
    let revoked = false;
    // In front of the stub: the profile save finds the session revoked, and from then on /player/me answers as the account signed in to next.
    await page.route('http://api.e2e.test/api/player/me', (route) => {
      const method = route.request().method();
      const reply = (status, body) => route.fulfill({ status, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
      if (method === 'PUT') { revoked = true; return reply(401, { message: 'Unauthorized' }); }
      if (method === 'GET' && revoked) return reply(200, { ...NAMES, ...next });
      return route.fallback();
    });
    const balance = page.locator('#bal');
    const spot = page.getByRole('button', { name: /^Bet spot 1,/ });
    const dollars = (n) => `$${n.toLocaleString('en-US')}`;

    await login(page);
    await placeBet(page, 100);
    await expect(balance).toHaveText('$900');
    await expect(spot).toHaveAccessibleName(/^Bet spot 1, \$100\b/);
    await page.evaluate(() => { window.sameDocument = true; });

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Gameplay/ })).toContainText('Very fast');
    await account(page).click();
    await page.getByLabel('First name').fill('Ada');
    await save(page).click();
    await expect(page.getByText('Please log in to manage settings.')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('bj.token'))).toBeNull();

    await page.getByRole('link', { name: 'Log in', exact: true }).click();
    await page.getByPlaceholder('Username or Email').fill(next.userName);
    await page.getByPlaceholder('Password').fill('not-a-real-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/game$/);
    await page.locator('.felt').dispatchEvent('click'); // skips the new table's shuffle
    await expect(page.getByText('Place your bets', { exact: true })).toBeVisible({ timeout: 15_000 });

    await expect(balance).toHaveText(dollars(next.credits));
    await expect(spot).toHaveAccessibleName(/^Bet spot 1, \$0\b/);
    await expect(page.getByRole('button', { name: 'Rebet', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await placeBet(page, 10); // the new session's table takes a bet from the right balance
    await expect(balance).toHaveText(dollars(next.credits - 10));
    expect(await page.evaluate(() => window.sameDocument), 'no reload in between').toBe(true);
    expect(api.bets).toEqual([]);
  });
}

// #204: a second sign-in while the first still waits (a cold API start). Both would share the one stored token, so the second is refused unsent.
test('signing up while a log-in is still waiting is refused and sends nothing; the log-in then lands on the table (#204)', async ({ page }) => {
  const api = await stubApi(page);
  let release;
  const answer = new Promise((resolve) => { release = resolve; });
  // In front of the stub: the log-in answers only when released; a sign-up would be answered at once, as another account.
  await page.route('http://api.e2e.test/api/auth/login', async (route) => {
    if (route.request().method() === 'POST') await answer;
    await route.fallback();
  });
  const registers = [];
  await page.route('http://api.e2e.test/api/auth/register', (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    registers.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ accessToken: 'e2e-token-other' }) });
  });

  const loginSent = page.waitForRequest((r) => r.url().endsWith('/api/auth/login') && r.method() === 'POST');
  await submitLogin(page);
  await loginSent;
  await page.getByRole('link', { name: 'Create an account' }).click();
  for (const [field, value] of [['Username', 'second'], ['Email', 'second@e2e.test'], ['Password', 'not-a-real-password'], ['First name', 'Sec'], ['Last name', 'Ond']]) {
    await page.getByPlaceholder(field, { exact: true }).fill(value);
  }
  await page.getByRole('button', { name: 'Create account' }).click();

  // soft: when the refusal is missing, the next line also says whether the sign-up went out
  await expect.soft(page.getByRole('alert')).toHaveText('Another sign-in is still in progress. Please wait for it to finish.');
  expect(registers).toEqual([]);
  await expect(page).toHaveURL(/\/signup$/);

  release();
  await expect(page).toHaveURL(/\/game$/);
  await page.locator('.felt').dispatchEvent('click'); // skips the new table's shuffle
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#bal')).toHaveText('$1,000');
  expect(api.logins.map((body) => body.usernameOrEmail)).toEqual(['tester']);
  expect(await page.evaluate(() => sessionStorage.getItem('bj.token'))).toBe('e2e-token');
  expect(registers).toEqual([]);
});

// #196: the first password change revokes the token, so a second request would 401 and sign the player out (the stub answers like that).
test('pressing Change password twice, and again after leaving Settings, sends one change and stays signed in (#196)', async ({ page }) => {
  let release;
  const api = await stubApi(page, { passwordGate: new Promise((resolve) => { release = resolve; }) });
  await openSettings(page);
  const change = page.getByRole('button', { name: 'Change password' });
  const fill = async () => {
    await account(page).click();
    await page.getByLabel('Current password').fill('old-dummy-pass');
    await page.getByLabel('New password').fill('new-dummy-pass1');
  };
  await fill();
  await change.dblclick();
  await expect(change).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => api.passwords.length).toBe(1);

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await fill();
  await expect(change).toHaveAttribute('aria-disabled', 'true'); // still running: the guard outlives the page
  await change.click({ force: true }); // Playwright will not click an aria-disabled button by itself; a player can
  await expect(page.getByText('Password changed')).toHaveCount(0);
  await expect(page.getByLabel('Current password')).toHaveValue('old-dummy-pass'); // the ignored press clears nothing

  release();
  await expect(change).not.toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => api.logins.length).toBe(2); // the sign-in, then the one silent sign-in after the change
  expect(api.passwords).toHaveLength(1);
  await expect(page.getByText('Please log in to manage settings.')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('bj.token'))).toBe('e2e-token-2');
});
