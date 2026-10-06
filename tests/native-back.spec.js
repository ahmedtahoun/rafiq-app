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
  if (platform) {
    // App.tsx registers the listener from its mount effect, after an
    // import: a fixed wait here was a race a loaded run lost, pressing back
    // before anyone was listening — the press vanished and the poll below
    // timed out on an unchanged screen. Wait for the listener itself.
    await expect
      .poll(() => page.evaluate(async () => {
        const { App } = await import('/@id/@capacitor/app');
        return App.hasListeners('backButton');
      }), {
        message: 'the backButton listener was never registered',
        // The first native test in a worker loads the whole app cold, and
        // on a loaded run that has taken longer than the 7 s default.
        timeout: 20_000,
      })
      .toBe(true);
  } else {
    await page.waitForTimeout(400);
  }
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

// Counts exitApp() calls. "Store unchanged" alone can't tell exiting from
// doing nothing — on Welcome or Main, back() is itself a no-op — so the
// exit branch needs its own signal. Capacitor resolves each plugin method
// on the web implementation at call time (impl[prop]), and the impl is
// `new AppWeb()` from the chunk the App plugin module imports; importing
// that same URL here gets the same module instance, so patching its
// prototype is what the real call reaches. The URL is read out of the
// plugin module's own source rather than hard-coded, since it carries a
// dependency-optimizer hash.
const spyOnExit = (page) => page.evaluate(async () => {
  const src = await (await fetch('/@id/@capacitor/app')).text();
  const webUrl = src.match(/import\("([^"]*\/web-[^"]*)"\)/)[1];
  const { AppWeb } = await import(webUrl);
  window.__exitCalls = 0;
  AppWeb.prototype.exitApp = async function () {
    window.__exitCalls += 1;
  };
});
const exitCalls = (page) => page.evaluate(() => window.__exitCalls);

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

test('shouldExitOnBack: exits only where back() has nowhere to go', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, null);

  // Pinned by hand rather than recomputed from ROOTS/PARENT, so a change to
  // either list that alters behaviour has to change this table too.
  // Exits on an empty history: every tab root, plus the screens with no
  // PARENT at all — welcome (the app's first screen), roleSelect and
  // onboarding. Everything else has a PARENT for back() to fall back to.
  const expected = {
    welcome: true, roleSelect: true, onboarding: true,
    main: true, profile: true, clients: true, schedule: true, discover: true, clientHome: true,
    clientSchedule: true, clientTasks: true, myPrograms: true, messagesInbox: true, comingSoon: true,
    auth: false, clientAuth: false, editProfile: false, addClient: false, clientDetail: false,
    editClient: false, addTimeBlock: false, programDetail: false,
  };

  const r = await page.evaluate(async (screens) => {
    const back = await import('/src/lib/nativeBack.ts');
    return screens.map((s) => [s, back.shouldExitOnBack(s, 0), back.shouldExitOnBack(s, 3)]);
  }, Object.keys(expected));

  for (const [screen, exitsAtEmptyHist, exitsWithHist] of r) {
    expect.soft(exitsAtEmptyHist, `${screen}, empty history`).toBe(expected[screen]);
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
  // A settle, not a race: this asserts that *nothing* happens, and there is
  // no event to poll for. The failure mode of too short a wait here is a
  // false pass, not the false fail the polls above replace.
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
    await spyOnExit(page);
    await nav(page, { screen: 'clients' });
    await nav(page, { screen: 'addClient' });
    const before = await storeState(page);
    expect.soft(before, `${platform}: on addClient, one entry of history`).toEqual({ screen: 'addClient', histLen: 1 });

    await pressBack(page);

    // Poll, don't sleep. The listener runs asynchronously, and a fixed wait
    // is a race the suite loses under load — this is what made the `welcome`
    // case below fail about one full run in ten while passing 10/10 on its
    // own. Polling the thing that must happen also earns the negative check
    // after it: once the pop is visible the handler has already picked its
    // branch, so "did not exit" is a real assertion rather than a guess
    // about timing.
    await expect.soft
      .poll(() => storeState(page), { message: `${platform}: popped back to clients, history empty again` })
      .toEqual({ screen: 'clients', histLen: 0 });
    expect.soft(await exitCalls(page), `${platform}:   and did not exit`).toBe(0);

    await ctx.close();
    expect.soft(errs, `${platform}: no page errors`).toEqual([]);
  });

  // main: a tab root. welcome: the app's first screen — no history, no
  // PARENT, not a root — where back() alone is a silent no-op, so before
  // this rule the hardware button did nothing at all there.
  for (const screen of ['main', 'welcome']) {
    test(`native (${platform}): back on ${screen} with no history exits the app`, async ({ browser }) => {
      const { page, ctx, errs } = await open(browser, platform);

      await spyOnExit(page);
      await nav(page, { screen });
      const before = await storeState(page);
      expect.soft(before, `${platform}: on ${screen}, no history`).toEqual({ screen, histLen: 0 });

      await pressBack(page);

      await expect.soft
        .poll(() => exitCalls(page), { message: `${platform}: exitApp() called once` })
        .toBe(1);
      expect.soft(await storeState(page), `${platform}: and back() did not move anything`).toEqual(before);

      await ctx.close();
      expect.soft(errs, `${platform}: no page errors`).toEqual([]);
    });
  }

  test(`native (${platform}): the web fallback's unimplemented exitApp() rejection is swallowed`, async ({ browser }) => {
    // No spy here: the real web exitApp() rejects with "Not implemented on
    // web", and nativeBack.ts's .catch() is what keeps that from surfacing
    // as an unhandled rejection.
    const { page, ctx, errs } = await open(browser, platform);
    await nav(page, { screen: 'welcome' });
    await pressBack(page);
    // Also a settle: an unhandled rejection would surface on a later tick,
    // and absence is not pollable.
    await page.waitForTimeout(150);
    await ctx.close();
    expect.soft(errs, `${platform}: no page errors`).toEqual([]);
  });
}
