import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleCoachPage } from '../site/coach-page.mjs';

/**
 * A coach's public page, rafiqpro.com/c/<code> (site/coach-page.mjs, served
 * by site/functions/c/[code].js). The handler runs here in Node with a
 * stand-in for the database; the browser loads what it returns, with the
 * site's real stylesheet, from a stand-in origin.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://rafiqpro.test';
const ENV = { SUPABASE_URL: 'https://proj.supabase.test/', SUPABASE_ANON_KEY: 'anon-key' };

const COACH = {
  coach_id: 'c-1', full_name: 'Dina Farouk', title: 'Career coaching · Life coaching',
  bio: 'Helps people find work they love.\n\nTen years in hiring.', languages: ['Arabic', 'English'],
  session_mode: 'online', experience_years: 6, certifications: ['ICF ACC'], verified: true,
  from_price: 600, currency: 'EGP', rating_count: 4, rating_avg: 4.25,
};

/** Runs the handler with a stand-in database; returns what it did and the calls it made. */
async function handle({ code = 'k7m2qx', lang = 'en', coach = COACH, rpc, env = ENV } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (rpc === 'throw') throw new Error('offline');
    if (rpc) return new Response('{}', { status: rpc });
    return new Response(JSON.stringify(coach), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await handleCoachPage({ code, lang, env, fetchImpl });
  return { result, calls };
}

/** Opens what the handler returned, as the browser would get it. */
async function show(page, result, path = '/c/k7m2qx') {
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/style.css') {
      return route.fulfill({ body: readFileSync(join(ROOT, 'site/public/style.css'), 'utf8'), contentType: 'text/css' });
    }
    return route.fulfill({ status: result.status, headers: result.headers, body: result.body });
  });
  await page.goto(`${ORIGIN}${path}`);
}

const visibleText = (page) => page.locator('main').innerText();

