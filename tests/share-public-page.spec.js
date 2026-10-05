import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls } from './fakeSupabase.js';

/**
 * The app half of a coach's public page (0026, rafiqpro.com/c/<code>):
 * the switch on Share Profile, the link and what can be done with it, the
 * Share button back on Profile, and a page's "Open in Rafiq Pro" landing in
 * the app (src/lib/coachLinks.ts).
 */

const COACH = 'coach-1';
const MEMBER = 'member-1';

const coachTables = ({ on = false, code = null } = {}) => ({
  profiles: [{ id: COACH, full_name: 'Dina Farouk', role: 'coach', account_status: 'active', phone: '', country_code: '+20', email: 'd@x.com', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null }],
  coach_profiles: [{
    profile_id: COACH, title: 'Career coaching', cert: '', bio: 'Helps people find work they love.', languages: [], session_mode: 'online', experience_years: 2,
    certifications: [], cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z', public_page: on, public_code: code,
  }],
  clients: [], client_private: [], tasks: [], subscriptions: [], ratings: [], payouts: [], messages: [], message_reads: [], session_requests: [], offerings: [],
});

const memberTables = () => ({
  ...coachTables({ on: true, code: 'k7m2qx' }),
  profiles: [
    ...coachTables().profiles,
    { id: MEMBER, full_name: 'Hana Mostafa', role: 'client', account_status: 'active', phone: '', country_code: '+20', email: 'h@x.com' },
  ],
  member_profiles: [{ profile_id: MEMBER, goal: '', focus: 'career', signup_completed_at: '2026-09-01T00:00:00Z' }],
});

const COPY = {
  en: { title: 'Public page', off: 'Turn it on to get a link you can send to anyone.', share: 'Share link', view: 'View page' },
  ar: { title: 'الصفحة العامة', off: 'فعّلها لتحصل على رابط ترسله لمن تريد.', share: 'مشاركة الرابط', view: 'عرض الصفحة' },
};

async function open(browser, { role = 'coach', lang = 'en', dark = false, data, signedIn = true, uid, platform } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await installScreenSettle(page);
  // A "phone": Capacitor's CustomPlatform hook, as native-back.spec.js uses.
  if (platform) await page.addInitScript((name) => { window.CapacitorCustomPlatform = { name }; }, platform);
  await page.goto('/');
  await page.evaluate(([r, l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [role, lang, dark]);
  await page.reload();
  const who = uid ?? (role === 'coach' ? COACH : MEMBER);
  if (signedIn) {
    await installFakeSupabase(page, { userId: who, tables: data ?? coachTables() });
    await signIn(page, who);
  }
  return { page, ctx, errs };
}

async function go(page, target) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), target);
  await page.evaluate(() => window.__screenSettled());
}
const rpcs = async (page, fn) => (await dbCalls(page)).filter((c) => c.op === 'rpc' && c.fn === fn).map((c) => c.args);
const screen = (page) => page.evaluate(async () => {
  const s = (await import('/src/store/appStore.ts')).useAppStore.getState();
  return { screen: s.screen, params: s.params };
});

