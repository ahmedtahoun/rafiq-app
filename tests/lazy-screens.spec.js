import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * Screens load when they are opened, not at startup (LAUNCH-CHECKLIST §10).
 *
 * Fifty-four static imports in App.tsx meant the first paint waited for
 * every screen in the app. These check the split is real rather than
 * trusting the build output: the first test fails the moment someone turns
 * a `lazy(() => import(...))` back into a static import, because the
 * module then arrives before it is needed.
 *
 * The dev server serves each module on request, so "was it fetched" is
 * directly observable here in a way it is not in a production bundle.
 */

const SCREEN_MODULE = (name) => new RegExp(`/src/screens/${name}\\.tsx`);

async function openApp(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  const fetched = [];
  page.on('request', (r) => fetched.push(r.url()));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  fetched.length = 0;
  await page.reload();
  await page.waitForTimeout(600);
  return { ctx, page, errs, fetched };
}

test('startup does not fetch every screen, and opening one fetches it', async ({ browser }) => {
  const { ctx, page, errs, fetched } = await openApp(browser);

  // Welcome is the first screen, so it is expected. These are not.
  const atStartup = ['Schedule', 'Earnings', 'PayoutAccount', 'ClientDetail', 'CoachMessages'];
  for (const name of atStartup) {
    expect(
      fetched.some((u) => SCREEN_MODULE(name).test(u)),
      `${name} should not be on the startup path`,
    ).toBe(false);
  }

  // What is on screen at startup did have to load.
  expect(fetched.some((u) => SCREEN_MODULE('Welcome').test(u)), 'Welcome is the first screen').toBe(true);

  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    useAppStore.getState().nav({ screen: 'schedule' });
  });
  await expect(page.locator('.schedule-hero')).toBeVisible();

  expect(
    fetched.some((u) => SCREEN_MODULE('Schedule').test(u)),
    'Schedule arrives when it is opened',
  ).toBe(true);
  // And still nothing pulled in the screens nobody asked for.
  expect(
    fetched.some((u) => SCREEN_MODULE('PayoutAccount').test(u)),
    'opening Schedule does not drag in PayoutAccount',
  ).toBe(false);

  expect(errs).toEqual([]);
  await ctx.close();
});

test('a screen that is slow to arrive shows the spinner, not a blank frame', async ({ browser }) => {
  const { ctx, page, errs } = await openApp(browser);

  // Hold Earnings back long enough to see what is rendered in its place.
  await page.route('**/src/screens/Earnings.tsx*', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    useAppStore.getState().nav({ screen: 'earnings' });
  });

  // The app's own loading state, the same one a slow Supabase read shows —
  // not a second kind of loading screen, and not an empty phone frame.
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(page.locator('.load-state[role="status"]')).toHaveAttribute('aria-live', 'polite');

  // And it gets out of the way once the screen arrives.
  await expect(page.locator('.earnings-header')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.load-state')).toHaveCount(0);

  expect(errs).toEqual([]);
  await ctx.close();
});

test('the spinner is translated and mirrored while an Arabic screen loads', async ({ browser }) => {
  const { ctx, page, errs } = await openApp(browser);
  await page.evaluate(() => localStorage.setItem('rafiq_lang', JSON.stringify('ar')));
  await page.reload();
  await page.waitForTimeout(400);

  await page.route('**/src/screens/Earnings.tsx*', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    useAppStore.getState().nav({ screen: 'earnings' });
  });

  const expected = await page.evaluate(async () => {
    const { translate } = await import('/src/lib/i18n.ts');
    return translate('ar', 'loadingEllipsis');
  });
  await expect(page.locator('.load-state-body')).toHaveText(expected);
  expect(await page.evaluate(() => document.documentElement.dir), 'still RTL while loading').toBe('rtl');

  expect(errs).toEqual([]);
  await ctx.close();
});
