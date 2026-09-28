import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 2: the signed-in user's own profile and
 * onboarding on profiles / coach_profiles / member_profiles, through
 * tests/fakeSupabase.js. What each write may touch is proven against the
 * real schema by supabase/tests/07_profiles.sql; these check the screens —
 * that they read the real rows, write the right ones, and show loading and
 * error states instead of stale or default data.
 */

const UID = 'user-123';

const coachTables = ({ coach = true, signedUp = true, verification = 'unverified', cover = null } = {}) => ({
  profiles: [{
    id: UID, full_name: 'Rana Coach', phone: '10 555 0000', country_code: '+20', email: 'rana@x.com',
    country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null, account_status: 'active',
  }],
  coach_profiles: coach ? [{
    profile_id: UID, title: 'Nutrition', cert: 'ICF', bio: 'Real bio', languages: ['Arabic'], session_mode: 'online',
    experience_years: 4, certifications: ['ICF'], cover_photo_url: cover, verification_status: verification,
    signup_completed_at: signedUp ? '2026-09-01T00:00:00Z' : null,
  }] : [],
});

async function open(browser, { screen, role = 'coach', lang = 'en', dark = false, tables, fail, signedIn = true, before } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([r, l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [role, lang, dark]);
  await page.reload();
  await installFakeSupabase(page, { tables, fail });
  if (before) await before(page);
  if (signedIn) await signIn(page, UID);
  if (screen) {
    await page.evaluate(async (s) => {
      const m = await import('/src/store/appStore.ts');
      m.useAppStore.getState().nav(s);
    }, screen);
    await page.waitForTimeout(400);
  }
  return { page, ctx, errs };
}

const screenText = (page) => page.locator('.phone-frame').first().innerText();
const currentScreen = (page) => page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen);
const mockProfile = (page) => page.evaluate(async () => (await import('/src/lib/mockStore.ts')).getCoachProfile());
const writesTo = async (page, table, op) => (await dbCalls(page)).filter((c) => c.table === table && c.op === op);

// Everything the app is allowed to write, per the grants in 0004/0005/0006.
const WRITABLE = {
  profiles: ['full_name', 'email', 'phone', 'country_code', 'country', 'country_flag', 'city', 'avatar_photo_url'],
  coach_profiles: ['profile_id', 'title', 'cert', 'bio', 'languages', 'session_mode', 'experience_years', 'certifications', 'cover_photo_url', 'signup_completed_at'],
  member_profiles: ['profile_id', 'goal', 'focus', 'signup_completed_at'],
};
async function expectOnlyGrantedColumns(page) {
  for (const call of await dbCalls(page)) {
    if (!(call.table in WRITABLE) || (call.op !== 'update' && call.op !== 'insert')) continue;
    for (const col of Object.keys(call.values)) {
      expect.soft(WRITABLE[call.table], `${call.op} ${call.table}.${col} is a granted column`).toContain(col);
    }
  }
}

// --- Reading -----------------------------------------------------------------

test('signed out, the profile screens still read mockStore, with no loading step', async ({ browser }) => {
  // CI's state: configured (placeholder credentials) but never signed in.
  const { page, ctx, errs } = await open(browser, { screen: 'profile', tables: coachTables(), signedIn: false });
  expect.soft(await page.locator('.load-state').count(), 'no loading screen').toBe(0);
  expect.soft((await page.locator('.profile-name').innerText()).trim()).toBe('Yasmin El-Sayed');
  expect.soft((await dbCalls(page)).length, 'nothing asked of Supabase').toBe(0);
  await ctx.close();
  expect.soft(errs).toEqual([]);
});

// What each screen shows of the profile — AccountDetails is the sign-in
// email and phone, the other three lead with the name.
const SHOWS = { profile: 'Rana Coach', accountDetails: 'rana@x.com', previewProfile: 'Rana Coach', shareProfile: 'Rana Coach' };
for (const [screen, marker] of Object.entries(SHOWS)) {
  test(`signed in, ${screen} shows the real profile row, not the demo coach`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { screen, tables: coachTables() });
    const text = await screenText(page);
    expect.soft(text, 'from the real row').toContain(marker);
    expect.soft(text, 'no demo identity').not.toMatch(/Yasmin|yasmin\.elsayed/);
    await ctx.close();
    expect.soft(errs).toEqual([]);
  });
}

test('Profile reads verification_status from coach_profiles', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'profile', tables: coachTables({ verification: 'verified' }) });
  const badge = page.locator('.profile-row', { hasText: 'Verification' }).locator('.profile-row-badge');
  expect.soft((await badge.innerText()).trim()).toBe('Verified');
  // mockStore still says unverified — the badge isn't coming from there.
  expect.soft(await page.evaluate(async () => (await import('/src/lib/mockStore.ts')).getVerificationStatus())).toBe('unverified');
  await ctx.close();
});

test('a coach who has not onboarded yet gets an empty profile, not an error', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile', tables: coachTables({ coach: false }) });
  expect.soft(await page.locator('.load-state').count()).toBe(0);
  expect.soft((await page.locator('.profile-name').innerText()).trim()).toBe('Rana Coach');
  await ctx.close();
  expect.soft(errs).toEqual([]);
});

