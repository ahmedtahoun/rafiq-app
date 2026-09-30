import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The status bar's icons follow the app's own dark-mode switch, not the
 * phone's. Left to the phone, a member who turns dark mode on in the app
 * while their phone is light gets dark icons on a dark page: no clock, no
 * battery. See src/lib/nativeSystemBars.ts for why an old Android WebView is
 * left alone.
 */

// Same technique as native-back.spec.js: installing Capacitor's
// CustomPlatform hook before any module loads makes isNativePlatform() true.
async function open(browser, platform, dark) {
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
  await page.evaluate((d) => {
    localStorage.clear();
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, dark);
  await page.reload();
  await page.waitForTimeout(300);
  return { page, ctx, errs };
}

// Records what the app asks for from here on. The app and this import share
// one module instance (the same URL through Vite), so the swap is what the
// app's own effect calls.
const spy = (page) => page.evaluate(async () => {
  const mod = await import('/src/lib/nativeSystemBars.ts');
  window.__styles = [];
  mod.systemBars.setStyle = async (style) => { window.__styles.push(style); };
});
const setDark = (page, dark) => page.evaluate(async (d) => {
  const { useAppStore } = await import('/src/store/appStore.ts');
  useAppStore.getState().setDark(d);
}, dark);
const styles = (page) => page.evaluate(() => window.__styles);

test('systemBarsStyleFor: the app theme on iOS and on an edge-to-edge Android', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, null, false);
  const table = await page.evaluate(async () => {
    const { systemBarsStyleFor } = await import('/src/lib/nativeSystemBars.ts');
    const modern = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/141.0.0.0 Mobile Safari/537.36';
    const old = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/124.0.6367.219 Mobile Safari/537.36';
    return {
      iosDark: systemBarsStyleFor(true, 'ios', ''),
      iosLight: systemBarsStyleFor(false, 'ios', ''),
      androidModernDark: systemBarsStyleFor(true, 'android', modern),
      androidModernLight: systemBarsStyleFor(false, 'android', modern),
      androidOldDark: systemBarsStyleFor(true, 'android', old),
      web: systemBarsStyleFor(true, 'web', modern),
    };
  });
  expect(table).toEqual({
    iosDark: 'DARK', // light icons on the dark page
    iosLight: 'LIGHT',
    androidModernDark: 'DARK',
    androidModernLight: 'LIGHT',
    androidOldDark: null, // Capacitor pads the app; the bars sit on the native window
    web: null,
  });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('switching the app to dark mode turns the status bar icons light (iOS)', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, 'ios', false);
  await spy(page);
  await setDark(page, true);
  await setDark(page, false);
  expect(await styles(page)).toEqual(['DARK', 'LIGHT']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a plain browser never touches the system bars', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, null, false);
  await spy(page);
  await setDark(page, true);
  expect(await styles(page)).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});
