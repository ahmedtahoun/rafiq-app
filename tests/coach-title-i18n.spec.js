import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';

/**
 * Issue #95, the member's side: My Pro (ClientCoach) printed the coach's
 * stored title raw, so an Arabic screen read "Career coaching". The title
 * is the coach's specialties as English values joined with " · "
 * (EditProfile.tsx); each is now translated, the way Discover does.
 */

const MEMBER = 'member-1';

const tables = (title) => ({
  profiles: [{ id: MEMBER, full_name: 'Hana M.', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' }],
  clients: [{
    id: 'rel-a', coach_id: 'coach-a', member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
    email: null, city: null, program: '', specialty: 'Career coaching', plan: 'Basic', initials: 'HM', avatar_bg: '#3E6FB0',
    active: true, progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null, program_completed: false,
    payment_status: 'due', goal: '', focus: '', signup_completed_at: null, created_at: '2026-09-01T00:00:00Z',
  }],
  coach_directory: [{
    coach_id: 'coach-a', full_name: 'Dina Farouk', title, verified: true, rating_count: 0, rating_avg: null,
    bio: 'Coach.', certifications: [], avatar_photo_url: null, cover_photo_url: null,
  }],
  tasks: [], packages: [], sessions: [], mood_checkins: [],
});

async function open(browser, { lang, title, signedIn = true }) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
  }, lang);
  await page.reload();
  if (signedIn) {
    await installFakeSupabase(page, { userId: MEMBER, tables: tables(title) });
    await signIn(page, MEMBER);
  }
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientCoach'));
  return { page, ctx, errs };
}

const titleOf = (page) => page.locator('.client-coach-title');

test('Arabic: every specialty in the coach\'s title is translated', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', title: 'Career coaching · Life coaching' });
  await expect(titleOf(page)).toHaveText('التدريب المهني · التدريب الحياتي');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('English: the same title reads as stored', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'en', title: 'Career coaching · Life coaching' });
  await expect(titleOf(page)).toHaveText('Career coaching · Life coaching');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic: a value that is not a specialty is shown as stored, isolated; an empty title is Life coaching', async ({ browser }) => {
  let { page, ctx, errs } = await open(browser, { lang: 'ar', title: 'Nutrition coaching · Kite surfing' });
  await expect(titleOf(page)).toHaveText('تدريب التغذية · ⁨Kite surfing⁩');
  expect(errs).toEqual([]);
  await ctx.close();

  ({ page, ctx, errs } = await open(browser, { lang: 'ar', title: '' }));
  await expect(titleOf(page)).toHaveText('التدريب الحياتي');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic, signed out: the demo coach\'s title is translated too', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', signedIn: false });
  await expect(titleOf(page)).toBeVisible();
  await expect(titleOf(page)).not.toContainText(/[A-Za-z]/);
  expect(errs).toEqual([]);
  await ctx.close();
});
