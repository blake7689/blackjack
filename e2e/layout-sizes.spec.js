import { test, expect, stubApi, seedRandom, login, placeBet, VEGAS } from './fixtures';

// Layout at eight sizes (#168). At each size: a round (bet, offers + insurance, your move, results, next hand), a split round and the six Settings
// sections. After every step the page is audited, and a violation fails the test with every offender listed:
//   - no sideways scroll; - nothing outside the viewport, cut by an overflow ancestor, or with its text cut in its own box;
//   - no overlap between table pieces (or between controls on Settings); - top bar and dock heights per DESIGN section 4; - tap targets >= 44 px high.
// Chromium project only (the sizes are set here, not by Playwright projects). Reduced motion keeps every step still when it is measured.
// Seeds: picked for the order of shoe builds before the deal (CLAUDE.md "E2E seeds"; how to re-pick is the comment at the bottom).
const SEEDS = { insurance: 18128, pair: 1522024, play: 1149 }; // 9 vs ace (insurance offered) / 8,8 vs 6 / 10,9 vs 6
const SIZES = [[320, 568], [375, 667], [414, 760], [844, 390], [412, 915], [768, 1024], [1024, 768], [1920, 1080]];
const SECTIONS = { rules: /^Table rules/, play: /^Gameplay/, chips: /^Chips/, look: /^Appearance/, sound: /^Sound/, account: /^Account/ };

// Known, accepted findings. Each is matched by its kind, its sizes and the text of the offender; keep this list minimal, one line of reason each.
// A waiver that matches nothing in a run is not an error (the finding may be fixed); delete it then.
const WAIVERS = [
  { name: 'rack-edge-chip', kind: 'clipped', match: /\.rack/, reason: 'the chip rack scrolls sideways and fades its edge chip with a mask, so one chip is cut by design' },
  { name: 'rack-scroller-box', kind: 'text', match: /rack-wrap/, reason: 'the same masked rack scroller: its content is a few px wider or taller than its box because it scrolls' },
  { name: 'hit-area-844x390', kind: 'overlap', sizes: ['844x390'], match: /icon-btn.* x div\.(discard|shoe)/, reason: 'the 44 px Menu / Settings hit areas stick 4 px out of the 40 px top bar over the empty shoe and discard boxes; nothing visible touches' },
];

// DESIGN section 4: top bar and dock heights per mode, and the two dock rows on a phone (rack / keys).
function expected(w, h) {
  if (h <= 520) return { mode: 'landscape phone', top: 40, dock: 64 };
  if (w >= 900) return h <= 740 ? { mode: 'desktop short', top: 46, dock: 84 } : { mode: 'desktop', top: 52, dock: 92 };
  if (h <= 740) return { mode: 'short phone', top: 44, dock: 126, rows: [52, 46] };
  return { mode: w >= 600 ? 'tablet (phone metrics)' : 'phone', top: 48, dock: 134, rows: [54, 50] };
}