test('a failed load shows an error with a working retry — never the demo data', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile', tables: coachTables(), fail: ['profiles'] });

  expect.soft(await page.locator('.load-state[role="alert"]').count(), 'error state').toBe(1);
  expect.soft(await screenText(page)).not.toContain('Yasmin');

  await setFailing(page, []);
  await page.locator('.load-state button', { hasText: 'Try again' }).click();
  await page.waitForTimeout(300);
  expect.soft((await page.locator('.profile-name').innerText()).trim(), 'loaded on retry').toBe('Rana Coach');

  await ctx.close();
  expect.soft(errs).toEqual([]);
});

test('the error state in Arabic and dark mode', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'editProfile', tables: coachTables(), fail: ['profiles'], lang: 'ar', dark: true });

  expect.soft(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect.soft(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  const text = await screenText(page);
  expect.soft(text).toContain('تعذّر التحميل');
  expect.soft(text).toContain('حاول مرة أخرى');
  expect.soft(/[A-Za-z]{3,}/.test(text), `no English in "${text}"`).toBe(false);
  // Not a tab root, so it offers a way back.
  expect.soft(await page.locator('.load-state-back').count()).toBe(1);

  await ctx.close();
  expect.soft(errs).toEqual([]);
});

// --- Edit Profile -----------------------------------------------------------------

test('Edit Profile saves to profiles + coach_profiles and uploads the photo to a path', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'editProfile', tables: coachTables() });
  const before = await mockProfile(page);

  expect.soft(await page.locator('#epname').inputValue(), 'prefilled from the real row').toBe('Rana Coach');
  expect.soft(await page.locator('#epbio').inputValue()).toBe('Real bio');

  await page.locator('#epname').fill('Rana Khalil');
  await page.locator('#epbio').fill('Helping people eat well');
  await page.locator('#avatarFileInput').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.alloc(2048, 1) });
  await page.waitForTimeout(150);
  await page.locator('.edit-profile-save').click();
  await page.waitForTimeout(500);

  const [person] = await dbRows(page, 'profiles');
  const [coach] = await dbRows(page, 'coach_profiles');
  expect.soft(person.full_name).toBe('Rana Khalil');
  expect.soft(person.avatar_photo_url, 'an object path, not a URL').toBe(`${UID}/avatar`);
  expect.soft(coach.bio).toBe('Helping people eat well');
  expect.soft(coach.verification_status, 'untouched').toBe('unverified');

  const uploads = (await dbCalls(page)).filter((c) => c.op === 'storage.upload');
  expect.soft(uploads.map((u) => [u.bucket, u.path, u.contentType])).toEqual([['avatars', `${UID}/avatar`, 'image/png']]);

  expect.soft(await currentScreen(page), 'back on Profile').toBe('profile');
  expect.soft((await page.locator('.profile-name').innerText()).trim(), 'showing the saved name without a refetch').toBe('Rana Khalil');
  expect.soft(await mockProfile(page), 'mockStore untouched').toEqual(before);

  await expectOnlyGrantedColumns(page);
  await ctx.close();
  expect.soft(errs).toEqual([]);
});

test('Edit Profile: removing the cover clears the column and deletes the object', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'editProfile', tables: coachTables({ cover: `${UID}/cover` }) });

  await page.locator('.edit-profile-cover-remove').click();
  await page.locator('.edit-profile-save').click();
  await page.waitForTimeout(500);

  expect.soft((await dbRows(page, 'coach_profiles'))[0].cover_photo_url).toBe(null);
  expect.soft((await dbCalls(page)).filter((c) => c.op === 'storage.remove').map((c) => [c.bucket, c.paths])).toEqual([['covers', [`${UID}/cover`]]]);
  expect.soft(await writesTo(page, 'profiles', 'update').then((w) => 'avatar_photo_url' in w[0].values), 'avatar left alone').toBe(false);

  await ctx.close();
  expect.soft(errs).toEqual([]);
});

