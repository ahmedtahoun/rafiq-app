import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 3, the coach side: the roster (Clients,
 * ClientDetail, AddClient, EditClient, AddTask) on clients / client_private /
 * tasks / sessions / packages / payments, through tests/fakeSupabase.js.
 * What each write may touch is proven against the real schema by
 * supabase/tests/11_roster_app.sql.
 *
 * The page clock is pinned to noon on Mon 28 Sep 2026 in Cairo (the suite's
 * zone, UTC+3 then), so "today", "overdue" and "expires in 30 days" are
 * real-calendar facts these tests can state — not the fixed demo week.
 */

const UID = 'coach-1';
const NOW = new Date('2026-09-28T09:00:00Z'); // 12:00 in Cairo

const client = (id, name, extra = {}) => ({
  id, coach_id: UID, member_id: null, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: 'Life coaching · Basic', specialty: 'Life coaching', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''),
  avatar_bg: '#3E6FB0', active: true, progress: 40, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: 'Sleep better', focus: '', signup_completed_at: null,
  created_at: `2026-09-0${id.length % 9 + 1}T00:00:00Z`, ...extra,
});
const task = (id, clientId, title, dueAt, extra = {}) => ({
  id, client_id: clientId, title, description: '', due_at: dueAt, due_has_time: false, recurring: false, done: false,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});

const roster = () => ({
  clients: [
    // Next session today at 18:00 Cairo.
    client('c-rana', 'Rana Adel', { next_session_at: '2026-09-28T15:00:00Z' }),
    client('c-omar', 'Omar Said', { payment_status: 'paid', progress: 80 }),
    client('c-old', 'Old Member', { active: false }),
  ],
  client_private: [
    { client_id: 'c-omar', notes: '', is_favourite: true },
    { client_id: 'c-rana', notes: 'Prefers mornings', is_favourite: false },
  ],
  tasks: [
    // Due Sat 26 Sep (local midnight) — two days late.
    task('t-late', 'c-rana', 'Evening walk', '2026-09-25T21:00:00Z'),
    task('t-next', 'c-rana', 'Journal', '2026-10-04T21:00:00Z'),
    task('t-omar', 'c-omar', 'Meal prep', '2026-10-01T21:00:00Z'),
  ],
  sessions: [
    { id: 's-past', client_id: 'c-rana', scheduled_at: '2026-09-21T15:00:00Z', attendance: 'attended', recap: 'Good start' },
    { id: 's-next', client_id: 'c-rana', scheduled_at: '2026-10-05T15:00:00Z', attendance: null, recap: null },
  ],
  packages: [{ client_id: 'c-rana', total: 8, used: 3, expires_at: '2026-10-10T21:00:00Z' }],
  payments: [
    { id: 'pay-1', client_id: 'c-rana', kind: 'charge', amount: 500, currency: 'EGP', state: 'completed', method: 'Cash', note: null, refund_of: null, paid_at: '2026-09-20T10:00:00Z' },
  ],
});

async function open(browser, { lang = 'en', dark = false, tables = roster(), fail, signedIn = true, screen = 'clients', params } = {}) {
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
  await installFakeSupabase(page, { userId: UID, tables, fail });
  if (signedIn) await signIn(page, UID);
  if (screen) await go(page, screen, params);
  return { page, ctx, errs };
}

async function go(page, screen, params) {
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params]);
  await page.waitForTimeout(300);
}

const frame = (page) => page.locator('.phone-frame').first();
const callsTo = async (page, table, op) => (await dbCalls(page)).filter((c) => c.table === table && (!op || c.op === op));
const DEMO_NAMES = /Sara Ahmed|Omar Fathy|Mona Reda|Khaled Ibrahim|Laila Youssef|Nour Hassan/;

// --- Reading -------------------------------------------------------------------

