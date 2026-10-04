import { defineConfig } from '@playwright/test';

/**
 * Store screenshots — deliberately NOT the browser suite.
 *
 * `playwright.config.ts` at the repo root has `testDir: './tests'`, so
 * nothing here is picked up by `npm test` or by CI. This config is only
 * reached through `npm run screenshots`.
 *
 * Why separate: these write PNGs into the repo, they take minutes, and a
 * failure means "an image did not render", not "the app is broken". CI
 * should not be gated on, or slowed by, producing marketing assets.
 *
 * Its own port (5174) AND its own Vite dep cache, so it never fights a
 * dev server someone already has on 5173. Both matter: two Vite servers
 * on one `node_modules/.vite` corrupt each other, and the symptom is
 * unrelated screens rendering blank rather than an error naming the
 * cause. Running this concurrently with `npm test` cost a 13-minute run
 * and eight false failures before the cache was split.
 */
export default defineConfig({
  // Empties out/ first, so a shot that is no longer produced cannot
  // leave a stale PNG behind for someone to upload.
  globalSetup: './clean.mjs',
  testDir: '.',
  testMatch: /shots\.mjs$/,
  // One at a time: the shots share an output directory and a run should
  // read the same from top to bottom every time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  timeout: 300_000,

  use: {
    baseURL: 'http://127.0.0.1:5174',
    // Where the app's users are. The app formats calendar values in UTC
    // and real instants in the device zone (CLAUDE.md, "Two kinds of
    // time"), so the zone changes what some screens read.
    timezoneId: 'Africa/Cairo',
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },

  webServer: {
    command: 'npm run dev -- --port 5174 --host 127.0.0.1',
    url: 'http://127.0.0.1:5174',
    // Read by vite.config.ts. Keeps this server's prebundled deps out of
    // node_modules/.vite, which `npm test`'s server on 5173 owns.
    env: { RAFIQ_VITE_CACHE_DIR: 'store/screenshots/.vite' },
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
