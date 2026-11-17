import { test, expect, stubApi, seedRandom, login, VEGAS, placeBet } from './fixtures';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Chips and betting (#82): what jsdom cannot see (real layout, scrolling, the keyboard, the hand-timed double tap) and the ledger staying one opening bet.
// Seeds are the existing ones (see smoke.spec.js): 183 is a 14 against a 6 (jack in the hole), 207 a 16 against an ace with a dealer blackjack.

const chip = (page, v) => page.getByRole('button', { name: `$${v.toLocaleString()} chip`, exact: true });
const spot = (page) => page.getByRole('button', { name: /^Bet spot 1,/ });
const key = (page, name) => page.getByRole('button', { name, exact: true });
const balance = (page) => page.locator('#bal'); // the top bar's balance (also the hidden top-up's target)
const dimmed = (locator) => expect(locator).toHaveAttribute('aria-disabled', 'true');
const lit = (locator) => expect(locator).not.toHaveAttribute('aria-disabled', 'true');

test('a tap selects a chip, a tap on the circle bets it: nothing is bet until the circle is tapped, and the ledger sees one opening bet at the deal', async ({ page }) => {
  const api = await stubApi(page);
  await login(page);
  await expect(chip(page, 25)).toHaveAttribute('aria-pressed', 'true'); // $25 is selected on arrival
  await chip(page, 5).click();
  await expect(chip(page, 5)).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 25)).toHaveAttribute('aria-pressed', 'false');
  await expect(balance(page)).toHaveText('$1,000'); // a tap on a chip only selects
  await expect(page.getByRole('button', { name: 'Bet spot 1, $0. Adds a $5 chip' })).toBeVisible();

  await spot(page).click();
  await expect(page.getByRole('button', { name: 'Bet spot 1, $5. Adds a $5 chip' })).toBeVisible();
  await expect(balance(page)).toHaveText('$995');
  await chip(page, 25).click();
  await spot(page).click();
  await expect(page.getByRole('button', { name: 'Bet spot 1, $30. Adds a $25 chip' })).toBeVisible();
  await expect(balance(page)).toHaveText('$970');
  expect(api.bets, 'building the bet never reaches the ledger').toEqual([]);

  await key(page, 'Deal').click();
  await expect.poll(() => api.bets.length).toBe(1);
  expect(api.bets).toEqual([{ amount: 30, newRound: true, requestId: expect.stringMatching(V4) }]);
});

test('a double tap (a double click) on a chip selects it and bets it once', async ({ page }) => {
  const api = await stubApi(page);
  await login(page);
  await chip(page, 10).dblclick();
  await expect(chip(page, 10)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Bet spot 1, $10. Adds a $10 chip' })).toBeVisible();
  await expect(balance(page)).toHaveText('$990');
  expect(api.bets).toEqual([]);
});

test('Undo, Clear and 2x: each works on the circle with balance checks, and the keys dim when they cannot act', async ({ page }) => {
  const api = await stubApi(page);
  await login(page);
  await dimmed(key(page, 'Undo'));
  await dimmed(key(page, 'Clear'));
  await dimmed(key(page, 'Double every bet'));
  await dimmed(key(page, 'Rebet')); // no round has been played: nothing to repeat
  await dimmed(key(page, 'Deal'));

  await placeBet(page, 10);
  await placeBet(page, 5);
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$15/ })).toBeVisible();
  await expect(balance(page)).toHaveText('$985');
  await key(page, 'Undo').click(); // takes the last chip (the 5) back
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$10/ })).toBeVisible();
  await expect(balance(page)).toHaveText('$990');
  await key(page, 'Double every bet').click();
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$20/ })).toBeVisible();
  await expect(balance(page)).toHaveText('$980');
  await key(page, 'Undo').click(); // the doubling is one step
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$10/ })).toBeVisible();
  await key(page, 'Undo').click();
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$0/ })).toBeVisible();
  await expect(balance(page)).toHaveText('$1,000');
  await dimmed(key(page, 'Undo')); // the history is empty again

  await placeBet(page, 25);
  await placeBet(page, 10);
  await key(page, 'Clear').click();
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$0/ })).toBeVisible();
  await expect(balance(page)).toHaveText('$1,000');
  await dimmed(key(page, 'Undo')); // Clear empties the history too
  expect(api.bets, 'undo and clear are local: the ledger never hears of them').toEqual([]);
});

