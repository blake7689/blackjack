import { test, expect, stubApi, seedRandom, login } from './fixtures';

// Keyboard-only play (#85, DESIGN section 8). Seeds as in smoke.spec.js.
// Seed 183: king of diamonds + 4 of clubs (14) against a 6 of clubs; Hit draws the 5 of hearts (19), Stay, the dealer draws to 19 (a push).
// Seed 65: 3 of diamonds + jack of spades (13) against an ace of clubs (insurance is offered; the dealer has no blackjack).

test('a whole round with the keyboard alone: chip, deal, hit, stay, next hand, and focus lands where it should (#85)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  const key = (name) => page.getByRole('button', { name, exact: true });

  await page.keyboard.press('3'); // the third chip of the rack, $10: selected...
  await expect(key('$10 chip')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('3'); // ...and, pressed again straight after, bet on the first circle
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$10/ })).toBeVisible();
  await page.keyboard.press('Space'); // deal
  await expect(key('Deal')).toHaveCount(0);

  const hit = key('Hit');
  await expect(hit).toBeFocused({ timeout: 15_000 }); // your move: focus is on Hit...
  await expect(hit).toBeEnabled(); // ...and it wakes once the cards have landed
  await page.keyboard.press('h');
  await expect(page.getByRole('img', { name: '5 of hearts' })).toBeVisible();
  await expect(hit).toBeEnabled({ timeout: 15_000 });
  await page.keyboard.press('s');

  const next = key('Next hand');
  await expect(next).toBeFocused({ timeout: 30_000 }); // the results: focus is on Next hand
  await expect(page.getByText('Hand 1: push, 19. Dealer: 19.')).toBeAttached();
  await page.keyboard.press('Space'); // a focused button keeps its own action: one click, one next hand
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toHaveLength(1);
  expect(api.bets[0]).toMatchObject({ amount: 10, newRound: true });
});

test('Enter deals too, and R surrenders once the cards have landed (#85)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await page.keyboard.press('3');
  await page.keyboard.press('3');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('img', { name: '6 of clubs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Surrender', exact: true })).toBeEnabled({ timeout: 15_000 });
  await page.keyboard.press('r');
  await expect(page.getByText('SURRENDER', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.settles[0]).toMatchObject({ payout: 5 });
});

test('the offers by keyboard: focus on the first offer, N says no thanks, then Hit has focus (#85)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 65);
  await login(page);
  await page.keyboard.press('3');
  await page.keyboard.press('3');
  await page.keyboard.press('Space');
  const offers = page.getByRole('group', { name: 'Offers' });
  const insurance = offers.getByRole('button', { name: 'Insurance $5' });
  await expect(insurance).toBeFocused({ timeout: 15_000 });
  await expect(insurance).toBeEnabled();
  await page.keyboard.press('n');
  await expect(offers).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hit', exact: true })).toBeFocused({ timeout: 15_000 });
  expect(api.bets.map((b) => b.amount)).toEqual([10]); // no insurance was bought
});

test('I takes the insurance from the keyboard (#85)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 65);
  await login(page);
  await page.keyboard.press('3');
  await page.keyboard.press('3');
  await page.keyboard.press('Space');
  const insurance = page.getByRole('group', { name: 'Offers' }).getByRole('button', { name: 'Insurance $5' });
  await expect(insurance).toBeEnabled({ timeout: 15_000 });
  await page.keyboard.press('i');
  await expect(page.getByRole('button', { name: 'Hit', exact: true })).toBeFocused({ timeout: 15_000 });
  await expect.poll(() => api.bets.map((b) => b.amount)).toEqual([10, 5]); // the insurance is a second stake
});
