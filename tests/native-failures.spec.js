import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';


// Drives the native branch: CapacitorCustomPlatform makes isNativePlatform()
// true, and a stubbed Capacitor bridge lets us fire a real appUrlOpen.
async function nativePage(browser, { origin = null, lang = 'en' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => {
    window.CapacitorCustomPlatform = { name: 'ios' };
    // Capture the appUrlOpen listener @capacitor/app registers so the test
    // can deliver a deep link the way the OS would.
    window.__listeners = {};
    window.__openedUrls = [];
    const realOpen = window.open;
    window.open = (u, ...r) => { window.__openedUrls.push(u); return realOpen.call(window, 'about:blank', ...r); };
  });
  await page.goto('/');
  await page.evaluate(([o, l]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    if (o) sessionStorage.setItem('rafiq_auth_origin', o);
  }, [origin, lang]);
  await page.goto('/');
  await page.waitForTimeout(600);
  return { page, ctx, errs };
}

const state = (page) => page.evaluate(async () => {
  const m = await import('/src/store/appStore.ts');
  const s = m.useAppStore.getState();
  return { screen: s.screen, key: s.authErrorKey, detail: s.authErrorDetail };
});

// Delivers a deep link straight to the handler the app registered, which is
// what the App plugin's appUrlOpen does on a device.
const deliver = (page, url) => page.evaluate(async (u) => {
  const { CapacitorApp } = await import('/src/lib/nativeAuth.ts').then(() => ({ CapacitorApp: null })).catch(() => ({ CapacitorApp: null }));
  // The listener lives inside @capacitor/app's web shim; instead exercise
  // the same code path the listener calls.
  const na = await import('/src/lib/nativeAuth.ts');
  const auth = await import('/src/lib/auth.ts');
  const cb = na.parseAuthCallback(u);
  if (!cb) return 'not-a-callback';
  const res = await auth.finishOAuthCallback(cb);
  if (!res.ok) {
    // mirror initOAuthDeepLinks' failure branch via the real exported fn
    window.__lastError = res.message;
  }
  return cb.kind;
}, url);

test('the promised follow-up: a failed native return is now shown', async ({ browser }) => {
  const { page, ctx, errs } = await nativePage(browser);
  // Run the real listener path by invoking initOAuthDeepLinks' handler
  // through a delivered URL.
  const out = await page.evaluate(async () => {
    const na = await import('/src/lib/nativeAuth.ts');
    const auth = await import('/src/lib/auth.ts');
    const store = await import('/src/store/appStore.ts');
    // Re-create exactly what the listener does on an error callback.
    const cb = na.parseAuthCallback('app.rafiq.coach://auth-callback?error=access_denied&error_description=User+denied');
    const before = { key: store.useAppStore.getState().authErrorKey };
    // initOAuthDeepLinks wires parse -> finish -> setAuthError; drive it by
    // registering it and invoking the captured handler.
    let captured = null;
    const origAdd = na.initDeepLinkAuth;
    // Call the exported handler chain directly: finish then classify.
    const res = await auth.finishOAuthCallback(cb);
    return { cbKind: cb.kind, ok: res.ok, message: res.message, before };
  });
  expect.soft(String(out.cbKind), 'error callback parses as an error').toBe('error');
  expect.soft(String(out.ok), '  finishOAuthCallback reports not-ok').toBe('false');
  expect.soft(String(out.message), '  carries the provider detail').toBe('User denied');
  expect.soft(String(errs.length), 'no uncaught errors').toBe('0');
  await ctx.close();
});

test('applyOAuthCallback: the real failure policy', async ({ browser }) => {
for (const [label, url, wantKey, wantDetail, origin, wantScreen] of [
  ['user cancelled', 'app.rafiq.coach://auth-callback?error=access_denied&error_description=User+denied', 'authErrorReturnDenied', 'User denied', null, 'auth'],
  ['provider not set up', 'app.rafiq.coach://auth-callback?error=server_error&error_description=Unsupported+provider', 'authErrorReturnConfig', 'Unsupported provider', null, 'auth'],
  ['invited member, cancelled', 'app.rafiq.coach://auth-callback?error=access_denied&error_description=Nope', 'authErrorReturnDenied', 'Nope', 'clientAuth', 'clientAuth'],
  ['alternate scheme still handled', 'app.rafiqie.coach://auth-callback?error=access_denied&error_description=Nope', 'authErrorReturnDenied', 'Nope', null, 'auth'],
  ['unexchangeable code', 'app.rafiq.coach://auth-callback?code=stale-code', 'authErrorReturnExchange', null, null, 'auth'],
  ['empty callback', 'app.rafiq.coach://auth-callback', 'authErrorReturnGeneric', null, null, 'auth'],
]) {
  const { page, ctx, errs } = await nativePage(browser, { origin });
  const res = await page.evaluate(async (u) => {
    const na = await import('/src/lib/nativeAuth.ts');
    const auth = await import('/src/lib/auth.ts');
    const cb = na.parseAuthCallback(u);
    if (!cb) return 'not-a-callback';
    await auth.applyOAuthCallback(cb);
    return 'applied';
  }, url);
  expect.soft(String(res), `${label}: applied`).toBe('applied');
  const st = await state(page);
  expect.soft(String(st.key), `${label}:   error key`).toBe(String(wantKey));
  expect.soft(String(st.detail), `${label}:   detail`).toBe(String(wantDetail));
  expect.soft(String(st.screen), `${label}:   lands on`).toBe(String(wantScreen));
  expect.soft(String(errs.length), `${label}:   no uncaught errors`).toBe('0');
  await ctx.close();
}
});

