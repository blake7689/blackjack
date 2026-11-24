import { test, expect, stubApi, openTable } from './fixtures';

// Hidden credits top-up (#90). The real code is never written here: every test types this arbitrary stand-in.
const CODE = 'dummy-code-123';
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// The balance in the top bar (the chip buttons also read '$100').
const shown = (page) => page.locator('#bal');

// Seven quick clicks on the balance (the hidden gesture: 7 within 3 s). Raw mouse clicks at one point: locator.click() re-checks the element
// each time (~0.4-0.6 s per click in WebKit), which can push 7 clicks past the 3 s window.
async function tapBalance(page, times = 7) {
  const box = await page.getByText('Balance', { exact: true }).boundingBox();
  for (let i = 0; i < times; i++) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('seven taps on a low balance open the prompt: a wrong code fails generically, the right one tops up (#90)', async ({ page }) => {
  const api = await stubApi(page, {
    startCredits: 40,
    topUps: [
      { status: 400, message: "That didn't work." },
      { status: 200, credits: 10040 },
    ],
  });
  await openTable(page);
  await expect(shown(page)).toHaveText('$40');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await tapBalance(page);
  const dialog = page.getByRole('dialog', { name: 'Enter code' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Code')).toBeFocused();
  await expect(dialog.getByLabel('Code')).toHaveAttribute('type', 'password');

  await dialog.getByLabel('Code').fill('wrong-dummy-code');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog.getByRole('alert')).toHaveText("That didn't work.");
  await expect(dialog.getByLabel('Code')).toHaveValue('');
  await expect(dialog.getByLabel('Code')).toBeFocused();

  await dialog.getByLabel('Code').fill(CODE);
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(shown(page)).toHaveText('$10,040');
  await expect(page.getByText(CODE)).toHaveCount(0);

  expect(api.topups).toEqual([
    { code: 'wrong-dummy-code', requestId: expect.stringMatching(V4) },
    { code: CODE, requestId: expect.stringMatching(V4) },
  ]);
  expect(api.topups[0].requestId).not.toBe(api.topups[1].requestId); // each submit is its own request
  expect(api.failed).toEqual([]);
});

test('a locked-out code attempt shows the wait from Retry-After, and no retry follows (#90)', async ({ page }) => {
  const api = await stubApi(page, {
    startCredits: 40,
    topUps: [{ status: 429, message: 'Too many attempts.', headers: { 'Retry-After': '600' } }],
  });
  await openTable(page);
  await tapBalance(page);
  const dialog = page.getByRole('dialog', { name: 'Enter code' });
  await dialog.getByLabel('Code').fill(CODE);
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Too many attempts. Try again later in about 10 minutes.');
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled();
  expect(api.topups).toHaveLength(1); // a lockout is final for this attempt; the stub would 501 a second call
  await expect(shown(page)).toHaveText('$40');
});

test('Escape and Cancel close the prompt and leave the balance alone (#90)', async ({ page }) => {
  const api = await stubApi(page, { startCredits: 40 });
  await openTable(page);
  await tapBalance(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await tapBalance(page);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(shown(page)).toHaveText('$40');
  expect(api.topups).toEqual([]);
});

test('seven taps open nothing at $100 or more (#90)', async ({ page }) => {
  await stubApi(page, { startCredits: 100 });
  await openTable(page);
  await tapBalance(page, 14);
  await expect(shown(page)).toHaveText('$100');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the backdrop covers the whole viewport, header and betting footer included (#90)', async ({ page }) => {
  await stubApi(page, { startCredits: 40 });
  await openTable(page);
  await tapBalance(page);
  await expect(page.getByRole('dialog', { name: 'Enter code' })).toBeVisible();

  // Header and footer controls sit under the overlay, so a real click there could not reach them.
  const settings = await page.getByRole('button', { name: 'Settings', exact: true }).boundingBox();
  const chip = await page.getByRole('button', { name: '$10 chip', exact: true }).boundingBox();
  const { width, height } = page.viewportSize();
  const points = [
    [2, 2], [width / 2, 2], [width - 3, 2], // header: corners and top edge
    [settings.x + settings.width / 2, settings.y + settings.height / 2], // the Settings button
    [chip.x + chip.width / 2, chip.y + chip.height / 2], // a betting chip
    [2, height - 3], [width / 2, height - 3], [width - 3, height - 3], // bottom edge
  ];
  const outside = await page.evaluate(
    (pts) => pts.filter(([x, y]) => !document.elementFromPoint(x, y)?.closest('.topup-overlay')),
    points,
  );
  expect(outside).toEqual([]);
  expect(await page.evaluate(() => document.querySelector('.topup-overlay').parentElement === document.body)).toBe(true);
});
