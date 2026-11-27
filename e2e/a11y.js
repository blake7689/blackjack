import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

// A scan takes most of a second in WebKit, and a fade can start inside it (the balance badge fades on a 2.6 s timer), so waiting before
// the scan is not enough (#205): while axe reads, every CSS transition and animation is already at its end. A running one jumps there.
const STILL = '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }';

// Fails on serious or critical axe violations (minor and moderate are ignored), listing rule, impact and selectors.
// A violation that cannot be fixed yet: pass { disableRules: ['rule-id'] } with a one-line comment giving the reason. Never a blanket disable.
export async function expectNoSeriousA11y(page, label, { disableRules = [] } = {}) {
  const still = await page.addStyleTag({ content: STILL });
  let violations;
  try {
    // The style does not reach element.animate() (card and chip flights): wait for those to end.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect.getComputedTiming().endTime === Infinity));
    ({ violations } = await new AxeBuilder({ page }).disableRules(disableRules).analyze());
  } finally {
    await still.evaluate((el) => el.remove());
  }
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}) ${n.target.join(' ')}: ${n.failureSummary.split('\n').pop().trim()} | ${n.html.slice(0, 100)}`));
  expect(bad, `${label}: serious/critical accessibility violations`).toEqual([]);
}
