import { test, expect, stubApi, seedRandom, login, VEGAS, placeBet } from './fixtures';

// Table art acceptance (#81): what jsdom cannot see (CSS, real layout, fonts, the keyboard, cards landing one at a time).
// The seeds were found like seed 183 (see smoke.spec.js: 4 router keys, the settings-load shoe, then the game-start shoe, Vegas 6 decks); the first four
// cards of the second shoe are player, dealer up, player, hole, and the next ones are the hits and the dealer's draws. If the app's use of Math.random
// changes, the card assertions fail first and the seeds need re-picking.
//   Seed 19:   king of spades + ace of diamonds (a natural) against a 2 of diamonds up, 6 of spades in the hole (no offers, no peek).
//   Seed 241:  ace of hearts + 6 of diamonds (soft 17) against a 5 of hearts up, 7 of hearts in the hole.
//   Seed 183:  see smoke.spec.js (14 against a 6; Hit draws the 5 of hearts, the dealer the 3 of diamonds).
//   Seed 38821090: 3 of spades + 5 of hearts, Hit draws the 5 of spades and the ace of hearts (14, four cards); the dealer (3 of spades up, 2 of hearts
//              in the hole) draws 3, 3, ace, 3, ace, 8: eight cards.

async function dealAt(page, seed, settings = {}) {
  const api = await stubApi(page, { settings: { ...VEGAS, playTimeout: 250, ...settings } });
  await seedRandom(page, seed);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  return api;
}

// Soft totals and a natural (the pill)
test('a soft hand shows both totals, 7/17, beside the hand and never on a card (#81)', async ({ page }) => {
  await dealAt(page, 241);
  await expect(page.getByRole('img', { name: 'ace of hearts' })).toBeVisible();
  await expect(page.getByRole('img', { name: '6 of diamonds' })).toBeVisible();
  const pill = page.locator('.player-hand .pill');
  await expect(pill).toHaveText('7/17');
  await expect(pill).toBeVisible(); // hidden while the opening cards are dealt
  await expect(page.getByRole('group', { name: 'Hand 1: ace of hearts, 6 of diamonds, 17' })).toBeVisible();
  const [box, last] = await Promise.all([pill.boundingBox(), page.locator('.player-hand .fan-slot').last().boundingBox()]);
  expect(box.x, 'the pill is to the right of the last card').toBeGreaterThanOrEqual(last.x + last.width);
});

test.describe('Show hand totals off (.no-totals)', () => {
  test('with totals on, the dealer shows its total and the natural says Blackjack!', async ({ page }) => {
    await dealAt(page, 19);
    await expect(page.locator('.player-hand .pill.bj')).toHaveText('Blackjack!');
    await expect(page.locator('.dealer-hand .pill')).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/no-totals/);
  });

  test('hides every total in every phase but keeps Blackjack!, and the hands lose their totals from their names (#81)', async ({ page }) => {
    await dealAt(page, 19, { showTotals: false });
    await expect(page.locator('html')).toHaveClass(/no-totals/);
    await expect(page.locator('.player-hand .pill.bj')).toBeVisible();
    await expect(page.locator('.player-hand .pill.bj')).toHaveText('Blackjack!');
    await expect(page.locator('.dealer-hand .pill')).toHaveCount(1); // it is there (the control above shows it) ...
    await expect(page.locator('.dealer-hand .pill')).toBeHidden(); // ... but not shown
    await expect(page.getByRole('group', { name: 'Hand 1: king of spades, ace of diamonds, blackjack' })).toBeVisible();
    await expect(page.getByRole('group', { name: /^Dealer: / })).not.toHaveAccessibleName(/showing/);
    await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 }); // the results phase: still hidden
    await expect(page.locator('.dealer-hand .pill')).toBeHidden();
    await expect(page.locator('.player-hand .pill.bj')).toBeVisible();
  });
});

