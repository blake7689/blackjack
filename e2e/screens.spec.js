import { test, expect, stubApi, seedRandom, login, placeBet, VEGAS } from './fixtures';

// The polished screens (#87): the Table rules sheet from its three doors, Home, the Error screen and the two styled confirms.
// The sheet eases in over a moment (it fades up): every assertion on it is a web-first one, and the axe scans wait for opacity 1 first (a11y.spec.js).

const sheet = (page) => page.getByRole('dialog', { name: 'Table rules' });
const signedIn = (page) => page.addInitScript(() => sessionStorage.setItem('bj.token', 'e2e-token')); // signed in without the login form
const tooSmall = (locator) => locator.evaluateAll((els) => els
  .map((el) => [el.getAttribute('aria-label') || el.textContent.trim(), Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)])
  .filter(([, w, h]) => w < 44 || h < 44));
const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

// Hit is live: the deal's cards have landed and the dock is idle. Seed 183 is the smoke test's deal (a 14 against a 6, no offers).
async function midRound(page) {
  await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hit' })).toBeEnabled({ timeout: 15_000 });
}

test.describe('the Table rules sheet', () => {
  test('opens from the felt print: a dialog named Table rules, Close focused, the preset, the edge and the rules; Escape closes it and focus returns to the print', async ({ page }) => {
    await stubApi(page);
    await login(page);
    const print = page.getByRole('button', { name: 'Table rules' });
    await print.click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'Close' })).toBeFocused();
    await expect(sheet(page).getByText('Vegas', { exact: true })).toBeVisible();
    await expect(sheet(page).getByText(/House edge .*% est\./)).toBeVisible();
    for (const group of ['Payouts', 'Dealer', 'Doubling', 'Splitting', 'Surrender']) await expect(sheet(page).getByRole('heading', { name: group })).toBeVisible();
    await expect(sheet(page).getByText('Blackjack pays 3 to 2')).toBeVisible(); // the Vegas fixture
    await expect(sheet(page).getByText('The dealer hits soft 17', { exact: true })).toBeVisible(); // the sheet's own sentences (L1-23)
    await expect(sheet(page).getByText('The dealer peeks for blackjack before you play', { exact: true })).toBeVisible();
    await expect(sheet(page).getByText('Late surrender')).toBeVisible();
    await expect(sheet(page).getByRole('link', { name: 'Change rules' })).toBeVisible(); // signed in
    await expect(page).toHaveURL(/\/game$/); // opening it leaves the table where it is

    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(print).toBeFocused();
  });

  test('a tap on the backdrop closes it, a tap inside does not, and Close closes it', async ({ page }) => {
    await stubApi(page);
    await login(page);
    const print = page.getByRole('button', { name: 'Table rules' });
    await print.click();
    await sheet(page).getByRole('heading', { name: 'Table rules' }).click();
    await expect(sheet(page)).toBeVisible();
    await page.mouse.click(4, 4); // the overlay: outside the sheet on the phone's bottom sheet and on the desktop's centred panel
    await expect(sheet(page)).toHaveCount(0);
    await expect(print).toBeFocused();

    await print.click();
    await sheet(page).getByRole('button', { name: 'Close' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(print).toBeFocused();
  });

  test('Tab stays inside the sheet: Change rules wraps to Close, and Shift+Tab from Close wraps to Change rules', async ({ page }) => {
    await stubApi(page);
    await login(page);
    await page.getByRole('button', { name: 'Table rules' }).click();
    const close = sheet(page).getByRole('button', { name: 'Close' });
    const change = sheet(page).getByRole('link', { name: 'Change rules' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(change).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(change).toBeFocused();
  });

  test('opens from the table menu, stays on the table, and Escape closes it with focus on the Menu button', async ({ page }) => {
    await stubApi(page);
    await login(page);
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.click();
    await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Table rules' }).click();
    await expect(sheet(page)).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/\/game$/);
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(menu).toBeFocused();
  });

  test('opens from Home signed out (Rules), without a Change rules link', async ({ page }) => {
    await stubApi(page);
    await page.goto('/');
    await expect(page.getByText('Please log in to start playing.')).toBeVisible();
    const rules = page.getByRole('button', { name: 'Rules' });
    await rules.click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'Close' })).toBeFocused();
    await expect(sheet(page).getByRole('link', { name: 'Change rules' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(rules).toBeFocused();
  });

  test('opens from Home signed in, and Change rules goes to Settings on the Table rules section', async ({ page }) => {
    await stubApi(page);
    await signedIn(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/game$/);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Rules' }).click();
    await sheet(page).getByRole('link', { name: 'Change rules' }).click();
    await expect(page).toHaveURL(/\/settings#rules$/);
    await expect(page.getByRole('button', { name: /^Table rules/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('it follows the saved rules: Europe reads as Europe, with its own lines', async ({ page }) => {
    await stubApi(page, { settings: { ...VEGAS, playTimeout: 250, dealerHoleBehaviour: 'drawAfter', dealerHitsSoft17: false, maxSplitHands: 0, surrender: 'none', doubleOn: '9-11', noHoleCardLoss: 'all', blackjackPaysImmediately: false } });
    await login(page);
    await page.getByRole('button', { name: 'Table rules' }).click();
    await expect(sheet(page).getByText('Europe', { exact: true })).toBeVisible();
    await expect(sheet(page).getByText('Split any number of hands')).toBeVisible();
    await expect(sheet(page).getByText('No surrender')).toBeVisible();
    await expect(sheet(page).getByText('Dealer stands on all 17s')).toBeVisible();
  });

  test('has 44 px controls and no sideways scroll at the phone\'s own width', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the desktop project sets its own widths below');
    await stubApi(page);
    await login(page);
    await page.getByRole('button', { name: 'Table rules' }).click();
    await expect(sheet(page)).toBeVisible();
    expect(await tooSmall(sheet(page).locator('button, a[href]')), 'the sheet\'s controls').toEqual([]);
    expect(await noSidewaysScroll(page), 'sideways scroll').toBe(true);
    const { box, view } = { box: await sheet(page).boundingBox(), view: page.viewportSize() };
    expect(box.x, 'a bottom sheet is full width').toBeLessThanOrEqual(1);
    expect(Math.round(box.width)).toBe(view.width);
    await expect.poll(async () => Math.round((await sheet(page).boundingBox()).y + (await sheet(page).boundingBox()).height)).toBe(view.height); // it sits on the bottom edge (after its slide up)
  });

  for (const [w, h] of [[390, 844], [375, 667]]) {
    test(`is a bottom sheet at ${w}x${h}: full width, on the bottom edge, 44 px controls, no sideways scroll`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'the phone project runs its own width above');
      await page.setViewportSize({ width: w, height: h });
      await stubApi(page);
      await login(page);
      await page.getByRole('button', { name: 'Table rules' }).click();
      await expect(sheet(page)).toBeVisible();
      await expect(sheet(page).getByRole('button', { name: 'Close' })).toBeFocused();
      expect(await tooSmall(sheet(page).locator('button, a[href]')), 'the sheet\'s controls').toEqual([]);
      expect(await noSidewaysScroll(page), 'sideways scroll').toBe(true);
      const box = await sheet(page).boundingBox();
      expect(box.x).toBeLessThanOrEqual(1);
      expect(Math.round(box.width)).toBe(w);
      await expect.poll(async () => { const b = await sheet(page).boundingBox(); return Math.round(b.y + b.height); }).toBe(h); // after its slide up
    });
  }

  for (const [w, h] of [[768, 1024], [1440, 900]]) {
    test(`is a centred panel at ${w}x${h}: narrower than the screen, centred, and clear of the bottom edge`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'the desktop project sets the viewports');
      await page.setViewportSize({ width: w, height: h });
      await stubApi(page);
      await login(page);
      await page.getByRole('button', { name: 'Table rules' }).click();
      await expect(sheet(page)).toBeVisible();
      await expect.poll(async () => { // after its slide up
        const b = await sheet(page).boundingBox();
        return [Math.round(b.width) <= 560, Math.abs(b.x + b.width / 2 - w / 2) <= 1, b.y + b.height < h - 8, b.y > 8];
      }).toEqual([true, true, true, true]);
      expect(await noSidewaysScroll(page), 'sideways scroll').toBe(true);
      expect(await tooSmall(sheet(page).locator('button, a[href]')), 'the sheet\'s controls').toEqual([]);
    });
  }
});

test.describe('the Error screen', () => {
  test('a restore that gets no answer shows "Can\'t reach the table"; Try again asks again and lands on the table', async ({ page }) => {
    const api = await stubApi(page, { meFailures: 1 });
    await signedIn(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Can\'t reach the table' })).toBeVisible();
    await expect(page.getByText('Your balance is safe.', { exact: false })).toBeVisible();
    await expect(page.getByText('Please log in to start playing.')).toHaveCount(0); // never a page that thinks you are signed out
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByText('Place your bets', { exact: true })).toBeVisible({ timeout: 15_000 });
    expect(api.failed).toEqual([]);
  });

  test('the Error screen covers every page, and Home gives up on the restore and shows the signed-out Home', async ({ page }) => {
    await stubApi(page, { meFailures: 1 });
    await signedIn(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Can\'t reach the table' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Please log in to start playing.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Can\'t reach the table' })).toHaveCount(0);
  });

  test('Try again that fails again stays on the Error screen', async ({ page }) => {
    await stubApi(page, { meFailures: 2 });
    await signedIn(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Can\'t reach the table' })).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click(); // the third answer is a good one
    await expect(page).toHaveURL(/\/game$/);
  });

  test('has 44 px buttons and no sideways scroll', async ({ page }) => {
    await stubApi(page, { meFailures: 1 });
    await signedIn(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Can\'t reach the table' })).toBeVisible();
    expect(await tooSmall(page.locator('main').locator('button, a[href]')), 'the Error screen\'s controls').toEqual([]);
    expect(await noSidewaysScroll(page), 'sideways scroll').toBe(true);
  });
});

