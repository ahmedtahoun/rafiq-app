import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 4, the calendar, part 2: signed in, the
 * coach moves or cancels a booked session from Schedule, through 0011's
 * reschedule_booking / cancel_booking (modelled by tests/fakeSupabase.js,
 * proven against the real schema by supabase/tests/15_booking_changes.sql).
 *
 * The clock is pinned to Wed 30 Sep 2026, 12:00 in Cairo, as in
 * schedule-remote.spec.js: Hana's session today at 2 PM is two hours away,
 * inside the 12 hours' notice a move needs; Friday's at 10 AM is not.
 */

const COACH = 'coach-1';
const NOW = new Date('2026-09-30T09:00:00Z');

const client = (id, name, extra = {}) => ({
  id, coach_id: COACH, member_id: null, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: '', specialty: '', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''), avatar_bg: '#3E6FB0',
  active: true, progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null, program_completed: false,
  payment_status: 'due', goal: '', focus: '', signup_completed_at: null, created_at: '2026-09-01T00:00:00Z', ...extra,
});
const block = (id, kind, startsAt, endsAt, extra = {}) => ({
  id, coach_id: COACH, client_id: null, kind, label: null, starts_at: startsAt, ends_at: endsAt, session_type: null, ...extra,
});

const tables = () => ({
  clients: [client('c-hana', 'Hana Mostafa', { next_session_at: '2026-09-30T11:00:00Z', next_session_type: 'standard' })],
  weekly_availability: [
    { coach_id: COACH, day_of_week: 2, enabled: true, start_hour: 9, end_hour: 17 },
    { coach_id: COACH, day_of_week: 3, enabled: false, start_hour: 9, end_hour: 17 },
    { coach_id: COACH, day_of_week: 4, enabled: true, start_hour: 9, end_hour: 17 },
  ],
  sessions: [
    { id: 's-today', client_id: 'c-hana', scheduled_at: '2026-09-30T11:00:00Z', time_block_id: 'b-hana', attendance: null, recap: null },
    { id: 's-fri', client_id: 'c-hana', scheduled_at: '2026-10-02T07:00:00Z', time_block_id: 'b-hana-fri', attendance: null, recap: null },
  ],
  cancellations: [],
  time_blocks: [
    // Friday, 10:00–10:50 Cairo: Hana's next one after today.
    block('b-hana-fri', 'booked', '2026-10-02T07:00:00Z', '2026-10-02T07:50:00Z', { client_id: 'c-hana', label: 'Session · Hana Mostafa', session_type: 'standard' }),
    // Today, 14:00–14:50 Cairo: Hana's session.
    block('b-hana', 'booked', '2026-09-30T11:00:00Z', '2026-09-30T11:50:00Z', { client_id: 'c-hana', label: 'Session · Hana Mostafa', session_type: 'standard' }),
    // Today, 07:00–08:00: busy, before the usual 8 AM start.
    block('b-gym', 'busy', '2026-09-30T04:00:00Z', '2026-09-30T05:00:00Z'),
    // Friday, 10:00–12:00: busy.
    block('b-fri', 'busy', '2026-10-02T07:00:00Z', '2026-10-02T09:00:00Z', { label: 'Unavailable' }),
    // Last week and next week: not this week's.
    block('b-old', 'busy', '2026-09-25T07:00:00Z', '2026-09-25T08:00:00Z'),
    block('b-next', 'busy', '2026-10-05T07:00:00Z', '2026-10-05T08:00:00Z'),
  ],
});

async function open(browser, { lang = 'en', dark = false, signedIn = true, screen = 'schedule', data = tables(), fail } = {}) {
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
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [lang, dark]);
  await page.reload();
  await installFakeSupabase(page, { userId: COACH, tables: data, fail });
  if (signedIn) await signIn(page, COACH);
  await go(page, screen);
  return { page, ctx, errs };
}
async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(300);
}
const rpcCalls = async (page) => (await dbCalls(page)).filter((c) => c.op === 'rpc');
const byId = async (page, table, id) => (await dbRows(page, table)).find((r) => r.id === id);
const sheet = (page) => page.locator('.sheet-panel');

async function openFriday(page) {
  await page.locator('.schedule-day-chip').nth(4).click();
  await page.locator('.schedule-block', { hasText: 'Hana Mostafa' }).click();
}

