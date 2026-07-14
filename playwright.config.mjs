import { defineConfig, devices } from '@playwright/test';

// End-to-end / behavioral tests. These are DEV-only: the shipped app and the
// `npm test` release checker remain dependency-free. Playwright drives the app
// through the zero-dep static server in scripts/serve.mjs.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry'
  },
  // Phone-first PWA — exercise it at a phone size.
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } }
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe'
  }
});