// Runs in the page. kind 'table' (no page scroll: all four edges) or 'settings' (an inner scroller: horizontal only). Returns plain violation lists.
function auditInPage({ kind }) {
  const INT = 'button,a[href],input,select,textarea,[role=button],[role=radio],[role=switch],[role=checkbox],[role=tab],[role=option],[role=menuitem],[role=slider]';
  const PIECES = '.top,.bal,.count,.msg,.verdict,.pill,.spot,.side-spot,.dock,.rack-wrap,.shoe,.discard,.hand .card,.player-hand .card,.dealer-hand .card,.tag';
  const EXEMPT_CLIP = '.shoe,.discard,.cut-rest'; // meant to sit partly off the felt
  const SKIP = '.flight-layer,.riffle,.shuffle,[class*=shuffle]';
  const vis = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity > 0.01; };
  const desc = (e) => { const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 3).join('.') : ''; const t = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24); return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${cls ? '.' + cls : ''}${t ? ` "${t}"` : ''}`; };
  const R = (e) => { const r = e.getBoundingClientRect(); return JSON.stringify([Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]); };
  const root = document.documentElement;
  const out = { hscroll: root.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth ? `page ${root.scrollWidth}/${document.body.scrollWidth} wide in ${innerWidth}` : '', clipped: [], overlaps: [], taps: [], text: [], strict: [] };
  const all = [...new Set([...document.querySelectorAll(INT + ',' + PIECES + ',.print-hit,.print')])].filter((e) => vis(e) && !e.closest(SKIP) && !e.closest('[hidden]'));
  const tol = 1;
  // clipped: outside the viewport, or cut by an overflow ancestor
  for (const e of all) {
    if (e.matches(EXEMPT_CLIP)) continue;
    const r = e.getBoundingClientRect();
    const fixed = (() => { for (let p = e; p; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return true; return false; })();
    const inScroller = (() => { for (let p = e.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (/auto|scroll/.test(kind === 'settings' ? c.overflowX : c.overflowX + c.overflowY) && p.scrollWidth > p.clientWidth + 1) return true; } return false; })();
    if (!inScroller) {
      const bad = [];
      if (r.left < -tol) bad.push(`left ${Math.round(r.left)}`);
      if (r.right > innerWidth + tol) bad.push(`right ${Math.round(r.right)} > ${innerWidth}`);
      if (kind === 'table') { if (r.top < -tol) bad.push(`top ${Math.round(r.top)}`); if (r.bottom > innerHeight + tol) bad.push(`bottom ${Math.round(r.bottom)} > ${innerHeight}`); }
      if (bad.length) out.clipped.push(`${desc(e)} ${R(e)} outside viewport: ${bad.join(', ')}`);
    }
    if (fixed) continue;
    for (let p = e.parentElement; p && p !== root; p = p.parentElement) {
      const c = getComputedStyle(p); const cx = c.overflowX !== 'visible', cy = c.overflowY !== 'visible' && kind === 'table';
      if (!cx && !cy) continue;
      const pr = p.getBoundingClientRect();
      const ox = cx ? Math.max(0, Math.min(r.right, pr.right) - Math.max(r.left, pr.left)) / r.width : 1, oy = cy ? Math.max(0, Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top)) / r.height : 1;
      const frac = ox * oy;
      if (frac > 0 && frac < 1 - tol / Math.max(r.width, r.height)) { out.clipped.push(`${desc(e)} ${R(e)} cut by ${desc(p).split(' "')[0]} ${R(p)}: ${Math.round(frac * 100)}% visible`); break; }
    }
  }
  // text or content cut inside its own overflow:hidden box
  for (const e of all) { const c = getComputedStyle(e); if ((c.overflowX === 'hidden' || c.overflowY === 'hidden' || c.overflowX === 'clip') && !e.matches('.felt,.dock,.top,.stage-in,.main-area,.settings-screen')) { if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.text.push(`${desc(e)} ${R(e)} content ${e.scrollWidth}x${e.scrollHeight} in box ${e.clientWidth}x${e.clientHeight}`); } }
  // overlaps between things that must not overlap
  const ok = (a, b) => {
    if (a.contains(b) || b.contains(a)) return true;
    if (a.matches('.card') && b.matches('.card')) return true; // a fan
    if (a.matches('.print,.print-hit') || b.matches('.print,.print-hit')) return true; // cards, the message and the verdict lie over the felt print
    if (a.matches('.stack') || b.matches('.stack')) return true;
    if (kind === 'settings') { const fx = (e) => { for (let p = e; p; p = p.parentElement) { const s = getComputedStyle(p).position; if (s === 'fixed' || s === 'sticky') return true; } return false; }; if (fx(a) !== fx(b)) return true; }
    return false;
  };
  const subjects = kind === 'settings' ? all.filter((e) => e.matches(INT)) : all.filter((e) => !e.matches('.print,.print-hit'));
  const shown = new Set();
  for (let i = 0; i < subjects.length; i++) for (let j = i + 1; j < subjects.length; j++) {
    const a = subjects[i], b = subjects[j]; if (ok(a, b)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 1.5 && h > 1.5) { const k = desc(a) + '|' + desc(b); if (shown.has(k)) continue; shown.add(k); out.overlaps.push(`${desc(a)} ${R(a)} x ${desc(b)} ${R(b)} by ${Math.round(w * 10) / 10}x${Math.round(h * 10) / 10}`); }
  }
  // tap targets: height >= 44 (a checkbox or radio is its label row; the "i" counts its ::before)
  const tapSet = new Set([...document.querySelectorAll(INT + ',.hint-i')].filter((e) => vis(e) || e.matches('.hint-i')));
  for (const e of tapSet) {
    if (e.closest(SKIP) || e.closest('[hidden]')) continue;
    if (e.matches('input[type=checkbox],input[type=radio]') && e.closest('label') && !vis(e)) continue;
    const t = e.matches('input[type=checkbox],input[type=radio]') ? (e.closest('label') ?? e) : e;
    const r = t.getBoundingClientRect(); let h = r.height;
    if (e.matches('.hint-i')) h = Math.max(h, parseFloat(getComputedStyle(e, '::before').height) || 0);
    if (!(r.width > 0)) continue;
    if (h < 44 - 0.5) out.taps.push(`${desc(e)} ${Math.round(h * 10) / 10} px high (${Math.round(r.width)} wide)`);
  }
  // the overlap rule above tolerates 1.5 px; these two do not: a verdict (two lines for an insurance result) is 8 px clear of the first card (DESIGN section 4 "Middle"), and no total pill touches the shoe's box
  const verdict = document.querySelector('.msg .verdict'), cardTops = [...document.querySelectorAll('.seats .card')].filter(vis).map((e) => e.getBoundingClientRect().top);
  if (kind === 'table' && verdict && cardTops.length) { const gap = Math.min(...cardTops) - Math.max(verdict.getBoundingClientRect().bottom, document.querySelector('.msg').getBoundingClientRect().bottom); if (gap < 8) out.strict.push(`verdict ${Math.round(gap * 10) / 10} px above the first card (at least 8)`); }
  const shoe = document.querySelector('.shoe')?.getBoundingClientRect();
  if (kind === 'table' && shoe) for (const pill of document.querySelectorAll('.dealer-hand .pill')) { const p = pill.getBoundingClientRect(); const w = Math.min(shoe.right, p.right) - Math.max(shoe.left, p.left), h = Math.min(shoe.bottom, p.bottom) - Math.max(shoe.top, p.top); if (w > 0 && h > 0) out.strict.push(`${desc(pill)} overlaps the shoe box by ${Math.round(w * 10) / 10}x${Math.round(h * 10) / 10}`); }
  const q = (s) => { const e = document.querySelector(s); return e && vis(e) ? Math.round(e.getBoundingClientRect().height * 10) / 10 : null; };
  out.heights = { top: q('.top'), dock: q('.dock'), rows: [...document.querySelectorAll('.dock-row')].filter(vis).map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10) };
  return out;
}

const btn = (page, name) => page.getByRole('button', { name, exact: true });
const waived = (kind, size, text) => WAIVERS.some((w) => w.kind === kind && (!w.sizes || w.sizes.includes(size)) && w.match.test(text));

// Settles the page, audits it, and fails the test (softly, so every step is reported) with the offenders listed.
async function audit(page, size, step, kind = 'table') {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(2, 2); // no hover state on a key
  await expect(page.locator('.bal .delta')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.flight-layer > *')).toHaveCount(0, { timeout: 10_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const a = await page.evaluate(auditInPage, { kind });
  const [w, h] = size.split('x').map(Number);
  const ex = expected(w, h);
  const bad = [];
  if (a.hscroll) bad.push(['hscroll', a.hscroll]);
  for (const [k, list] of [['clipped', a.clipped], ['text', a.text], ['overlap', a.overlaps], ['tap', a.taps], ['strict', a.strict]]) for (const t of list) bad.push([k, t]);
  if (kind === 'table') {
    if (a.heights.top !== ex.top) bad.push(['height', `top bar ${a.heights.top} px (DESIGN ${ex.top}, ${ex.mode})`]);
    if (a.heights.dock !== ex.dock) bad.push(['height', `dock ${a.heights.dock} px (DESIGN ${ex.dock}, ${ex.mode})`]);
    if (ex.rows && a.heights.rows.length === 2 && !step.includes('offers') && a.heights.rows.join() !== ex.rows.join()) bad.push(['height', `dock rows ${a.heights.rows.join('/')} px (DESIGN ${ex.rows.join('/')})`]);
  }
  for (const [k, t] of bad) if (waived(k, size, t)) test.info().annotations.push({ type: 'waived', description: `${size}, ${step}, ${k}: ${t}` });
  const offenders = bad.filter(([k, t]) => !waived(k, size, t)).map(([k, t]) => `${k}: ${t}`);
  expect.soft(offenders, `${size}, ${step}: ${offenders.length} layout violation(s)\n  ${offenders.join('\n  ')}\n`).toEqual([]);
}

async function start(page, seed, credits = 5000) {
  await stubApi(page, { startCredits: credits, settings: { ...VEGAS, playTimeout: 250 } });
  await seedRandom(page, SEEDS[seed]);
  await login(page);
}
const hitReady = (page) => expect(btn(page, 'Hit')).toBeEnabled({ timeout: 20_000 });
const nextReady = (page) => expect(btn(page, 'Next hand')).toBeEnabled({ timeout: 25_000 });

for (const [w, h] of SIZES) {
  const size = `${w}x${h}`;
  test.describe(`layout at ${size} (#168)`, () => {
    test.skip(({ isMobile }) => isMobile, 'the chromium project sets the sizes'); // (the phone project does not match this file; a guard only)
    test.use({ viewport: { width: w, height: h }, reducedMotion: 'reduce', hasTouch: w < 900 });

    test('round: bet, offers, insurance, play, results, next hand', async ({ page }) => {
      await start(page, 'insurance');
      await audit(page, size, '1 betting (empty)');
      await placeBet(page, 50);
      await audit(page, size, '2 betting (chip in the circle)');
      await btn(page, 'Deal').click();
      const offers = page.getByRole('group', { name: 'Offers' });
      await expect(offers.getByRole('button', { name: /^Insurance/ })).toBeEnabled({ timeout: 20_000 });
      await audit(page, size, '3 offers');
      await offers.getByRole('button', { name: /^Insurance/ }).click();
      await hitReady(page);
      await audit(page, size, '4 your move (insurance taken)');
      await btn(page, 'Stay').click();
      await nextReady(page);
      await audit(page, size, '5 results');
      await btn(page, 'Next hand').click();
      await expect(page.getByText('Place your bets', { exact: true })).toBeVisible();
      await audit(page, size, '6 next hand (betting)');
    });

    test('split round: split, double, results', async ({ page }) => {
      await start(page, 'pair');
      await placeBet(page, 25);
      await btn(page, 'Deal').click();
      await hitReady(page);
      await expect(btn(page, 'Split')).toBeEnabled();
      await audit(page, size, '7 pair, your move');
      await btn(page, 'Split').click();
      await expect(page.locator('.player-hand')).toHaveCount(2);
      await hitReady(page);
      await audit(page, size, '8 split (two hands)');
      if (await btn(page, 'Double').isEnabled()) {
        await btn(page, 'Double').click();
        await expect(page.locator('.side-spot').first()).toBeVisible({ timeout: 10_000 });
        await audit(page, size, '9 split, first hand doubled (side stake)');
      }
      for (let i = 0; i < 8; i++) { // Stay until every hand is done
        await expect(btn(page, 'Stay').or(btn(page, 'Next hand'))).toBeEnabled({ timeout: 25_000 });
        if (await btn(page, 'Next hand').count()) break;
        await btn(page, 'Stay').click();
      }
      await nextReady(page);
      await audit(page, size, '10 split results');
    });

    test('settings: the six sections in turn', async ({ page }) => {
      await start(page, 'play');
      await btn(page, 'Settings').click();
      await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
      await audit(page, size, 'S0 settings (all closed)', 'settings');
      for (const [id, name] of Object.entries(SECTIONS)) {
        const head = page.getByRole('button', { name });
        await head.click();
        await expect(head).toHaveAttribute('aria-expanded', 'true');
        await audit(page, size, `S ${id}`, 'settings');
      }
    });
  });
}

