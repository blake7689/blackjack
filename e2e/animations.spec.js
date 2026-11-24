import { test, expect, stubApi, seedRandom, login, submitLogin, placeBet, VEGAS } from './fixtures';

// What only a browser shows of the animations (#83): the peek's mirror check on the path with no offer, the shuffle's skip, reduced motion, and a settled round's
// chips and badge. The deliberate delays are the app's own (Rate of Play 500 makes the check 0.65 s and the shuffle 2.2 s); nothing here sleeps.
// Seeds are the ones of smoke.spec.js: 207 is a 16 against an ace of diamonds with the king of spades in the hole (a dealer blackjack), 65 is a 13 against an
// ace of clubs with the 7 of clubs in the hole (soft 18), 183 is a 14 against a 6 whose hit makes 19 and a dealer who draws to 19 (a push).
// With insurance off and surrender none the ace up offers nothing, so the peek happens inside the deal (a display hold after the cards land, no extra step).
const NO_OFFER = { ...VEGAS, insurance: false, surrender: 'none', playTimeout: 500 };

// Samples on every frame, every 4 ms and on every DOM change, so a slow runner that paints few frames (WebKit on CI, #180) still sees the 0.2 s hold and the 0.5 s
// "No blackjack": while the line says the dealer checks, how much of the hole card is in view (against the felt's top edge), how far it tucked under,
// whether any face reached the dealer's hand (the hole card is the king of spades in the seed-207 round), and whether "No blackjack" was ever shown.
async function watchPeek(page) {
  await page.evaluate(() => {
    const w = (window.__peek = { checking: 0, minShown: 1, tucked: 0, leaks: 0, sawClear: false });
    let rest = null; // the hole card's top against the felt's top while nothing animates it
    const sample = () => {
      const h = document.querySelector('.dealer-hand [data-fk="hole"] .card'), f = document.querySelector('.felt');
      if (h && f && !h.getAnimations().length) rest = h.getBoundingClientRect().top - f.getBoundingClientRect().top;
      const line = document.querySelector('.msg')?.textContent ?? '';
      if (line.includes('No blackjack')) w.sawClear = true;
      if (line.includes('Dealer checks for blackjack')) {
        w.checking++;
        const hole = document.querySelector('.dealer-hand [data-fk="hole"] .card');
        const felt = document.querySelector('.felt');
        if (hole && felt) {
          const r = hole.getBoundingClientRect();
          const above = Math.max(0, felt.getBoundingClientRect().top - r.top);
          w.minShown = Math.min(w.minShown, 1 - above / r.height);
          w.tucked = Math.max(w.tucked, above);
          // A runner that paints no frame during the 0.2 s hold never shows the hole card tucked, so the slide's own target counts too: where the running
          // translate animation takes the card, against the felt edge (the card's rest position is where it sat before any animation ran).
          const slide = hole.getAnimations().map((a) => a.effect.getKeyframes()[1]?.translate).find((t) => /[1-9]/.test(t ?? ''));
          if (slide && rest !== null) {
            const target = Number(slide.match(/-?\d+(\.\d+)?/g).at(-1));
            w.tucked = Math.max(w.tucked, -(rest + target));
            w.minShown = Math.min(w.minShown, 1 - Math.max(0, -(rest + target)) / r.height);
          }
        }
        if (document.querySelector('.dealer-hand img[alt*="king"]')) w.leaks++;
      }
    };
    const frame = () => { sample(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    setInterval(sample, 4);
    new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}
const readPeek = (page) => page.evaluate(() => window.__peek);

async function dealNoOffer(page, seed) {
  const api = await stubApi(page, { settings: NO_OFFER });
  await seedRandom(page, seed);
  await login(page);
  await placeBet(page);
  await watchPeek(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  return api;
}

test('the peek with no offer: the hole card tucks under the felt and back with 85 % in view, its face never in the page, then the dealer\'s blackjack flips it (#83)', async ({ page }) => {
  const api = await dealNoOffer(page, 207);
  await expect(page.getByRole('img', { name: 'ace of diamonds' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Offers' })).toHaveCount(0); // nothing is offered
  await expect(page.getByRole('img', { name: 'king of spades' })).toBeVisible({ timeout: 20_000 }); // the check is over and the hole card turned
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  const peek = await readPeek(page);
  expect(peek.checking, 'the check was on show').toBeGreaterThan(0);
  expect(peek.tucked, 'the hole card went up under the felt edge').toBeGreaterThan(0);
  expect(peek.minShown, 'at least 85 % of the hole card in view in every frame').toBeGreaterThanOrEqual(0.85);
  expect(peek.leaks, 'frames in which the hole card\'s face was in the page during the check').toBe(0);
  expect(peek.sawClear, 'a dealer blackjack never says "No blackjack"').toBe(false);
  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.settles).toEqual([{ payout: 0, requestId: expect.any(String) }]);
});

test('the peek with no offer and no blackjack: the same check, then "No blackjack", then your move (#83)', async ({ page }) => {
  await dealNoOffer(page, 65);
  await expect(page.getByRole('img', { name: 'ace of clubs' })).toBeVisible();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Hit', exact: true })).toBeEnabled({ timeout: 15_000 });
  const peek = await readPeek(page);
  expect(peek.checking).toBeGreaterThan(0);
  expect(peek.tucked).toBeGreaterThan(0);
  expect(peek.minShown).toBeGreaterThanOrEqual(0.85);
  expect(peek.sawClear, '"No blackjack" shows before play starts').toBe(true);
  await expect(page.getByRole('img', { name: '7 of clubs' })).toHaveCount(0); // the hole card is still a back
});

test('a tap on the table skips the shuffle: the board is ready within a second instead of 4.5 s (#83)', async ({ page }) => {
  await stubApi(page, { settings: { ...VEGAS, playTimeout: 1000 } });
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await submitLogin(page);
  await (await settingsLoaded).finished();
  const shuffling = page.locator('.rack-wrap.off'); // the dock waits (its rack is dimmed) while the shuffle plays; the Deal key still says Deal (L2-4)
  await expect(shuffling).toBeVisible();
  await page.getByRole('region', { name: 'Your seats' }).click({ position: { x: 4, y: 4 } });
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible({ timeout: 1500 }); // 4.5 s if it were played out
  await expect(shuffling).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Deal', exact: true })).toBeVisible();
});

test('reduced motion: no shuffle at all, and the board is ready at once (#83)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubApi(page, { settings: { ...VEGAS, playTimeout: 1000 } });
  await page.addInitScript(() => {
    window.__shuffle = { riffle: false, line: false };
    new MutationObserver(() => {
      if (document.querySelector('.riffle')) window.__shuffle.riffle = true;
      if (document.querySelector('.msg')?.textContent === 'Shuffling') window.__shuffle.line = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  const settingsLoaded = page.waitForResponse('**/player/me/settings');
  await submitLogin(page);
  await (await settingsLoaded).finished();
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible({ timeout: 3000 }); // a shuffle would take 4.5 s
  expect(await page.evaluate(() => window.__shuffle)).toEqual({ riffle: false, line: false });
});

test('a push: one verdict and no tag, the balance badge shows what moved, and no chip blinks out when its stack is replaced by the moving copy (#83)', async ({ page }) => {
  await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await expect(page.getByRole('banner').getByText('-$10', { exact: true })).toBeVisible(); // the bet moved the balance: shown at once, the figure then counts down
  await expect(page.locator('#bal')).toHaveText('$990');
  await page.evaluate(() => {
    const w = (window.__chips = { blinks: 0, lifted: 0 });
    let was = false;
    new MutationObserver(() => {
      const hidden = [...document.querySelectorAll('.spot .stack, .side-spot .stack')].some((s) => s.style.visibility === 'hidden');
      const copies = document.querySelectorAll('.flight-layer .ghost.lifted').length;
      if (copies) w.lifted++;
      if (hidden && !was && !copies) w.blinks++; // the real stack hides in the frame its copy appears, never before
      was = hidden;
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
  });
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await page.getByRole('button', { name: 'Hit' }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stay' }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('PUSH', { exact: true })).toHaveCount(1); // the verdict; one hand has no tag
  await expect(page.getByRole('banner').getByText('+$10', { exact: true })).toBeVisible(); // the stake came back
  await expect(page.locator('#bal')).toHaveText('$1,000');
  const chips = await page.evaluate(() => window.__chips);
  expect(chips.lifted, 'the stake was replaced by a moving copy').toBeGreaterThan(0);
  expect(chips.blinks, 'times a stack hid without its copy already on show').toBe(0);
});
