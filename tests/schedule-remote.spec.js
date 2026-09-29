import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 4, the calendar: signed in, Schedule is
 * the coach's real week — their time_blocks and weekly hours, with names
 * from their roster — and AddTimeBlock adds to it. Moving, cancelling and
 * attendance come in the next PR.
 *
 * The clock is pinned to Wed 30 Sep 2026, 12:00 in Cairo (UTC+3): the week
 * shown is Mon 28 Sep – Sun 4 Oct.
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
  clients: [client('c-hana', 'Hana Mostafa')],
  weekly_availability: [
    { coach_id: COACH, day_of_week: 2, enabled: true, start_hour: 9, end_hour: 17 },
    { coach_id: COACH, day_of_week: 3, enabled: false, start_hour: 9, end_hour: 17 },
  ],
  time_blocks: [
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
const frame = (page) => page.locator('.phone-frame').first();
const DEMO = /Sara Ahmed|Omar Fathy|Mona Reda|October/;

test('signed out, Schedule is still the demo week and asks Supabase for nothing', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { signedIn: false });
  await expect(page.locator('.schedule-day-chip-date')).toHaveText(['20', '21', '22', '23', '24', '25', '26']);
  expect((await dbCalls(page)).filter((c) => c.table === 'time_blocks')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('signed in, the day view is today on the real calendar — never the demo week', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(page.locator('.schedule-day-chip-date')).toHaveText(['28', '29', '30', '1', '2', '3', '4']);
  await expect(page.locator('.schedule-day-chip.is-selected')).toContainText('30');
  await expect(page.locator('.schedule-selected-label')).toHaveText('Wednesday, September 30');
  expect(await frame(page).innerText()).not.toMatch(DEMO);

  const blocks = page.locator('.schedule-block');
  // Weekly hours, the gym hour, Hana's session.
  await expect(blocks).toHaveCount(3);
  await expect(blocks.filter({ hasText: 'Hana Mostafa' })).toContainText('2:00');
  await expect(blocks.filter({ hasText: 'Preferred hours' })).toHaveCount(1);
  // The 7 AM block widens the day rather than hanging off its top.
  await expect(page.locator('.schedule-hour-label').first()).toHaveText('7 AM');

  const [read] = (await dbCalls(page)).filter((c) => c.table === 'time_blocks');
  expect(read.filters).toEqual([
    ['coach_id', COACH],
    ['starts_at', '2026-09-27T21:00:00.000Z', 'gte'],
    ['starts_at', '2026-10-04T21:00:00.000Z', 'lt'],
  ]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a booked session opens its member; nothing not yet real is offered', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.schedule-block', { hasText: 'Hana Mostafa' }).click();
  await expect(page.locator('.schedule-sheet-name')).toHaveText('Hana Mostafa');
  const sheet = page.locator('.sheet-panel');
  await expect(sheet.getByRole('button', { name: 'View full profile' })).toBeVisible();
  for (const name of ['Cancel session', 'Reschedule', 'Remind about session', 'Join Session', 'Confirm session']) {
    await expect(sheet.getByRole('button', { name })).toHaveCount(0);
  }
  await sheet.getByRole('button', { name: 'View full profile' }).click();
  const state = await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState());
  expect([state.screen, state.params.clientId]).toEqual(['clientDetail', 'c-hana']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the week and month views are the real dates', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.locator('.schedule-section-label')).toHaveText('This Week · September 28 – October 4');
  const rows = page.locator('.schedule-week-row');
  await expect(rows.nth(2)).toContainText('1 session booked');
  await expect(rows.nth(3)).toContainText('No availability set');
  await expect(rows.nth(0)).toContainText('No availability set');

  await page.getByRole('button', { name: 'Month' }).click();
  await expect(page.locator('.schedule-section-label')).toHaveText('September 2026');
  // Sep 2026 starts on a Tuesday: the grid opens on Mon 31 Aug.
  await expect(page.locator('.schedule-month-cell').first()).toHaveText('31');
  await page.locator('.schedule-month-cell', { hasText: /^2$/ }).last().click();
  await expect(page.locator('.schedule-selected-label')).toHaveText('Friday, October 2');
  await expect(page.locator('.schedule-block')).toHaveCount(1);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read shows retry, never the demo week', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['time_blocks.select'] });
  await expect(page.getByRole('alert')).toContainText("Couldn't load this");
  expect(await frame(page).innerText()).not.toMatch(DEMO);
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.schedule-block')).toHaveCount(3);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('adding a block puts it on the real calendar, on that day of this week', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'addTimeBlock' });
  const days = page.locator('.add-time-block-day-chip');
  // Monday and Tuesday are gone; today is picked.
  await expect(days.nth(0)).toBeDisabled();
  await expect(days.nth(1)).toBeDisabled();
  await expect(days.nth(2)).toHaveClass(/is-selected/);
  await expect(frame(page)).not.toContainText('Repeat weekly');

  // Earlier today has already gone by.
  await page.locator('#atb-start').fill('9:00 AM');
  await page.locator('#atb-end').fill('10:00 AM');
  await expect(page.getByRole('button', { name: 'Save Block' })).toBeDisabled();

  await days.nth(3).click();
  await page.locator('#atb-start').fill('2:00 PM');
  await page.locator('#atb-end').fill('4:30 PM');
  await page.getByRole('button', { name: 'Unavailable' }).click();
  await page.getByRole('button', { name: 'Save Block' }).click();
  await expect.poll(async () => (await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen))).toBe('schedule');
  const added = (await dbRows(page, 'time_blocks')).at(-1);
  expect(added).toMatchObject({
    coach_id: COACH, client_id: null, kind: 'busy', label: 'Unavailable',
    starts_at: '2026-10-01T11:00:00.000Z', ends_at: '2026-10-01T13:30:00.000Z',
  });
  // Schedule reads it back on Thursday.
  await page.locator('.schedule-day-chip').nth(3).click();
  await expect(page.locator('.schedule-block', { hasText: 'Unavailable' })).toContainText('2:00');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed add stays on the form and says so', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'addTimeBlock', fail: ['time_blocks.insert'] });
  await page.locator('#atb-start').fill('3:00 PM');
  await page.locator('#atb-end').fill('4:00 PM');
  await page.getByRole('button', { name: 'Save Block' }).click();
  await expect(page.getByRole('alert')).toHaveText("This block wasn't saved. Please try again.");
  await expect(page.locator('#atb-start')).toHaveValue('3:00 PM');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic and dark: the real week reads right', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true });
  await expect(page.locator('.schedule-selected-label')).toHaveText('أربعاء، 30 سبتمبر');
  await page.locator('.schedule-view-tab').nth(2).click();
  await expect(page.locator('.schedule-section-label')).toHaveText('سبتمبر 2026');
  expect(errs).toEqual([]);
  await ctx.close();
});
