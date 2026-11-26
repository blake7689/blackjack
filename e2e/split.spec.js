import { test, expect, stubApi, seedRandom, login, VEGAS, placeBet } from './fixtures';

// Split deal (#133). Seed 262 (mulberry32), found by the same script as seed 183 and the offers seeds (see smoke.spec.js: 4 router keys, the settings-load shoe,
// then the game-start shoe, Vegas 6 decks), keeping a round with a pair, a 7 up (no peek, no offers) and the next two cards different and not finishing a hand:
//   player 4 of hearts + 4 of diamonds against a 7 of diamonds up, king of spades in the hole (17).
//   Split: the first hand draws the king of hearts (14); the second hand's card, the 8 of spades (12), is next in the shoe.
// If the app's use of Math.random changes, the card assertions fail first and the seed needs re-picking.
async function splitAt262(page, settings) {
  const api = await stubApi(page, settings ? { settings } : {});
  await seedRandom(page, 262);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('img', { name: '4 of hearts' })).toBeVisible();
  await expect(page.getByRole('img', { name: '4 of diamonds' })).toBeVisible();
  await expect(page.getByRole('img', { name: '7 of diamonds' })).toBeVisible();
  await page.getByRole('button', { name: 'Split' }).click({ timeout: 15_000 }); // dimmed (aria-disabled) while the cards fly
  return api;
}

test('split, one at a time: the second hand holds one card until the first is finished, then its card is dealt (#133)', async ({ page }) => {
  const api = await splitAt262(page);
  const hands = page.getByRole('group', { name: /^Hand \d/ });
  await expect(hands).toHaveCount(2);
  await expect(page.getByRole('img', { name: 'king of hearts' })).toBeVisible(); // the first hand's card
  await expect(page.getByRole('button', { name: 'Stay' })).toBeEnabled({ timeout: 15_000 }); // the first hand to play (dimmed while its card flies)
  await expect(hands.nth(0).locator('.fly-card')).toHaveCount(2);
  await expect(hands.nth(1).locator('.fly-card')).toHaveCount(1); // only the card that moved
  await expect(page.getByRole('img', { name: '8 of spades' })).toHaveCount(0); // the second hand's card is still in the shoe: it must not be on the page
  expect(await page.content()).not.toContain('8 of spades');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'two split hands must not scroll the board sideways').toBe(true); // matters at phone size

  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByRole('img', { name: '8 of spades' })).toBeVisible(); // dealt to the second hand as play reaches it
  await expect(hands.nth(1).locator('.fly-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Stay' })).toBeEnabled({ timeout: 15_000 }); // the second hand is now in play
  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'king of spades' })).toBeVisible(); // the dealer played: 17 beats 14 and 12
  await expect(page.getByText('LOSE', { exact: true })).toHaveCount(3); // two hands: the verdict and a tag under each circle (#83)
  await expect(page.getByRole('banner').getByText(/^[+-]\$\d/)).toHaveCount(0); // a loss leaves no balance badge in the top bar (#83)

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toEqual([
    { amount: 10, newRound: true, requestId: expect.any(String) },
    { amount: 10, newRound: false, requestId: expect.any(String) }, // the split stake, taken at the split
  ]);
  expect(api.settles).toEqual([{ payout: 0, requestId: expect.any(String) }]);
});

test('split, both at once: the second hand has its card straight away (#133)', async ({ page }) => {
  const api = await splitAt262(page, { ...VEGAS, splitDeal: 'both' });
  await expect(page.getByRole('group', { name: /^Hand \d/ })).toHaveCount(2);
  await expect(page.getByRole('img', { name: 'king of hearts' })).toBeVisible();
  await expect(page.getByRole('img', { name: '8 of spades' })).toBeVisible(); // no waiting
  await expect(page.getByRole('button', { name: 'Stay' })).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByRole('group', { name: /^Hand \d/ }).nth(1).locator('.fly-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Stay' }).click();
  await page.getByRole('button', { name: 'Stay' }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toHaveLength(2);
});

