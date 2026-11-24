import { test, expect, stubApi, seedRandom, login, placeBet, submitLogin, VEGAS } from './fixtures';

// The loop 2 build list (#166, L2-1 .. L2-13): what only a real browser shows. Seed 183 is the round described in smoke.spec.js (14 against a 6, Hit draws a 5).
// The fixture's saved settings say tableMessages "all" and currency "USD" (fixtures.js), so these specs set their own where they test those.
const key = (page, name) => page.getByRole('button', { name, exact: true });
const FAST = { ...VEGAS, playTimeout: 250 };
const wide = (page) => (page.viewportSize()?.width ?? 0) >= 900 && (page.viewportSize()?.height ?? 0) >= 521;

// Signs in with the opening shuffle skipped and waits until the table is open for bets (the rack awake), whatever the line says.
async function openTable(page) {
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await submitLogin(page);
  await (await settingsLoaded).finished();
  await page.locator('.felt').dispatchEvent('click'); // a tap on the felt skips the shuffle, and is not a pointerdown: the idle clock is not touched
  await expect(page.locator('.rack-wrap:not(.off)')).toBeVisible({ timeout: 15_000 });
}

// Every non-empty line the message line ever held that is not a result, collected in the page.
const watchLine = (page) => page.addInitScript(() => {
  window.__lines = new Set();
  new MutationObserver(() => {
    const msg = document.querySelector('.msg');
    if (msg && !msg.querySelector('.verdict') && msg.textContent) window.__lines.add(msg.textContent);
  }).observe(document, { subtree: true, childList: true, characterData: true });
});
const lines = (page) => page.evaluate(() => [...window.__lines]);

for (const messages of ['hints', 'results']) {
  test(`Table messages "${messages}": no status line ever shows, and the result does (L2-1)`, async ({ page }) => {
    await watchLine(page);
    await stubApi(page, { settings: { ...FAST, tableMessages: messages } });
    await seedRandom(page, 183);
    await openTable(page);
    await placeBet(page);
    await key(page, 'Deal').click();
    await key(page, 'Hit').click({ timeout: 15_000 });
    await key(page, 'Stay').click({ timeout: 15_000 });
    await expect(page.locator('.msg .verdict')).toBeVisible({ timeout: 30_000 }); // every result shows
    await expect(key(page, 'Next hand')).toBeVisible();
    const seen = await lines(page);
    for (const status of ['Dealing', 'Dealer plays', 'Settling bets', 'Dealer checks for blackjack', 'No blackjack', 'Shuffling', 'Waiting for the server...']) {
      expect(seen, status).not.toContain(status);
    }
  });
}

test('Table messages "hints": the line is empty, then the prompt fades in after 5 s with no input (L2-1)', async ({ page }) => {
  await stubApi(page, { settings: { ...FAST, tableMessages: 'hints' } });
  await openTable(page);
  const began = Date.now();
  await expect(page.locator('.msg')).toHaveText(''); // nothing while the player is just looking
  await expect(page.locator('.msg')).toHaveText('Place your bets', { timeout: 9000 });
  expect(Date.now() - began).toBeGreaterThan(4000); // after the 5 s, not at once
  await expect(page.locator('.msg .prompt')).toHaveCSS('opacity', '1'); // it has faded in
});

test('Table messages "hints": a tap hides the prompt and starts the wait again (L2-1)', async ({ page }) => {
  await stubApi(page, { settings: { ...FAST, tableMessages: 'hints' } });
  await openTable(page);
  await expect(page.locator('.msg')).toHaveText('Place your bets', { timeout: 9000 });
  await page.getByRole('button', { name: '$10 chip', exact: true }).click(); // a pointerdown on the page hides the prompt again
  await expect(page.locator('.msg')).toHaveText('');
});

test('Table messages "results": notices still show, here Out of credits (L2-1)', async ({ page }) => {
  await stubApi(page, { settings: { ...FAST, tableMessages: 'results' }, startCredits: 0 });
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await submitLogin(page);
  await (await settingsLoaded).finished();
  await page.locator('.felt').dispatchEvent('click');
  await expect(page.locator('.msg')).toHaveText('Out of credits', { timeout: 15_000 }); // a notice shows in every mode
});

