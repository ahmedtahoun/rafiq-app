import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 4, the calendar, part 5: a member asks to
 * move a booked session and the coach confirms it (0017) — a
 * session_requests row naming the booking, answered in Notifications, whose
 * accept moves the booking and its session. Blocks from either side stop a
 * request and its accept. tests/fakeSupabase.js models the database;
 * supabase/tests/21_member_move_request.sql proves the real one.
 *
 * The clock is pinned to noon on Mon 28 Sep 2026 in Cairo. Hana's session
 * with Dina is tomorrow (Tue) at 10 AM, 22 hours away; Dina's hours are
 * Tuesdays 9–5 and Thursdays 1–5.
 */

const COACH = 'coach-a';
const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const client = (extra = {}) => ({
  id: 'rel-a', coach_id: COACH, member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
  email: null, city: null, program: '', specialty: '', plan: 'Basic', initials: 'HM', avatar_bg: '#3E6FB0', active: true,
  progress: 0, needs_checkin: false, next_session_at: '2026-09-29T07:00:00Z', next_session_type: 'standard',
  program_completed: false, payment_status: 'due', goal: '', focus: '', signup_completed_at: null,
  created_at: '2026-09-01T00:00:00Z', blocked_by_member_at: null, blocked_by_coach_at: null, ...extra,
});
const hours = (day, start, end) => ({ coach_id: COACH, day_of_week: day, enabled: true, start_hour: start, end_hour: end });
const moveRequest = (extra = {}) => ({
  id: 'req-move', member_id: MEMBER, coach_id: COACH, offering_id: null, price: 0, currency: 'EGP', status: 'pending',
  requested_start: '2026-10-01T12:00:00Z', reschedule_of: 'b-next', created_at: '2026-09-28T08:00:00Z', responded_at: null, ...extra,
});

const tables = () => ({
  profiles: [
    { id: MEMBER, full_name: 'Hana Mostafa', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' },
    { id: COACH, full_name: 'Dina Farouk', role: 'coach', account_status: 'active' },
  ],
  clients: [client()],
  coach_directory: [{
    coach_id: COACH, full_name: 'Dina Farouk', title: 'Nutrition coaching', country: 'Egypt', country_flag: '🇪🇬',
    languages: ['Arabic'], experience_years: 5, verified: true, featured: false, from_price: 600, rating_count: 4,
    rating_avg: 4.5, bio: 'Dina helps people eat well.', avatar_photo_url: null, session_mode: 'online',
    certifications: [], cover_photo_url: null,
  }],
  weekly_availability: [hours(1, 9, 17), hours(3, 13, 17)],
  offerings: [],
  tasks: [],
  mood_checkins: [],
  packages: [{ client_id: 'rel-a', total: 8, used: 3, expires_at: '2026-10-10T21:00:00Z' }],
  cancellations: [],
  session_requests: [],
  time_blocks: [{
    id: 'b-next', coach_id: COACH, client_id: 'rel-a', kind: 'booked', label: 'Session · Hana Mostafa',
    starts_at: '2026-09-29T07:00:00Z', ends_at: '2026-09-29T07:50:00Z', session_type: 'standard',
  }],
  sessions: [{ id: 's-next', client_id: 'rel-a', scheduled_at: '2026-09-29T07:00:00Z', time_block_id: 'b-next', attendance: null, recap: null }],
});

async function open(browser, { role = 'client', userId = MEMBER, lang = 'en', dark = false, data = tables(), signedIn = true, screen = 'clientSchedule' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
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
  await installFakeSupabase(page, { userId, tables: data });
  if (signedIn) await signIn(page, userId);
  await go(page, screen);
  return { page, ctx, errs };
}
async function go(page, screen, params) {
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params]);
  await page.waitForTimeout(300);
}
const where = (page) => page.evaluate(async () => {
  const s = (await import('/src/store/appStore.ts')).useAppStore.getState();
  return [s.screen, s.params.coachId ?? null];
});
const card = (page) => page.locator('.client-schedule-upcoming');
const moveSheet = (page) => page.locator('.client-schedule-sheet');
const byId = async (page, table, id) => (await dbRows(page, table)).find((r) => r.id === id);