// Multi-split deal (#193): no card already on the table may jump while the hands are split, resplit and then given their second cards.
// Seed 1807 with ONE deck (so every card is unique), found by script like seed 183 (4 router keys, the settings-load shoe, then the game-start shoe), keeping a
// round with a 3 of clubs up (no offers, no peek), no hand reaching 21 (it would finish by itself), where "Split whenever allowed, else Stay" gives the actions below (ten-value cards pair with each other):
// two splits of the first hand in a row, then splits of a LATER hand with a finished hand to its left. The player is dealt the jack of clubs + queen of spades.
// P = Split, S = Stay; every action but the last deals exactly one card. If the app's use of Math.random changes, the card assertions fail first.
const SIX = [['jack of clubs', '7 of spades'], ['queen of clubs', '9 of clubs'], ['king of clubs', '9 of diamonds'], ['king of hearts', '4 of spades'], ['king of spades', '9 of spades'], ['queen of spades', '5 of spades']];
const FOUR = [['jack of clubs', '7 of spades'], ['queen of clubs', 'king of clubs'], ['king of spades', '9 of clubs'], ['queen of spades', 'king of hearts']];
const MULTI_SPLIT = [
  { name: 'desktop, six hands', viewport: { width: 1280, height: 720 }, maxSplitHands: 0, actions: 'PPSPPSPSSSS', rows: 'scroll', hands: SIX, desktop: true },
  { name: '667x375, four hands, the row scrolls', viewport: { width: 667, height: 375 }, maxSplitHands: 4, actions: 'PPSPSSS', rows: 'scroll', hands: FOUR },
  { name: '375x667, four hands, the seats go tight', viewport: { width: 375, height: 667 }, maxSplitHands: 4, actions: 'PPSPSSS', rows: 'tight', hands: FOUR },
];