test('2x never bets more than the balance', async ({ page }) => {
  await stubApi(page, { startCredits: 150 });
  await login(page);
  await placeBet(page, 100);
  await expect(balance(page)).toHaveText('$50');
  await dimmed(key(page, 'Double every bet'));
  await key(page, 'Double every bet').click({ force: true }); // a dimmed key does nothing
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$100/ })).toBeVisible();
  await expect(balance(page)).toHaveText('$50');
});

// Seed 183 (see smoke.spec.js): a $10 round that Hit and Stay settle with a push.
test('Rebet puts the last round\'s bet back, only once and only with an empty circle', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await dimmed(key(page, 'Rebet'));
  await placeBet(page, 10);
  await key(page, 'Deal').click();
  await page.getByRole('button', { name: 'Hit', exact: true }).click({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: '5 of hearts' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Next hand' }).click({ timeout: 30_000 });
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();
  await expect.poll(() => api.settles.length).toBe(1);

  await lit(key(page, 'Rebet'));
  await key(page, 'Rebet').click();
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$10/ })).toBeVisible();
  await dimmed(key(page, 'Rebet')); // a bet is down
  await key(page, 'Undo').click(); // the rebet is one step, undoable
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$0/ })).toBeVisible();
  await lit(key(page, 'Rebet'));
  expect(api.bets, 'a rebet on the table is not a ledger bet until the deal').toHaveLength(1);
});

test('the keyboard: 1-9 pick the chip at that place in the rack, the same key twice bets it, U undoes, C clears, B rebets, X doubles', async ({ page }) => {
  await stubApi(page);
  await login(page);
  // The key listener is attached in an effect, a few ms after the table shows (a key sent in that gap is lost, as for a real user): retried until one lands.
  await expect(async () => {
    await page.keyboard.press('3'); // the third chip: $10
    await expect(chip(page, 10)).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass();
  await expect(balance(page)).toHaveText('$1,000');
  await page.keyboard.press('3'); // twice: bets it
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$10/ })).toBeVisible();
  await page.keyboard.press('x');
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$20/ })).toBeVisible();
  await page.keyboard.press('u');
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$10/ })).toBeVisible();
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$0/ })).toBeVisible();
  await expect(balance(page)).toHaveText('$1,000');
});

test('out of credits: the rack is a note with the balance, nothing that bets is live, and a tap on the circle does nothing', async ({ page }) => {
  const api = await stubApi(page, { startCredits: 0 });
  await login(page);
  await expect(page.getByText('Out of credits. Your balance is $0.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Chips' })).toHaveCount(0);
  for (const name of ['Undo', 'Clear', 'Rebet', 'Double every bet', 'Deal']) await dimmed(key(page, name));
  await expect(page.getByRole('button', { name: 'Bet spot 1, $0' })).toBeDisabled();
  expect(api.bets).toEqual([]);
});

// Seed 207: a 16 against an ace (a dealer blackjack). Taking insurance puts its stake on the table, as its own labelled stack.
test('the insurance stake shows on the table while it is live, and never covers the bet, at every size', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 207);
  await login(page);
  await placeBet(page, 10);
  await key(page, 'Deal').click();
  const offers = page.getByRole('group', { name: 'Offers' });
  await expect(offers.getByRole('button', { name: 'Insurance $5' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('INS $5', { exact: true })).toHaveCount(0); // not until it is taken
  await offers.getByRole('button', { name: 'Insurance $5' }).click();
  await expect(page.getByText('INS $5', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('INS $5', { exact: true })).toBeVisible(); // and it stays through the settle

  const intersects = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
  for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    const label = page.getByText('INS $5', { exact: true });
    await expect(label).toBeVisible();
    const circle = page.getByRole('button', { name: /^Bet \$10/ });
    await expect.poll(async () => intersects(await label.boundingBox(), await circle.boundingBox()), { message: `INS label over the bet at ${size.width}x${size.height}` }).toBe(false);
  }
});

