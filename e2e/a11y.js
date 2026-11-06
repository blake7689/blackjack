import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

// Fails on serious or critical axe violations (minor and moderate are ignored), listing rule, impact and selectors.
// A violation that cannot be fixed yet: pass { disableRules: ['rule-id'] } with a one-line comment giving the reason. Never a blanket disable.
export async function expectNoSeriousA11y(page, label, { disableRules = [] } = {}) {
  const { violations } = await new AxeBuilder({ page }).disableRules(disableRules).analyze();
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}) ${n.target.join(' ')}: ${n.failureSummary.split('\n').pop().trim()} | ${n.html.slice(0, 100)}`));
  expect(bad, `${label}: serious/critical accessibility violations`).toEqual([]);
}
