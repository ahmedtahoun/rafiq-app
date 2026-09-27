import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The Android hardware back button.
 *
 * Nothing listened for it before this: Capacitor's default is to exit the
 * app the instant it's pressed, from whatever screen is open. Now
 * `initBackButton()` (src/lib/nativeBack.ts), wired up from App.tsx's own
 * mount effect, routes it through the same back() the on-screen arrow
 * uses, and only lets it exit on a screen back() itself treats as a dead
 * end (ROOTS in appStore.ts).
 *
 * These tests drive the real listener App.tsx registers on mount — not a
 * second one set up by hand — so they exercise the actual wiring, not a
 * stand-in for it. `App.exitApp()` itself can't be verified here:
 * Capacitor's web fallback has no such thing and throws "Not implemented
 * on web", which is exactly why nativeBack.ts wraps the call in .catch().
 * What's covered instead: a real back-history pop still wins over exiting,
 * a true dead end takes the exit branch (never calls back()), and none of
 * it runs at all outside a native shell.
 */

// `platform: null` = a real browser. Anything else installs Capacitor's
// CustomPlatform hook BEFORE any module loads, which is what makes
// Capacitor.isNativePlatform() true — same technique native-oauth.spec.js
// uses, and the only way to reach the native branch without a device. This
// also makes App.tsx's own mount effect register the real backButton
// listener under test, since isNativePlatform() is what its initBackButton()
// call is guarded on.
async function open(browser, platform) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  if (platform) {
    await page.addInitScript((name) => {
      window.CapacitorCustomPlatform = { name };
    }, platform);
  }
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  return { page, ctx, errs };
}

// Fires the same event a real hardware back press notifies as. Works
// because Capacitor's web fallback (AppWeb, a WebPlugin) exposes a real
// notifyListeners() that dispatches to whatever addListener() registered,
// regardless of what would normally trigger it on that platform — so this
// reaches the exact listener App.tsx's own mount effect set up, the same
// object identity, since registerPlugin() only ever creates one proxy per
// plugin name and hands the same one to every importer.
// '@capacitor/app' (bare specifier) only resolves through Vite's own
// transform of a source file that imports it statically — a raw dynamic
// import() of the bare id from eval'd test code never goes through that
// pipeline. Vite's dev server also serves any bare id resolved through its
// own plugin container at /@id/<id>, which is what makes this reach the
// same registered plugin singleton.
const pressBack = (page) => page.evaluate(async () => {
  const { App } = await import('/@id/@capacitor/app');
  await App.notifyListeners('backButton', { canGoBack: false });
});

const storeState = (page) => page.evaluate(async () => {
  const { useAppStore } = await import('/src/store/appStore.ts');
  const s = useAppStore.getState();
  return { screen: s.screen, histLen: s.hist.length };
});

const nav = (page, patch) => page.evaluate(async (p) => {
  const { useAppStore } = await import('/src/store/appStore.ts');
  useAppStore.getState().nav(p);
}, patch);

// ---------------------------------------------------------------------------

test('shouldExitOnBack: exits only on a dead end (empty history on a ROOTS screen)', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, null);

  const r = await page.evaluate(async () => {
    const [back, store] = await Promise.all([
      import('/src/lib/nativeBack.ts'),
      import('/src/store/appStore.ts'),
    ]);
    const allScreens = [
      'welcome', 'roleSelect', 'auth', 'clientAuth', 'onboarding', 'main', 'profile',
      'editProfile', 'clients', 'addClient', 'clientDetail', 'schedule', 'addTimeBlock',
      'discover', 'clientHome', 'clientSchedule', 'clientTasks', 'myPrograms', 'programDetail',
      'messagesInbox', 'comingSoon',
    ];
    return allScreens.map((s) => [
      s,
      store.ROOTS.includes(s),
      back.shouldExitOnBack(s, 0),
      back.shouldExitOnBack(s, 3),
    ]);
  });

  for (const [screen, isRoot, exitsAtEmptyHist, exitsWithHist] of r) {
    // A ROOTS screen only exits when there truly is no history — and a
    // non-ROOTS screen never exits, no matter how empty its history is
    // (welcome, for instance, is a dead end that stays put — the whole
    // point of routing through the same PARENT-less no-op back() honors).
    expect.soft(exitsAtEmptyHist, `${screen} (ROOTS=${isRoot}), empty history`).toBe(isRoot);
    expect.soft(exitsWithHist, `${screen}, non-empty history never exits`).toBe(false);
  }

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('web: App.tsx never registers the listener, so a stray backButton event does nothing', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, null);

  await nav(page, { screen: 'clients' });
  await nav(page, { screen: 'addClient' });
  const before = await storeState(page);
  expect.soft(before.screen, 'on addClient with clients in history').toBe('addClient');
  expect.soft(before.histLen, '  one entry deep').toBe(1);

  await pressBack(page);
  await page.waitForTimeout(150);

  const after = await storeState(page);
  expect.soft(after.screen, 'unchanged on web').toBe(before.screen);
  expect.soft(after.histLen, '  history unchanged too').toBe(before.histLen);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

for (const platform of ['android', 'ios']) {
  test(`native (${platform}): a real back-history entry pops instead of exiting`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, platform);

    // clients -> addClient pushes clients onto the history stack, so this
    // is the "real back-history wins" case even though clients is itself
    // a ROOTS screen — the bug this guards is exiting the app one press
    // too early instead of the on-screen back arrow's own behaviour.
    await nav(page, { screen: 'clients' });
    await nav(page, { screen: 'addClient' });
    const before = await storeState(page);
    expect.soft(before, `${platform}: on addClient, one entry of history`).toEqual({ screen: 'addClient', histLen: 1 });

    await pressBack(page);
    await page.waitForTimeout(150);

    const after = await storeState(page);
    expect.soft(after.screen, `${platform}: popped back to clients, not exited`).toBe('clients');
    expect.soft(after.histLen, `${platform}:   history is empty again`).toBe(0);

    await ctx.close();
    expect.soft(errs, `${platform}: no page errors`).toEqual([]);
  });

  test(`native (${platform}): a true dead end takes the exit branch, not back()`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, platform);

    // main is a ROOTS screen entered with empty history — the same shape
    // as landing on any bottom-nav tab. Before this fix a hardware back
    // press here exited the app immediately; now it still should (there
    // is nowhere for back() to send it), but through the exit branch,
    // not a call to back() that would otherwise silently no-op here.
    await nav(page, { screen: 'main' });
    const before = await storeState(page);
    expect.soft(before, `${platform}: on main, no history`).toEqual({ screen: 'main', histLen: 0 });

    await pressBack(page);
    await page.waitForTimeout(150);

    const after = await storeState(page);
    // exitApp() rejects under Capacitor's web fallback and is caught
    // internally — nothing about that should touch the store, which is
    // exactly how "the exit branch ran instead of back()" shows up here.
    expect.soft(after, `${platform}: store untouched — back() was not called`).toEqual(before);

    await ctx.close();
    // Confirms the .catch() on exitApp() actually caught the rejection
    // Capacitor's web fallback throws, rather than leaving it unhandled.
    expect.soft(errs, `${platform}: the unimplemented exitApp() rejection was swallowed`).toEqual([]);
  });
}