// Runs in the page. No check depends on how fast the frames come (a loaded runner drops them). Once per animation frame it records every face-up card (x without
// the seats row's scroll; rx / ry from its own seat; `glides`: a translate animation is running on it, or began since the last frame) and every flying copy's width beside the cards'. It also
// notes where each glide puts its card at its start, read once the commit that started it is over. `window.__step` is the action being played.
function recordFrames() {
  const frames = (window.__frames = []);
  const starts = (window.__starts = []);
  let painted = {}; // the cards as of the last frame
  const begun = new Set(); // glides begun since then: a late frame can outlast a whole glide
  let copies = 0;
  window.__step = -1;
  const spotOf = (card) => {
    const r = card.getBoundingClientRect();
    return { x: r.left + (card.closest('.seats')?.scrollLeft ?? 0), y: r.top };
  };
  const glides = (el) => el.getAnimations().some((a) => a.playState === 'running' && a.effect.getKeyframes().some((k) => k.translate !== undefined));
  const animate = Element.prototype.animate;
  Element.prototype.animate = function watched(keyframes, options) {
    const animation = animate.call(this, keyframes, options);
    const slot = keyframes?.[0]?.translate !== undefined && this.closest('.fan-slot');
    if (slot) begun.add(slot.dataset.fk);
    if (slot) queueMicrotask(() => {
      const was = painted[slot.dataset.fk];
      if (!was || !slot.isConnected) return;
      const now = spotOf(slot.firstElementChild);
      starts.push({ step: window.__step, key: slot.dataset.fk, off: Math.hypot(now.x - was.x, now.y - was.y) });
    });
    return animation;
  };
  const sample = () => {
    const cards = {};
    for (const slot of document.querySelectorAll('.seat .fan-slot, .dealer-hand .fan-slot')) {
      const card = slot.firstElementChild;
      if (card.style.visibility === 'hidden') continue;
      const r = card.getBoundingClientRect();
      const s = slot.closest('.seat')?.getBoundingClientRect();
      cards[slot.dataset.fk] = { ...spotOf(card), w: card.offsetWidth, glides: begun.has(slot.dataset.fk) || glides(slot) || glides(card), ...(s && { rx: r.left - s.left, ry: r.top - s.top }) };
    }
    painted = cards;
    begun.clear();
    const cardWidth = document.querySelector('.fan-slot > .card')?.offsetWidth;
    const flying = [...document.querySelectorAll('.flight-layer .fly-copy:not(.sweep)')].filter((c) => c.style.visibility !== 'hidden')
      .map((c) => ({ id: (c.qaId ??= ++copies), w: c.offsetWidth, cardWidth }));
    frames.push({ step: window.__step, cards, flying });
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

const FAR = 40; // px: more than a one-frame card resize moves a card, far less than any of the jumps (about 160 px and up)

function findJumps({ frames, starts }, actions) {
  const jumps = [];
  const at = (step) => `action ${step} ${actions[step]}`;
  // 1. A glide starts where its card was last painted, never from a remembered spot the row has since scrolled or moved away from.
  for (const s of starts) if (s.off > FAR) jumps.push(`${at(s.step)}: ${s.key} began a glide ${Math.round(s.off)} px from where it was`);
  const copyWidths = new Map();
  const wrongSize = new Map(); // copy id -> frames in a row it differed from the cards
  const home = new Map(); // each card's place in its own seat just before the action being played
  let prev;
  for (const f of frames) {
    if (prev && f.step !== prev.step) {
      home.clear();
      for (const [key, c] of Object.entries(prev.cards)) home.set(key, c);
    }
    for (const [key, now] of Object.entries(f.cards)) {
      // 2. A card gets somewhere else only by gliding there.
      const was = prev?.cards[key];
      const moved = was ? Math.hypot(now.x - was.x, now.y - was.y) : 0;
      if (moved > FAR && !now.glides && !was.glides) jumps.push(`${at(f.step)}: ${key} moved ${Math.round(moved)} px at once, with no glide`);
      // 3. A Stay splits nothing: while the next hand is dealt its card, no card leaves its place in its own seat (the hand only re-centres, a few px),
      // however the row scrolls.
      const rest = actions[f.step] === 'S' && now.rx !== undefined ? home.get(key) : undefined;
      if (rest && Math.hypot(now.rx - rest.rx, now.ry - rest.ry) > now.w / 2) jumps.push(`${at(f.step)}: ${key} strayed more than half a card from its place in its seat`);
    }
    // 4. A flying copy keeps one width, the cards' (one frame of difference is the sampler running before the flight's own frame callback).
    for (const c of f.flying) {
      copyWidths.set(c.id, (copyWidths.get(c.id) ?? new Set()).add(c.w));
      wrongSize.set(c.id, c.w === c.cardWidth ? 0 : (wrongSize.get(c.id) ?? 0) + 1);
      if (wrongSize.get(c.id) === 2) jumps.push(`${at(f.step)}: flying copy ${c.id} is ${c.w} px wide, the cards are ${c.cardWidth}`);
    }
    prev = f;
  }
  for (const [id, widths] of copyWidths) if (widths.size > 1) jumps.push(`flying copy ${id} changed width: ${[...widths].join(' -> ')}`);
  return { jumps: [...new Set(jumps)], copies: copyWidths.size };
}

for (const size of MULTI_SPLIT) {
  test.describe(`multi-split deal, ${size.name}`, () => {
    test.use({ viewport: size.viewport });

    test('no card on the table jumps, and each flying card keeps the width it lands at (#193)', async ({ page }, testInfo) => {
      test.skip(!!size.desktop && testInfo.project.name !== 'chromium', 'the desktop size runs once, in the chromium project');
      await stubApi(page, { settings: { ...VEGAS, playTimeout: 250, deckCount: 1, maxSplitHands: size.maxSplitHands } });
      await seedRandom(page, 1807);
      await login(page);
      await placeBet(page);
      await page.getByRole('button', { name: 'Deal', exact: true }).click();
      for (const card of ['jack of clubs', 'queen of spades', '3 of clubs']) await expect(page.getByRole('img', { name: card })).toBeVisible();

      // Nothing in the air, and every glide over (one still running is finished by the next measurement, which would read as a jump).
      const still = () => page.waitForFunction(() => !document.querySelector('.board.busy') && !document.querySelector('.flight-layer .fly-copy')
        && !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.closest('.fan-slot')));
      const key = (action) => page.getByRole('button', { name: action === 'P' ? 'Split' : 'Stay' });
      await expect(key(size.actions[0])).toBeEnabled({ timeout: 15_000 });
      await still();
      await page.evaluate(recordFrames);

      for (let i = 0; i < size.actions.length; i++) {
        await expect(key(size.actions[i])).toBeEnabled({ timeout: 15_000 });
        await still();
        // two frames first: each action starts from a recorded frame of the table at rest
        await page.evaluate((step) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => { window.__step = step; done(); }))), i);
        await key(size.actions[i]).click();
        if (i < size.actions.length - 1) await expect(page.locator('.seats .fan-slot')).toHaveCount(3 + i);
      }
      await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
      await still();

      // the round the seed gives, so the scenario really ran
      const hands = page.getByRole('group', { name: /^Hand \d/ });
      await expect(hands).toHaveCount(size.hands.length);
      for (const [i, names] of size.hands.entries()) for (const card of names) await expect(hands.nth(i).getByRole('img', { name: card })).toBeVisible();
      await expect(page.locator('.seats')).toHaveClass(new RegExp(`\\b${size.rows}\\b`));

      const { jumps, copies } = findJumps(await page.evaluate(() => ({ frames: window.__frames, starts: window.__starts })), size.actions);
      expect(copies, 'flying copies were sampled').toBeGreaterThanOrEqual(size.actions.length - 1);
      expect(jumps).toEqual([]);
    });
  });
}
