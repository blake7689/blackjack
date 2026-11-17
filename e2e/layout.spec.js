import { test, expect, stubApi, seedRandom, login } from './fixtures';

// The layout core (#80): the table never resizes between betting, dealing, the offers, your move and the results, the dock keeps
// its height, the message line holds its 48 px, the tip line is 0 px, and Hit and Stay stay on screen at every size.
// Seed 65 (see smoke.spec.js): 3 of diamonds + jack of spades (13) against an ace of clubs, 7 of clubs in the hole (no blackjack).
// One round through it shows every face of the dock: betting, dealing, the offers, your move (after "No thanks"), the results.

// Samples the board on every frame and on every DOM change (no timers): which heights each part has had, which dock faces and
// message lines were on screen, whether the page ever scrolled, and the smallest key.
async function watchLayout(page) {
  await page.evaluate(() => {
    const seen = (window.__layout = { dock: new Set(), msg: new Set(), stage: new Set(), tip: new Set(), faces: new Set(), words: new Set(), scrolled: false, minKey: Infinity });
    const parts = { dock: '.dock', msg: '.msg', stage: '.main-area.stage', tip: '.tip-line' };
    const sample = () => {
      for (const [name, selector] of Object.entries(parts)) {
        const el = document.querySelector(selector);
        if (el) seen[name].add(Math.round(el.getBoundingClientRect().height * 10) / 10);
      }
      const face = document.querySelector('.dock-in')?.getAttribute('data-face');
      if (face) seen.faces.add(face);
      const words = document.querySelector('.msg')?.textContent;
      if (words) seen.words.add(words);
      const root = document.documentElement;
      if (root.scrollWidth > root.clientWidth || root.scrollHeight > window.innerHeight) seen.scrolled = true;
      for (const key of document.querySelectorAll('.dock button')) seen.minKey = Math.min(seen.minKey, key.getBoundingClientRect().height);
    };
    new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const frame = () => { sample(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
}

const readLayout = async (page) => page.evaluate(() => Object.fromEntries(Object.entries(window.__layout).map(([k, v]) => [k, v instanceof Set ? [...v] : v])));

// Signs in, sits at the table, and plays seed 65 from the first chip to the next betting screen, watching the layout all the way.
async function playRound(page) {
  await stubApi(page);
  await seedRandom(page, 65);
  await login(page);
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();
  await watchLayout(page);
  await page.getByRole('button', { name: 'Add 10', exact: true }).click();
  await expect(page.getByText('Tap Deal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  const offers = page.getByRole('group', { name: 'Offers' });
  await expect(offers.getByRole('button', { name: 'Insurance $5' })).toBeEnabled({ timeout: 15_000 }); // dimmed while the cards fly
  await offers.getByRole('button', { name: 'No thanks' }).click();
  const hit = page.getByRole('button', { name: 'Hit', exact: true });
  await expect(hit).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  const stay = page.getByRole('button', { name: 'Stay', exact: true });
  await expect(stay).toBeEnabled();
  await stay.click();
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Next hand' }).click();
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();
  return readLayout(page);
}

// msg: the message line's height in this mode (48 px; 30 on a short landscape phone and 56 on wide screens, the mockup's .mid)
function expectSteady(layout, msg = 48) {
  expect([...layout.faces].sort(), 'every face of the dock was on screen').toEqual(['betting', 'offers', 'play', 'results']);
  expect(layout.words).toEqual(expect.arrayContaining(['Place your bets', 'Tap Deal', 'Dealing', 'Insurance?', 'Your move']));
  expect(layout.dock, 'the dock keeps one height').toHaveLength(1);
  expect(layout.msg, 'the message line keeps one height').toEqual([msg]);
  expect(layout.stage, 'the table does not resize').toHaveLength(1);
  expect(layout.tip, 'the tip line stays 0 px').toEqual([0]);
  expect(layout.scrolled, 'the page never scrolls').toBe(false);
}

test('betting, dealing, offers, your move and results all share one dock, message and table height (#80)', async ({ page, isMobile }) => {
  expectSteady(await playRound(page), isMobile ? 48 : 56); // the desktop project's 1280x720 is a wide screen
});

test('the tip line exists, is empty and 0 px tall, between the felt and the dock (#80)', async ({ page }) => {
  await stubApi(page);
  await login(page);
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();
  const tip = page.locator('.tip-line');
  await expect(tip).toBeEmpty();
  expect((await tip.boundingBox()).height).toBe(0);
  const [stage, dock] = await Promise.all([page.locator('.main-area.stage').boundingBox(), page.getByLabel('Controls').boundingBox()]);
  expect((await tip.boundingBox()).y).toBeGreaterThanOrEqual(stage.y + stage.height); // after the felt
  expect((await tip.boundingBox()).y).toBeLessThanOrEqual(dock.y); // before the dock
});

// The other sizes of the issue's checklist, in the desktop project only (the phone project runs the Pixel 7 round above).
for (const [name, viewport, msg] of [['375x667', { width: 375, height: 667 }, 48], ['844x390', { width: 844, height: 390 }, 30]]) {
  test.describe(`at ${name}`, () => {
    test.skip(({ isMobile }) => isMobile, 'the phone project runs the Pixel 7 round');
    test.use({ viewport });

    test('the layout holds through a round, the keys are at least 44 px high, and nothing scrolls (#80)', async ({ page }) => {
      const layout = await playRound(page);
      expectSteady(layout, msg);
      expect(layout.minKey, 'every key in the dock').toBeGreaterThanOrEqual(44);
    });
  });
}

test.describe('at 844x390 (a phone on its side)', () => {
  test.skip(({ isMobile }) => isMobile, 'the phone project runs the Pixel 7 round');
  test.use({ viewport: { width: 844, height: 390 } });

  test('Hit and Stay are on screen and live on your turn, and the dock stays below the felt (#80)', async ({ page }) => {
    await stubApi(page);
    await seedRandom(page, 65);
    await login(page);
      await page.getByRole('button', { name: 'Add 10', exact: true }).click();
    await page.getByRole('button', { name: 'Deal', exact: true }).click();
    await page.getByRole('group', { name: 'Offers' }).getByRole('button', { name: 'No thanks' }).click();
    const hit = page.getByRole('button', { name: 'Hit', exact: true });
    const stay = page.getByRole('button', { name: 'Stay', exact: true });
    await expect(hit).toBeEnabled({ timeout: 15_000 });
    await expect(stay).toBeEnabled();
    for (const key of [hit, stay]) {
      await expect(key).toBeVisible();
      await expect(key).toBeInViewport({ ratio: 1 }); // all of it, not just a corner
    }
    const dock = await page.getByLabel('Controls').boundingBox();
    const stage = await page.locator('.main-area.stage').boundingBox();
    expect(stage.y + stage.height, 'the felt ends where the dock starts').toBeLessThanOrEqual(dock.y + 1);
    await hit.click(); // a real click lands: nothing sits on top of the key
  });
});

// Nothing is clipped at any size (#81): after the deal every card, the circle and the amount are inside the felt, the top bar's three parts do not
// overlap and the balance is centred on it, and the page does not scroll sideways. Seed 183: 14 against a 6, then a hit.
for (const [w, h] of [[320, 568], [375, 667], [390, 844], [768, 1024], [1440, 900], [844, 390], [360, 1200]]) {
  test(`the table and the top bar fit at ${w}x${h} (#81)`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'the desktop project sets the viewports');
    await page.setViewportSize({ width: w, height: h });
    await stubApi(page);
    await seedRandom(page, 183);
    await login(page);
    await page.getByRole('button', { name: 'Add 10', exact: true }).click();
    await page.getByRole('button', { name: 'Deal', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hit' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Hit' }).click();
    await expect(page.getByRole('img', { name: '5 of hearts' })).toBeVisible();
    await expect(page.locator('.board.busy')).toHaveCount(0);
    const fit = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const felt = box(document.querySelector('.felt'));
      const inside = (el) => { const r = box(el); return r.top >= felt.top - 1 && r.bottom <= felt.bottom + 1 && r.left >= felt.left - 1 && r.right <= felt.right + 1; };
      const parts = ['.bar-l', '.bal', '.top-r'].map((q) => box(document.querySelector(q)));
      const bal = box(document.querySelector('#bal'));
      const bar = box(document.querySelector('.top-in'));
      return {
        outside: [...document.querySelectorAll('.card, .spot, .amt, .pill')].filter((el) => !inside(el)).map((el) => el.className),
        overlap: parts.some((p, i) => i && p.left < parts[i - 1].right - 0.5),
        balanceOffCentre: Math.abs(bal.left + bal.width / 2 - (bar.left + bar.width / 2)),
        scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cw: parseFloat(getComputedStyle(document.querySelector('.stage-in')).getPropertyValue('--cw')),
      };
    });
    expect(fit.outside, 'cards, circle, amount and pill inside the felt').toEqual([]);
    expect(fit.overlap, 'the top bar parts do not overlap').toBe(false);
    expect(fit.balanceOffCentre, 'the balance is centred on the bar').toBeLessThan(2);
    expect(fit.scrolls, 'no horizontal scroll').toBe(false);
    if (w === 844 && h === 390) expect(fit.cw, 'the card width on a short landscape phone (the mockup: about 66)').toBeGreaterThanOrEqual(60);
  });
}
