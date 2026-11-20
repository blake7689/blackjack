import { test, expect, stubApi, seedRandom, login, placeBet, submitLogin } from './fixtures';

// The loop 1 fix pass (#166, L1-10 .. L1-27): what only a real layout shows. Seed 183 is the round described in smoke.spec.js (14 against a 6, Hit draws a 5).
const key = (page, name) => page.getByRole('button', { name, exact: true });
const icon = (locator) => locator.locator('svg use').getAttribute('href');
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };

test('the play keys and Next hand carry the mockup\'s icons, and keep their accessible names (L1-10)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await key(page, 'Deal').click();
  await expect(key(page, 'Hit')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });
  expect(await Promise.all(['Double', 'Split', 'Surrender', 'Stay', 'Hit'].map((name) => icon(key(page, name))))).toEqual(
    ['#i-double', '#i-split', '#i-surrender', '#i-stay', '#i-hit']);
  await key(page, 'Hit').click();
  await key(page, 'Stay').click({ timeout: 15_000 });
  await expect(key(page, 'Next hand')).toBeVisible({ timeout: 30_000 });
  expect(await icon(key(page, 'Next hand'))).toBe('#i-next');
});

test('the chip in the bet circle is centred on the ring (L1-11)', async ({ page }) => {
  await stubApi(page);
  await login(page);
  await placeBet(page, 25);
  await expect(page.locator('.flight-layer > *')).toHaveCount(0); // the chip has landed
  const off = () => page.evaluate(() => {
    const spot = document.querySelector('.spot').getBoundingClientRect();
    const svg = document.querySelector('.spot .stack svg').getBoundingClientRect();
    // one chip: its face is the top 100 of the viewBox's 106, so its centre is half a width below the svg's top
    return { x: svg.x + svg.width / 2 - (spot.x + spot.width / 2), y: svg.y + svg.width / 2 - (spot.y + spot.height / 2) };
  });
  await expect.poll(async () => Math.hypot((await off()).x, (await off()).y)).toBeLessThan(1.5);
});

test('the base text is 15 px in the --tx ink, and the felt keeps its light ink (L1-15)', async ({ page }) => {
  await stubApi(page);
  await login(page);
  const look = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--tx)';
    document.body.append(probe);
    const tx = getComputedStyle(probe).color;
    probe.remove();
    return { body: getComputedStyle(document.body).fontSize, bodyColor: getComputedStyle(document.body).color, tx, felt: getComputedStyle(document.querySelector('.felt')).color };
  });
  expect(look.body).toBe('15px');
  expect(look.bodyColor).toBe(look.tx);
  expect(look.felt).toBe('rgb(238, 242, 239)');
});

test('the total pill is 26 px high with 14 px text at every width (L1-16)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await key(page, 'Deal').click();
  const pill = page.locator('.seat .pill').first();
  await expect(pill).toBeVisible({ timeout: 15_000 });
  await expect(pill).toHaveCSS('opacity', '1'); // it fades in over 220 ms
  expect(await pill.evaluate((el) => { const c = getComputedStyle(el); return [el.getBoundingClientRect().height, c.fontSize, c.borderTopLeftRadius]; })).toEqual([26, '14px', '13px']);
});

test('inline links are underlined: Create an account on Log in, Log out on Home (L1-17)', async ({ page }) => {
  await stubApi(page);
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveCSS('text-decoration-line', 'underline');
  await page.goto('/');
  await submitLogin(page);
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCSS('text-decoration-line', 'underline');
});

test('with nothing to bet the line says Out of credits and the circle still names its chip (L1-18)', async ({ page }) => {
  await stubApi(page, { startCredits: 0 });
  await login(page); // waits for the line
  await expect(page.locator('#bal')).toHaveText('$0');
  await expect(page.locator('.msg')).toHaveText('Out of credits');
  await expect(page.getByRole('button', { name: 'Bet spot 1, $0. Adds a $25 chip' })).toBeDisabled();
});

test('Settings has only its own head: no global header, nothing dark over a light page (L1-12)', async ({ page }) => {
  await stubApi(page, { settings: { mode: 'light' } });
  await page.addInitScript(() => sessionStorage.setItem('bj.token', 'e2e-token'));
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Home' })).toHaveCount(0);
  await expect(page.locator('.bj-header')).toHaveCount(0);
  expect((await page.locator('.s-head').boundingBox()).y).toBe(0);
  const colours = await page.evaluate(() => { const i = document.createElement('i'); i.style.background = 'var(--bg)'; document.body.append(i); const bg = getComputedStyle(i).backgroundColor; i.remove(); return [getComputedStyle(document.querySelector('.settings-screen')).backgroundColor, bg]; });
  expect(colours[0]).toBe(colours[1]); // the page is the token background, with no navy bar above it
});

test('Settings: the column is 680 px with its gutters, a section header is 75 px, and an opened section scrolls into view (L1-21, L1-22)', async ({ page }) => {
  await stubApi(page);
  await page.addInitScript(() => sessionStorage.setItem('bj.token', 'e2e-token'));
  await page.goto('/settings#account');
  const { width } = page.viewportSize();
  await expect(page.locator('#sec-account-h')).toHaveAttribute('aria-expanded', 'true');
  expect((await page.locator('.s-body').boundingBox()).width).toBe(Math.min(680, width));
  expect((await page.locator('#sec-rules').boundingBox()).width).toBe(Math.min(648, width - 32));
  expect((await page.locator('#sec-rules-h').boundingBox()).height).toBeCloseTo(75, 0);
  // the deep link scrolled the page (the inner scroller) to the Account section: its header is in view, below the sticky head (scroll-margin 72 px) or as high as the page's end allows
  const scrolled = () => page.locator('.settings-screen').evaluate((el) => el.scrollTop);
  await expect.poll(scrolled).toBeGreaterThan(0);
  const inView = async (id) => { const box = await page.locator(id).boundingBox(); return box.y >= 0 && box.y + 68 <= page.viewportSize().height; };
  expect(await inView('#sec-account-h')).toBe(true);
  await page.getByRole('button', { name: /^Chips/ }).click(); // a tap opens the next one and brings it up too
  await expect.poll(() => inView('#sec-chips-h')).toBe(true);
});

test('a refused opening bet voids the round; its cards are not put back, so the next deal draws different ones (L1-27, by design)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  let refuse = true;
  await page.route('**/api/ledger/bet', (route) => (refuse && route.request().method() === 'POST'
    ? route.fulfill({ status: 400, contentType: 'application/json', headers: CORS, body: '{"message":"Not enough credit"}' }) : route.fallback()));
  await placeBet(page, 25);
  await key(page, 'Deal').click();
  await expect(page.locator('.msg .notice')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.discard')).not.toHaveClass(/empty/); // the voided round's cards are in the discard pile
  refuse = false;
  await placeBet(page, 25);
  await key(page, 'Deal').click();
  await expect(key(page, 'Hit')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
  // the first round was king of diamonds + 4 of clubs against a 6 of clubs (smoke.spec.js, seed 183); the shoe moved on, so this one is another hand
  const both = (await page.getByRole('img', { name: 'king of diamonds' }).count()) + (await page.getByRole('img', { name: '4 of clubs' }).count());
  expect(both, 'not the same two cards again').toBeLessThan(2);
});
