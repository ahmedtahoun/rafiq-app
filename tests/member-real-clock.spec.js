import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 6, the member's calendars on the real
 * clock. Signed in, booking is a real request from the coach's own page,
 * whose days start at the real today — ClientBooking, the demo's booking
 * screen, is never shown to a signed-in member. Signed out, ClientBooking,
 * ClientSchedule and CoachPreview take the demo's fixed week from TODAY_MS
 * (CLAUDE.md), so the demo doesn't drift with the real date: these tests
 * run in late September 2026, a year after it.
 */

const MEMBER = 'member-1';
// Monday 28 September 2026, noon in Cairo.
const NOW = new Date('2026-09-28T09:00:00Z');

const tables = ({ relationships = true } = {}) => ({
  profiles: [{ id: MEMBER, full_name: 'Hana M.', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' }],
  clients: relationships ? [{
    id: 'rel-a', coach_id: 'coach-a', member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
    email: null, city: null, program: '', specialty: '', plan: '', initials: 'HM', avatar_bg: '#3E6FB0', active: true,
    progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null, program_completed: false,
    payment_status: 'due', goal: '', focus: '', signup_completed_at: null, created_at: '2026-09-01T00:00:00Z',
  }] : [],
  coach_directory: [{
    coach_id: 'coach-a', full_name: 'Dina Farouk', title: 'Career coaching', country: 'Egypt', country_flag: '🇪🇬',
    languages: ['Arabic'], experience_years: 6, verified: true, featured: false, from_price: 600, rating_count: 0,
    rating_avg: null, bio: '', avatar_photo_url: null, session_mode: 'online', certifications: [], cover_photo_url: null,
  }],
  // Monday 9–17.
  weekly_availability: [{ coach_id: 'coach-a', day_of_week: 0, enabled: true, start_hour: 9, end_hour: 17 }],
  tasks: [], mood_checkins: [], packages: [], sessions: [], offerings: [], session_requests: [], coach_reviews: [],
});

async function open(browser, { lang = 'en', signedIn = true, data = tables(), screen = 'clientBooking' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
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
  await installFakeSupabase(page, { userId: MEMBER, tables: data });
  if (signedIn) await signIn(page, MEMBER);
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(300);
  return { page, ctx, errs };
}
const frame = (page) => page.locator('.phone-frame').first();
const DEMO = /Yasmin|Oct(ober)? 2[0-6]|2025/;

test('signed in, booking is the coach’s own page on the real clock, never the demo booking screen', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(page.locator('.coach-preview-screen')).toBeVisible();
  await expect(frame(page)).toContainText('Dina Farouk');
  await expect(page.locator('.client-booking-screen')).toHaveCount(0);
  // The picker starts at the real today, Monday 28 September.
  await expect(page.locator('.coach-preview-day-on')).toContainText('28');
  await expect(page.locator('.coach-preview-next-label')).toBeVisible();
  await expect(frame(page)).not.toContainText(DEMO);
  // Back still leaves (no redirect to bounce off).
  expect((await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState())).screen).toBe('clientBooking');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('signed in with no coach yet, booking says how to find one', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ relationships: false }) });
  await expect(page.getByText('No coach yet')).toBeVisible();
  await expect(page.locator('.client-booking-slot')).toHaveCount(0);
  await expect(frame(page)).not.toContainText(DEMO);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('signed out, the demo booking stays on its fixed week whatever the real date', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { signedIn: false });
  await expect(page.locator('.client-booking-screen')).toBeVisible();
  // Mon 20 and Tue 21 October 2025 have passed; Wed 22 is today and picked.
  const cells = page.locator('.client-booking-cell-open');
  await expect(cells.first()).toHaveText(/^22/);
  await expect(page.locator('.client-booking-cell-on')).toHaveText(/^22/);
  await page.locator('.client-booking-slot:not(.client-booking-slot-off)').first().click();
  await page.getByRole('button', { name: /^Request / }).click();
  await expect(page.getByText('Request sent!')).toBeVisible();
  await expect(page.locator('.client-booking-confirmed')).toContainText(/Wed, Oct 22/i);
  const ics = decodeURIComponent(await page.locator('a[download="session.ics"]').getAttribute('href'));
  expect(ics).toMatch(/DTSTART:20251022T/);
  expect(errs).toEqual([]);
  await ctx.close();
});

// The signed-out demo coach page was removed with the fictional coaches
// (#101), so its fixed-week check went with it; signed out, every coach link
// now shows "not available" (tests/discover.spec.js).