test('a GBP account sees pounds on every amount, and chips named for them (L2-2)', async ({ page }) => {
  await stubApi(page, { settings: { ...FAST, currency: 'GBP' } });
  await seedRandom(page, 183);
  await login(page);
  await expect(page.locator('#bal')).toHaveText('£1,000');
  await expect(page.getByRole('button', { name: '£10 chip', exact: true })).toBeVisible();
  await placeBetPounds(page);
  await key(page, 'Deal').click();
  await key(page, 'Hit').click({ timeout: 15_000 });
  await key(page, 'Stay').click({ timeout: 15_000 });
  await expect(key(page, 'Next hand')).toBeVisible({ timeout: 30_000 });
  const text = await page.locator('.board').innerText();
  expect(text).toContain('£');
  expect(text).not.toContain('$');
});
const placeBetPounds = async (page, chip = 10) => {
  await page.getByRole('button', { name: `£${chip} chip`, exact: true }).click();
  await page.getByRole('button', { name: /^Bet spot 1,/ }).click();
};

test.describe('Auto currency follows the device language (L2-2)', () => {
  test.describe('en-GB', () => {
    test.use({ locale: 'en-GB' });
    test('pounds', async ({ page }) => {
      await stubApi(page, { settings: { ...FAST, currency: 'auto' } });
      await login(page);
      await expect(page.locator('#bal')).toHaveText('£1,000');
    });
  });
  test.describe('de-DE', () => {
    test.use({ locale: 'de-DE' });
    test('euros', async ({ page }) => {
      await stubApi(page, { settings: { ...FAST, currency: 'auto' } });
      await login(page);
      await expect(page.locator('#bal')).toHaveText('€1,000');
    });
  });
  test.describe('en-US', () => {
    test.use({ locale: 'en-US' });
    test('dollars, and the Settings summary says what Auto resolved to', async ({ page }) => {
      await stubApi(page, { settings: { ...FAST, currency: 'auto' } });
      await login(page);
      await expect(page.locator('#bal')).toHaveText('$1,000');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('button', { name: /^Appearance/ })).toContainText('Green felt · Emerald · Dark · $');
    });
  });
});

test('Show keyboard shortcuts: the hints are off by default and on with the setting, on a desktop screen only; the keys work and say so either way (L2-3)', async ({ page }) => {
  await stubApi(page);
  await login(page);
  const hint = () => page.evaluate(() => {
    const kbd = getComputedStyle(document.querySelector('.dock .key kbd')).display;
    const digit = getComputedStyle(document.querySelector('.rc[data-key]'), '::before').display;
    return { kbd, digit };
  });
  expect(await hint()).toEqual({ kbd: 'none', digit: 'none' }); // off by default
  await expect(key(page, 'Deal')).toHaveAttribute('aria-keyshortcuts', 'Space'); // the key still says its shortcut
  // On: the same page, with the setting turned on in Settings.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Gameplay/ }).click();
  const control = page.getByRole('switch', { name: /^Show keyboard shortcuts/ });
  if (wide(page)) {
    await page.locator('label.sw', { hasText: 'Show keyboard shortcuts' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('.s-note')).toHaveText('Saved');
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.locator('.dock.hints')).toBeVisible();
    expect(await hint()).toEqual({ kbd: 'block', digit: 'block' });
  } else {
    await expect(control).toBeHidden(); // a phone has no keyboard hints to show: the setting is not offered
    await expect(page.locator('.dock.hints')).toHaveCount(0);
  }
});