test('signed out, Members still shows the demo roster and asks Supabase for nothing', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { signedIn: false });
  await expect(frame(page)).toContainText('Sara Ahmed');
  expect(await callsTo(page, 'clients')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('signed in, Members lists the real roster — no demo members, real overdue and favourites', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  const text = await frame(page).innerText();
  for (const name of ['Rana Adel', 'Omar Said', 'Old Member']) expect(text).toContain(name);
  expect(text).not.toMatch(DEMO_NAMES);
  expect(text).toMatch(/3 total/i);

  const card = (name) => page.locator('.clients-card', { hasText: name });
  // Rana's walk was due two days ago, against the real calendar.
  await expect(card('Rana Adel')).toContainText('Task overdue');
  await expect(card('Rana Adel')).toContainText('Today');
  await expect(card('Omar Said')).not.toContainText('overdue');
  await expect(card('Old Member')).toContainText('Inactive');
  await expect(card('Omar Said').getByRole('button', { name: /favourite/i })).toHaveAttribute('aria-pressed', 'true');

  const reads = await callsTo(page, 'clients', 'select');
  expect(reads[0].filters).toEqual([['coach_id', UID]]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a coach with no members yet gets an empty roster with a way to add one', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { tables: {} });
  await expect(frame(page)).toContainText('No members yet');
  expect(await frame(page).innerText()).not.toMatch(DEMO_NAMES);
  await page.locator('.clients-empty-add').click();
  expect(await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen)).toBe('addClient');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed roster read shows the retry state, never the demo roster', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['clients.select'] });
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(DEMO_NAMES);
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(frame(page)).toContainText('Rana Adel');
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Roster writes ---------------------------------------------------------------

test('starring a member writes client_private, creating the row the first time', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  const star = page.locator('.clients-card', { hasText: 'Old Member' }).getByRole('button', { name: /favourite/i });
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  const writes = (await callsTo(page, 'client_private')).filter((c) => c.op !== 'select');
  expect(writes.map((c) => c.op)).toEqual(['update', 'insert']);
  expect(await dbRows(page, 'client_private')).toContainEqual({ client_id: 'c-old', is_favourite: true });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('adding a member inserts one clients row for this coach; notes go to client_private', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'addClient' });
  await page.locator('#acname').fill('Hana Mostafa');
  await page.locator('#acgoal').fill('Run 5k');
  await page.locator('#acnotes').fill('Knee injury last year');
  await page.locator('.add-client-submit').click();
  await expect(frame(page)).toContainText('Hana Mostafa');

  const [insert] = await callsTo(page, 'clients', 'insert');
  expect(insert.values).toMatchObject({ coach_id: UID, full_name: 'Hana Mostafa', initials: 'HM', goal: 'Run 5k', active: true, progress: 0, payment_status: 'due' });
  expect(insert.values).not.toHaveProperty('notes');
  expect(insert.values).not.toHaveProperty('member_id');
  const hana = (await dbRows(page, 'clients')).find((c) => c.full_name === 'Hana Mostafa');
  expect(await dbRows(page, 'client_private')).toContainEqual({ client_id: hana.id, notes: 'Knee injury last year' });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed add keeps the form and says so', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'addClient', fail: ['clients.insert'] });
  await page.locator('#acname').fill('Hana Mostafa');
  await page.locator('.add-client-submit').click();
  await expect(page.locator('.add-client-error')).toHaveText('Something went wrong. Please try again.');
  await expect(page.locator('#acname')).toHaveValue('Hana Mostafa');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('editing a member updates clients (with new initials) and client_private; archiving sets inactive', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'editClient', params: { clientId: 'c-rana' } });
  await expect(page.locator('#ecname')).toHaveValue('Rana Adel');
  await page.locator('#ecname').fill('Rana Kamal');
  await page.locator('#ecnotes').fill('Prefers evenings');
  await page.locator('.edit-client-save').click();
  await expect(frame(page)).toContainText('Rana Kamal');

  const rana = (await dbRows(page, 'clients')).find((c) => c.id === 'c-rana');
  expect(rana).toMatchObject({ full_name: 'Rana Kamal', initials: 'RK' });
  expect(await dbRows(page, 'client_private')).toContainEqual({ client_id: 'c-rana', notes: 'Prefers evenings', is_favourite: false });

  await go(page, 'editClient', { clientId: 'c-omar' });
  await page.locator('.edit-client-archive-btn').click();
  await page.locator('.edit-client-modal-btn-danger').click();
  await expect(page.locator('.clients-card', { hasText: 'Omar Said' })).toContainText('Inactive');
  expect((await dbRows(page, 'clients')).find((c) => c.id === 'c-omar')).toMatchObject({ active: false, needs_checkin: false });
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Tasks -------------------------------------------------------------------------

test('a task added for "tomorrow" is stored as local midnight tomorrow, and reads back that way', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'addTask', params: { clientId: 'c-omar' } });
  await page.locator('#task-title').fill('Stretch');
  await page.getByRole('button', { name: 'Tomorrow' }).click();
  await page.locator('.add-task-save').click();
  await expect(page.locator('.client-detail-task-row', { hasText: 'Stretch' })).toContainText('Due tomorrow');

  const [insert] = await callsTo(page, 'tasks', 'insert');
  // Tue 29 Sep 00:00 in Cairo.
  expect(insert.values).toMatchObject({ client_id: 'c-omar', title: 'Stretch', due_at: '2026-09-28T21:00:00.000Z', due_has_time: false, done: false });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('ClientDetail shows real tasks, toggles, edits and deletes them', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientDetail', params: { clientId: 'c-rana' } });
  const row = (title) => page.locator('.client-detail-task-row', { hasText: title });
  await expect(row('Evening walk')).toContainText('Due Sat, Sep 26');
  await expect(row('Evening walk').locator('.client-detail-task-due')).toHaveClass(/is-overdue/);
  await expect(row('Journal')).not.toContainText('overdue');

  await row('Evening walk').getByRole('button', { name: /Toggle complete/ }).click();
  await expect(row('Evening walk').locator('.client-detail-task-check')).toHaveClass(/is-done/);
  const done = (await dbRows(page, 'tasks')).find((t) => t.id === 't-late');
  expect(done.done).toBe(true);
  expect(done.done_at).toBe(NOW.toISOString());

  await row('Journal').locator('.client-detail-task-main').click();
  await page.locator('#cdetitle').fill('Journal nightly');
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(row('Journal nightly')).toContainText('Due today');
  expect((await dbRows(page, 'tasks')).find((t) => t.id === 't-next')).toMatchObject({ title: 'Journal nightly', due_at: '2026-09-27T21:00:00.000Z' });

  await row('Journal nightly').locator('.client-detail-task-main').click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(row('Journal nightly')).toHaveCount(0);
  expect((await dbRows(page, 'tasks')).map((t) => t.id)).not.toContain('t-next');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed task toggle leaves the task as it is stored and says so', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientDetail', params: { clientId: 'c-rana' }, fail: ['tasks.update'] });
  const row = page.locator('.client-detail-task-row', { hasText: 'Journal' });
  await row.getByRole('button', { name: /Toggle complete/ }).click();
  await expect(page.locator('.client-detail-action-error').first()).toHaveText('Something went wrong. Please try again.');
  await expect(row.locator('.client-detail-task-check')).not.toHaveClass(/is-done/);
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Sessions, package, payments ---------------------------------------------------

