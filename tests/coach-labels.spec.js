import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';

/**
 * Stored English on an Arabic screen, the coach's side.
 *
 * Preview Profile (issue #95) printed the coach's stored specialties and
 * languages raw — "Life coaching", "Arabic" — on the screen captioned
 * "this is what members see". Schedule printed each block's stored label:
 * the database writes a booking's as "Session · {name}" in English, and
 * AddTimeBlock wrote a busy block's in whatever language the coach had on,
 * so either read wrong in the other language. A booked session's length
 * also came from its type ("50 min") rather than its block.
 */

const COACH = 'coach-1';

const tables = () => ({
  profiles: [{ id: COACH, full_name: 'Laila Hafez', phone: '', country_code: '+20', email: 'l@x.com', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null, account_status: 'active', role: 'coach' }],
  coach_profiles: [{
    profile_id: COACH, title: 'Life coaching · Career coaching', cert: '', bio: 'Coach.', languages: ['Arabic', 'English'],
    session_mode: 'online', experience_years: 3, certifications: [], cover_photo_url: null, verification_status: 'unverified',
    signup_completed_at: '2026-09-01T00:00:00Z',
  }],
  clients: [{
    id: 'c-rana', coach_id: COACH, member_id: 'm-rana', full_name: 'Rana Adel', age: null, phone: '', country_code: '+20', email: null, city: null,
    program: '', specialty: 'Life coaching', plan: 'Basic', initials: 'RA', avatar_bg: '#3E6FB0', active: true, progress: 40,
    needs_checkin: false, next_session_at: '2026-09-28T12:00:00Z', next_session_type: 'standard', program_completed: false, payment_status: 'paid',
    goal: '', focus: '', signup_completed_at: null, invite_code: null, invite_expires_at: null, created_at: '2026-09-01T00:00:00Z',
  }],
  client_private: [], tasks: [], packages: [], payments: [], subscriptions: [], offerings: [], session_requests: [], favourites: [],
  weekly_availability: [{ coach_id: COACH, day_of_week: 0, enabled: true, start_hour: 10, end_hour: 18 }],
  time_blocks: [
    // Monday 28 Sep in Cairo: a 60-minute booking at 15:00, labelled the
    // way the database labels it, and busy time saved from an Arabic screen.
    { id: 'tb-1', coach_id: COACH, client_id: 'c-rana', kind: 'booked', label: 'Session · Rana Adel', starts_at: '2026-09-28T12:00:00Z', ends_at: '2026-09-28T13:00:00Z', session_type: 'standard' },
    { id: 'tb-2', coach_id: COACH, client_id: null, kind: 'busy', label: 'غير متاح', starts_at: '2026-09-28T06:00:00Z', ends_at: '2026-09-28T07:00:00Z', session_type: null },
  ],
  sessions: [{ id: 's-1', client_id: 'c-rana', scheduled_at: '2026-09-28T12:00:00Z', time_block_id: 'tb-1', attendance: null, attendance_set_by: null, recap: null }],
});

async function open(browser, { lang, screen }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-09-28T07:00:00Z'));
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
  }, lang);
  await page.reload();
  await installFakeSupabase(page, { userId: COACH, tables: tables() });
  await signIn(page, COACH);
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  return { page, ctx, errs };
}

test('Preview Profile, Arabic: specialties and languages in Arabic, as members see them', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', screen: 'previewProfile' });
  await expect(page.locator('.preview-profile-chip')).toHaveText(['التدريب الحياتي', 'التدريب المهني']);
  await expect(page.locator('.preview-profile-soft-chip')).toHaveText(['العربية', 'الإنجليزية']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Preview Profile, English: the same values read as stored', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'en', screen: 'previewProfile' });
  await expect(page.locator('.preview-profile-chip')).toHaveText(['Life coaching', 'Career coaching']);
  await expect(page.locator('.preview-profile-soft-chip')).toHaveText(['Arabic', 'English']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Schedule, Arabic: a booking reads in Arabic with its real length; busy time is never English', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', screen: 'schedule' });
  const labels = page.locator('.schedule-block-label');
  await expect(labels.filter({ hasText: 'Rana' })).toHaveText('جلسة · ⁨Rana Adel⁩ · 60 دقيقة');
  await expect(page.locator('.phone-frame')).not.toContainText(/Session|Preferred hours|Unavailable/);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Schedule, English: busy time saved from an Arabic screen reads in English', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'en', screen: 'schedule' });
  const labels = page.locator('.schedule-block-label');
  await expect(labels.filter({ hasText: 'Rana' })).toHaveText('Session · ⁨Rana Adel⁩ · 60 min');
  await expect(labels.filter({ hasText: 'Unavailable' })).toHaveCount(1);
  await expect(page.locator('.phone-frame')).not.toContainText('غير متاح');
  expect(errs).toEqual([]);
  await ctx.close();
});