test('the Deal key always says Deal, is dimmed while the table shuffles, and has no "auto" line (L2-4)', async ({ page }) => {
  await stubApi(page, { settings: { ...VEGAS, playTimeout: 1000 } });
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await submitLogin(page);
  await (await settingsLoaded).finished();
  await expect(page.locator('.rack-wrap')).toHaveClass(/off/); // the shuffle is on
  await expect(key(page, 'Deal')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Shuffling', exact: true })).toHaveCount(0);
  await page.locator('.felt').dispatchEvent('click');
  await expect(page.locator('.rack-wrap:not(.off)')).toBeVisible();
  await expect(key(page, 'Deal')).toBeVisible();
});

test('auto deal: Deal and Next hand show a bar that fills over the real wait, and it goes with Pause (L2-4)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__bars = [];
    new MutationObserver(() => {
      for (const i of document.querySelectorAll('.key .bar i')) {
        const label = i.closest('.key').getAttribute('aria-label') ?? i.closest('.key').textContent;
        const ms = i.getAnimations()[0]?.effect.getTiming().duration;
        if (ms && !window.__bars.some((b) => b.label === label && b.ms === ms)) window.__bars.push({ label, ms });
      }
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  const api = await stubApi(page, { settings: { ...FAST, resetInitialBet: true, autoDeal: true, autoDealDelay: 8000 } });
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page, 10);
  await key(page, 'Deal').click();
  await key(page, 'Hit').click({ timeout: 15_000 });
  await key(page, 'Stay').click({ timeout: 15_000 });
  const deal = key(page, 'Deal').locator('.bar i');
  await expect(deal).toHaveCount(1, { timeout: 30_000 }); // the rebet is on the table and a deal is armed
  const progress = () => deal.evaluate((el) => { const a = el.getAnimations()[0]; return a.currentTime / a.effect.getTiming().duration; });
  const first = await progress();
  await expect.poll(progress).toBeGreaterThan(first); // it is filling
  const bars = await page.evaluate(() => window.__bars);
  expect(bars.find((b) => b.label === 'Deal')?.ms, 'the Deal bar is the whole 8 s wait').toBeGreaterThanOrEqual(8000);
  expect(bars.find((b) => b.label.startsWith('Next hand'))?.ms, 'Next hand had a bar for its own, shorter wait').toBeGreaterThan(0);
  await expect(key(page, 'Deal')).toHaveAccessibleName('Deal');
  await key(page, 'Pause auto deal').click(); // paused: no bar
  await expect(deal).toHaveCount(0);
  expect(api.bets.length, 'only round 1 reached the ledger').toBe(1);
});

test('reduced motion: the countdown bar is not shown, and the Pause key still says auto deal is on (L2-4)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubApi(page, { settings: { ...FAST, resetInitialBet: true, autoDeal: true, autoDealDelay: 10_000 } });
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page, 10);
  await key(page, 'Deal').click();
  await key(page, 'Hit').click({ timeout: 15_000 });
  await key(page, 'Stay').click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^Bet spot 1, .10/ })).toBeVisible({ timeout: 30_000 });
  await expect(key(page, 'Pause auto deal')).toBeVisible();
  const bar = key(page, 'Deal').locator('.bar');
  await expect(bar).toHaveCount(1);
  await expect(bar).toHaveCSS('display', 'none');
});

test('Home has no felt hero: the wordmark, the actions and room (L2-5)', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await expect(page.getByText('Please log in to start playing.')).toBeVisible();
  await expect(page.locator('.hero, main.page img')).toHaveCount(0);
  const wordmark = await page.locator('main.page.home .wm').boundingBox();
  expect(wordmark.height).toBeGreaterThanOrEqual(56); // larger than the other screens' 40
  const viewport = page.viewportSize();
  expect(Math.abs(wordmark.x + wordmark.width / 2 - viewport.width / 2), 'centred').toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const name of ['Log in', 'Create an account', 'Rules']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});

test('Settings: the "i" mark is 14 px with a 44 px tap area, and the explainer under the preset is Blake\'s wording (L2-6, L2-7)', async ({ page }) => {
  await stubApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Gameplay/ }).click();
  const mark = page.locator('.hint-i:visible').first();
  const box = await mark.boundingBox();
  expect([box.width, box.height]).toEqual([14, 14]);
  const area = await mark.evaluate((el) => { const s = getComputedStyle(el, '::before'); return [parseFloat(s.width), parseFloat(s.height)]; });
  expect(area).toEqual([44, 44]);
  expect(await mark.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12); // the glyph stays readable
  await page.getByRole('button', { name: /^Table rules/ }).click();
  await expect(page.getByText('House edge is an estimated house edge over the player who uses basic strategy and declines insurance. Figure is approximate. A plus sign means a worse deal for you, as the house would gain advantage. Insurance, House variations and Advanced options are not counted.', { exact: true })).toBeVisible();
});

