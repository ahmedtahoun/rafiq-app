import { defineConfig } from '@playwright/test';

/**
 * The admin app's own suite, separate from the main one. The root config
 * has `testDir: './tests'`, so `npm test` at the repo root never collects
 * these, and this never collects those.
 *
 * Nothing here reaches Supabase. The dev server is pointed at an
 * unroutable URL and every request to it is intercepted, so a run cannot
 * touch the real project even by accident.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5175',
    timezoneId: 'Africa/Cairo',
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      // Deliberately not a real project: 127.0.0.1:1 refuses instantly,
      // so an un-intercepted call fails loudly instead of going somewhere.
      VITE_SUPABASE_URL: 'http://127.0.0.1:1',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
