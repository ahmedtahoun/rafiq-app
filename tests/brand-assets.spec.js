import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The app's mark: the shared <Logo> in the app, and the native icons and
 * splash screens generated from the same definition (src/lib/logoMark.ts →
 * scripts/render-brand-assets.mjs → assets/ → @capacitor/assets).
 *
 * What this cannot prove: that the icon looks right on a home screen. Sizes,
 * alpha and "not the placeholder" are checkable here; how it reads at 40px
 * under a circular mask is not.
 */

const ROOT = new URL('../', import.meta.url);
const file = (p) => readFileSync(new URL(p, ROOT));
const sha = (p) => createHash('sha256').update(file(p)).digest('hex').slice(0, 16);

/** Width, height and PNG colour type (2 = RGB, 6 = RGBA) from the IHDR chunk. */
function png(p) {
  const b = file(p);
  expect(b.subarray(1, 4).toString(), `${p} is a PNG`).toBe('PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

// sha256 prefixes of what Capacitor's template shipped, taken from main
// before this change. Seeing one again means the placeholder came back.
const PLACEHOLDERS = {
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png': '29e4777e319de3ee',
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png': '87cb2f2ffe992652',
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png': 'bd24fd383253bf8d',
  'android/app/src/main/res/drawable/splash.png': '5cf98b4451bd99b2',
};

test('the native icons and splashes are ours, not Capacitor\'s placeholders', () => {
  for (const [p, placeholder] of Object.entries(PLACEHOLDERS)) {
    expect(sha(p), p).not.toBe(placeholder);
  }
});

test('the iOS icon is 1024 square with no alpha channel', () => {
  // App Store Connect rejects an icon with an alpha channel, even an opaque one.
  expect(png('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'))
    .toEqual({ width: 1024, height: 1024, colorType: 2 });
});

test('iOS has a light and a dark splash, and every file its catalogue names exists', () => {
  const dir = 'ios/App/App/Assets.xcassets/Splash.imageset/';
  const images = JSON.parse(file(`${dir}Contents.json`)).images;
  const dark = images.filter((i) => i.appearances?.some((a) => a.value === 'dark'));
  expect(images.length - dark.length, 'light splashes').toBeGreaterThan(0);
  expect(dark.length, 'dark splashes').toBeGreaterThan(0);
  for (const i of images) expect(existsSync(new URL(`${dir}${i.filename}`, ROOT)), i.filename).toBe(true);
});

test('Android has the launcher icon at every density, and an adaptive icon', () => {
  const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, px] of Object.entries(sizes)) {
    for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_background']) {
      const { width, height } = png(`android/app/src/main/res/mipmap-${density}/${name}.png`);
      expect([width, height], `${density}/${name}`).toEqual([px, px]);
    }
  }
  const adaptive = file('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml').toString();
  expect(adaptive).toContain('@mipmap/ic_launcher_foreground');
  expect(adaptive).toContain('@mipmap/ic_launcher_background');
  // A dark splash for night mode, next to the light one.
  expect(existsSync(new URL('android/app/src/main/res/drawable-night/splash.png', ROOT))).toBe(true);
});

test('Android 12+ draws its splash from the mark, on the page colour in both themes', () => {
  // Android 12+ ignores splash.png and draws its own splash; without these it
  // shows the 192px launcher icon, blown up and blurred, on the system grey.
  const styles = file('android/app/src/main/res/values/styles.xml').toString();
  expect(styles).toContain('<item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>');
  expect(styles).toContain('<item name="windowSplashScreenBackground">@color/splash_background</item>');
  const color = (dir) => /<color name="splash_background">(#\w+)<\/color>/.exec(file(`android/app/src/main/res/${dir}/splash.xml`).toString())?.[1];
  expect(color('values')).toBe('#FAF9F5');
  expect(color('values-night')).toBe('#18140F');
  const icon = file('android/app/src/main/res/drawable/splash_icon.xml').toString();
  expect(icon).toContain('<vector');
  expect(icon).toContain('#B75C3D');
});

test('the source artwork is committed, at the sizes the generator expects', () => {
  expect(png('assets/icon-only.png')).toEqual({ width: 1024, height: 1024, colorType: 2 });
  expect(png('assets/icon-foreground.png')).toMatchObject({ width: 1024, height: 1024, colorType: 6 });
  expect(png('assets/splash.png')).toMatchObject({ width: 2732, height: 2732 });
  expect(png('assets/splash-dark.png')).toMatchObject({ width: 2732, height: 2732 });
  expect(file('assets/logo.svg').toString()).toContain('<svg');
});

// ---------------------------------------------------------------------------
// In the app

async function open(browser, lang, dark) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [lang, dark]);
  await page.reload();
  return { ctx, page, errs };
}

for (const [lang, dark] of [['en', false], ['ar', true], ['en', true], ['ar', false]]) {
  test(`RoleSelect and Auth show the logo, not a bare "R" (${lang}, ${dark ? 'dark' : 'light'})`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, lang, dark);
    for (const [screen, mark] of [['roleSelect', '.role-select-mark'], ['auth', '.auth-mark']]) {
      const found = await page.evaluate(async ([s, sel]) => {
        const { useAppStore } = await import('/src/store/appStore.ts');
        useAppStore.getState().nav(s);
        await new Promise((r) => setTimeout(r, 300));
        const box = document.querySelector(sel);
        const svg = box?.querySelector('svg[data-logo]');
        const r = svg?.getBoundingClientRect();
        return {
          svg: Boolean(svg),
          text: box?.textContent ?? null,
          hidden: svg?.getAttribute('aria-hidden'),
          // A logo is not directional: never mirrored under RTL.
          transform: svg ? getComputedStyle(svg).transform : null,
          filled: r ? Math.round(r.width) === Math.round(box.getBoundingClientRect().width) && r.height > 40 : false,
        };
      }, [screen, mark]);
      expect(found, screen).toEqual({ svg: true, text: '', hidden: 'true', transform: 'none', filled: true });
    }
    expect(errs).toEqual([]);
    await ctx.close();
  });
}
