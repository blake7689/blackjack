import { test, expect, stubApi, seedRandom, submitLogin, login, VEGAS, placeBet } from './fixtures';
import { expectNoSeriousA11y } from './a11y';
import { gameReducer, initialGameState } from '../src/utils/gameReducer';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('the tab is titled Blakejack and <html> carries the default theme (#79)', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await expect(page).toHaveTitle('Blakejack');
  await expect(page.getByRole('heading', { level: 1, name: 'Blakejack' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-felt', 'green');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'emerald');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
});

test('cold-start sign-in waits out a slow API (#75)', async ({ page }) => {
  const api = await stubApi(page, { loginDelayMs: 15_000, meDelayMs: 11_000 }); // both past the old 10 s limit
  await submitLogin(page);
  await expect(page.getByText(/waking up/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible({ timeout: 35_000 }); // a signed-in player lands on the table
  expect(api.failed).toEqual([]); // no request was aborted early
});

test('cold-start session restore waits out a slow API (#75)', async ({ page }) => {
  const api = await stubApi(page, { meDelayMs: 11_000 });
  await page.addInitScript(() => sessionStorage.setItem('bj.token', 'e2e-token'));
  await page.goto('/');
  await expect(page.getByText('Shuffling up...')).toBeVisible(); // Loading while the session restores, not Home
  await expect(page.getByText('Please log in to start playing.')).toHaveCount(0);
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('#bal')).toHaveText('$1,000');
  expect(api.failed).toEqual([]);
});

// Seed 183 (mulberry32), the Vegas table of the fixture (US peek, 6 decks, dealer hits soft 17). Before the deal the page uses 4 random numbers (router keys),
// the settings load builds one shoe and the start of the game (right after it, since #81) a second one; the deal draws from that. The shuffle consumes Math.random in proportion to the shoe
// size, so a change of the fixture's deck count means a new seed. To re-pick: replay those steps over createShoe (src/utils/cards.js) and keep a round whose
// cards are all different, with no pair, no blackjack, no ace or ten up, a Hit that neither busts nor makes 21, and a dealer that has to draw.
//   player king of diamonds + 4 of clubs = 14, dealer 6 of clubs up + jack of hearts in the hole (16, no blackjack).
//   Hit draws the 5 of hearts (19); Stay; the dealer flips the hole card and draws the 3 of diamonds (19: a push).
// If the app's use of Math.random changes, these card assertions fail first and the seed needs re-picking.
test('the keys wait while cards move through a whole round (#72)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(await noHScroll(), 'the game board must not scroll sideways').toBe(true); // matters at phone size (the phone project)

  // Count frames where the buttons are visible while a card is still moving; also record that both states were seen.
  await page.evaluate(() => {
    const w = (window.__watch = { violations: 0, sawHidden: false, hiddenToVisible: false, motionFrames: 0, focused: document.hasFocus() });
    const sample = () => {
      const wrap = document.querySelector('.options-wrap');
      const layer = document.querySelector('.flight-layer');
      const moving = (layer?.children.length ?? 0) > 0
        || document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.closest?.('.flight-layer, .fly-inner'));
      if (moving) w.motionFrames++;
      if (!wrap) return;
      // the dock keeps its keys on show and dims the ones that cannot act (aria-disabled); one that can act while a card moves is a violation
      const live = Array.from(wrap.querySelectorAll('button')).some((b) => b.getAttribute('aria-disabled') !== 'true') && getComputedStyle(wrap).pointerEvents !== 'none';
      if (!live) w.sawHidden = true;
      else if (w.sawHidden) w.hiddenToVisible = true;
      if (live && moving) w.violations++;
    };
    new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, attributes: true });
    const frame = () => { sample(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });

  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('img', { name: 'king of diamonds' })).toBeVisible();
  await expect(page.getByRole('img', { name: '4 of clubs' })).toBeVisible();
  await expect(page.getByRole('img', { name: '6 of clubs' })).toBeVisible();
  await page.getByRole('button', { name: 'Hit' }).click({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: '5 of hearts' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay' }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'jack of hearts' })).toBeVisible(); // the hole card was flipped
  await page.getByRole('button', { name: 'Next hand' }).click();
  await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();

  const watch = await page.evaluate(() => window.__watch);
  expect(watch.focused, 'the page must have focus for realistic animation timing').toBe(true);
  expect(watch.violations, 'frames with a live key while a card moved').toBe(0);
  expect(watch.sawHidden && watch.hiddenToVisible, 'watcher saw the keys go dimmed then live').toBe(true);
  expect(watch.motionFrames, 'watcher saw cards moving').toBeGreaterThan(0);

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toEqual([{ amount: 10, newRound: true, requestId: expect.stringMatching(V4) }]);
  expect(api.settles).toEqual([{ payout: expect.any(Number), requestId: expect.stringMatching(V4) }]);
  expect(api.bets[0].requestId).not.toBe(api.settles[0].requestId);
});

// The same seed-183 deal (14 against a 6, jack in the hole, Vegas peek): Surrender gives half the bet back in one settle, and the dealer draws nothing.
test('surrendering a hand returns half the bet, in one settle (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('img', { name: 'king of diamonds' })).toBeVisible();
  await expect(page.getByRole('img', { name: '6 of clubs' })).toBeVisible();

  await page.getByRole('button', { name: 'Surrender' }).click({ timeout: 15_000 });
  await expect(page.getByText('SURRENDER', { exact: true })).toBeVisible({ timeout: 30_000 }); // the verdict, once the round settles (#83)
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'jack of hearts' })).toBeVisible(); // the hole card is shown
  await expect(page.getByRole('img', { name: '3 of diamonds' })).toHaveCount(0); // the dealer did not play on (16)
  await expect(page.getByRole('button', { name: 'Surrender' })).toHaveCount(0); // the results dock has no Surrender key

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toEqual([{ amount: 10, newRound: true, requestId: expect.stringMatching(V4) }]);
  expect(api.settles).toEqual([{ payout: 5, requestId: expect.stringMatching(V4) }]);
});

