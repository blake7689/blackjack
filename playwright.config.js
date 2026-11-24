import { defineConfig, devices } from '@playwright/test';

const ci = !!process.env.CI;

// The specs the narrow-screen projects (phone, webkit) re-run; one regex so they cannot drift.
const narrowSpecs = /(smoke|topup|a11y|split|layout|tableart|chips|animations|sound|screens)\.spec\.js/;

// Smoke tests run against the e2e build (.env.e2e -> fake API origin that page.route answers).
// Headless by default; `npx playwright test --headed` shows the browser.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000, // the cold-start test holds sign-in and /player/me for 15 s + 11 s, ~28 s in all
  globalTimeout: ci ? 7 * 60_000 : undefined, // per matrix leg (chromium / phone / webkit), each ~3-4 min; ends before the step/job limits so Playwright fails with a report
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }], ['./e2e/flakyReporter.js']] : 'list',
  use: {
    baseURL: 'http://localhost:4174',
    trace: ci ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // E2E_CHANNEL=chrome uses the installed Google Chrome where Playwright's own download cannot run (e.g. blocked by security software).
  // 'phone' re-runs the smoke, top-up, a11y, split, layout, table-art, chips, animations, sound and screens tests at Pixel 7 size (touch, mobile viewport); `--project=phone` runs only it.
  // 'webkit' (#167) runs the same specs in WebKit at iPhone 14 size (Safari's engine; no channel exists for it).
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL } },
    { name: 'phone', testMatch: narrowSpecs, use: { ...devices['Pixel 7'], channel: process.env.E2E_CHANNEL } },
    { name: 'webkit', testMatch: narrowSpecs, use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    // Port 4174, so a local production preview on 4173 (real API) is never picked up.
    command: 'npm run build:e2e && npm run preview -- --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
