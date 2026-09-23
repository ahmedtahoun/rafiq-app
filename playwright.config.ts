import { defineConfig, devices } from '@playwright/test';

/**
 * These are browser tests: they drive the real app in Chromium and read
 * what a user would see. That is deliberate — `tsc` and `oxlint` pass on
 * every bug this suite has caught (Arabic text scrambling under bidi, a
 * rating written to the wrong row, a chevron mirrored twice), because
 * none of those are type errors.
 *
 * The suite talks to the Vite dev server rather than a production build,
 * so it can import `src/lib/mockStore.ts` and `src/store/appStore.ts`
 * through the module graph to seed state and assert on it.
 */
export default defineConfig({
  testDir: './tests',
  // Each spec seeds localStorage and navigates, so files are independent
  // but tests within a file share a page fixture in order.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 45_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 420, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI installs the browser build this Playwright version expects, so
        // it needs no override. Some sandboxes ship a different build at a
        // fixed path instead of allowing a download; point PW_CHROMIUM at
        // it there rather than pinning the whole toolchain to that build.
        ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
      },
    },
  ],

  webServer: {
    command: 'npm run dev -- --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