// Offers (#91). Seeds picked by script like seed 183 (same steps: 4 router keys, then the settings-load shoe and the game-start shoe, Vegas 6 decks), keeping the
// first four cards of the second shoe: player, dealer up, player, hole. Seed 183 is left alone.
//   Seed 207: 10 of clubs + 6 of diamonds (16) against an ace of diamonds, king of spades in the hole (a dealer blackjack; no other king or spade on the table).
//   Seed 65:  3 of diamonds + jack of spades (13) against an ace of clubs, 7 of clubs in the hole (soft 18: no blackjack, the dealer stands).
// If the app's use of Math.random changes, the card assertions fail first and the seeds need re-picking.
async function dealAt(page, seed, settings) {
  const api = await stubApi(page, settings ? { settings } : {});
  await seedRandom(page, seed);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  return api;
}

test('insurance against an ace: half the bet is a separate ledger bet, the hole card stays hidden until the peek, and a dealer blackjack pays it in the one settle (#91)', async ({ page }) => {
  const api = await dealAt(page, 207);
  await expect(page.getByRole('img', { name: '10 of clubs' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'ace of diamonds' })).toBeVisible();

  const offers = page.getByRole('group', { name: 'Offers' });
  await expect(offers.getByRole('button', { name: 'Insurance $5' })).toBeVisible({ timeout: 15_000 }); // dimmed while the cards fly
  await expect(offers.getByRole('button', { name: 'No thanks' })).toBeVisible();
  await expect(page.getByText('Insurance?')).toBeVisible();
  expect(await page.content(), 'the hole card is dealt but must not be in the page').not.toMatch(/king/i);
  expect(api.bets).toHaveLength(1); // only the opening bet so far

  await offers.getByRole('button', { name: 'Insurance $5' }).click();
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'king of spades' })).toBeVisible(); // the peek turned the hole card over
  await expect(page.getByText('Insurance pays $15')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Offers' })).toHaveCount(0);

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toEqual([
    { amount: 10, newRound: true, requestId: expect.stringMatching(V4) },
    { amount: 5, newRound: false, requestId: expect.stringMatching(V4) }, // an ordinary bet: no extra field for the API
  ]);
  expect(api.bets[1].requestId).not.toBe(api.bets[0].requestId);
  expect(api.settles).toEqual([{ payout: 15, requestId: expect.stringMatching(V4) }]); // the lost hand pays nothing; the insurance pays 2:1 and its stake back
  expect(api.failed).toEqual([]);
});

