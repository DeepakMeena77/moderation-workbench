import { defineConfig, devices } from '@playwright/test';

// Two projects (docs/05-test-plan.md sec. 6 and sec. 7). The UI project runs against the built app
// (`npm run build` first). Set BASE_URL to test a deployed URL instead of starting a local server.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'e2e', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'] } },
    { name: 'ui', testDir: './tests/ui', use: { ...devices['Desktop Chrome'] } },
  ],
  // Playwright starts and stops this server itself, so nothing keeps running after the tests.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run start -- -p 3000 -H 127.0.0.1',
        url: `${baseURL}/status`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