// L2-8: the dealer's hand and the first seat sit closer on a wide screen, the print and message block still centred between them; phones and tablets are as they were.
const DESKTOPS = [[1440, 900], [1920, 1080], [1024, 768], [1280, 720]];
for (const [width, height] of DESKTOPS) {
  test(`PC ${width}x${height}: hands sit closer, the print and message centred between them, nothing overlaps (L2-8)`, async ({ page }) => {
    test.skip(!wide(page), 'a wide-screen layout rule');
    await page.setViewportSize({ width, height });
    await stubApi(page);
    await seedRandom(page, 183);
    await login(page);
    await placeBet(page);
    await key(page, 'Deal').click();
    await expect(key(page, 'Hit')).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });
    await expect(page.locator('.flight-layer > *')).toHaveCount(0);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const dealer = r('.dealer-hand'), seat = r('.seat'), print = r('.print'), mid = r('.mid');
      const cs = getComputedStyle(document.querySelector('.stage-in'));
      return { gap: seat.top - dealer.bottom, above: print.top - dealer.bottom, below: seat.top - mid.bottom, overlap: dealer.bottom > print.top || mid.bottom > seat.top, padTop: parseFloat(cs.paddingTop) };
    });
    expect(m.overlap).toBe(false);
    expect(Math.abs(m.above - m.below), 'the block is centred between the hands').toBeLessThanOrEqual(12);
    // Closer: the print and the message sit within 70 px of each hand (before: 155 and 161 px at 1920x1080, 65 and 71 at 1440x900).
    expect(m.above).toBeLessThanOrEqual(70);
    expect(m.below).toBeLessThanOrEqual(70);
    if (height >= 1000) expect(m.padTop, 'a tall window pushes the hands inward from both ends').toBeGreaterThan(60);
    if (height <= 720) expect(m.padTop, 'a short one has nothing to give').toBeLessThanOrEqual(30);
  });
}

test('a phone keeps its layout: the table pads its top and bottom as before (L2-8)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubApi(page);
  await login(page);
  const pad = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.stage-in')); return [parseFloat(cs.paddingTop), parseFloat(cs.paddingBottom)]; });
  expect(pad[0]).toBeLessThanOrEqual(20);
  expect(pad[1]).toBeLessThanOrEqual(8);
});

// Declines any offer and stays on every hand until the results show (the second round of a seed is not known).
const playOut = (page) => expect.poll(async () => {
  if (await key(page, 'Next hand').isVisible()) return 'done';
  for (const button of [page.getByRole('group', { name: 'Offers' }).getByRole('button', { name: 'No thanks' }), key(page, 'Stay')]) {
    if (!(await button.isVisible())) continue;
    // a key can vanish between the check and the read (the play face gives way to the results), so nothing here waits for it: a short timeout and a catch
    const dimmed = await button.getAttribute('aria-disabled', { timeout: 1000 }).catch(() => 'true');
    if (dimmed !== 'true') await button.click({ timeout: 2000 }).catch(() => {});
  }
  return 'playing';
}, { timeout: 40_000, intervals: [200] }).toBe('done');