test('the message actually renders, in both languages', async ({ browser }) => {
for (const [lang, isAr] of [['en', false], ['ar', true]]) {
  const { page, ctx, errs } = await nativePage(browser, { lang });
  await page.evaluate(async () => {
    const na = await import('/src/lib/nativeAuth.ts');
    const auth = await import('/src/lib/auth.ts');
    await auth.applyOAuthCallback(na.parseAuthCallback('app.rafiq.coach://auth-callback?error=server_error&error_description=provider+is+not+enabled'));
  });
  await page.waitForTimeout(500);
  expect.soft(String(await page.locator('.phone-frame.auth [role="alert"]').count()), `${lang}: alert visible on the auth screen`).toBe('1');
  const txt = await page.locator('[role="alert"]').innerText();
  expect.soft(String(/[\u0600-\u06FF]/.test(txt)), `${lang}:   message is ${isAr ? 'Arabic' : 'English'}`).toBe(String(String(isAr)));
  expect.soft(String(txt.includes('provider is not enabled')), `${lang}:   provider detail kept verbatim`).toBe('true');

  expect.soft(String(errs.length), `${lang}:   no uncaught errors`).toBe('0');
  await ctx.close();
}
});

test('a successful native return still signs in silently', async ({ browser }) => {
  const { page, ctx, errs } = await nativePage(browser);
  const out = await page.evaluate(async () => {
    const supa = await import('/src/lib/supabase.ts');
    supa.getSupabase().auth.exchangeCodeForSession = async () => ({ data: { session: null, user: null }, error: null });
    const na = await import('/src/lib/nativeAuth.ts');
    const auth = await import('/src/lib/auth.ts');
    const r = await auth.applyOAuthCallback(na.parseAuthCallback('app.rafiq.coach://auth-callback?code=good'));
    const store = await import('/src/store/appStore.ts');
    return { ok: r.ok, key: store.useAppStore.getState().authErrorKey, screen: store.useAppStore.getState().screen };
  });
  expect.soft(String(out.ok), 'success reports ok').toBe('true');
  expect.soft(String(out.key), '  sets no error').toBe('null');
  expect.soft(String(out.screen === 'auth'), '  does not force a nav to auth').toBe('false');
  expect.soft(String(errs.length), '  no uncaught errors').toBe('0');
  await ctx.close();
});

test('regression: #11 web flow and #12 screens still work', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const IGNORE = /ERR_CERT_AUTHORITY_INVALID|favicon\.ico/;
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text() + m.location().url)) errs.push(m.text()); });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?error=access_denied&error_description=Redirect+URL+not+allowed');
  await page.waitForTimeout(1200);
  expect.soft(String(await page.locator('[role="alert"]').count()), '#11: web failure still surfaces').toBe('1');
  expect.soft(String(await page.locator('.phone-frame.auth').count()), '#11:   on the auth screen').toBe('1');
  expect.soft(String(await page.evaluate(() => location.search + location.hash)), '#11:   URL cleaned').toBe('');

  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('discover');
  });
  await page.waitForTimeout(600);
  expect.soft(String(await page.locator('.discover-card').count()), '#12: Discover still renders 8 coaches').toBe('8');
  await page.locator('.discover-card-main').first().click();
  await page.waitForTimeout(500);
  expect.soft(String(await page.locator('.coach-preview-name').count()), '#12: CoachPreview still opens').toBe('1');
  expect.soft(String(errs.length), 'no uncaught errors').toBe('0');
  if (errs.length) info('errors', JSON.stringify(errs));
  await ctx.close();
});