// --- The member asks -------------------------------------------------------------

test('the member asks to move their session; the booking stays until the coach confirms', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await card(page).getByRole('button', { name: 'Reschedule' }).click();
  await expect(moveSheet(page)).toContainText('Dina Farouk confirms it before it changes.');
  // Two weeks of days; Monday (no hours) can't be picked.
  const days = moveSheet(page).locator('.client-schedule-day');
  await expect(days).toHaveCount(14);
  await expect(days.nth(0)).toBeDisabled();
  // Tuesday's slots don't offer the session's own time.
  await expect(moveSheet(page).locator('.client-schedule-slot', { hasText: /^10:00 AM$/ })).toHaveCount(0);

  await days.nth(3).click();
  await moveSheet(page).locator('.client-schedule-slot', { hasText: '3:00 PM' }).click();
  await moveSheet(page).getByRole('button', { name: 'Ask for this time' }).click();

  await expect(moveSheet(page)).toHaveCount(0);
  await expect(card(page)).toContainText('Asked to move to Thu, Oct 1, 3:00 PM — waiting on Dina Farouk.');
  await expect(card(page)).toContainText(/Tue, Sep 29.*10:00/);
  await expect(card(page).getByRole('button', { name: 'Reschedule' })).toHaveCount(0);
  const [row] = await dbRows(page, 'session_requests');
  expect(row).toMatchObject({
    member_id: MEMBER, coach_id: COACH, offering_id: null, price: 0, status: 'pending',
    reschedule_of: 'b-next', requested_start: '2026-10-01T12:00:00.000Z',
  });
  expect((await byId(page, 'time_blocks', 'b-next')).starts_at).toBe('2026-09-29T07:00:00Z');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a waiting move can be withdrawn, and Reschedule comes back', async ({ browser }) => {
  const data = tables();
  data.session_requests.push(moveRequest());
  const { page, ctx, errs } = await open(browser, { data });
  await expect(card(page)).toContainText('waiting on Dina Farouk');
  await card(page).getByRole('button', { name: 'Withdraw move' }).click();
  await expect(card(page).getByRole('button', { name: 'Reschedule' })).toBeVisible();
  expect((await byId(page, 'session_requests', 'req-move')).status).toBe('withdrawn');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('within 12 hours there is no Reschedule, and it says why', async ({ browser }) => {
  const data = tables();
  // Today at 3 PM instead: three hours away.
  Object.assign(data.time_blocks[0], { starts_at: '2026-09-28T12:00:00Z', ends_at: '2026-09-28T12:50:00Z' });
  data.sessions[0].scheduled_at = '2026-09-28T12:00:00Z';
  const { page, ctx, errs } = await open(browser, { data });
  await expect(card(page).getByRole('button', { name: 'Reschedule' })).toHaveCount(0);
  await expect(card(page)).toContainText('Too close to the session time to reschedule — 12h notice needed.');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a move the database refuses says so in the picker', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.evaluate(() => { window.__fake.refuse['session_requests.insert'] = '42501'; });
  await card(page).getByRole('button', { name: 'Reschedule' }).click();
  await moveSheet(page).locator('.client-schedule-slot').first().click();
  await moveSheet(page).getByRole('button', { name: 'Ask for this time' }).click();
  await expect(moveSheet(page).getByRole('alert')).toHaveText("This session can't be moved now. It may be within 12 hours, or no longer yours to move.");
  expect(await dbRows(page, 'session_requests')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('asking the coach for a new session leaves a waiting move alone', async ({ browser }) => {
  const data = tables();
  data.session_requests.push(moveRequest());
  const { page, ctx, errs } = await open(browser, { data });
  const sent = await page.evaluate(async () => (await import('/src/lib/requestData.ts')).sendSessionRequest({
    coachId: 'coach-a', offeringId: null, startWallMs: Date.UTC(2026, 9, 6, 10), price: 0, currency: 'EGP',
  }));
  expect(sent.ok).toBe(true);
  expect((await byId(page, 'session_requests', 'req-move')).status).toBe('pending');
  const [withdraw] = (await dbCalls(page)).filter((c) => c.table === 'session_requests' && c.op === 'update');
  expect(withdraw.filters).toContainEqual(['reschedule_of', null, 'is']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a blocked member is told on the coach’s page, not that the send failed', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'discover' });
  await go(page, 'coachPreview', { coachId: COACH });
  await page.evaluate(() => { window.__fake.refuse['session_requests.insert'] = '42501'; });
  await page.locator('.coach-preview-primary').click();
  await expect(page.getByRole('alert')).toHaveText("You can't request a session with this coach right now.");
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- The coach answers --------------------------------------------------------------

const openCoach = (browser, data) => open(browser, { role: 'coach', userId: COACH, data, screen: 'notifications' });

test('the coach sees the move with both times, and accepting it moves the booking', async ({ browser }) => {
  const data = tables();
  data.session_requests.push(moveRequest());
  const { page, ctx, errs } = await openCoach(browser, data);
  const row = page.locator('.notifications-row');
  await expect(row).toContainText('asked to move a session');
  await expect(row).toContainText('Tue, Sep 29, 10:00 AM → Thu, Oct 1, 3:00 PM');
  await row.click();
  const sheet = page.locator('.notifications-sheet');
  await expect(sheet).toContainText('Booked for');
  await expect(sheet).toContainText('Asked for');
  await expect(sheet).not.toContainText('Free');
  await sheet.getByRole('button', { name: 'Accept' }).click();

  await expect(page.locator('.notifications-banner')).toContainText('session is moved.');
  const block = await byId(page, 'time_blocks', 'b-next');
  expect([block.starts_at, block.ends_at]).toEqual(['2026-10-01T12:00:00.000Z', '2026-10-01T12:50:00.000Z']);
  expect((await byId(page, 'sessions', 's-next')).scheduled_at).toBe('2026-10-01T12:00:00.000Z');
  expect(await dbRows(page, 'time_blocks')).toHaveLength(1);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a blocked relationship’s request can’t be accepted, and the sheet says why', async ({ browser }) => {
  const data = tables();
  data.session_requests.push(moveRequest());
  data.clients[0].blocked_by_member_at = '2026-09-28T08:30:00Z';
  const { page, ctx, errs } = await openCoach(browser, data);
  await page.locator('.notifications-row').click();
  await page.locator('.notifications-sheet').getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByRole('alert')).toContainText('one of you has blocked the other');
  expect((await byId(page, 'session_requests', 'req-move')).status).toBe('pending');
  expect((await byId(page, 'time_blocks', 'b-next')).starts_at).toBe('2026-09-29T07:00:00Z');
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Booking from elsewhere ---------------------------------------------------------

test('signed in, "book a session" opens the coach’s page; signed out, the demo booking screen', async ({ browser }) => {
  const signedIn = await open(browser, { screen: 'clientCoach' });
  await signedIn.page.locator('.client-coach-secondary').click();
  expect(await where(signedIn.page)).toEqual(['coachPreview', COACH]);
  expect(signedIn.errs).toEqual([]);
  await signedIn.ctx.close();

  const signedOut = await open(browser, { screen: 'clientCoach', signedIn: false });
  await signedOut.page.locator('.client-coach-secondary').click();
  expect((await where(signedOut.page))[0]).toBe('clientBooking');
  expect(signedOut.errs).toEqual([]);
  await signedOut.ctx.close();
});

test('Arabic and dark: the waiting move and the coach’s arrow read right', async ({ browser }) => {
  const data = tables();
  data.session_requests.push(moveRequest());
  const member = await open(browser, { lang: 'ar', dark: true, data });
  await expect(card(member.page)).toContainText('بانتظار Dina Farouk');
  await expect(card(member.page).getByRole('button', { name: 'سحب طلب النقل' })).toBeVisible();
  expect(member.errs).toEqual([]);
  await member.ctx.close();

  const coach = await open(browser, { role: 'coach', userId: COACH, lang: 'ar', dark: true, data: (() => { const d = tables(); d.session_requests.push(moveRequest()); return d; })(), screen: 'notifications' });
  const row = coach.page.locator('.notifications-row');
  await expect(row).toContainText('طلب');
  await expect(row).toContainText('←');
  expect(coach.errs).toEqual([]);
  await coach.ctx.close();
});