test('a booked session two hours away can be cancelled but not moved; Friday’s can be both', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.schedule-block', { hasText: 'Hana Mostafa' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Cancel session' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Reschedule' })).toHaveCount(0);
  await expect(sheet(page)).toContainText('Too close to the session time to reschedule — 12h notice needed.');
  await page.locator('.schedule-sheet-close').click();

  await openFriday(page);
  await expect(sheet(page).getByRole('button', { name: 'Reschedule' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Cancel session' })).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('moving Friday’s session keeps its length and moves the session with it', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await openFriday(page);
  await sheet(page).getByRole('button', { name: 'Reschedule' }).click();
  // Monday and Tuesday have gone; today's slots are only those still ahead.
  await expect(page.locator('.schedule-reschedule-slots').locator('..').locator('.schedule-day-chip').nth(1)).toBeDisabled();
  await page.locator('.schedule-slot-chip', { hasText: '3:00 PM' }).click();
  await page.getByRole('button', { name: 'Confirm new time' }).click();

  await expect(page.locator('.schedule-block', { hasText: 'Hana Mostafa' })).toContainText('3:00');
  expect(await rpcCalls(page)).toEqual([{ op: 'rpc', fn: 'reschedule_booking', args: { p_block: 'b-hana-fri', p_start: '2026-10-02T12:00:00.000Z' } }]);
  const moved = await byId(page, 'time_blocks', 'b-hana-fri');
  expect([moved.starts_at, moved.ends_at]).toEqual(['2026-10-02T12:00:00.000Z', '2026-10-02T12:50:00.000Z']);
  expect((await byId(page, 'sessions', 's-fri')).scheduled_at).toBe('2026-10-02T12:00:00.000Z');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a time on another booking is refused in the sheet, and nothing moves', async ({ browser }) => {
  const data = tables();
  data.clients.push(client('c-omar', 'Omar Said'));
  data.time_blocks.push(block('b-omar', 'booked', '2026-10-02T12:00:00Z', '2026-10-02T12:50:00Z', { client_id: 'c-omar', label: 'Session · Omar Said' }));
  const { page, ctx, errs } = await open(browser, { data });
  await openFriday(page);
  await sheet(page).getByRole('button', { name: 'Reschedule' }).click();
  await page.locator('.schedule-slot-chip', { hasText: '3:00 PM' }).click();
  await page.getByRole('button', { name: 'Confirm new time' }).click();
  await expect(page.getByRole('alert')).toHaveText('This time clashes with a booked session, or time you marked unavailable.');
  expect((await byId(page, 'time_blocks', 'b-hana-fri')).starts_at).toBe('2026-10-02T07:00:00Z');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a move onto time marked unavailable is refused', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await openFriday(page);
  await sheet(page).getByRole('button', { name: 'Reschedule' }).click();
  // Friday 10:00–12:00 is the coach's busy block.
  await page.locator('.schedule-slot-chip', { hasText: '11:15 AM' }).click();
  await page.getByRole('button', { name: 'Confirm new time' }).click();
  await expect(page.getByRole('alert')).toHaveText('This time clashes with a booked session, or time you marked unavailable.');
  expect((await byId(page, 'time_blocks', 'b-hana-fri')).starts_at).toBe('2026-10-02T07:00:00Z');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the coach removes a busy block from its sheet', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.schedule-day-chip').nth(4).click();
  await page.locator('.schedule-block', { hasText: 'Unavailable' }).click();
  await sheet(page).getByRole('button', { name: 'Remove this block' }).click();
  await expect(page.locator('.schedule-block', { hasText: 'Unavailable' })).toHaveCount(0);
  expect(await byId(page, 'time_blocks', 'b-fri')).toBeUndefined();
  const [del] = (await dbCalls(page)).filter((c) => c.table === 'time_blocks' && c.op === 'delete');
  expect(del.filters).toEqual([['id', 'b-fri'], ['kind', 'busy']]);
  // A booked session is never deleted this way: its sheet has no Remove.
  await page.locator('.schedule-block', { hasText: 'Hana Mostafa' }).click();
  await expect(sheet(page).getByRole('button', { name: 'Remove this block' })).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('cancelling today’s session frees the time, keeps it in history, and moves "next session" on', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.schedule-block', { hasText: 'Hana Mostafa' }).click();
  await sheet(page).getByRole('button', { name: 'Cancel session' }).click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();

  await expect(page.locator('.schedule-block', { hasText: 'Hana Mostafa' })).toHaveCount(0);
  expect(await rpcCalls(page)).toEqual([{ op: 'rpc', fn: 'cancel_booking', args: { p_block: 'b-hana' } }]);
  expect(await byId(page, 'time_blocks', 'b-hana')).toBeUndefined();
  expect((await byId(page, 'sessions', 's-today')).attendance).toBe('cancelled');
  const [record] = await dbRows(page, 'cancellations');
  expect(record).toMatchObject({ client_id: 'c-hana', cancelled_by_role: 'coach', within_grace: false });
  expect((await byId(page, 'clients', 'c-hana')).next_session_at).toBe('2026-10-02T07:00:00Z');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a cancel that goes through stays done even if the re-read fails, with no spinner', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  // Clients once, so the roster is loaded; then every read fails.
  await go(page, 'clients');
  await go(page, 'schedule');
  await page.evaluate(() => { window.__fake.fail = ['time_blocks.select', 'clients.select', 'weekly_availability.select']; });
  await page.locator('.schedule-block', { hasText: 'Hana Mostafa' }).click();
  await sheet(page).getByRole('button', { name: 'Cancel session' }).click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(page.locator('.schedule-block', { hasText: 'Hana Mostafa' })).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.locator('.load-state')).toHaveCount(0);
  await expect(page.locator('.schedule-timeline')).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('an error from one sheet never shows up in the next', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['rpc.cancel_booking'] });
  // The cancel is still in flight when the coach taps Keep it; it fails after.
  await page.evaluate(() => { window.__fake.rpcDelay = 800; });
  await openFriday(page);
  await sheet(page).getByRole('button', { name: 'Cancel session' }).click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await page.waitForTimeout(1200);
  await openFriday(page);
  await sheet(page).getByRole('button', { name: 'Reschedule' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed cancel keeps the session and says so', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['rpc.cancel_booking'] });
  await page.locator('.schedule-block', { hasText: 'Hana Mostafa' }).click();
  await sheet(page).getByRole('button', { name: 'Cancel session' }).click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.');
  await page.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.locator('.schedule-block', { hasText: 'Hana Mostafa' })).toHaveCount(1);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic and dark: the cancel error reads in Arabic', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true, fail: ['rpc.cancel_booking'] });
  await page.locator('.schedule-block').filter({ hasText: 'Hana Mostafa' }).click();
  await sheet(page).locator('.schedule-sheet-btn-red').click();
  await page.locator('.schedule-modal-btn-danger').click();
  await expect(page.getByRole('alert')).toHaveText('حدث خطأ ما. يرجى المحاولة مرة أخرى.');
  expect(errs).toEqual([]);
  await ctx.close();
});