// Three betting spots (#59), at every size above: three circles, the offers, a split on spot 1 (four hands) and the results.
// Seed 8956: see multihand.spec.js.
for (const [w, h] of SIZES) {
  const size = `${w}x${h}`;
  test.describe(`three spots at ${size} (#59)`, () => {
    test.skip(({ isMobile }) => isMobile, 'the chromium project sets the sizes');
    test.use({ viewport: { width: w, height: h }, reducedMotion: 'reduce', hasTouch: w < 900 });

    test('betting, offers, a split and the results', async ({ page }) => {
      await stubApi(page, { startCredits: 5000, settings: { ...VEGAS, handSpots: 3, playTimeout: 250 } });
      await seedRandom(page, 8956);
      await login(page);
      await audit(page, size, 'M1 three empty circles');
      await btn(page, '$25 chip').click();
      for (const n of [1, 2, 3]) await page.getByRole('button', { name: new RegExp(`^Bet spot ${n},`) }).click();
      await audit(page, size, 'M2 three bets');
      await btn(page, 'Deal').click();
      const offers = page.getByRole('group', { name: 'Offers' });
      for (const n of [1, 2, 3]) {
        await expect(page.getByText(`Spot ${n}: insurance?`, { exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(offers.getByRole('button', { name: /^No thanks/ })).toBeEnabled({ timeout: 20_000 });
        if (n === 2) { await audit(page, size, 'M3 offers on spot 2'); await offers.getByRole('button', { name: /^Insurance/ }).click(); }
        else await offers.getByRole('button', { name: /^No thanks/ }).click();
      }
      await hitReady(page);
      await audit(page, size, 'M4 three spots, your move');
      await btn(page, 'Split').click();
      await expect(page.locator('.player-hand')).toHaveCount(4);
      await hitReady(page);
      await audit(page, size, 'M5 four hands');
      for (let i = 0; i < 8; i++) {
        await expect(btn(page, 'Stay').or(btn(page, 'Next hand'))).toBeEnabled({ timeout: 25_000 });
        if (await btn(page, 'Next hand').count()) break;
        await btn(page, 'Stay').click();
      }
      await nextReady(page);
      await audit(page, size, 'M6 results');
    });
  });
}

// Re-picking a seed (a change to when shoes are built, or to the deck count, breaks the card assertions first): replay what the page does before
// the deal with mulberry32 as seedRandom does (4 router-key numbers, then createShoe(6, true) for the settings load and again for the game start)
// and take the first seed whose second shoe starts with the wanted ranks (T = a ten): insurance '9 A 7 6', pair '8 6 8 T 3 5', play 'T 9 6 T'.