// The count: never blank, and it moves only as cards land face up. Seed 183: the king (-1), 6 (+1) and 4 (+1) land in the deal's order,
// the hole card (jack, -1) only when it turns, then the Hit's 5 (+1) and the dealer's 3 (+1).
test('the count is never blank and moves one card at a time, as each lands face up (#81)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await page.evaluate(() => {
    const rec = (window.__count = { seen: [], trueSeen: [], blank: false });
    const read = () => {
      const figures = [...document.querySelectorAll('.count b')].map((b) => b.textContent.trim());
      if (figures.length !== 2 || figures.some((t) => !t)) { rec.blank = true; return; }
      if (rec.seen.at(-1) !== figures[0]) rec.seen.push(figures[0]);
      if (rec.trueSeen.at(-1) !== figures[1]) rec.trueSeen.push(figures[1]);
    };
    new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    read();
  });
  await expect(page.getByRole('group', { name: 'Card count' })).toContainText('Count0'); // empty table: 0, not blank
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('img', { name: '4 of clubs' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Card count' })).toContainText('Count+1'); // king, 6 and 4 are down; the hole card is not counted
  await page.getByRole('button', { name: 'Hit' }).click({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: '5 of hearts' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay' }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });

  const rec = await page.evaluate(() => window.__count);
  expect(rec.blank, 'a figure was ever empty').toBe(false);
  // 0 -> king -1 -> 6 +0 -> 4 +1 -> (hole hidden) -> 5 +2 -> hole turns (jack) +1 -> dealer's 3 +2: one card at a time, never ahead of a landing
  expect(rec.seen).toEqual(['0', '-1', '0', '+1', '+2', '+1', '+2']);
  expect(rec.trueSeen.every((t) => /^[+-]?\d+$/.test(t))).toBe(true);
});

// The top bar's menu from the keyboard
test('the menu opens from the keyboard, lists its items, keeps Analytics inert (Soon), and Escape closes it and gives the focus back (#81)', async ({ page }) => {
  await stubApi(page);
  await login(page);
  const button = page.getByRole('button', { name: 'Menu', exact: true });
  const menu = page.getByRole('navigation', { name: 'Menu' });
  await expect(menu).toBeHidden();
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button')).toHaveText(['Home', 'Table rules', 'Analytics Soon', 'Settings', 'Log out']);
  await expect(menu.getByRole('radio')).toHaveCount(3); // the felt swatches

  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', { name: 'Home' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const analytics = menu.getByRole('button', { name: /Analytics/ });
  await expect(analytics).toBeFocused();
  await expect(analytics).toContainText('Soon');
  await expect(analytics).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible(); // does nothing
  await expect(page).toHaveURL(/\/game$/);

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
  await page.keyboard.press('Tab'); // a closed menu is out of the tab order: the next stop is the top bar's Settings key
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
});

// The felt print, preset by preset (the words are ruleCatalog.js's: the same as Settings and the rules sheet)
const AFTER = 'drawAfter'; // no hole card
const PRINTS = [
  ['Vegas', {}, ['Blackjack Pays 3 to 2', 'Dealer hits soft 17 · Dealer peeks', 'Insurance pays 2 to 1']],
  ['Atlantic City', { dealerHoleBehaviour: AFTER, deckCount: 8, dealerHitsSoft17: false, blackjackPaysImmediately: false }, ['Blackjack Pays 3 to 2', 'Dealer stands on all 17s · No second card', 'Insurance pays 2 to 1']],
  ['Europe', { dealerHoleBehaviour: AFTER, dealerHitsSoft17: false, doubleOn: '9-11', maxSplitHands: 0, noHoleCardLoss: 'all', surrender: 'none', blackjackPaysImmediately: false }, ['Blackjack Pays 3 to 2', 'Dealer stands on all 17s · No second card', 'Insurance pays 2 to 1']],
  ['Australia', { dealerHoleBehaviour: AFTER, dealerHitsSoft17: false, doubleOn: '9-11', maxSplitHands: 3, surrender: 'none', blackjackPaysImmediately: false }, ['Blackjack Pays 3 to 2', 'Dealer stands on all 17s · No second card', 'Insurance pays 2 to 1']],
  ['Singapore', { dealerHoleBehaviour: AFTER, dealerHitsSoft17: false, maxSplitHands: 3, surrender: 'earlyNoAce', blackjackPaysImmediately: false }, ['Blackjack Pays 3 to 2', 'Dealer stands on all 17s · No second card', 'Insurance pays 2 to 1']],
  ['a 6:5 table with insurance', { blackjackPayout: '6:5' }, ['Blackjack Pays 6 to 5', 'Dealer hits soft 17 · Dealer peeks', 'Insurance pays 2 to 1']],
  ['a 6:5 table with no insurance and no peek', { blackjackPayout: '6:5', insurance: false, dealerHoleBehaviour: 'drawEarly_NoCheck' }, ['Blackjack Pays 6 to 5', 'Dealer hits soft 17 · No peek']],
];
for (const [name, rules, lines] of PRINTS) {
  test(`the felt prints ${name}'s payout, soft 17, hole-card mode${lines.length === 3 ? ' and insurance' : ' (no insurance line)'} (#81)`, async ({ page }) => {
    await stubApi(page, { settings: { ...VEGAS, playTimeout: 250, ...rules } });
    await login(page);
    await expect(page.locator('.print text')).toHaveText(lines);
    await expect(page.locator('.print path.band')).toHaveCount(lines.length === 3 ? 2 : 0); // insurance sits in a ruled band
    await expect(page.getByRole('button', { name: 'Table rules' }).first()).toBeVisible();
  });
}

test('the felt print is set in Cinzel and Cormorant Garamond, which are self-hosted and load (#81)', async ({ page }) => {
  await stubApi(page);
  await login(page);
  await expect(page.locator('.print text')).toHaveCount(3);
  const families = await page.locator('.print text').evaluateAll((els) => els.map((el) => getComputedStyle(el).fontFamily));
  expect(families[0]).toContain('Cinzel');
  expect(families[1]).toContain('Cormorant Garamond');
  expect(families[2]).toContain('Cormorant Garamond');
  const faces = await page.evaluate(async () => (await Promise.all(['Cinzel', 'Cormorant Garamond'].map((f) => document.fonts.load(`700 16px "${f}"`)))).map((r) => r.length));
  expect(faces, 'both faces were found and loaded (a missing face loads nothing)').toEqual([1, 1]);
});

// Hands: 0.27cw step for every hand, and a long dealer hand slides left clear of the shoe. Seed 38821090: the player holds four cards, the dealer eight.
const geometry = (page) => page.evaluate(() => {
  const rect = (el) => el.getBoundingClientRect();
  const cw = parseFloat(getComputedStyle(document.querySelector('.stage-in')).getPropertyValue('--cw'));
  const lefts = (sel) => [...document.querySelectorAll(sel)].map((el) => rect(el).left);
  const dealerSlots = [...document.querySelectorAll('.dealer-hand .fan-slot')];
  return {
    cw,
    dealer: lefts('.dealer-hand .fan-slot'),
    player: lefts('.player-hand .fan-slot'),
    dealerRight: Math.max(...dealerSlots.map((el) => rect(el).right)),
    shoeLeft: rect(document.querySelector('.shoe-card')).left,
    slide: parseFloat(getComputedStyle(document.querySelector('.dealer-area')).marginRight),
    pill: rect(document.querySelector('.dealer-hand .pill')).left,
  };
});
const steps = (lefts) => lefts.slice(1).map((left, i) => left - lefts[i]);

for (const [name, viewport, slides] of [['a 320 px phone', { width: 320, height: 800 }, true], ['a wide screen', { width: 1280, height: 720 }, false]]) {
  test(`${name}: every hand steps 0.27 of a card, never tightens, and the eight-card dealer hand ${slides ? 'slides left, clear of the shoe' : 'stays clear of the shoe'} (#81)`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'sets its own viewport; the desktop project runs it');
    await page.setViewportSize(viewport);
    await stubApi(page);
    await seedRandom(page, 38821090);
    await login(page);
    await placeBet(page);
    await page.getByRole('button', { name: 'Deal', exact: true }).click();
    await page.getByRole('button', { name: 'Hit', exact: true }).click({ timeout: 15_000 });
    await expect(page.getByRole('img', { name: '5 of spades' })).toBeVisible();
    await page.getByRole('button', { name: 'Hit', exact: true }).click({ timeout: 15_000 });
    await expect(page.getByRole('img', { name: 'ace of hearts' })).toBeVisible();
    await page.getByRole('button', { name: 'Stay', exact: true }).click({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.dealer-hand .fan-slot')).toHaveCount(8);
    await expect(page.locator('.player-hand .fan-slot')).toHaveCount(4);

    // the cards glide into place for a moment after the last lands: wait on the layout, not on the clock
    await expect.poll(async () => {
      const g = await geometry(page);
      const step = Math.round(g.cw * 0.27);
      return [...steps(g.dealer), ...steps(g.player)].every((s) => Math.abs(s - step) < 0.6);
    }, { message: 'every card lies one step (0.27 of a card) past the one before it, dealer and player alike' }).toBe(true);
    const g = await geometry(page);
    expect(steps(g.dealer)).toHaveLength(7);
    expect(steps(g.player)).toHaveLength(3);
    expect(g.dealerRight, 'the dealer hand stops at the shoe (the design lets it reach 8 px past its left edge)').toBeLessThanOrEqual(g.shoeLeft + 8);
    expect(g.pill, "the dealer's total is beside the last card, never on it").toBeGreaterThanOrEqual(g.dealerRight);
    if (slides) expect(g.slide, 'the hand is longer than its room, so it slid left').toBeGreaterThan(0);
    else expect(g.slide, 'there is room: it stays centred').toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll').toBe(true);
  });
}

// Five hands: the seats scroll one hand at a time and the hand in play is centred. Seed 33973 (unlimited splits): jack + jack against a 3 up,
// and the next cards are tens (queen, 10, 10), so each split makes a new pair; four splits make five hands. Every card after that is 2-9: no more pairs, no 21.
const seatsState = (page) => page.evaluate(() => {
  const row = document.querySelector('.seats');
  const seats = [...row.children];
  const active = seats.findIndex((seat) => seat.classList.contains('active'));
  const [r, a] = [row.getBoundingClientRect(), seats[active]?.getBoundingClientRect()];
  const css = getComputedStyle(row);
  return { n: seats.length, scroll: row.classList.contains('scroll'), active, off: a ? a.left + a.width / 2 - (r.left + r.width / 2) : null, snap: css.scrollSnapType, mask: css.maskImage, overflowX: css.overflowX };
});

test('five hands scroll one hand at a time, fading at the edges, with the hand in play centred (#81)', async ({ page }) => {
  await stubApi(page, { settings: { ...VEGAS, playTimeout: 250, maxSplitHands: 0 } });
  await seedRandom(page, 33973);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  const hands = page.getByRole('group', { name: /^Hand \d/ });
  for (let n = 2; n <= 5; n++) {
    await page.getByRole('button', { name: 'Split', exact: true }).click({ timeout: 15_000 });
    await expect(hands).toHaveCount(n);
  }
  const state = () => seatsState(page);
  await expect.poll(async () => (await state()).scroll, { message: 'five hands scroll' }).toBe(true);
  const s = await state();
  expect(s.snap, 'one hand at a time').toMatch(/x mandatory/);
  expect(s.mask, 'neighbours fade at the edges').toContain('linear-gradient');
  expect(s.overflowX).toBe('auto');
  for (let i = 0; i < 5; i++) {
    await expect.poll(async () => { const t = await state(); return t.active === i && Math.abs(t.off) < 2; }, { message: `hand ${i + 1} is in play and centred` }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the page does not scroll sideways').toBe(true);
    if (i < 4) await page.getByRole('button', { name: 'Stay', exact: true }).click({ timeout: 15_000 });
  }
});