test('session history is the real sessions, and a recap saves once, when the field is left', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientDetail', params: { clientId: 'c-rana' } });
  const history = page.locator('.client-detail-session-card');
  await expect(history).toHaveCount(2);
  // Newest first; times in Cairo.
  await expect(history.nth(0)).toContainText('Oct 5, 2026');
  await expect(history.nth(0)).toContainText('6:00 PM');
  await expect(history.nth(0)).toContainText('Upcoming');
  await expect(history.nth(1)).toContainText('Attended');
  expect(await frame(page).innerText()).not.toContain('Oct 18, 2025');

  await history.nth(1).locator('.client-detail-session-row').click();
  const recap = page.locator('#recap-s-past');
  await expect(recap).toHaveValue('Good start');
  await recap.fill('Good start — keep the walk going');
  expect(await callsTo(page, 'sessions', 'update')).toEqual([]);
  await page.locator('.client-detail-header-title').click();
  await expect.poll(async () => (await callsTo(page, 'sessions', 'update')).length).toBe(1);
  expect((await dbRows(page, 'sessions')).find((s) => s.id === 's-past').recap).toBe('Good start — keep the walk going');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the package is the real one; renewing adds sessions and a fresh 30 days from today', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientDetail', params: { clientId: 'c-rana' } });
  await expect(page.locator('.client-detail-pkg-remaining')).toHaveText('5');
  // No demo streak on a real member.
  await expect(page.locator('.client-detail-hero-stat-num').nth(2)).toHaveText('—');
  await expect(page.locator('.client-detail-pkg-expiry')).toContainText('Oct 11, 2026');
  await page.locator('.client-detail-renew-link').click();
  await expect(page.locator('.client-detail-sheet-sub').first()).toContainText('Oct 28, 2026');
  await page.getByRole('button', { name: '+4 sessions' }).click();
  await expect(page.locator('.client-detail-pkg-remaining')).toHaveText('9');
  expect((await dbRows(page, 'packages'))[0]).toMatchObject({ total: 12, used: 3, expires_at: '2026-10-27T21:00:00.000Z' });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a member with no package shows none, and setting one up creates it', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientDetail', params: { clientId: 'c-omar' } });
  await expect(page.locator('.client-detail-pkg-none')).toHaveText('No session package yet.');
  await expect(page.locator('.client-detail-hero-stat-num').nth(1)).toHaveText('—');
  await page.locator('.client-detail-renew-link', { hasText: 'Set up' }).click();
  await page.getByRole('button', { name: '+8 sessions' }).click();
  await expect(page.locator('.client-detail-pkg-remaining')).toHaveText('8');
  expect(await dbRows(page, 'packages')).toContainEqual({ client_id: 'c-omar', total: 8, used: 0, expires_at: '2026-10-27T21:00:00.000Z' });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('recording and refunding a payment writes ledger rows and moves the payment status', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientDetail', params: { clientId: 'c-rana' } });
  await page.locator('.client-detail-record-btn').click();
  await page.locator('#cdamount').fill('750');
  await page.getByRole('button', { name: 'Card' }).click();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.locator('.client-detail-payment-title')).toHaveText('Payment up to date');

  const payments = await dbRows(page, 'payments');
  const charge = payments.find((p) => p.amount === 750);
  expect(charge).toMatchObject({ client_id: 'c-rana', kind: 'charge', method: 'Card', state: 'completed' });
  expect((await dbRows(page, 'clients')).find((c) => c.id === 'c-rana').payment_status).toBe('paid');

  await page.locator('.client-detail-view-history').click();
  const history = page.locator('.client-detail-payment-history-row');
  await expect(history.filter({ hasText: '500 EGP' })).toContainText('Sep 20, 2026');
  await history.filter({ hasText: '500 EGP' }).getByRole('button', { name: 'Refund' }).click();
  await page.locator('#cdrefundreason').fill('Session cancelled');
  await page.getByRole('button', { name: 'Confirm refund' }).click();

  const refund = (await dbRows(page, 'payments')).find((p) => p.kind === 'refund');
  expect(refund).toMatchObject({ client_id: 'c-rana', amount: 500, refund_of: 'pay-1', note: 'Session cancelled', method: 'Cash' });
  expect((await dbRows(page, 'clients')).find((c) => c.id === 'c-rana').payment_status).toBe('due');
  // Payments are a ledger: nothing was ever updated or deleted.
  expect((await callsTo(page, 'payments')).map((c) => c.op).filter((op) => op !== 'select' && op !== 'insert')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('ClientDetail in Arabic and dark mode: real dates in Arabic, statuses translated, nothing black', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true, screen: 'clientDetail', params: { clientId: 'c-rana' } });
  await expect(page.locator('.client-detail-session-card').nth(1)).toContainText('حضر');
  await expect(page.locator('.client-detail-session-card').nth(0)).toContainText('قادمة');
  await expect(page.locator('.client-detail-pkg-expiry')).toContainText('11 أكتوبر 2026');
  const black = await page.locator('.phone-frame *').evaluateAll((els) =>
    els.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && getComputedStyle(el).color === 'rgb(0, 0, 0)').map((el) => el.textContent.trim().slice(0, 30)),
  );
  expect(black).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});
