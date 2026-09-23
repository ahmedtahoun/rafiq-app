import { test, expect } from '@playwright/test';


// `platform: null` = a real browser. Anything else installs Capacitor's
// CustomPlatform hook BEFORE any module loads, which is what makes
// Capacitor.isNativePlatform() true and exercises the native branch.
async function open(browser, platform) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (platform) {
    await page.addInitScript((name) => {
      window.CapacitorCustomPlatform = { name };
    }, platform);
  }
  // Record every window.open — that is what @capacitor/browser's
  // implementation calls, so it stands in for the in-app browser.
  await page.addInitScript(() => {
    window.__opened = [];
    const real = window.open;
    window.open = (url, ...rest) => { window.__opened.push(url); return real.call(window, 'about:blank', ...rest); };
  });
  await page.goto('/');
  await page.waitForTimeout(400);
  return { page, ctx };
}

// Replaces the memoized client's auth methods with recorders, so the real
// signInWithOAuth runs end to end without any network.
const installSpy = (page) => page.evaluate(async () => {
  const { getSupabase } = await import('/src/lib/supabase.ts');
  const auth = getSupabase().auth;
  window.__calls = [];
  auth.signInWithOAuth = async (opts) => {
    window.__calls.push(['signInWithOAuth', opts]);
    return { data: { provider: opts.provider, url: 'https://ref.supabase.co/auth/v1/authorize?provider=' + opts.provider }, error: null };
  };
  auth.exchangeCodeForSession = async (code) => {
    window.__calls.push(['exchangeCodeForSession', code]);
    return { data: { session: null, user: null }, error: null };
  };
  auth.setSession = async (tokens) => {
    window.__calls.push(['setSession', tokens]);
    return { data: { session: null, user: null }, error: null };
  };
});
const calls = (page) => page.evaluate(() => window.__calls);

test('parseAuthCallback (pure)', async ({ browser }) => {
  const { page, ctx } = await open(browser, null);
  const r = await page.evaluate(async () => {
    const m = await import('/src/lib/nativeAuth.ts');
    const cases = [
      ['app.rafiqie.coach://auth-callback?code=abc123&state=s', 'primary scheme, PKCE code'],
      ['app.rafiq.coach://auth-callback?code=abc123', 'legacy scheme (pre-rename build)'],
      ['app.rafiq.coach://auth-callback?error=access_denied&error_description=User+denied', 'provider error'],
      ['app.rafiq.coach://auth-callback#access_token=tok&refresh_token=ref', 'implicit flow, tokens in fragment'],
      ['app.rafiq.coach://auth-callback#error=server_error&error_description=nope', 'error in fragment'],
      ['app.rafiq.coach://auth-callback', 'our scheme+host but nothing on it'],
      ['app.rafiq.coach://some-other-deep-link?code=x', 'our scheme, different host'],
      ['someone.else.app://auth-callback?code=x', 'another app’s scheme'],
      ['https://rafiq.app/auth-callback?code=x', 'an https URL'],
      ['not a url at all', 'garbage'],
      ['app.rafiq.coach://auth-callback?access_token=only', 'access token with no refresh token'],
    ];
    return cases.map(([url, label]) => [label, JSON.stringify(m.parseAuthCallback(url))]);
  });
  const want = {
    'primary scheme, PKCE code': '{"kind":"code","code":"abc123"}',
    'legacy scheme (pre-rename build)': '{"kind":"code","code":"abc123"}',
    'provider error': '{"kind":"error","error":"access_denied","description":"User denied"}',
    'implicit flow, tokens in fragment': '{"kind":"tokens","accessToken":"tok","refreshToken":"ref"}',
    'error in fragment': '{"kind":"error","error":"server_error","description":"nope"}',
    'our scheme+host but nothing on it': '{"kind":"error","error":"invalid_callback","description":""}',
    'our scheme, different host': 'null',
    'another app’s scheme': 'null',
    'an https URL': 'null',
    'garbage': 'null',
    'access token with no refresh token': '{"kind":"error","error":"invalid_callback","description":""}',
  };
  for (const [label, got] of r) expect.soft(String(got), label).toBe(String(want[label]));
  await ctx.close();
});

test('exported constants', async ({ browser }) => {
  const { page, ctx } = await open(browser, null);
  const c = await page.evaluate(async () => {
    const m = await import('/src/lib/nativeAuth.ts');
    return { redirect: m.NATIVE_REDIRECT_URL, schemes: m.AUTH_SCHEMES, host: m.AUTH_CALLBACK_HOST, native: m.isNativePlatform() };
  });
  expect.soft(String(c.redirect), 'NATIVE_REDIRECT_URL').toBe('app.rafiqie.coach://auth-callback');
  expect.soft(String(c.schemes.join(',')), 'answers to both schemes').toBe('app.rafiqie.coach,app.rafiq.coach');
  expect.soft(String(c.native), 'isNativePlatform() in a browser').toBe('false');
  await ctx.close();
});

