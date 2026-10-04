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
  tasks: [], mood_checkins: [], packages: [], sessions: [], session_requests: [], time_blocks: [], weekly_availability: [],
  messages: [], ratings: [], notifications: [], member_profiles: [],
});

async function open(browser, { data = tables() } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await installScreenSettle(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
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
async function go(page, screen) {
  // Not a timer. Since #82 each screen is its own chunk, and two of this
  // test's three assertions — no `.load-state`, no demo text in the frame
  // — are satisfied by a Suspense fallback just as well as by the real
  // screen. A guard that passes without the screen rendering is not a
  // guard. `__screenSettled` waits for exactly one painted `.phone-frame`
  // and no load state, and says so rather than timing out silently.
  const settled = await page.evaluate(async (s) => {
    (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s);
    return await window.__screenSettled();
  }, screen);
  expect(settled, `${screen} never settled`).toBe(true);
}
const frame = (page) => page.locator('.phone-frame').first();
// The demo member, their coach, and the demo's sample goal.
const DEMO = /Sara Ahmed|Yasmin|Feel more in control of life/;

// The whole member side. Discover, Notifications, My programs, Rate
// coach and the booking screen were added once step 6 converted them —
// LAUNCH-CHECKLIST §2 named extending this walk as the condition for
// ticking "remove the demo identities".
const SCREENS = ['clientHome', 'clientCoach', 'clientProfile', 'editClientProfile', 'coachMessages', 'clientTasks', 'myCoaches', 'clientSchedule', 'discover', 'clientNotifications', 'myPrograms', 'rateCoach', 'clientBooking'];

test('signed in, no member screen reads or shows the demo member', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  for (const screen of SCREENS) {
    await go(page, screen);
    await expect(page.locator('.load-state')).toHaveCount(0);
    await expect(frame(page), screen).not.toContainText(DEMO);
  }
  // Only the member's own and the device's: never a demo store, keyed by
  // the demo member or by anything else.
  const read = [...new Set(await page.evaluate(() => window.__keysRead))];
  // `rafiq_fav_coaches` is a known gap, not an allowance on principle:
  // `public.favourite_coaches` has existed since 0005 but
  // src/lib/directory.ts still keeps a member's saved coaches in
  // localStorage, so they do not follow them to another device. Listed
  // here so the rest of the walk can guard the member side; remove it
  // with the fix.
  const allowed = /^(rafiq_(role|lang|dark|notif_prefs|fav_coaches)|rafiq_member_relationship_member-1|rafiq_message_draft_rel-a|sb-.+)$/;
  expect(read.filter((k) => !allowed.test(k)), 'demo/local stores read while signed in').toEqual([]);
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