test('"No thanks" at the offers: no insurance bet, the dealer checks, the hole card stays hidden and play goes on (#91)', async ({ page }) => {
  const api = await dealAt(page, 65);
  await expect(page.getByRole('img', { name: 'ace of clubs' })).toBeVisible();
  const offers = page.getByRole('group', { name: 'Offers' });
  await expect(offers.getByRole('button', { name: 'Insurance $5' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('img', { name: '7 of clubs' })).toHaveCount(0);

  await offers.getByRole('button', { name: 'No thanks' }).click();
  await expect(page.getByRole('button', { name: 'Stay' })).toBeEnabled({ timeout: 15_000 }); // the peek found nothing: the player's turn
  await expect(page.getByRole('img', { name: '7 of clubs' })).toHaveCount(0); // the hole card is still face down
  await expect(page.getByRole('group', { name: 'Offers' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: '7 of clubs' })).toBeVisible();

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toEqual([{ amount: 10, newRound: true, requestId: expect.stringMatching(V4) }]);
  expect(api.settles).toEqual([{ payout: 0, requestId: expect.stringMatching(V4) }]); // 13 against a soft 18
});

test('early surrender is offered before the peek: the half bet is kept although the dealer has blackjack, and it is not offered again (#91)', async ({ page }) => {
  const api = await dealAt(page, 207, { ...VEGAS, surrender: 'early', playTimeout: 250 });
  const offers = page.getByRole('group', { name: 'Offers' });
  await expect(offers.getByRole('button', { name: 'Surrender' })).toBeVisible({ timeout: 15_000 });
  await expect(offers.getByRole('button', { name: 'Insurance $5' })).toBeVisible();
  await expect(page.getByText('Insurance?')).toBeVisible(); // one question per offer, insurance first

  await offers.getByRole('button', { name: 'Surrender' }).click();
  await expect(offers.getByRole('button', { name: 'Surrender' })).toHaveCount(0); // each offer closes by itself
  await offers.getByRole('button', { name: 'No thanks' }).click();
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: 'king of spades' })).toBeVisible(); // the dealer did have blackjack
  await expect(page.getByText('SURRENDER', { exact: true })).toBeVisible(); // the verdict (#83)
  await expect(page.getByRole('button', { name: 'Surrender' })).toHaveCount(0); // the results dock has no Surrender key

  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toEqual([{ amount: 10, newRound: true, requestId: expect.stringMatching(V4) }]);
  expect(api.settles).toEqual([{ payout: 5, requestId: expect.stringMatching(V4) }]);
});

// #196: the game-flow fixes, in a real browser (history, the retry timer, a held request, the 48 px line).
// A notice on the message line: all of it inside the line's box and the screen, nothing cut off.
const lineFits = (page) => page.locator('.msg .notice').evaluate((el) => {
  const line = el.closest('.msg');
  const [box, text] = [line.getBoundingClientRect(), el.getBoundingClientRect()];
  return {
    cutTop: Math.max(0, Math.round(box.top - text.top)), cutBottom: Math.max(0, Math.round(text.bottom - box.bottom)),
    cutSide: line.scrollWidth > line.clientWidth || text.left < 0 || text.right > document.documentElement.clientWidth,
    pageScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
const FITS = { cutTop: 0, cutBottom: 0, cutSide: false, pageScrolls: false };
async function expectNoticeFitsSmallScreens(page) {
  const own = page.viewportSize();
  expect(await lineFits(page), `${own.width}x${own.height}`).toEqual(FITS);
  for (const size of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => lineFits(page), { message: `${size.width}x${size.height}` }).toEqual(FITS);
  }
  await page.setViewportSize(own);
}

test('browser Back to Home, then Play, keeps the live round and its stake (#196)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hit' })).toBeEnabled({ timeout: 15_000 });

  // After a fresh sign-in the first Back is /login, which sends a signed-in player on to the table; the second is Home. Neither asks "Leave game?".
  await page.goBack();
  await expect(page).toHaveURL(/\/game$/);
  await expect(page.getByRole('button', { name: 'Hit' })).toBeVisible();
  await page.goBack();
  const play = page.getByRole('link', { name: 'Play', exact: true });
  await expect(play).toBeVisible();
  await play.click();

  await expect(page).toHaveURL(/\/game$/);
  for (const card of ['king of diamonds', '4 of clubs', '6 of clubs']) await expect(page.getByRole('img', { name: card })).toBeVisible();
  await expect(page.locator('#bal')).toHaveText('$990');
  await page.getByRole('button', { name: 'Stay' }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => api.settles.length).toBe(1);
  expect(api.bets).toHaveLength(1);
});

