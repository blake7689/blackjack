import { test, expect, stubApi, login } from './fixtures';

// Changing the password revokes the old token (#171): the app signs in again at once with the new password and keeps the session.
async function changePassword(page, current, next) {
  await login(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Account/ }).click();
  await page.getByLabel('Current password').fill(current);
  await page.getByLabel('New password').fill(next);
  await page.getByRole('button', { name: 'Change password' }).click();
}

test('a password change signs in again with the new password, keeps the session and balance, and later calls use the new token (#171)', async ({ page }) => {
  const api = await stubApi(page, { startCredits: 1000 });
  await changePassword(page, 'old-pass-1', 'new-pass-12');

  // PUT the change, then POST the login with the new password: the app, not the user, does the second step.
  await expect(page.getByRole('status').filter({ hasText: 'Password changed' })).toBeVisible();
  expect(api.passwords).toEqual([{ currentPassword: 'old-pass-1', newPassword: 'new-pass-12' }]);
  expect(api.logins).toEqual([expect.anything(), { usernameOrEmail: 'tester', password: 'new-pass-12' }]);
  const calls = api.requests.map((r) => r.endpoint);
  expect(calls.indexOf('PUT /player/me/password')).toBeLessThan(calls.lastIndexOf('POST /auth/login'));
  expect(api.requests.find((r) => r.endpoint === 'PUT /player/me/password').auth).toBe('Bearer e2e-token'); // the change itself uses the old token

  // Still signed in: no redirect, no sign-out, and a request made afterwards carries the token from the second login.
  await expect(page.getByText('Please log in to manage settings.')).toHaveCount(0);
  await page.getByRole('button', { name: /^Gameplay/ }).click();
  await page.getByRole('switch', { name: /^Show hand totals/ }).click({ force: true });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.requests.findLast((r) => r.endpoint === 'PUT /player/me/settings').auth).toBe('Bearer e2e-token-2');

  // The balance is the same one (no reload of a different player, nothing lost).
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.locator('#bal')).toHaveText('$1,000');
  expect(api.unknown).toEqual([]);
});

for (const status of [500, 401]) {
  test(`if the sign-in after the change fails (${status}), the player is signed out and Login explains why (#171)`, async ({ page }) => {
    const api = await stubApi(page, { reloginError: { status, message: 'nope' } });
    await changePassword(page, 'old-pass-1', 'new-pass-12');

    // Signed out at once; Settings shows the message straight away, and Login keeps it until the next sign-in.
    const message = 'Your password was changed, but we could not sign you in again. Please sign in with your new password.';
    await expect(page.getByText('Please log in to manage settings.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText(message);
    await page.getByRole('link', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toHaveText(message);
    expect(api.passwords).toHaveLength(1);
    expect(api.logins).toHaveLength(2);
  });
}