test('the discard pile: the swept cards land exactly on its top card, which never moves, never blinks, and only grows (L2-10)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  for (let round = 1; round <= 2; round++) {
    await placeBet(page);
    await key(page, 'Deal').click();
    await playOut(page);
    await expect(page.locator('.flight-layer > *')).toHaveCount(0);
    await page.evaluate(() => {
      window.__pile = [];
      window.__pileDone = false;
      const t0 = performance.now();
      let seen = false, after = 0; // it logs until the copies have come and gone and the pile has had 30 frames on its own (10 s at most: a slow runner)
      const centre = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; };
      const tick = () => {
        const d = document.querySelector('.discard'), card = d.querySelector('.discard-card'), copies = [...document.querySelectorAll('.fly-copy.sweep')];
        window.__pile.push({ pile: centre(card), lv: Number(d.dataset.lv), empty: d.classList.contains('empty'), opacity: Number(getComputedStyle(card).opacity), copies: copies.length, last: copies.length ? centre(copies.at(-1)) : null });
        if (copies.length) seen = true;
        if (seen && !copies.length) after++;
        if (after < 30 && performance.now() - t0 < 10_000) requestAnimationFrame(tick); else window.__pileDone = true;
      };
      requestAnimationFrame(tick);
    });
    await key(page, 'Next hand').click();
    await expect.poll(() => page.evaluate(() => window.__pileDone), { timeout: 15_000 }).toBe(true);
    const frames = await page.evaluate(() => window.__pile);
    const first = frames[0].pile;
    expect(frames.every((f) => f.pile.join() === first.join()), 'the pile\'s top card never moves').toBe(true);
    const landed = frames.filter((f) => f.last && f.last.join() === f.pile.join());
    expect(landed.length, 'the last copy lands exactly on the pile\'s top card').toBeGreaterThan(0);
    const lastCopy = frames.map((f) => f.copies > 0).lastIndexOf(true);
    // From the moment the copies are on the pile until the last one goes, the pile is there at full strength under them: no frame without it, no fade in.
    for (const f of frames.slice(frames.findIndex((x) => x.last && x.last.join() === x.pile.join()))) {
      if (f.opacity < 1) expect(f.empty, 'a pile that is dimmed is an empty one').toBe(true);
    }
    const after = frames.slice(lastCopy + 1);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((f) => f.opacity === 1 && !f.empty), 'after the copies go the pile is solid').toBe(true);
    const levels = frames.map((f) => f.lv);
    expect(levels, 'the pile only grows').toEqual([...levels].sort((a, b) => a - b));
    await expect(page.locator('.rack-wrap:not(.off)')).toBeVisible({ timeout: 20_000 });
  }
});

test('the opening shuffle is not played again by a trip to Settings and back before the first hand (L2-11)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__riffles = 0;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && n.classList.contains('riffle')) window.__riffles++;
    }).observe(document, { subtree: true, childList: true });
  });
  await stubApi(page, { settings: { ...VEGAS, playTimeout: 1000 } }); // a 4.5 s shuffle: a replay could not be missed
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await submitLogin(page);
  await (await settingsLoaded).finished();
  await expect.poll(() => page.evaluate(() => window.__riffles), { timeout: 10_000 }).toBe(1); // it plays once ...
  await page.locator('.felt').dispatchEvent('click'); // ... and is skipped
  await expect(page.locator('.rack-wrap:not(.off)')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.locator('.rack-wrap:not(.off)')).toBeVisible(); // awake at once, not shuffling
  await expect(page.locator('.riffle')).toHaveCount(0);
  expect(await page.evaluate(() => window.__riffles)).toBe(1);
  await placeBet(page); // and the table takes a bet at once
  await expect(page.getByRole('button', { name: /^Bet spot 1, \$10/ })).toBeVisible();
});

test('a reload asks "Leave site?" while a hand is in play, and not between rounds (L2-12)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  const asks = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  expect(await asks(), 'before the deal').toBe(false);
  await placeBet(page);
  expect(await asks(), 'a bet on the felt is not a hand').toBe(false);
  await key(page, 'Deal').click();
  expect(await asks(), 'dealing').toBe(true);
  await key(page, 'Hit').click({ timeout: 15_000 });
  expect(await asks(), 'on the turn').toBe(true);
  await key(page, 'Stay').click({ timeout: 15_000 });
  await expect(key(page, 'Next hand')).toBeVisible({ timeout: 30_000 });
  expect(await asks(), 'settled: between rounds').toBe(false);
});