test.describe('leaving the table and logging out ask in a dialog', () => {
  test('Home from the menu mid-round asks "Leave game and return Home?": Keep playing is first and focused, Escape keeps playing, Leave goes Home', async ({ page }) => {
    await midRound(page);
    const menu = page.getByRole('button', { name: 'Menu' });
    const home = () => page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Home' });
    await menu.click();
    await home().click();
    const dialog = page.getByRole('dialog', { name: 'Leave game and return Home?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Any bet in the circle will be lost.')).toBeVisible();
    await expect(dialog.getByRole('button')).toHaveText(['Keep playing', 'Leave']);
    await expect(dialog.getByRole('button', { name: 'Keep playing' })).toBeFocused();
    expect(await tooSmall(dialog.getByRole('button')), 'the dialog\'s buttons').toEqual([]);

    await page.keyboard.press('Escape'); // the safe answer
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByRole('button', { name: 'Hit' })).toBeEnabled(); // the round carries on

    await menu.click();
    await home().click();
    await dialog.getByRole('button', { name: 'Leave' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Play' })).toBeVisible();
  });

  test('Home before any card is out goes straight home, with no dialog', async ({ page }) => {
    await stubApi(page);
    await login(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Log out from Home asks "Log out?": Stay logged in keeps the session, Log out signs out', async ({ page }) => {
    await stubApi(page);
    await login(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Home' }).click();
    await expect(page.getByText('Signed in as tester')).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    const dialog = page.getByRole('dialog', { name: 'Log out?' });
    await expect(dialog.getByRole('button')).toHaveText(['Stay logged in', 'Log out']);
    await expect(dialog.getByRole('button', { name: 'Stay logged in' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Stay logged in' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Signed in as tester')).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await dialog.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByText('Please log in to start playing.')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('bj.token'))).toBeNull();
  });
});

test.describe('Home and the sign-in screens', () => {
  test('signed out: Log in, Create an account and Rules; the links lead to /login and /signup, which link to each other', async ({ page }) => {
    await stubApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Blakejack' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Play' })).toHaveCount(0);
    expect(await tooSmall(page.locator('main').locator('button, a.btn')), 'Home controls').toEqual([]);
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();
    for (const label of ['Username', 'Email', 'Password', 'First name', 'Last name']) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
    await expect(page.getByLabel('Username or email')).toBeVisible();
  });

  // #153: the small inline links get a 44 px tap area from padding and a negative margin, so the line itself must not grow.
  test('the inline links (Create an account, Log in, Log out) are at least 44 x 44 px, and the signed-in line is as tall as the signed-out one', async ({ page }) => {
    await stubApi(page);
    await page.goto('/');
    const note = page.getByText('Please log in to start playing.');
    await expect(note).toBeVisible();
    const signedOutHeight = (await note.boundingBox()).height;

    await page.goto('/login');
    const create = page.getByRole('main').getByRole('link', { name: 'Create an account' });
    await expect(create).toBeVisible();
    expect(await tooSmall(create), '/login: Create an account').toEqual([]);

    await page.goto('/signup');
    const logIn = page.getByRole('main').getByRole('link', { name: 'Log in' });
    await expect(logIn).toBeVisible();
    expect(await tooSmall(logIn), '/signup: Log in').toEqual([]);

    await login(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Home' }).click();
    const signed = page.getByText('Signed in as tester');
    await expect(signed).toBeVisible();
    expect(await tooSmall(page.getByRole('main').getByRole('button', { name: 'Log out' })), 'Home: Log out').toEqual([]);
    expect((await signed.boundingBox()).height, 'the signed-in line is as tall as the signed-out line').toBe(signedOutHeight);
  });

  test('Create account stays disabled until every field is valid, and each error is shown against its field', async ({ page }) => {
    await stubApi(page);
    await page.goto('/signup');
    const create = page.getByRole('button', { name: 'Create account' });
    const username = page.getByLabel('Username', { exact: true });
    await username.fill('ab');
    await expect(page.getByText('Username must be at least 3 characters.')).toBeVisible();
    await expect(username).toHaveAttribute('aria-invalid', 'true');
    await expect(create).toBeDisabled();
    await username.fill('newbie');
    await page.getByLabel('Email', { exact: true }).fill('newbie@e2e.test');
    await page.getByLabel('Password', { exact: true }).fill('secret12');
    await page.getByLabel('First name', { exact: true }).fill('New');
    await expect(create).toBeDisabled(); // the last name is still missing
    await page.getByLabel('Last name', { exact: true }).fill('Bie');
    await expect(create).toBeEnabled();
  });

  test('a refused log-in shows one alert and marks both fields invalid', async ({ page }) => {
    await stubApi(page, { loginError: { status: 401, message: 'Invalid username/email or password.' } });
    await page.goto('/login');
    await page.getByPlaceholder('Username or Email').fill('tester');
    await page.getByPlaceholder('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveText('Invalid username/email or password.');
    await expect(page.getByLabel('Username or email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
  });
});
