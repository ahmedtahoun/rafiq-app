import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';

/**
 * LAUNCH-CHECKLIST §2, "Remove the demo identities": signed in, nothing
 * reads the demo member (DEMO_MEMBER_CLIENT_ID, 'sara'). Every demo value
 * lives in localStorage, under a key that is either the demo member's own
 * (agreement_sara, …) or a shared demo store (clients, standing_slots, …),
 * so a signed-in member walking through the member screens may read only
 * their own and the device's keys — and never sees the demo member's words.
 */

const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const tables = ({ goal = '' } = {}) => ({
  profiles: [{ id: MEMBER, full_name: 'Hana M.', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' }],
  clients: [{
    id: 'rel-a', coach_id: 'coach-a', member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
    email: null, city: null, program: '', specialty: 'Nutrition', plan: 'Basic', initials: 'HM', avatar_bg: '#3E6FB0',
    active: true, progress: 40, needs_checkin: false, next_session_at: null, next_session_type: null,
    program_completed: false, payment_status: 'due', goal, focus: '', signup_completed_at: '2026-09-01T00:00:00Z',
    created_at: '2026-09-01T00:00:00Z',
  }],
  coach_directory: [{
    coach_id: 'coach-a', full_name: 'Dina Farouk', title: 'Nutrition coaching', verified: true, rating_count: 0, rating_avg: null,
    bio: '', certifications: [], avatar_photo_url: null, cover_photo_url: null,
  }],
  tasks: [], mood_checkins: [], packages: [], session_requests: [], time_blocks: [], messages: [], ratings: [], coach_reviews: [],
  // Enough on every screen of the walk that each shows real content, not
  // only its empty state: a program, a session to rate, a notification.
  sessions: [{ id: 's-past', client_id: 'rel-a', scheduled_at: '2026-09-21T07:00:00Z', recap: null, attendance: 'attended' }],
  offerings: [{
    id: 'off-reset', coach_id: 'coach-a', name: 'Nutrition Reset', description: '', type: 'program', duration: '8 weeks',
    format: 'online', price: 2400, currency: 'EGP', session_count: 8, active: true, created_at: '2026-08-01T00:00:00Z',
  }],
  enrollments: [{ client_id: 'rel-a', offering_id: 'off-reset', sessions_completed: 2, enrolled_at: '2026-09-10T10:00:00Z', milestone_reviewed_at: null }],
  notifications: [{ id: 'n1', recipient_id: MEMBER, kind: 'message', client_id: 'rel-a', payload: { preview: 'See you Monday' }, read_at: null, created_at: '2026-09-28T08:00:00Z' }],
  member_profiles: [{ profile_id: MEMBER, goal: '', focus: 'nutrition', signup_completed_at: '2026-09-01T00:00:00Z' }],
  weekly_availability: [0, 1, 2, 3, 4].map((d) => ({ coach_id: 'coach-a', day_of_week: d, enabled: true, start_hour: 9, end_hour: 17 })),
});

async function open(browser, { data = tables() } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  // Each screen is its own chunk (App.tsx): wait for the one navigated to,
  // not a fixed delay that could check the previous screen or the spinner.
  await installScreenSettle(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
    localStorage.setItem('rafiq_lang', JSON.stringify('en'));
  });
  await page.reload();
  await installFakeSupabase(page, { userId: MEMBER, tables: data });
  // The thread listens for new messages: a quiet channel, as in
  // messaging-remote.spec.js.
  await page.evaluate(async () => {
    const real = (await import('/src/lib/supabase.ts')).getSupabase();
    real.channel = (name) => ({ name, on() { return this; }, subscribe() { return this; } });
    real.removeChannel = async () => 'ok';
  });
  await signIn(page, MEMBER);
  // Every key the app asks localStorage for from here on.
  await page.evaluate(() => {
    window.__keysRead = [];
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      window.__keysRead.push(key);
      return get.call(this, key);
    };
  });
  return { page, ctx, errs };
}
/** A screen name, or { screen, params } for one that needs a subject. */
async function go(page, target) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), target);
  await page.evaluate(() => window.__screenSettled());
}
const nameOf = (target) => (typeof target === 'string' ? target : target.screen);
const frame = (page) => page.locator('.phone-frame').first();
// The demo member, their coach, the demo's sample goal, and the demo
// coach's catalogue (what Programs, Booking and the coach page would show).
const DEMO = /Sara Ahmed|Yasmin|Feel more in control of life|8-Week Transformation Program|Goal-Setting Workshop|Group Reflection Circle/;

// Every member screen that reads the member's data. Each must be on screen,
// not loading or failed, when it is checked.
const SCREENS = [
  'clientHome', 'clientCoach', 'clientProfile', 'editClientProfile', 'coachMessages', 'clientTasks', 'myCoaches', 'clientSchedule',
  'discover', 'clientNotifications', 'myPrograms', { screen: 'programDetail', params: { offeringId: 'off-reset' } },
  { screen: 'rateCoach', params: { sessionId: 's-past' } }, 'clientBooking', { screen: 'coachPreview', params: { coachId: 'coach-a' } },
];

test('signed in, no member screen reads or shows the demo member', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  for (const target of SCREENS) {
    await go(page, target);
    await expect(page.locator('.load-state'), nameOf(target)).toHaveCount(0);
    await expect(page.locator('.phone-frame'), nameOf(target)).toHaveCount(1);
    await expect(frame(page), nameOf(target)).not.toContainText(DEMO);
  }
  // Only the member's own and the device's: never a demo store, keyed by
  // the demo member or by anything else.
  const read = [...new Set(await page.evaluate(() => window.__keysRead))];
  // Favourites are the member's `favourite_coaches` rows now (#112), so
  // rafiq_fav_coaches, the phone's old copy, is a read like any other.
  const allowed = /^(rafiq_(role|lang|dark|notif_prefs)|rafiq_member_relationship_member-1|rafiq_message_draft_rel-a|sb-.+)$/;
  expect(read.filter((k) => !allowed.test(k))).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Home shows the goal the coach set, and none rather than the demo’s', async ({ browser }) => {
  const withGoal = await open(browser, { data: tables({ goal: 'Eat more greens' }) });
  await go(withGoal.page, 'clientHome');
  await expect(withGoal.page.locator('.client-home-progress-goal')).toHaveText('Eat more greens');
  await withGoal.ctx.close();

  const without = await open(browser);
  await go(without.page, 'clientHome');
  await expect(without.page.locator('.client-home-progress-label')).toBeVisible();
  await expect(without.page.locator('.client-home-progress-goal')).toHaveCount(0);
  expect([...withGoal.errs, ...without.errs]).toEqual([]);
  await without.ctx.close();
});

test('signed out, the demo member is still the demo', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await installScreenSettle(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
    localStorage.setItem('rafiq_lang', JSON.stringify('en'));
  });
  await page.reload();
  await go(page, 'clientHome');
  await expect(page.locator('.client-home-progress-goal')).toBeVisible();
  await go(page, 'clientProfile');
  await expect(page.locator('.client-profile-agreement-card')).toBeVisible();
  await ctx.close();
});
