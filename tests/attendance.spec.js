import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 4, the calendar, part 3a: signed in, the
 * coach records what happened at a session once it has started, through
 * 0012's mark_attendance (modelled by tests/fakeSupabase.js, proven against
 * the real schema by supabase/tests/16_mark_attendance.sql).
 *
 * The clock is pinned to Wed 30 Sep 2026, 12:00 in Cairo, as in
 * booking-changes.spec.js. Hana's Monday session and Omar's Tuesday intro
 * have happened; Hana's session today at 2 PM hasn't. Hana's package has
 * 8 credits with 2 used.
 */

const COACH = 'coach-1';
const NOW = new Date('2026-09-30T09:00:00Z');

const client = (id, name) => ({
  id, coach_id: COACH, member_id: null, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: '', specialty: '', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''), avatar_bg: '#3E6FB0',
  active: true, progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null, program_completed: false,
  payment_status: 'due', goal: '', focus: '', signup_completed_at: null, created_at: '2026-09-01T00:00:00Z',
});
const booked = (id, clientId, name, startsAt, minutes, sessionType) => ({
  id, coach_id: COACH, client_id: clientId, kind: 'booked', label: `Session · ${name}`,
  starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + minutes * 60000).toISOString(), session_type: sessionType,
});
const session = (id, clientId, at, blockId, extra = {}) => ({
  id, client_id: clientId, scheduled_at: at, time_block_id: blockId, attendance: null, attendance_set_by: null, recap: null, ...extra,
});

const tables = () => ({
  clients: [client('c-hana', 'Hana Mostafa'), client('c-omar', 'Omar Said')],
  packages: [{ client_id: 'c-hana', total: 8, used: 2, expires_at: '2026-10-30T00:00:00Z' }],
  weekly_availability: [],
  time_blocks: [
    // Monday 10:00 Cairo, Tuesday 11:00 (a free intro), and today at 2 PM.
    booked('b-mon', 'c-hana', 'Hana Mostafa', '2026-09-28T07:00:00Z', 50, 'standard'),
    booked('b-tue', 'c-omar', 'Omar Said', '2026-09-29T08:00:00Z', 20, 'intro'),
    booked('b-today', 'c-hana', 'Hana Mostafa', '2026-09-30T11:00:00Z', 50, 'standard'),
  ],
  sessions: [
    session('s-mon', 'c-hana', '2026-09-28T07:00:00Z', 'b-mon'),
    session('s-tue', 'c-omar', '2026-09-29T08:00:00Z', 'b-tue'),
    session('s-today', 'c-hana', '2026-09-30T11:00:00Z', 'b-today'),
  ],
});

async function open(browser, { lang = 'en', dark = false, data = tables() } = {}) {
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
  await installFakeSupabase(page, { userId: COACH, tables: data });
  await signIn(page, COACH);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('schedule'));
  await page.waitForTimeout(300);
  return { page, ctx, errs };
}
const sheet = (page) => page.locator('.sheet-panel');
const byId = async (page, table, id) => (await dbRows(page, table)).find((r) => (r.id ?? r.client_id) === id);
const rpcCalls = async (page) => (await dbCalls(page)).filter((c) => c.op === 'rpc');
/** Open a day's session: 0 is Monday. */
async function openSession(page, day, name) {
  await page.locator('.schedule-day-chip').nth(day).click();
  await page.locator('.schedule-block', { hasText: name }).click();
}