// The first load fails; the table opens on the defaults. The shuffle is skipped once the table is there.
async function openUnloadedTable(page) {
  await submitLogin(page);
  await expect(page.locator('.felt')).toBeVisible();
  await page.locator('.felt').dispatchEvent('click');
  await expect(page.locator('.rack-wrap:not(.off)')).toBeVisible({ timeout: 15_000 });
}
const UNLOADED = 'Saved settings not loaded. Rules may differ. Retrying...';
const settingsGets = (api) => api.requests.filter((r) => r.endpoint === 'GET /player/me/settings').length;

test('a settings load that fails once: the table says so, retries, and applies the saved table (#196)', async ({ page }) => {
  let release;
  const api = await stubApi(page, { settingsFailures: 1, settingsGate: new Promise((resolve) => { release = resolve; }), settings: { ...VEGAS, blackjackPayout: '6:5', playTimeout: 250 } });
  await openUnloadedTable(page);
  const line = page.locator('.msg');
  await expect(line).toHaveText(UNLOADED);
  await expect(line).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await expect(page.locator('.felt')).toContainText(/blackjack pays 3 to 2/i);
  await expect.poll(() => settingsGets(api)).toBeGreaterThan(1); // the retry went out by itself; its answer is held
  await expectNoSeriousA11y(page, 'table with the settings-not-loaded notice');
  await expectNoticeFitsSmallScreens(page);

  release();
  await expect(line).toHaveText('Place your bets', { timeout: 20_000 }); // the saved settings say every message shows
  await expect(page.locator('.felt')).toContainText(/blackjack pays 6 to 5/i);
});

