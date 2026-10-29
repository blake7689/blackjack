import { defineConfig, devices } from '@playwright/test';

const ci = !!process.env.CI;

// Smoke tests run against the e2e build (.env.e2e -> fake API origin that page.route answers).
// Headless by default; `npx playwright test --headed` shows the browser.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000, // the cold-start test holds sign-in and /player/me for 15 s + 11 s, ~28 s in all
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }], ['./e2e/flakyReporter.js']] : 'list',
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // E2E_CHANNEL=chrome uses the installed Google Chrome where Playwright's own download cannot run (e.g. blocked by security software).
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL } }],
  webServer: {
    // Port 4174, so a local production preview on 4173 (real API) is never picked up.
    command: 'npm run build:e2e && npm run preview -- --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