// The rack never shows a cut chip at rest (#82): every chip is either wholly in the rack's visible area or wholly out of it (a scrolling rack masks
// what is outside its padding), at every size and balance. The visible area is the rack's content box.
async function expectWholeChips(rack) {
  const cut = await rack.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const css = getComputedStyle(el);
    const left = r.left + parseFloat(css.paddingLeft);
    const right = r.right - parseFloat(css.paddingRight);
    return [...el.children].map((c) => c.getBoundingClientRect()).filter((b) => {
      const inside = b.left >= left - 0.5 && b.right <= right + 0.5;
      const outside = b.right <= left + 0.5 || b.left >= right - 0.5;
      return !inside && !outside;
    }).map((b) => [Math.round(b.left), Math.round(b.right), Math.round(left), Math.round(right)]);
  });
  expect(cut, 'chips cut by the rack edge: [left, right, visible left, visible right]').toEqual([]);
}

for (const credits of [30, 1000, 500_000]) {
  test(`the rack shows no cut chip at rest, at every size, with a balance of $${credits.toLocaleString()} (#82)`, async ({ page }) => {
    await stubApi(page, { startCredits: credits });
    await login(page);
    const rack = page.getByRole('group', { name: 'Chips' });
    await expect(rack.getByRole('button').first()).toBeVisible();
    for (const size of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(size);
      await expect.poll(async () => { try { await expectWholeChips(rack); return true; } catch { return false; } }, { message: `a chip is cut at ${size.width}x${size.height}` }).toBe(true);
      // scrolled to the far end it still rests on whole chips (the snap settles a frame later: polled)
      await rack.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await expect.poll(async () => { try { await expectWholeChips(rack); return true; } catch { return false; } }, { message: `a chip is cut after scrolling at ${size.width}x${size.height}` }).toBe(true);
    }
  });
}

test('at 375 px nothing scrolls sideways and every betting control is at least 44 px high (#82)', async ({ page }) => {
  await stubApi(page, { startCredits: 500_000 }); // the fullest rack
  await login(page);
  await page.setViewportSize({ width: 375, height: 667 });
  await placeBet(page, 10); // something in the circle so that every key is live
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$10/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'sideways scroll').toBe(true);
  const heights = await page.getByRole('contentinfo', { name: 'Controls' }).getByRole('button').evaluateAll((els) => els.map((el) => [el.getAttribute('aria-label') || el.textContent, el.getBoundingClientRect().height, el.getBoundingClientRect().width]));
  expect(heights.length).toBeGreaterThan(5);
  for (const [name, h, w] of heights) {
    expect(h, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(w, `${name} width`).toBeGreaterThanOrEqual(44);
  }
  const circle = await page.getByRole('button', { name: /^Bet spot 1/ }).boundingBox();
  expect(Math.min(circle.width, circle.height), 'the bet circle').toBeGreaterThanOrEqual(44);
});

test('Undo takes the armed auto deal back, and the round is not dealt (#88)', async ({ page }) => {
  const api = await stubApi(page, { settings: { ...VEGAS, playTimeout: 250, resetInitialBet: true, autoDeal: true, autoDealDelay: 10000 } });
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page, 10);
  await key(page, 'Deal').click();
  await page.getByRole('button', { name: 'Hit', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stay', exact: true }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$10/ })).toBeVisible({ timeout: 30_000 }); // the rebet is on the table, a deal armed
  await expect(key(page, 'Deal')).toContainText('auto');
  await key(page, 'Undo').click();
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$0/ })).toBeVisible();
  await expect(key(page, 'Deal')).not.toContainText('auto'); // disarmed
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible(); // and it stays there: no deal follows
  expect(api.bets, 'only round 1 reached the ledger').toHaveLength(1);
});
