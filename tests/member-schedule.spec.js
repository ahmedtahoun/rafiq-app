import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 4, the calendar, part 4: signed in, the
 * member's Schedule is their own sessions with the coach they're viewing —
 * the next booked one (or their open request), what has happened — and
 * they can cancel a booked session through 0013's member_cancel_session
 * (modelled by tests/fakeSupabase.js, proven against the real schema by
 * supabase/tests/17_member_cancel_session.sql), or withdraw a request.
 *
 * The clock is pinned to noon on Mon 28 Sep 2026 in Cairo, as in
 * member-remote.spec.js. Hana's next session with Dina is tomorrow at
 * 10 AM, more than 12 hours away; her package has 8 credits with 3 used.
 */

const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const client = (id, coachId, extra = {}) => ({
  id, coach_id: coachId, member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
  email: null, city: null, program: 'Nutrition · Basic', specialty: 'Nutrition', plan: 'Basic', initials: 'HM',
  avatar_bg: '#3E6FB0', active: true, progress: 45, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: 'Eat more greens', focus: '', signup_completed_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});
const coach = (id, name) => ({
  coach_id: id, full_name: name, title: 'Nutrition coaching', verified: true, rating_count: 4, rating_avg: 4.5,
  bio: `${name} helps people eat well.`, certifications: [], avatar_photo_url: null, cover_photo_url: null,
});
const booked = (id, startsAt, minutes, sessionType) => ({
  id, coach_id: 'coach-a', client_id: 'rel-a', kind: 'booked', label: 'Session · Hana Mostafa',
  starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + minutes * 60000).toISOString(), session_type: sessionType,
});
const session = (id, at, extra = {}) => ({
  id, client_id: 'rel-a', scheduled_at: at, time_block_id: null, attendance: null, attendance_set_by: null, recap: null, ...extra,
});