test('saved settings that arrive mid-round wait for the next hand (#196)', async ({ page }) => {
  let release;
  const api = await stubApi(page, { settingsFailures: 1, settingsGate: new Promise((resolve) => { release = resolve; }), settings: { ...VEGAS, blackjackPayout: '6:5', playTimeout: 250 } });
  await seedRandom(page, 183);
  await openUnloadedTable(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  const stay = page.getByRole('button', { name: 'Stay' });
  await expect(stay).toBeEnabled({ timeout: 15_000 });
  await expect.poll(() => settingsGets(api)).toBeGreaterThan(1);
  const answered = page.waitForResponse((r) => r.url().endsWith('/player/me/settings') && r.ok());
  release();
  await (await answered).finished();
  await expect(page.locator('.msg')).toHaveText(UNLOADED); // held: the round keeps its rules
  await expect(page.locator('.felt')).toContainText(/blackjack pays 3 to 2/i);

  await stay.click();
  await expect(page.locator('.msg .verdict')).toBeVisible({ timeout: 30_000 }); // never hidden by the notice
  await expect(page.locator('.felt')).toContainText(/blackjack pays 3 to 2/i);
  await page.getByRole('button', { name: 'Next hand' }).click();
  await expect(page.locator('.msg')).toHaveText('Place your bets', { timeout: 15_000 });
  await expect(page.locator('.felt')).toContainText(/blackjack pays 6 to 5/i);
});

test('a payout the server refuses is said in place of the verdict until the next deal; the dock says Not paid and the +$ badge goes at once (#196, #207)', async ({ page }) => {
  let release;
  const api = await stubApi(page, { settleRefusal: { status: 400, message: 'The payout is over the cap.', gate: new Promise((resolve) => { release = resolve; }) } });
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await page.getByRole('button', { name: 'Surrender' }).click({ timeout: 15_000 });

  const badge = page.locator('.bal .delta');
  const summary = page.locator('.summary .s-l');
  await expect(badge).toHaveText('+$5', { timeout: 30_000 }); // the settle is on its way, its answer held
  await expect(summary).toHaveText('You lost-$5');
  release();
  // Well inside the badge's own 3 s life, so only the refusal can have removed it.
  await expect(badge).toHaveCount(0, { timeout: 1500 });

  const line = page.locator('.msg');
  const notice = 'The server refused your $5 payout; it was not paid.';
  await expect(line).toHaveText(notice);
  await expect(summary).toHaveText('Payout refusedNot paid');
  await expect(summary.locator('b')).not.toHaveClass(/up|down/);
  await expect(line).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await expect(line.locator('.verdict')).toHaveCount(0);
  await expect(page.locator('#bal')).toHaveText('$990'); // the server's balance
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeEnabled();
  await expectNoSeriousA11y(page, 'results with the refused-payout notice');
  await expectNoticeFitsSmallScreens(page);

  await page.getByRole('button', { name: 'Next hand' }).click();
  await expect(page.locator('.rack-wrap:not(.off)')).toBeVisible({ timeout: 15_000 });
  await expect(line).toHaveText(notice); // still there between rounds
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(line).not.toContainText('refused');
  expect(api.settles).toHaveLength(1);
});

// Every notice that carries an amount, worded by the reducer itself, with the longest amount (#207). A real refused payout puts a notice on the line;
// each wording then takes its place there, so the real CSS lays it out.
function amountNotices() {
  const big = 1234567.5;
  const reduce = (state, action) => gameReducer({ ...initialGameState, ...state }, action);
  const payout = reduce({}, { type: 'BET_REJECTED', payout: big });
  const broke = {
    type: 'END_ROUND', credits: 0, state: { initialBet: big, settings: { ...initialGameState.settings, resetInitialBet: true, autoDeal: true } },
  };
  const stake = (extra) => reduce({ pendingBets: [{ seq: 1, handTag: 1, amount: big, ...extra }], hands: [{ tag: 1, bet: big }] }, { type: 'BET_REJECTED', seq: 1 }).notice;
  return [
    payout.payoutNotice,
    reduce(broke.state, broke).notice,
    reduce({ ...broke.state, payoutNotice: payout.payoutNotice, refusedPayout: big }, broke).notice,
    reduce({ payoutNotice: payout.payoutNotice, refusedPayout: big, pendingBets: [{ seq: 1, newRound: true }] }, { type: 'BET_REJECTED', seq: 1 }).notice,
    stake({}),
    stake({ side: 'insurance' }),
  ];
}

test('every notice with a long amount fits the message line on the smallest screens (#207)', async ({ page }) => {
  const notices = amountNotices();
  expect(new Set(notices).size).toBe(6);
  for (const text of notices) expect(text).toContain('1,234,567.50');
  await stubApi(page, { settleRefusal: { status: 400, message: 'The payout is over the cap.' } });
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await page.getByRole('button', { name: 'Surrender' }).click({ timeout: 15_000 });
  const line = page.locator('.msg .notice');
  await expect(line).toContainText('refused', { timeout: 30_000 });

  for (const size of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(size);
    for (const text of notices) {
      await line.evaluate((el, words) => { el.textContent = words; }, text);
      await expect.poll(() => lineFits(page), { message: `${size.width}x${size.height}: ${text}` }).toEqual(FITS);
    }
  }
});

test('a refusal that arrives a round late never replaces the new round\'s verdict (#196)', async ({ page }) => {
  let release;
  const api = await stubApi(page, { settleRefusal: { status: 400, message: 'The payout is over the cap.', once: true, gate: new Promise((resolve) => { release = resolve; }) } });
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await page.getByRole('button', { name: 'Surrender' }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Next hand' }).click({ timeout: 30_000 }); // round 1's settle is still unanswered
  await expect(page.locator('.rack-wrap:not(.off)')).toBeVisible({ timeout: 15_000 });
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  const stay = page.getByRole('button', { name: 'Stay' });
  await expect(stay).toBeEnabled({ timeout: 15_000 });

  release();
  const line = page.locator('.msg');
  const notice = 'The server refused your $5 payout; it was not paid.';
  await expect(line).toHaveText(notice);
  await stay.click();
  await expect(line.locator('.verdict')).toBeVisible({ timeout: 30_000 });
  await expect(line.locator('.sr-only')).toHaveText(/^Hand 1: .+ Dealer: .+\.$/);
  await expect(line).not.toContainText('refused');
  await page.getByRole('button', { name: 'Next hand' }).click();
  await expect(line).toHaveText(notice, { timeout: 15_000 }); // back at the betting step
  await expect.poll(() => api.settles.length).toBe(2);
});