for (const dark of [false, true]) {
  test(`English${dark ? ', dark' : ''}: the coach's own page, from the database`, async ({ page }) => {
    if (dark) await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 375, height: 900 });
    const { result } = await handle();
    expect(result.status).toBe(200);
    await show(page, result);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('.coach-name')).toHaveText('Dina Farouk ✓');
    await expect(page.locator('.coach-verified')).toHaveAttribute('aria-label', 'Verified pro');
    await expect(page.locator('.coach-avatar')).toHaveText('DF');
    await expect(page.locator('.coach-title')).toHaveText('Career coaching · Life coaching');
    await expect(page.locator('.coach-price')).toHaveText('From 600 EGP');
    await expect(page.locator('.coach-stats dd')).toHaveText(['★ 4.3', '6', '4']);
    await expect(page.locator('main p[dir="auto"]')).toHaveText(['Helps people find work they love.', 'Ten years in hiring.']);
    await expect(page.locator('.coach-facts dd')).toHaveText(['Arabic, English', 'Online', 'ICF ACC']);
    await expect(page.locator('.coach-open')).toHaveAttribute('href', 'app.rafiqie.coach://c/k7m2qx');
    await expect(page.locator('.coach-open')).toHaveText('Open in Rafiq Pro');
    await expect(page.locator('.coach-soon')).toHaveText('Coming soon to the App Store and Google Play.');
    await expect(page.locator('.lang')).toHaveAttribute('href', '/ar/c/k7m2qx');
    await expect(page).toHaveTitle('Dina Farouk — Rafiq Pro');
    // The stylesheet applied, in the right theme, and nothing wider than a phone.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(dark ? 'rgb(24, 20, 15)' : 'rgb(250, 249, 245)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('script, img, iframe, form').count()).toBe(0);
  });

  test(`Arabic${dark ? ', dark' : ''}: the same page, right to left, in the app's Arabic`, async ({ page }) => {
    if (dark) await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 375, height: 900 });
    const { result } = await handle({ lang: 'ar', coach: { ...COACH, full_name: 'دينا فاروق', bio: 'تساعد الناس على إيجاد عمل يحبونه.' } });
    await show(page, result, '/ar/c/k7m2qx');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('.coach-title')).toHaveText('التدريب المهني · التدريب الحياتي');
    await expect(page.locator('.coach-price')).toHaveText('ابتداءً من 600 جنيه');
    await expect(page.locator('.coach-stats dt')).toHaveText(['التقييم', 'سنوات الخبرة', 'التقييمات']);
    await expect(page.locator('.coach-facts dd').first()).toHaveText('العربية، الإنجليزية');
    await expect(page.locator('.coach-open')).toHaveText('افتح في رفيق');
    await expect(page.locator('.lang')).toHaveAttribute('href', '/c/k7m2qx');
    // Only the coach's own words may be Latin (a credential here).
    const chrome = await page.evaluate(() => {
      const main = document.querySelector('main').cloneNode(true);
      main.querySelectorAll('bdi').forEach((b) => b.remove());
      return main.innerText;
    });
    expect(chrome).not.toMatch(/[A-Za-z]{3,}/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('it asks the database for that one code, as anyone, and nothing else', async () => {
  const { calls } = await handle({ code: ' K7M2QX ' });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://proj.supabase.test/rest/v1/rpc/public_coach_page');
  expect(calls[0].init.method).toBe('POST');
  expect(calls[0].init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer anon-key' });
  expect(JSON.parse(calls[0].init.body)).toEqual({ p_code: 'k7m2qx' });
});

test('a coach\'s words are text, never markup', async ({ page }) => {
  const { result } = await handle({
    coach: {
      ...COACH,
      full_name: '<img src=x onerror="window.hit=1">Dina',
      bio: '<script>window.hit=2</script>Hello',
      title: '"><b>Career</b>',
      languages: ['<i>x</i>'],
      certifications: ['<a href="https://evil.test">ICF</a>'],
    },
  });
  await show(page, result);
  expect(await page.locator('main img, main script, main b, main i, main a:not(.coach-open)').count()).toBe(0);
  await expect(page.locator('.coach-name')).toContainText('<img src=x onerror="window.hit=1">Dina');
  await expect(page.locator('main p[dir="auto"]')).toHaveText('<script>window.hit=2</script>Hello');
  expect(await page.evaluate(() => window.hit)).toBeUndefined();
});

test('not available looks the same however it came about, and a bad code isn\'t even asked', async () => {
  const malformed = await handle({ code: 'k7m2q0' });
  expect(malformed.calls).toHaveLength(0);
  expect(malformed.result.status).toBe(404);
  const unknown = await handle({ coach: null });
  expect(unknown.calls).toHaveLength(1);
  expect(unknown.result.status).toBe(404);
  expect(unknown.result.body).toBe(malformed.result.body);
  expect(unknown.result.body).toContain('This page isn’t available');
  expect(unknown.result.body).not.toContain('k7m2qx');
  const ar = await handle({ lang: 'ar', coach: null });
  expect(ar.result.body).toContain('هذه الصفحة غير متاحة');
});

test('the database failing is an error, not "not available", and isn\'t cached', async () => {
  for (const rpc of [500, 'throw']) {
    const { result } = await handle({ rpc });
    expect(result.status).toBe(503);
    expect(result.body).toContain('Something went wrong');
    expect(result.headers['Cache-Control']).toBe('no-store');
  }
});

test('the site\'s security headers, kept out of search results, cached for a minute', async () => {
  const { result } = await handle();
  const h = result.headers;
  expect(h['Content-Security-Policy']).toBe("default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  expect(h['X-Frame-Options']).toBe('DENY');
  expect(h['Referrer-Policy']).toBe('no-referrer');
  expect(h['X-Robots-Tag']).toBe('noindex');
  expect(h['Cache-Control']).toBe('public, max-age=60');
  expect(result.body).toContain('<meta name="robots" content="noindex">');
  // The same policy the static pages get from _headers.
  expect(readFileSync(join(ROOT, 'site/_headers'), 'utf8')).toContain(`Content-Security-Policy: ${h['Content-Security-Policy']}`);
});

test('store links appear once they are set, and only real https ones', async ({ page }) => {
  const { result } = await handle({
    env: { ...ENV, APP_STORE_URL: 'https://apps.apple.com/app/id1', PLAY_STORE_URL: 'javascript:alert(1)' },
  });
  await show(page, result);
  await expect(page.locator('.coach-stores a')).toHaveText(['App Store']);
  await expect(page.locator('.coach-stores a')).toHaveAttribute('href', 'https://apps.apple.com/app/id1');
  await expect(page.locator('.coach-soon')).toHaveCount(0);
});

test('fewer than three reviews reads "New", as in the app; no price, bio or facts, no empty sections', async ({ page }) => {
  const { result } = await handle({
    coach: { ...COACH, rating_count: 2, rating_avg: 5, from_price: null, bio: '  ', languages: [], certifications: [], session_mode: null, experience_years: 0, verified: false },
  });
  await show(page, result);
  await expect(page.locator('.coach-stats dd')).toHaveText(['New', '—', '2']);
  await expect(page.locator('.coach-price, .coach-facts, .coach-verified, main h2:text("About")')).toHaveCount(0);
});

test('the words it shares with the app are the app\'s, from i18n.ts', async ({ page }) => {
  await page.goto('/');
  const { fresh, committed } = await page.evaluate(async () => {
    const { translate } = await import('/src/lib/i18n.ts');
    const { SPECIALTIES } = await import('/src/lib/specialties.ts');
    const { MIN_REVIEWS_FOR_RATING } = await import('/src/lib/mockStore.ts');
    const site = await import('/site/coach-page-strings.mjs');
    const pick = (lang) => {
      const out = {};
      for (const k of Object.keys(site.STRINGS[lang])) {
        if (typeof site.STRINGS[lang][k] === 'string') out[k] = translate(lang, k);
      }
      out.specialties = Object.fromEntries(SPECIALTIES.map((s) => [s.value, translate(lang, s.labelKey)]));
      out.languages = { Arabic: translate(lang, 'discoverLanguageArabic'), English: translate(lang, 'discoverLanguageEnglish'), French: translate(lang, 'discoverLanguageFrench') };
      return out;
    };
    return {
      fresh: { min: MIN_REVIEWS_FOR_RATING, en: pick('en'), ar: pick('ar') },
      committed: { min: site.MIN_REVIEWS_FOR_RATING, en: site.STRINGS.en, ar: site.STRINGS.ar },
    };
  });
  expect(committed, 'site/coach-page-strings.mjs is behind i18n.ts: run npm run build:site').toEqual(fresh);
});

test('both addresses are routed, each in its language', () => {
  const en = join(ROOT, 'site/functions/c/[code].js');
  const ar = join(ROOT, 'site/functions/ar/c/[code].js');
  expect(existsSync(en) && existsSync(ar)).toBe(true);
  expect(readFileSync(en, 'utf8')).toContain("respond(context, 'en')");
  expect(readFileSync(ar, 'utf8')).toContain("respond(context, 'ar')");
});