const tables = () => ({
  profiles: [{ id: MEMBER, full_name: 'Hana M.', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' }],
  clients: [client('rel-a', 'coach-a', { next_session_at: '2026-09-29T07:00:00Z', next_session_type: 'standard' })],
  coach_directory: [coach('coach-a', 'Dina Farouk')],
  tasks: [],
  mood_checkins: [],
  packages: [{ client_id: 'rel-a', total: 8, used: 3, expires_at: '2026-10-10T21:00:00Z' }],
  cancellations: [],
  session_requests: [],
  time_blocks: [booked('b-next', '2026-09-29T07:00:00Z', 50, 'standard')],
  sessions: [
    session('s-held', '2026-09-21T15:00:00Z', { attendance: 'attended', recap: 'Great first week' }),
    session('s-missed', '2026-09-24T15:00:00Z', { attendance: 'no_show' }),
    session('s-gone', '2026-09-25T15:00:00Z', { attendance: 'cancelled' }),
    session('s-next', '2026-09-29T07:00:00Z', { time_block_id: 'b-next' }),
  ],
});

async function open(browser, { lang = 'en', dark = false, data = tables(), signedIn = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [lang, dark]);
  await page.reload();
  await installFakeSupabase(page, { userId: MEMBER, tables: data });
  if (signedIn) await signIn(page, MEMBER);
  await go(page, 'clientSchedule');
  return { page, ctx, errs };
}
async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(300);
}
const frame = (page) => page.locator('.phone-frame').first();
const card = (page) => page.locator('.client-schedule-upcoming');
const dialog = (page) => page.locator('.client-schedule-dialog');
const byId = async (page, table, id) => (await dbRows(page, table)).find((r) => (r.id ?? r.client_id) === id);
const rpcCalls = async (page) => (await dbCalls(page)).filter((c) => c.op === 'rpc');
const DEMO = /Sara Ahmed|Yasmin/;

test('signed out, it is still the demo member’s schedule', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { signedIn: false });
  await expect(frame(page)).toContainText('Yasmin');
  expect((await dbCalls(page)).filter((c) => c.table === 'sessions')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('signed in: the real next session, and what has happened — never the demo', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(frame(page)).toContainText('With Dina Farouk');
  await expect(card(page)).toContainText('Confirmed');
  await expect(card(page)).toContainText(/Tue, Sep 29.*10:00/);
  await expect(card(page)).toContainText('50-Minute Session');

  const history = page.locator('.client-schedule-history-row');
  await expect(history).toHaveCount(2);
  await expect(history.nth(0)).toContainText('Missed session');
  await expect(history.nth(1)).toContainText('Great first week');
  // Not real yet signed in: moving, joining, rating.
  for (const name of ['Reschedule', 'Join Session', 'Rate']) await expect(frame(page).getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(frame(page)).not.toContainText(DEMO);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('cancelling with notice: the session is cancelled, no credit is used, and it is gone from the card', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await card(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toContainText('Cancel this session?');
  await expect(dialog(page)).not.toContainText('uses one session from your package');
  await dialog(page).getByRole('button', { name: 'Yes, cancel' }).click();

  await expect(dialog(page)).toHaveCount(0);
  await expect(frame(page)).toContainText('No upcoming session');
  expect(await rpcCalls(page)).toEqual([{ op: 'rpc', fn: 'member_cancel_session', args: { p_session: 's-next' } }]);
  expect(await byId(page, 'sessions', 's-next')).toMatchObject({ attendance: 'cancelled', attendance_set_by: 'client' });
  expect(await byId(page, 'time_blocks', 'b-next')).toBeUndefined();
  expect((await byId(page, 'packages', 'rel-a')).used).toBe(3);
  // Home's next session moves on too, without a reload.
  expect((await byId(page, 'clients', 'rel-a')).next_session_at).toBeNull();
  await go(page, 'clientHome');
  await expect(frame(page)).not.toContainText('10:00');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a late cancel says it uses a credit, and does', async ({ browser }) => {
  const data = tables();
  // Today at 3 PM: three hours away.
  data.time_blocks.push(booked('b-soon', '2026-09-28T12:00:00Z', 50, 'standard'));
  data.sessions.push(session('s-soon', '2026-09-28T12:00:00Z', { time_block_id: 'b-soon' }));
  const { page, ctx, errs } = await open(browser, { data });
  await card(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toContainText('This is within 12h of the session, so it uses one session from your package.');
  await dialog(page).getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect((await byId(page, 'packages', 'rel-a')).used).toBe(4);
  // The next one along takes its place.
  await expect(card(page)).toContainText(/Tue, Sep 29.*10:00/);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a late free intro, or no credit left, says nothing about a credit', async ({ browser }) => {
  const data = tables();
  data.time_blocks.push(booked('b-intro', '2026-09-28T12:00:00Z', 20, 'intro'));
  data.sessions.push(session('s-intro', '2026-09-28T12:00:00Z', { time_block_id: 'b-intro' }));
  const { page, ctx, errs } = await open(browser, { data });
  await expect(card(page)).toContainText('Intro Call');
  await card(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).not.toContainText('uses one session');
  await ctx.close();

  const full = tables();
  full.packages[0].used = 8;
  full.time_blocks.push(booked('b-soon', '2026-09-28T12:00:00Z', 50, 'standard'));
  full.sessions.push(session('s-soon', '2026-09-28T12:00:00Z', { time_block_id: 'b-soon' }));
  const second = await open(browser, { data: full });
  await card(second.page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(second.page)).toContainText('Cancel this session?');
  await expect(dialog(second.page)).not.toContainText('uses one session');
  expect([...errs, ...second.errs]).toEqual([]);
  await second.ctx.close();
});

test('a failed cancel keeps the session and says so in the dialog', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.evaluate(() => { window.__fake.fail = ['rpc.member_cancel_session']; });
  await card(page).getByRole('button', { name: 'Cancel' }).click();
  await dialog(page).getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText('Something went wrong. Please try again.');
  expect((await byId(page, 'sessions', 's-next')).attendance).toBeNull();
  // Reopened, the dialog starts clean.
  await dialog(page).getByRole('button', { name: 'Keep it' }).click();
  await card(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a session cancelled elsewhere says so, and the card catches up', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.evaluate(() => {
    Object.assign(window.__fake.db.sessions.find((s) => s.id === 's-next'), { attendance: 'cancelled' });
  });
  await card(page).getByRole('button', { name: 'Cancel' }).click();
  await dialog(page).getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(dialog(page).getByRole('alert')).toHaveText('This session was already moved or cancelled.');
  await dialog(page).getByRole('button', { name: 'Keep it' }).click();
  await expect(frame(page)).toContainText('No upcoming session');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('an open request shows as pending, and withdrawing it is the request’s own withdraw', async ({ browser }) => {
  const data = tables();
  data.time_blocks = [];
  data.sessions = data.sessions.filter((s) => s.id !== 's-next');
  data.session_requests.push({
    id: 'req-1', member_id: MEMBER, coach_id: 'coach-a', offering_id: null, price: 0, status: 'pending',
    requested_start: '2026-10-01T08:00:00Z', created_at: '2026-09-27T10:00:00Z',
  });
  const { page, ctx, errs } = await open(browser, { data });
  await expect(card(page)).toContainText('Pending');
  await expect(card(page)).toContainText(/Thu, Oct 1.*11:00/);
  await expect(card(page)).toContainText('Intro Call');
  await card(page).getByRole('button', { name: 'Withdraw request' }).click();
  await expect(dialog(page)).toContainText('Withdraw this request?');
  await dialog(page).getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(frame(page)).toContainText('No upcoming session');
  expect((await byId(page, 'session_requests', 'req-1')).status).toBe('withdrawn');
  expect(await rpcCalls(page)).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('requesting a session opens the coach’s own page', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.getByRole('button', { name: '+ Request a session' }).click();
  const where = await page.evaluate(async () => {
    const s = (await import('/src/store/appStore.ts')).useAppStore.getState();
    return [s.screen, s.params.coachId];
  });
  expect(where).toEqual(['coachPreview', 'coach-a']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a member no coach has accepted yet is pointed to Discover', async ({ browser }) => {
  const data = tables();
  data.clients = [];
  const { page, ctx, errs } = await open(browser, { data });
  await expect(page.locator('.no-coach-yet')).toBeVisible();
  await expect(frame(page)).not.toContainText(DEMO);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic and dark', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true });
  await expect(frame(page)).toContainText('مع Dina Farouk');
  await expect(card(page)).toContainText('مؤكدة');
  await expect(page.locator('.client-schedule-history-row').first()).toContainText('جلسة فائتة');
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(errs).toEqual([]);
  await ctx.close();
});