for (const lang of ['en', 'ar']) {
  for (const dark of [false, true]) {
    test(`off until the coach turns it on, saying what it shows (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
      const { page, ctx, errs } = await open(browser, { lang, dark });
      await go(page, 'shareProfile');
      const sw = page.getByRole('switch', { name: COPY[lang].title });
      await expect(sw).toHaveAttribute('aria-checked', 'false');
      await expect(page.locator('.share-profile-public-body')).toBeVisible();
      await expect(page.locator('.share-profile-chip').first()).toHaveText(lang === 'ar' ? 'التدريب المهني' : 'Career coaching');
      await expect(page.locator('.share-profile-public-note')).toHaveText(COPY[lang].off);
      await expect(page.locator('.share-profile-link')).toHaveCount(0);
      // No pretend QR code and no pretend share sheet any more.
      await expect(page.locator('.share-profile-qr, .share-profile-sheet, svg[role="img"]')).toHaveCount(0);
      expect(await rpcs(page, 'set_public_page')).toEqual([]);

      await sw.click();
      await expect(sw).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.share-profile-link')).toHaveText('rafiqpro.com/c/k7m2qx');
      await expect(page.locator('.share-profile-link')).toHaveAttribute('dir', 'ltr');
      await expect(page.getByRole('button', { name: COPY[lang].share })).toBeVisible();
      await expect(page.getByRole('button', { name: COPY[lang].view })).toBeVisible();
      expect(await rpcs(page, 'set_public_page')).toEqual([{ p_on: true }]);
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('off again hides the link; on again shows the same one', async ({ browser }) => {
  const { page, ctx } = await open(browser, { data: coachTables({ on: true, code: 'k7m2qx' }) });
  await go(page, 'shareProfile');
  const sw = page.getByRole('switch', { name: 'Public page' });
  await expect(page.locator('.share-profile-link')).toHaveText('rafiqpro.com/c/k7m2qx');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.share-profile-link')).toHaveCount(0);
  await page.evaluate(() => { window.__fake.publicCode = 'zzzzzz'; });
  await sw.click();
  await expect(page.locator('.share-profile-link')).toHaveText('rafiqpro.com/c/k7m2qx');
  expect(await rpcs(page, 'set_public_page')).toEqual([{ p_on: false }, { p_on: true }]);
  await ctx.close();
});

test('copy, share and view all use the real link', async ({ browser }) => {
  const { page, ctx } = await open(browser, { data: coachTables({ on: true, code: 'k7m2qx' }) });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => {
    window.__opened = [];
    window.open = (url, target, features) => { window.__opened.push([url, target, features]); return null; };
    window.__shared = [];
    navigator.share = async (data) => { window.__shared.push(data); };
  });
  await go(page, 'shareProfile');
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('.share-profile-toast')).toHaveText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://rafiqpro.com/c/k7m2qx');
  await page.getByRole('button', { name: 'Share link' }).click();
  await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([{ title: 'Dina Farouk', url: 'https://rafiqpro.com/c/k7m2qx' }]);
  await page.getByRole('button', { name: 'View page' }).click();
  expect(await page.evaluate(() => window.__opened)).toEqual([['https://rafiqpro.com/c/k7m2qx', '_blank', 'noopener']]);
  await ctx.close();
});

test('without a share sheet, Share link copies it', async ({ browser }) => {
  const { page, ctx } = await open(browser, { data: coachTables({ on: true, code: 'k7m2qx' }) });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => { delete Navigator.prototype.share; delete navigator.share; });
  await go(page, 'shareProfile');
  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.locator('.share-profile-toast')).toHaveText('Link copied');
  await ctx.close();
});

test('a switch that fails says so and stays off', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await go(page, 'shareProfile');
  await page.evaluate(() => { window.__fake.fail = ['rpc.set_public_page']; });
  const sw = page.getByRole('switch', { name: 'Public page' });
  await sw.click();
  await expect(page.locator('.share-profile-public-error')).toHaveText("Couldn't change your public page. Try again.");
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.share-profile-link')).toHaveCount(0);
  await page.evaluate(() => { window.__fake.fail = []; });
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.share-profile-public-error')).toHaveCount(0);
  await ctx.close();
});

test('a failed read is an error with a retry, never the demo', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await page.evaluate(() => { window.__fake.fail = ['coach_profiles']; });
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('shareProfile'));
  await expect(page.locator('.load-state[role="alert"]')).toBeVisible();
  await expect(page.locator('.share-profile-public')).toHaveCount(0);
  await page.evaluate(() => { window.__fake.fail = []; });
  await page.locator('.load-state button', { hasText: 'Try again' }).click();
  await expect(page.getByRole('switch', { name: 'Public page' })).toHaveAttribute('aria-checked', 'false');
  await ctx.close();
});

test('Profile\'s Share button is back signed in, and opens it; signed out there is no page to share', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await go(page, 'profile');
  await page.locator('.profile-quick-btn', { hasText: 'Share' }).click();
  expect((await screen(page)).screen).toBe('shareProfile');
  await ctx.close();

  const out = await open(browser, { signedIn: false });
  await go(out.page, 'profile');
  await expect(out.page.locator('.profile-quick-btn', { hasText: 'Share' })).toHaveCount(0);
  await go(out.page, 'shareProfile');
  await expect(out.page.getByRole('switch', { name: 'Public page' })).toBeDisabled();
  await expect(out.page.locator('.share-profile-public-note')).toHaveText('Sign in to turn on your public page.');
  await out.ctx.close();
});

// --- Opening a page's link in the app ------------------------------------------------------

test('which links are coach links', async ({ page }) => {
  await page.goto('/');
  const codes = await page.evaluate(async () => {
    const { coachLinkCode } = await import('/src/lib/publicPageData.ts');
    return [
      'app.rafiqie.coach://c/k7m2qx', 'app.rafiqie.coach://c/K7M2QX/', 'https://rafiqpro.com/c/k7m2qx', 'https://rafiqpro.com/ar/c/k7m2qx',
      'https://www.rafiqpro.com/c/k7m2qx/', 'app.rafiqie.coach://auth-callback?code=x', 'app.rafiqie.coach://c/k7m2q0', 'https://evil.test/c/k7m2qx',
      'http://rafiqpro.com/c/k7m2qx', 'app.rafiqie.coach://c/k7m2qx/extra', 'not a url',
    ].map(coachLinkCode);
  });
  expect(codes).toEqual(['k7m2qx', 'k7m2qx', 'k7m2qx', 'k7m2qx', 'k7m2qx', null, null, null, null, null, null]);
});

test('a member opening a page in the app lands on that coach', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { role: 'client', data: memberTables() });
  // The phone hands the app the link, as Capacitor's appUrlOpen does.
  await page.evaluate(async () => {
    const m = await import('/src/lib/coachLinks.ts');
    m.linkSource.native = () => true;
    m.linkSource.listen = (handler) => { window.__openUrl = handler; return () => {}; };
    m.initCoachLinks();
    window.__openUrl('app.rafiqie.coach://c/k7m2qx');
  });
  await expect.poll(() => screen(page)).toEqual({ screen: 'coachPreview', params: { coachId: COACH } });
  expect(await rpcs(page, 'public_coach_page')).toEqual([{ p_code: 'k7m2qx' }]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('on a phone, the app itself listens: the link Capacitor hands it opens the coach', async ({ browser }) => {
  const { page, ctx } = await open(browser, { role: 'client', data: memberTables(), platform: 'android' });
  await expect.poll(() => page.evaluate(async () => {
    const { App } = await import('/@id/@capacitor/app');
    return App.hasListeners('appUrlOpen');
  }), { message: 'App.tsx never started listening for coach links' }).toBe(true);
  await page.evaluate(async () => {
    const { App } = await import('/@id/@capacitor/app');
    await App.notifyListeners('appUrlOpen', { url: 'app.rafiqie.coach://c/k7m2qx' });
  });
  await expect.poll(() => screen(page)).toEqual({ screen: 'coachPreview', params: { coachId: COACH } });
  await ctx.close();
});

test('a page turned off since opens nothing; nor does a coach\'s own tap', async ({ browser }) => {
  const off = await open(browser, { role: 'client', data: { ...memberTables(), coach_profiles: coachTables({ on: false, code: 'k7m2qx' }).coach_profiles } });
  const before = await screen(off.page);
  await off.page.evaluate(async () => (await import('/src/lib/coachLinks.ts')).openCoachLink('app.rafiqie.coach://c/k7m2qx'));
  expect(await screen(off.page)).toEqual(before);
  await off.ctx.close();

  const coach = await open(browser, { data: coachTables({ on: true, code: 'k7m2qx' }) });
  const was = await screen(coach.page);
  expect(await coach.page.evaluate(async () => (await import('/src/lib/coachLinks.ts')).openCoachLink('app.rafiqie.coach://c/k7m2qx'))).toBe(true);
  expect(await screen(coach.page)).toEqual(was);
  expect(await rpcs(coach.page, 'public_coach_page')).toEqual([]);
  await coach.ctx.close();
});

test('signed out, the link waits for the member to sign in, then opens once', async ({ browser }) => {
  const { page, ctx } = await open(browser, { role: 'client', signedIn: false });
  await page.evaluate(async () => (await import('/src/lib/coachLinks.ts')).openCoachLink('https://rafiqpro.com/ar/c/k7m2qx'));
  expect(await page.evaluate(() => localStorage.getItem('rafiq_pending_coach_link'))).toBe('k7m2qx');
  await installFakeSupabase(page, { userId: MEMBER, tables: memberTables() });
  await signIn(page, MEMBER);
  await expect.poll(() => screen(page)).toEqual({ screen: 'coachPreview', params: { coachId: COACH } });
  expect(await page.evaluate(() => localStorage.getItem('rafiq_pending_coach_link'))).toBeNull();
  await ctx.close();
});

test('on the web, nothing listens for app links', async ({ page }) => {
  await page.goto('/');
  const listened = await page.evaluate(async () => {
    const m = await import('/src/lib/coachLinks.ts');
    let n = 0;
    m.linkSource.listen = () => { n++; return () => {}; };
    m.initCoachLinks();
    return n;
  });
  expect(listened).toBe(0);
});