test('WEB branch (regression: unchanged behaviour)', async ({ browser }) => {
  const { page, ctx } = await open(browser, null);
  await installSpy(page);
  const res = await page.evaluate(async () => {
    const { signInWithOAuth } = await import('/src/lib/auth.ts');
    return await signInWithOAuth('google');
  });
  const [[name, opts]] = await calls(page);
  expect.soft(String(name), 'called supabase signInWithOAuth').toBe('signInWithOAuth');
  expect.soft(String(opts.options.redirectTo), '  redirectTo is the page origin').toBe(new URL(page.url()).origin);
  expect.soft(String(opts.options.skipBrowserRedirect), '  skipBrowserRedirect is false').toBe('false');
  expect.soft(String(res.ok), '  result ok').toBe('true');
  expect.soft(String((await page.evaluate(() => window.__opened)).length), 'no in-app browser opened on web').toBe('0');
  await ctx.close();
});

test('NATIVE branch (iOS)', async ({ browser }) => {
for (const platform of ['ios', 'android']) {
  const { page, ctx } = await open(browser, platform);
  const isNative = await page.evaluate(async () => (await import('/src/lib/nativeAuth.ts')).isNativePlatform());
  expect.soft(String(isNative), `${platform}: isNativePlatform()`).toBe('true');
  await installSpy(page);
  const res = await page.evaluate(async () => {
    const { signInWithOAuth } = await import('/src/lib/auth.ts');
    return await signInWithOAuth('apple');
  });
  const [[, opts]] = await calls(page);
  expect.soft(String(opts.options.redirectTo), `${platform}: redirectTo is the custom scheme`).toBe('app.rafiqie.coach://auth-callback');
  expect.soft(String(opts.options.skipBrowserRedirect), `${platform}: skipBrowserRedirect is true`).toBe('true');
  expect.soft(String(res.ok), `${platform}: result ok`).toBe('true');
  const opened = await page.evaluate(() => window.__opened);
  expect.soft(String(opened.length), `${platform}: opened the authorize URL`).toBe('1');

  expect.soft(String(String(opened[0]).includes('/auth/v1/authorize?provider=apple')), `${platform}:   it is the provider URL`).toBe('true');
  await ctx.close();
}
});

test('explicit redirectTo still wins', async ({ browser }) => {
  const { page, ctx } = await open(browser, 'ios');
  await installSpy(page);
  await page.evaluate(async () => {
    const { signInWithOAuth } = await import('/src/lib/auth.ts');
    await signInWithOAuth('google', 'https://staging.rafiq.app/cb');
  });
  const [[, opts]] = await calls(page);
  expect.soft(String(opts.options.redirectTo), 'caller-supplied redirectTo is honoured').toBe('https://staging.rafiq.app/cb');
  await ctx.close();
});

test('finishOAuthCallback routes each shape', async ({ browser }) => {
  const { page, ctx } = await open(browser, 'ios');
  await installSpy(page);
  const out = await page.evaluate(async () => {
    const { finishOAuthCallback } = await import('/src/lib/auth.ts');
    const code = await finishOAuthCallback({ kind: 'code', code: 'the-code' });
    const tokens = await finishOAuthCallback({ kind: 'tokens', accessToken: 'a', refreshToken: 'r' });
    const err = await finishOAuthCallback({ kind: 'error', error: 'access_denied', description: 'User denied' });
    return { code, tokens, err, calls: window.__calls };
  });
  expect.soft(String(out.calls[0][0]), 'code  -> exchangeCodeForSession').toBe('exchangeCodeForSession');
  expect.soft(String(out.calls[0][1]), '  with the code').toBe('the-code');
  expect.soft(String(out.code.ok), '  ok').toBe('true');
  expect.soft(String(out.calls[1][0]), 'tokens -> setSession').toBe('setSession');
  expect.soft(String(JSON.stringify(out.calls[1][1])), '  with both tokens').toBe('{"access_token":"a","refresh_token":"r"}');
  expect.soft(String(out.calls.length), 'error -> no supabase call').toBe('2');
  expect.soft(String(out.err.ok), '  reports not-ok').toBe('false');
  expect.soft(String(out.err.message), '  carries the description').toBe('User denied');
  await ctx.close();
});

test('web app still loads with the Capacitor imports', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const IGNORE = /ERR_CERT_AUTHORITY_INVALID|favicon\.ico/;
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('auth');
  });
  await page.waitForTimeout(800);
  expect.soft(String(await page.locator('.phone-frame.auth').count()), 'Auth screen renders').toBe('1');
  expect.soft(String(await page.locator('.auth-btn').count()), '  both provider buttons').toBe('2');
  expect.soft(String(errs.length), '  no uncaught errors from the new imports').toBe('0');
  if (errs.length) info('  errors', JSON.stringify(errs));
  await ctx.close();
});
