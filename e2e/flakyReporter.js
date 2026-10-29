import { appendFileSync } from 'node:fs';

// Lists tests that passed only on a retry in the GitHub job summary.
export default class FlakyReporter {
  onBegin(_config, suite) {
    this.suite = suite;
  }

  onEnd() {
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (!file) return;
    const flaky = this.suite.allTests().filter((t) => t.outcome() === 'flaky');
    if (!flaky.length) return;
    const lines = flaky.map((t) => `- ${t.titlePath().slice(2).join(' > ')}`);
    appendFileSync(file, `### Flaky e2e tests (passed on retry)\n${lines.join('\n')}\n`);
  }
}
