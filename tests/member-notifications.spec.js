import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 6, the member's Notifications: signed in,
 * their own `notifications` rows (src/lib/notificationData.ts) of the four
 * kinds the database sends a member — a message, a payment, a session moved
 * or cancelled — and marking them read. Home's bell dot is their own
 * unread ones. Never the demo member's.
 *
 * The clock is pinned to noon on Mon 28 Sep 2026 in Cairo.
 */

const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const client = (id, coachId, extra = {}) => ({
  id, coach_id: coachId, member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
  email: null, city: null, program: '', specialty: '', plan: '', initials: 'HM',
  avatar_bg: '#3E6FB0', active: true, progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: '', focus: '', signup_completed_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});
const coach = (id, name) => ({
  coach_id: id, full_name: name, title: 'Life coaching', verified: true, rating_count: 0, rating_avg: null,
  bio: '', certifications: [], avatar_photo_url: null, cover_photo_url: null,
});
const note = (id, kind, clientId, payload, createdAt, extra = {}) => ({
  id, recipient_id: MEMBER, kind, client_id: clientId, payload, read_at: null, created_at: createdAt, ...extra,
});

const tables = ({ notifications } = {}) => ({
  profiles: [{ id: MEMBER, full_name: 'Hana M.', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' }],
  clients: [client('rel-a', 'coach-a'), client('rel-b', 'coach-b', { created_at: '2026-09-02T00:00:00Z' })],
  coach_directory: [coach('coach-a', 'Dina Farouk'), coach('coach-b', 'Omar Nabil')],
  tasks: [], mood_checkins: [], packages: [], sessions: [], session_requests: [], time_blocks: [], weekly_availability: [],
  messages: [], ratings: [],
  notifications: notifications ?? [
    note('n-pay', 'payment-received', 'rel-a', { payment_id: 'p1', kind: 'package', amount: 600, currency: 'EGP' }, '2026-09-20T10:00:00Z', { read_at: '2026-09-21T10:00:00Z' }),
    note('n-msg', 'message', 'rel-a', { message_id: 'm1', preview: 'See you on Tuesday!' }, '2026-09-28T08:00:00Z'),
    note('n-moved', 'session-moved', 'rel-b', { session_id: 's1', from: '2026-09-29T12:00:00Z', to: '2026-09-30T12:00:00Z' }, '2026-09-28T07:00:00Z'),
    note('n-cancel', 'session-cancelled', 'rel-a', { session_id: 's2', scheduled_at: '2026-09-29T07:00:00Z' }, '2026-09-27T07:00:00Z', { read_at: '2026-09-27T08:00:00Z' }),
    // Kinds a member isn't sent, and someone else's.
    note('n-req', 'session-request', 'rel-a', {}, '2026-09-28T08:30:00Z'),
    note('n-other', 'message', 'rel-x', { preview: 'Not yours' }, '2026-09-28T08:40:00Z', { recipient_id: 'someone-else' }),
  ],
});

async function open(browser, { lang = 'en', dark = false, data = tables(), fail, screen = 'clientNotifications' } = {}) {
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
  await installFakeSupabase(page, { userId: MEMBER, tables: data, fail });
  // Opening a message notification lands on the thread, which listens for
  // new messages: a quiet channel, as in messaging-remote.spec.js.
  await page.evaluate(async () => {
    const real = (await import('/src/lib/supabase.ts')).getSupabase();
    real.channel = (name) => ({ name, on() { return this; }, subscribe() { return this; } });
    real.removeChannel = async () => 'ok';
  });
  await signIn(page, MEMBER);
  await go(page, screen);
  return { page, ctx, errs };
}
async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(300);
}
const appState = (page) => page.evaluate(async () => {
  const { screen } = (await import('/src/store/appStore.ts')).useAppStore.getState();
  const { selectedId } = (await import('/src/store/memberStore.ts')).useMemberStore.getState();
  return { screen, selectedId };
});
const rows = (page) => page.locator('.client-notifications-row');
const dots = (page) => page.locator('.client-notifications-row .client-notifications-dot');
const bellDot = (page) => page.locator('.client-home-bell-dot');
const markAll = (page) => page.getByRole('button', { name: 'Mark all read' });
const updates = async (page) => (await dbCalls(page)).filter((c) => c.table === 'notifications' && c.op === 'update');
const DEMO = /Yasmin|Sara Ahmed|overdue|package/i;

test('the member’s own notifications, newest first, with who and when — never the demo’s', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).locator('.client-notifications-row-title')).toHaveText([
    'New message from ⁨Dina Farouk⁩',
    'Your session with ⁨Omar Nabil⁩ was moved',
    'Your session with ⁨Dina Farouk⁩ was cancelled',
    'Your payment was received',
  ]);
  await expect(rows(page).nth(0)).toContainText('See you on Tuesday!');
  // Wall-clock Cairo times: 12:00Z is 3 PM, 07:00Z is 10 AM.
  await expect(rows(page).nth(1)).toContainText('Now Wed, 3:00 PM');
  await expect(rows(page).nth(2)).toContainText('Tue, 10:00 AM');
  await expect(rows(page).nth(3)).toContainText('600 EGP · Sep 20, 2026');
  await expect(dots(page)).toHaveCount(2);
  await expect(page.locator('.phone-frame').first()).not.toContainText(DEMO);

  const read = (await dbCalls(page)).find((c) => c.table === 'notifications' && c.op === 'select');
  expect(read).toMatchObject({
    filters: [['recipient_id', MEMBER], ['kind', ['message', 'payment-received', 'session-moved', 'session-cancelled'], 'in']],
    order: ['created_at', false],
    limit: 50,
  });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('opening one marks it read and goes to it, for the coach it is about', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await rows(page).nth(1).click();
  expect(await appState(page)).toEqual({ screen: 'clientSchedule', selectedId: 'rel-b' });
  await expect.poll(async () => (await dbRows(page, 'notifications')).find((n) => n.id === 'n-moved').read_at).not.toBeNull();
  expect((await updates(page)).map((c) => c.filters)).toEqual([[['id', 'n-moved'], ['read_at', null, 'is']]]);

  await go(page, 'clientNotifications');
  await expect(dots(page)).toHaveCount(1);
  await rows(page).nth(0).click();
  expect(await appState(page)).toEqual({ screen: 'coachMessages', selectedId: 'rel-a' });
  await go(page, 'clientNotifications');
  // Already read: opening it again writes nothing.
  await rows(page).nth(3).click();
  expect(await appState(page)).toEqual({ screen: 'clientCoach', selectedId: 'rel-a' });
  expect(await updates(page)).toHaveLength(2);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('mark all read marks only theirs, and a failure says so and keeps them unread', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await setFailing(page, ['notifications.update']);
  await markAll(page).click();
  await expect(page.getByRole('alert')).toHaveText("Couldn't mark them read. Please try again.");
  await expect(dots(page)).toHaveCount(2);

  await setFailing(page, []);
  await markAll(page).click();
  await expect(dots(page)).toHaveCount(0);
  await expect(markAll(page)).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await updates(page)).at(-1).filters).toEqual([['recipient_id', MEMBER], ['read_at', null, 'is']]);
  const all = await dbRows(page, 'notifications');
  expect(all.find((n) => n.id === 'n-other').read_at).toBeNull();
  expect(all.filter((n) => n.recipient_id === MEMBER).every((n) => n.read_at)).toBe(true);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a relationship no longer theirs reads as “your coach”', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, {
    data: tables({ notifications: [note('n1', 'session-cancelled', 'rel-gone', { scheduled_at: '2026-09-29T07:00:00Z' }, '2026-09-27T07:00:00Z')] }),
  });
  await expect(rows(page).locator('.client-notifications-row-title')).toHaveText('Your session with ⁨your coach⁩ was cancelled');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('nothing yet: all caught up, and no mark-all', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ notifications: [] }) });
  await expect(page.getByText("You're all caught up!")).toBeVisible();
  await expect(markAll(page)).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read shows retry, never the demo’s notifications', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['notifications.select'] });
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(DEMO);
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(rows(page)).toHaveCount(4);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Home’s bell dot is the member’s own unread, and clears once they’re read', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientHome' });
  await expect(bellDot(page)).toHaveCount(1);
  const read = (await dbCalls(page)).find((c) => c.table === 'notifications' && c.op === 'select');
  expect(read.filters).toEqual([['recipient_id', MEMBER], ['kind', ['message', 'payment-received', 'session-moved', 'session-cancelled'], 'in'], ['read_at', null, 'is']]);
  await page.getByRole('button', { name: 'Notifications' }).click();
  await markAll(page).click();
  await expect(dots(page)).toHaveCount(0);
  await go(page, 'clientHome');
  await expect(page.locator('.client-home-icon-btn')).toBeVisible();
  await expect(bellDot(page)).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('no unread, or a failed read: no dot on Home, and never the demo’s', async ({ browser }) => {
  const none = await open(browser, { screen: 'clientHome', data: tables({ notifications: [note('n1', 'message', 'rel-a', {}, '2026-09-28T08:00:00Z', { read_at: '2026-09-28T08:01:00Z' })] }) });
  await expect(none.page.locator('.client-home-icon-btn')).toBeVisible();
  await expect(bellDot(none.page)).toHaveCount(0);
  await none.ctx.close();

  const failed = await open(browser, { screen: 'clientHome', fail: ['notifications.select'] });
  await expect(failed.page.locator('.client-home-icon-btn')).toBeVisible();
  await expect(bellDot(failed.page)).toHaveCount(0);
  expect([...none.errs, ...failed.errs]).toEqual([]);
  await failed.ctx.close();
});

test('Arabic and dark', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true });
  await expect(rows(page).nth(0).locator('.client-notifications-row-title')).toHaveText('رسالة جديدة من ⁨Dina Farouk⁩');
  await expect(rows(page).nth(1)).toContainText('الموعد الجديد:');
  await expect(page.getByRole('button', { name: 'تعليم الكل كمقروء' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(errs).toEqual([]);
  await ctx.close();
});