test('a session that has happened asks how it went; one still to come does not', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await openSession(page, 0, 'Hana Mostafa');
  await expect(sheet(page)).toContainText('How did this go?');
  for (const name of ['Completed', 'No-show', 'Dispute']) await expect(sheet(page).getByRole('button', { name })).toBeVisible();
  // Over, so it can't be moved or cancelled.
  await expect(sheet(page).getByRole('button', { name: 'Cancel session' })).toHaveCount(0);
  await page.locator('.schedule-sheet-close').click();

  await openSession(page, 2, 'Hana Mostafa');
  await expect(sheet(page)).not.toContainText('How did this go?');
  await expect(sheet(page).getByRole('button', { name: 'Cancel session' })).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Completed records it, uses a credit, and stays recorded', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await openSession(page, 0, 'Hana Mostafa');
  await sheet(page).getByRole('button', { name: 'Completed' }).click();
  await expect(sheet(page)).toContainText('Marked completed');
  await expect(sheet(page).getByRole('button', { name: 'Completed' })).toHaveCount(0);

  expect(await rpcCalls(page)).toEqual([{ op: 'rpc', fn: 'mark_attendance', args: { p_session: 's-mon', p_outcome: 'attended' } }]);
  expect(await byId(page, 'sessions', 's-mon')).toMatchObject({ attendance: 'attended', attendance_set_by: 'coach' });
  expect((await byId(page, 'packages', 'c-hana')).used).toBe(3);

  // Read back from the week, not just the sheet's own state.
  await page.locator('.schedule-sheet-close').click();
  await openSession(page, 0, 'Hana Mostafa');
  await expect(sheet(page)).toContainText('Marked completed');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a no-show uses a credit without the label claiming one; a free intro uses none', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await openSession(page, 0, 'Hana Mostafa');
  await sheet(page).getByRole('button', { name: 'No-show' }).click();
  await expect(sheet(page).locator('.schedule-sheet-notice')).toHaveText('Marked as a no-show');
  expect((await byId(page, 'packages', 'c-hana')).used).toBe(3);
  await page.locator('.schedule-sheet-close').click();

  await openSession(page, 1, 'Omar Said');
  await sheet(page).getByRole('button', { name: 'Completed' }).click();
  await expect(sheet(page)).toContainText('Marked completed');
  expect((await byId(page, 'sessions', 's-tue')).attendance).toBe('attended');
  expect((await byId(page, 'packages', 'c-hana')).used).toBe(3);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Dispute holds the credit', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await openSession(page, 0, 'Hana Mostafa');
  await sheet(page).getByRole('button', { name: 'Dispute' }).click();
  await expect(sheet(page)).toContainText("Marked as disputed — held, won't charge or release a credit until resolved");
  expect((await byId(page, 'sessions', 's-mon')).attendance).toBe('disputed');
  expect((await byId(page, 'packages', 'c-hana')).used).toBe(2);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a member’s own dispute is shown as theirs, with nothing to mark', async ({ browser }) => {
  const data = tables();
  Object.assign(data.sessions[0], { attendance: 'disputed', attendance_set_by: 'client' });
  const { page, ctx, errs } = await open(browser, { data });
  await openSession(page, 0, 'Hana Mostafa');
  await expect(sheet(page)).toContainText('The member disputed this session');
  await expect(sheet(page)).not.toContainText('How did this go?');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed mark says so and records nothing; one recorded elsewhere says that', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await openSession(page, 0, 'Hana Mostafa');
  await page.evaluate(() => { window.__fake.fail = ['rpc.mark_attendance']; });
  await sheet(page).getByRole('button', { name: 'Completed' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText('Something went wrong. Please try again.');
  expect((await byId(page, 'sessions', 's-mon')).attendance).toBeNull();
  expect((await byId(page, 'packages', 'c-hana')).used).toBe(2);

  // Meanwhile it was recorded on another device.
  await page.evaluate(() => {
    window.__fake.fail = [];
    Object.assign(window.__fake.db.sessions.find((s) => s.id === 's-mon'), { attendance: 'attended', attendance_set_by: 'coach' });
  });
  await sheet(page).getByRole('button', { name: 'No-show' }).click();
  await expect(sheet(page).getByRole('alert')).toHaveText("This session's attendance was already recorded.");
  expect((await byId(page, 'sessions', 's-mon')).attendance).toBe('attended');

  // Reopened, the sheet shows what was recorded, and the error is gone.
  await page.locator('.schedule-sheet-close').click();
  await openSession(page, 0, 'Hana Mostafa');
  await expect(sheet(page)).toContainText('Marked completed');
  await expect(sheet(page).getByRole('alert')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a mark that fails after its sheet is closed never shows up on the next session', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await openSession(page, 0, 'Hana Mostafa');
  await page.evaluate(() => { window.__fake.fail = ['rpc.mark_attendance']; window.__fake.rpcDelay = 600; });
  await sheet(page).getByRole('button', { name: 'Completed' }).click();
  await page.locator('.schedule-sheet-close').click();
  await page.waitForTimeout(900);
  await openSession(page, 1, 'Omar Said');
  await expect(sheet(page)).toContainText('How did this go?');
  await expect(sheet(page).getByRole('alert')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic and dark', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true });
  await openSession(page, 0, 'Hana Mostafa');
  await expect(sheet(page)).toContainText('كيف سارت الجلسة؟');
  await sheet(page).getByRole('button', { name: 'غياب' }).click();
  await expect(sheet(page).locator('.schedule-sheet-notice')).toHaveText('تم تمييزها كغياب');
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(errs).toEqual([]);
  await ctx.close();
});
