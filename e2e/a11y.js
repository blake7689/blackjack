import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

// A scan takes most of a second in WebKit, and a fade can start inside it (the balance badge fades on a 2.6 s timer), so waiting before
// the scan is not enough (#205): while axe reads, every CSS transition and animation is already at its end. A running one jumps there.
const STILL = '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }';

// While axe reads, motion is off (see STILL) and whatever was still moving has ended.
async function still(page, scan) {
  const style = await page.addStyleTag({ content: STILL });
  try {
    // The style does not reach element.animate() (card and chip flights): wait for those to end.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect.getComputedTiming().endTime === Infinity));
    return await scan();
  } finally {
    await style.evaluate((el) => el.remove());
  }
}

const serious = (violations) => violations
  .filter((v) => v.impact === 'serious' || v.impact === 'critical')
  .flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}) ${n.target.join(' ')}: ${n.failureSummary.split('\n').pop().trim()} | ${n.html.slice(0, 100)}`));

// Over the page screens' gradient axe only says "incomplete", never a violation (#214). So contrast is scanned again on a flat background
// in each of the gradient's two end colours, read from the page. Every point between is a mix of the two, so text that passes on both
// passes at every position, window size and scroll offset (text with a luminance between the two would fail: the ends are under 1.5:1 apart).
// Anything axe still cannot judge fails. The .signed button's tap area (padding, cancelled by its margin: nothing visible moves) overlaps the
// line's own text, which axe also calls "incomplete", so it is taken off for these two passes only.
async function screenContrast(page) {
  const screen = page.locator('.page-screen');
  if (!await screen.count()) return [];
  const ends = await screen.evaluate((el) => getComputedStyle(el).backgroundImage.match(/(?:rgba?|color)\([^()]*\)/g));
  expect(ends, 'the two end colours of the .page-screen gradient').toHaveLength(2);
  const bad = [];
  for (const end of ends) {
    const flat = await page.addStyleTag({ content: `.page-screen { background: ${end} !important; } .signed :is(a, button) { padding: 0 !important; margin: 0 !important; }` });
    try {
      const { violations, incomplete } = await new AxeBuilder({ page }).include('.page-screen').withRules(['color-contrast']).analyze();
      const unread = incomplete.flatMap((v) => v.nodes.map((n) => `${v.id} could not be checked (${n.any[0]?.data?.messageKey}) ${n.target.join(' ')} | ${n.html.slice(0, 100)}`));
      bad.push(...[...serious(violations), ...unread].map((line) => `on ${end}: ${line}`));
    } finally {
      await flat.evaluate((el) => el.remove());
    }
  }
  return bad;
}

// Fails on serious or critical axe violations (minor and moderate are ignored), listing rule, impact and selectors.
// On a .page-screen it also fails on any text whose contrast could not be checked (see screenContrast).
// A violation that cannot be fixed yet: pass { disableRules: ['rule-id'] } with a one-line comment giving the reason. Never a blanket disable.
export async function expectNoSeriousA11y(page, label, { disableRules = [] } = {}) {
  const bad = await still(page, async () => {
    const { violations } = await new AxeBuilder({ page }).disableRules(disableRules).analyze();
    return [...serious(violations), ...await screenContrast(page)];
  });
  expect(bad, `${label}: serious/critical accessibility violations`).toEqual([]);
}

// The page screen's contrast in all six looks (3 felts x dark and light). No accent colour is used for text on the gradient.
export async function expectScreenContrastInEveryLook(page, label) {
  await expect(page.locator('.page-screen')).toBeVisible();
  const bad = await still(page, async () => {
    const html = page.locator('html');
    const was = await html.evaluate((el) => ({ mode: el.dataset.mode, felt: el.dataset.felt }));
    const found = [];
    for (const mode of ['dark', 'light']) {
      for (const felt of ['green', 'blue', 'red']) {
        await html.evaluate((el, look) => Object.assign(el.dataset, look), { mode, felt });
        found.push(...(await screenContrast(page)).map((line) => `${mode} ${felt} ${line}`));
      }
    }
    await html.evaluate((el, look) => Object.assign(el.dataset, look), was);
    return found;
  });
  expect(bad, `${label}: contrast on the page screen, every look`).toEqual([]);
}
