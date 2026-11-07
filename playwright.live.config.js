import { defineConfig, devices } from '@playwright/test';

// Post-deploy smoke test against the real site and API (#119). Run by the deploy workflow's live_smoke job,
// or by hand: `npm run e2e:live` (needs E2E_LIVE_USERNAME and E2E_LIVE_PASSWORD in the environment).
export default defineConfig({
  testDir: 'e2e-live',
  testMatch: '*.spec.js',
  timeout: 180_000, // Azure API cold start is 30+ s; sign-in and /me wait up to 90 s each (COLD_START_TIMEOUT_MS)
  globalTimeout: 5 * 60_000, // ends before the 6-min step limit in the workflow so Playwright fails with a report
  retries: 0, // an alarm: a retry would hide a flaky live site
  workers: 1, // one real account: parallel tests would race on its balance
  reporter: [['list']], // no html report: nothing is uploaded and a trace could hold the sign-in
  use: {
    baseURL: process.env.LIVE_SITE_URL ?? 'https://lively-sky-084c84203.2.azurestaticapps.net',
    // Off: traces, videos and screenshots of the signed-in page could leak the account.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  // E2E_CHANNEL=chrome uses the installed Google Chrome where Playwright's own download cannot run.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL } }],
  // No webServer: the site is already deployed.
});