for (const lang of ['en', 'ar']) {
  test(`Edit Profile: a photo over 5 MB is refused when picked, and the current photo stays (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { screen: 'editProfile', tables: coachTables(), lang });

    await page.locator('#avatarFileInput').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1) });
    await page.waitForTimeout(200);

    const error = (await page.locator('.edit-profile-error').innerText()).trim();
    expect.soft(error).toBe(lang === 'en' ? 'That photo is too large. Choose one under 5 MB.' : 'هذه الصورة كبيرة جدًا. اختر صورة أقل من 5 ميجابايت.');
    expect.soft(await page.locator('.edit-profile-avatar-img').count(), 'no preview of the refused photo').toBe(0);

    // Saving now changes nothing about the photo, and uploads nothing.
    await page.locator('.edit-profile-save').click();
    await page.waitForTimeout(400);
    expect.soft((await dbCalls(page)).filter((c) => c.op === 'storage.upload').length).toBe(0);
    expect.soft('avatar_photo_url' in ((await writesTo(page, 'profiles', 'update'))[0]?.values ?? {}), 'avatar column untouched').toBe(false);

    await ctx.close();
    expect.soft(errs).toEqual([]);
  });
}

test('Edit Profile: a photo of the wrong type is refused when picked', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'editProfile', tables: coachTables() });
  await page.locator('#coverFileInput').setInputFiles({ name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.alloc(1024, 1) });
  await page.waitForTimeout(200);
  expect.soft((await page.locator('.edit-profile-error').innerText()).trim()).toBe('Use a JPEG, PNG or WebP photo.');
  expect.soft(await page.locator('.edit-profile-cover-img').count(), 'no preview').toBe(0);
  await ctx.close();
  expect.soft(errs).toEqual([]);
});

// --- Onboarding -----------------------------------------------------------------

test('coach onboarding creates the coach_profiles row and marks signup complete', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'onboarding', tables: coachTables({ coach: false }) });

  await page.locator('#oname').fill('Rana Coach');
  await page.locator('#ophone').fill('10 555 0000');
  await page.locator('#oemail').fill('rana@x.com');
  await page.locator('#ocity').fill('Alexandria');
  await page.locator('.onboarding-chip').first().click();
  await page.locator('button', { hasText: 'Get Started' }).click();
  await page.waitForTimeout(500);

  const [coach] = await dbRows(page, 'coach_profiles');
  expect.soft(coach?.profile_id).toBe(UID);
  expect.soft(typeof coach?.signup_completed_at, 'a real timestamp').toBe('string');
  expect.soft(coach?.title.length > 0, 'the chosen specialty').toBe(true);
  expect.soft((await dbRows(page, 'profiles'))[0].city).toBe('Alexandria');
  expect.soft(await currentScreen(page)).toBe('main');
  expect.soft((await mockProfile(page)).signupCompletedAtMs, 'mockStore untouched').toBe(null);

  await expectOnlyGrantedColumns(page);
  await ctx.close();
  expect.soft(errs).toEqual([]);
});

test('member onboarding in Arabic stores a stable focus slug, not Arabic text', async ({ browser }) => {
  const tables = { profiles: [{ id: UID, full_name: 'Mona', phone: null, country_code: null, email: null, city: null }] };
  const { page, ctx, errs } = await open(browser, { screen: 'clientOnboarding', role: 'client', lang: 'ar', tables });

  await page.locator('.client-onboarding-chip').nth(1).click(); // Meditation
  await page.locator('#cgoal').fill('أنام أفضل');
  await page.locator('#cwphone').fill('11 222 3333');
  await page.locator('#cemail').fill('mona@x.com');
  await page.locator('#ccity').fill('الجيزة');
  await page.locator('.client-onboarding-screen button, button').filter({ hasText: /ابدأ|Get Started/ }).last().click();
  await page.waitForTimeout(500);

  const [member] = await dbRows(page, 'member_profiles');
  expect.soft(member?.focus, 'the slug').toBe('meditation');
  expect.soft(member?.goal, "the member's own words, as typed").toBe('أنام أفضل');
  expect.soft(typeof member?.signup_completed_at).toBe('string');
  const [person] = await dbRows(page, 'profiles');
  expect.soft([person.phone, person.email, person.city]).toEqual(['11 222 3333', 'mona@x.com', 'الجيزة']);
  expect.soft((await writesTo(page, 'clients', 'update')).length, "the coach's roster row is not the member's to write").toBe(0);
  expect.soft(await currentScreen(page)).toBe('clientHome');

  await expectOnlyGrantedColumns(page);
  await ctx.close();
  expect.soft(errs).toEqual([]);
});

// --- Where a sign-in lands ------------------------------------------------------

async function landAfterSignIn(browser, { role, tables }) {
  const { page, ctx, errs } = await open(browser, {
    role, tables, signedIn: false,
    before: (p) => p.evaluate(async (uid) => {
      const { getSupabase } = await import('/src/lib/supabase.ts');
      const real = getSupabase();
      real.auth.getSession = async () => ({ data: { session: { user: { id: uid } } }, error: null });
      real.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
      const session = await import('/src/lib/session.ts');
      session.resetSessionTracking();
      session.initSession();
    }, UID),
  });
  await page.waitForTimeout(500);
  const screen = await currentScreen(page);
  await ctx.close();
  return { screen, errs };
}

test('sign-in routing reads onboarding state from the database, per role', async ({ browser }) => {
  const cases = [
    ['coach, onboarded', 'coach', coachTables(), 'main'],
    ['coach, not onboarded', 'coach', coachTables({ signedUp: false }), 'onboarding'],
    ['coach, no coach row yet', 'coach', coachTables({ coach: false }), 'onboarding'],
    ['member, onboarded', 'client', { member_profiles: [{ profile_id: UID, goal: 'x', focus: 'life', signup_completed_at: '2026-09-01T00:00:00Z' }] }, 'clientHome'],
    ['member, not onboarded', 'client', { member_profiles: [] }, 'clientOnboarding'],
  ];
  for (const [label, role, tables, want] of cases) {
    const { screen, errs } = await landAfterSignIn(browser, { role, tables });
    expect.soft(screen, label).toBe(want);
    expect.soft(errs, `${label}: no page errors`).toEqual([]);
  }
});
