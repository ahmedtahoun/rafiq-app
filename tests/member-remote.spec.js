import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 3, the member side: the screens that were
 * hardcoded to the demo member ('sara') and the demo coach read the
 * signed-in member's own relationships instead — ClientHome, ClientTasks,
 * MyCoaches, ClientCoach, ClientProfile and EditClientProfile — through
 * tests/fakeSupabase.js. What a member may write is proven against the real
 * schema by supabase/tests/12_member_app.sql.
 *
 * The page clock is pinned to noon on Mon 28 Sep 2026 in Cairo, like
 * roster-remote.spec.js.
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
const coach = (id, name, extra = {}) => ({
  coach_id: id, full_name: name, title: 'Nutrition coaching', verified: true, rating_count: 4, rating_avg: 4.5,
  bio: `${name} helps people eat well.`, certifications: ['ICF ACC'], avatar_photo_url: null, cover_photo_url: null, ...extra,
});
const task = (id, clientId, title, dueAt, extra = {}) => ({
  id, client_id: clientId, title, description: '', due_at: dueAt, due_has_time: false, recurring: false, done: false,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});

const ownProfile = { id: MEMBER, full_name: 'Hana M.', phone: '10 5550 1234', country_code: '+20', email: 'hana@x.com', account_status: 'active' };

const oneCoach = () => ({
  profiles: [{ ...ownProfile }],
  clients: [client('rel-a', 'coach-a', { next_session_at: '2026-09-28T15:00:00Z' })],
  coach_directory: [coach('coach-a', 'Dina Farouk')],
  tasks: [
    task('t-late', 'rel-a', 'Log breakfast', '2026-09-25T21:00:00Z'),
    task('t-next', 'rel-a', 'Try a new vegetable', '2026-10-01T21:00:00Z'),
  ],
  packages: [{ client_id: 'rel-a', total: 8, used: 3, expires_at: '2026-10-10T21:00:00Z' }],
  sessions: [
    { id: 's-1', client_id: 'rel-a', scheduled_at: '2026-09-21T15:00:00Z', recap: 'Great first week', attendance: 'attended' },
    // A future session's text is never shown as feedback.
    { id: 's-2', client_id: 'rel-a', scheduled_at: '2026-10-05T15:00:00Z', recap: 'Not yet', attendance: null },
  ],
  mood_checkins: [],
});

const twoCoaches = () => {
  const t = oneCoach();
  t.clients.push(client('rel-b', 'coach-b', { program: 'Yoga · Basic', goal: 'Touch my toes' }));
  t.clients.push(client('rel-old', 'coach-c', { active: false }));
  t.coach_directory.push(coach('coach-b', 'Omar Nabil', { title: 'Yoga coaching' }), coach('coach-c', 'Layla Samir', { title: 'Life coaching' }));
  t.tasks.push(task('t-yoga', 'rel-b', 'Stretch for 10 minutes', '2026-09-29T21:00:00Z'));
  return t;
};

async function open(browser, { lang = 'en', dark = false, tables = oneCoach(), fail, signedIn = true, screen = 'clientHome' } = {}) {
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
  await installFakeSupabase(page, { userId: MEMBER, tables, fail });
  if (signedIn) await signIn(page, MEMBER);
  if (screen) await go(page, screen);
  return { page, ctx, errs };
}

async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(300);
}
const currentScreen = (page) => page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen);
const frame = (page) => page.locator('.phone-frame').first();
const callsTo = async (page, table, op) => (await dbCalls(page)).filter((c) => c.table === table && (!op || c.op === op));
// The demo member, demo coach and demo claims that must never reach a real member.
const DEMO = /Sara Ahmed|Yasmin|5-day check-in streak|Preview: switch/;

// --- Identity ------------------------------------------------------------------

test('signed out, the member screens still show the demo member and ask Supabase for nothing', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { signedIn: false });
  await expect(frame(page)).toContainText('Sara Ahmed');
  await expect(frame(page)).toContainText('Yasmin');
  expect(await callsTo(page, 'clients')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a member no coach has accepted yet sees that — never the demo member or coach', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { tables: { profiles: [{ ...ownProfile }] } });
  for (const screen of ['clientHome', 'clientTasks', 'clientCoach', 'myCoaches', 'clientProfile']) {
    await go(page, screen);
    await expect(page.locator('.no-coach-yet'), screen).toBeVisible();
    expect(await frame(page).innerText(), screen).not.toMatch(DEMO);
  }
  // Their own name comes from their account.
  await expect(frame(page)).toContainText('Hana M.');
  await page.locator('.no-coach-yet-cta').click();
  expect(await currentScreen(page)).toBe('discover');

  const reads = await callsTo(page, 'clients', 'select');
  expect(reads[0].filters).toEqual([['member_id', MEMBER]]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('with a coach, Home is their real plan: the coach, the goal, real overdue, the latest past recap', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  const text = await frame(page).innerText();
  expect(text).not.toMatch(DEMO);
  expect(text).toContain('Hana Mostafa');
  expect(text).toContain('Eat more greens');
  // The coach's name is isolated inside the sentence (U+2068 … U+2069).
  expect(text).toContain('with \u2068Dina Farouk\u2069');
  expect(text).toContain('Today, 6:00 PM');
  expect(text).toContain('3/8');
  expect(text).toContain('Great first week');
  expect(text).not.toContain('Not yet');

  // The plan's tasks, against the real calendar.
  await go(page, 'clientTasks');
  const row = (title) => page.locator('.client-tasks-row', { hasText: title });
  await expect(row('Log breakfast')).toContainText('Overdue');
  await expect(row('Try a new vegetable')).not.toContainText('Overdue');
  await expect(frame(page)).toContainText('From \u2068Dina Farouk\u2069');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('ticking a task writes only done and done_at; a failure leaves it as stored', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientTasks' });
  const box = page.locator('.client-tasks-row', { hasText: 'Try a new vegetable' }).locator('.client-tasks-box');
  await box.click();
  await expect(box).toHaveAttribute('aria-pressed', 'true');
  const [update] = await callsTo(page, 'tasks', 'update');
  expect(Object.keys(update.values).sort()).toEqual(['done', 'done_at']);
  expect(update.values).toEqual({ done: true, done_at: NOW.toISOString() });
  expect(update.filters).toEqual([['id', 't-next']]);

  await setFailing(page, ['tasks.update']);
  await box.click();
  await expect(page.locator('.client-tasks-error')).toHaveText('Something went wrong. Please try again.');
  await expect(box).toHaveAttribute('aria-pressed', 'true');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a mood check-in is a new mood_checkins row for this relationship', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientTasks' });
  await page.locator('.client-tasks-mood-btn').first().click();
  await expect(page.locator('.client-tasks-mood-logged')).toBeVisible();
  expect(await dbRows(page, 'mood_checkins')).toEqual([{ id: 'mood_checkins-1', client_id: 'rel-a', mood: 'great' }]);
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- More than one coach -------------------------------------------------------------

test('with two coaches, My Coaches lists both (and a past one), and choosing one switches the app to them', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { tables: twoCoaches(), screen: 'myCoaches' });
  const cards = page.getByTestId('my-coaches-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Dina Farouk');
  await expect(cards.nth(0)).toContainText('Viewing');
  await expect(cards.nth(1)).toContainText('Omar Nabil');
  await expect(page.locator('.my-coaches-past')).toContainText('Layla Samir');
  expect(await frame(page).innerText()).not.toMatch(DEMO);

  await cards.nth(1).getByRole('button', { name: 'Tasks' }).click();
  expect(await currentScreen(page)).toBe('clientTasks');
  await expect(frame(page)).toContainText('Stretch for 10 minutes');
  await expect(frame(page)).not.toContainText('Log breakfast');
  await go(page, 'clientHome');
  await expect(frame(page)).toContainText('Touch my toes');
  await expect(frame(page)).toContainText('Omar Nabil');

  // Remembered for next time.
  expect(await page.evaluate((m) => localStorage.getItem(`rafiq_member_relationship_${m}`), MEMBER)).toBe('rel-b');
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- ClientCoach, ClientProfile, EditClientProfile ------------------------------------

test('ClientCoach shows the real coach, and a report goes to the queue for this relationship', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientCoach' });
  const text = await frame(page).innerText();
  expect(text).toContain('Dina Farouk');
  expect(text).toContain('ICF ACC');
  expect(text).toContain('Dina Farouk helps people eat well.');
  expect(text).not.toMatch(DEMO);
  // The demo's standing slot and Full Access upgrade aren't a real member's.
  await expect(page.locator('.client-coach-upgrade')).toHaveCount(0);

  await setFailing(page, ['pro_reports.insert']);
  await page.locator('.client-coach-report').click();
  await page.locator('.client-coach-reason').first().click();
  await expect(page.locator('.client-coach-report-error')).toBeVisible();
  await setFailing(page, []);
  await page.locator('.client-coach-reason').first().click();
  await expect(page.locator('.client-coach-reported')).toBeVisible();
  expect(await dbRows(page, 'pro_reports')).toEqual([
    { id: 'pro_reports-1', reporter_id: MEMBER, coach_id: 'coach-a', client_id: 'rel-a', reason: 'no_show', details: '' },
  ]);
  // Nothing went to the demo's local report list.
  expect(await page.evaluate(async () => (await import('/src/lib/mockStore.ts')).getProReports().length)).toBe(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test("editing your profile writes your own account, never the coach's roster row", async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'editClientProfile' });
  await expect(page.locator('#cname')).toHaveValue('Hana M.');
  await expect(page.locator('#cage')).toHaveCount(0);
  await page.locator('#cname').fill('Hana Mostafa Ali');
  await page.locator('#cphone').fill('10 5550 9999');
  await page.locator('.edit-client-profile-save').click();
  expect(await currentScreen(page)).toBe('clientProfile');
  await expect(frame(page)).toContainText('Hana Mostafa Ali');

  expect(await callsTo(page, 'clients', 'update')).toEqual([]);
  const [update] = await callsTo(page, 'profiles', 'update');
  expect(update.values).toEqual({ full_name: 'Hana Mostafa Ali', phone: '10 5550 9999', country_code: '+20' });
  expect(update.filters).toEqual([['id', MEMBER]]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('account deletion weighs this member\'s own obligations, not the demo member\'s', async ({ browser }) => {
  // No sessions left and none booked: nothing is owed, so deletion is offered.
  const tables = oneCoach();
  tables.clients[0].next_session_at = null;
  tables.packages[0].used = 8;
  const { page, ctx, errs } = await open(browser, { tables, screen: 'clientProfile' });
  await page.getByRole('button', { name: 'Delete Account' }).click();
  await expect(page.locator('.client-profile-modal-title')).toHaveText('Delete your account?');
  await ctx.close();

  // Sessions still to use: blocked, and it says why.
  const second = await open(browser, { screen: 'clientProfile' });
  await second.page.getByRole('button', { name: 'Delete Account' }).click();
  await expect(second.page.locator('.client-profile-modal-body')).toContainText('5');
  expect([...errs, ...second.errs]).toEqual([]);
  await second.ctx.close();
});

test('a failed load shows the retry state, never the demo member', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['clients.select'] });
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(DEMO);
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(frame(page)).toContainText('Dina Farouk');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('in Arabic and dark mode: the coach name stays isolated, no-coach reads in Arabic, nothing black', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true, screen: 'clientTasks' });
  // "From {coach}" with the name isolated inside the Arabic sentence.
  await expect(page.locator('.client-tasks-subtitle')).toContainText('⁨Dina Farouk⁩');
  const black = await page.locator('.phone-frame *').evaluateAll((els) =>
    els.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && getComputedStyle(el).color === 'rgb(0, 0, 0)').map((el) => el.textContent.trim().slice(0, 30)),
  );
  expect(black).toEqual([]);
  await ctx.close();

  const empty = await open(browser, { lang: 'ar', dark: true, tables: { profiles: [{ ...ownProfile }] } });
  await expect(empty.page.locator('.no-coach-yet-title')).toHaveText('لا يوجد مدرب بعد');
  expect([...errs, ...empty.errs]).toEqual([]);
  await empty.ctx.close();
});

test('a session the coach cancelled, or one the member missed, is not counted as one held', async ({ browser }) => {
  const tables = oneCoach();
  // Held on the 21st (s-1, already there), one cancelled on the 24th, and a
  // no-show on the 25th.
  tables.sessions.push({ id: 's-x', client_id: 'rel-a', scheduled_at: '2026-09-24T15:00:00Z', recap: null, attendance: 'cancelled' });
  tables.sessions.push({ id: 's-y', client_id: 'rel-a', scheduled_at: '2026-09-25T15:00:00Z', recap: null, attendance: 'no_show' });
  const { page, ctx, errs } = await open(browser, { tables, screen: 'clientCoach' });
  const sessions = page.locator('.client-coach-stat').filter({ hasText: 'Sessions' });
  await expect(sessions.locator('.client-coach-stat-value')).toHaveText('1');
  expect(errs).toEqual([]);
  await ctx.close();
});

/**
 * Help Centre's "Message {coach}" row, which #155 found naming the demo
 * coach. The screen is mostly static copy, which is why it sat outside the
 * member walk and why the bug lasted: `getCoachProfile()` with no remote
 * branch fell through to mockStore's own 'Yasmin El-Sayed'.
 *
 * Three states, because the fix is not only "read the right name": a screen
 * someone may open *because* something is broken must not block on a
 * network read or invent a pro they do not have.
 */
test('Help Centre names the member\'s real pro, or offers nobody', async ({ browser }) => {
  const withCoach = await open(browser, { screen: 'clientHelpCenter' });
  await expect(withCoach.page.locator('.client-help-contact')).toHaveText(/Dina Farouk/);
  expect(await frame(withCoach.page).innerText()).not.toMatch(DEMO);
  // The answers are the point of the screen; they render either way.
  await expect(withCoach.page.locator('.client-help-item')).not.toHaveCount(0);
  expect(withCoach.errs).toEqual([]);
  await withCoach.ctx.close();

  // No pro yet: no row at all, rather than "Message " or a placeholder name.
  const noCoach = await open(browser, { screen: 'clientHelpCenter', tables: { profiles: [{ ...ownProfile }] } });
  await expect(noCoach.page.locator('.client-help-contact')).toHaveCount(0);
  await expect(noCoach.page.locator('.client-help-item')).not.toHaveCount(0);
  expect(await frame(noCoach.page).innerText()).not.toMatch(DEMO);
  expect(noCoach.errs).toEqual([]);
  await noCoach.ctx.close();

  // A failed read is the same: the answers stay, nobody is named, and the
  // screen never covers itself in a LoadState.
  const failed = await open(browser, { screen: 'clientHelpCenter', fail: ['clients'] });
  await expect(failed.page.locator('.client-help-contact')).toHaveCount(0);
  await expect(failed.page.locator('.client-help-item')).not.toHaveCount(0);
  await expect(failed.page.locator('.load-state')).toHaveCount(0);
  await failed.ctx.close();
});

test('Arabic: the pro\'s name in Help Centre is isolated, so bidi cannot move it', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientHelpCenter', lang: 'ar' });
  const row = page.locator('.client-help-contact');
  await expect(row).toHaveText(/Dina Farouk/);
  // isolate() wraps the value in U+2068/U+2069. Without them a Latin name
  // inside Arabic copy reorders (CLAUDE.md), and no visual assertion here
  // would catch it.
  expect(await row.innerText()).toMatch(/\u2068Dina Farouk\u2069/);
  expect(errs).toEqual([]);
  await ctx.close();
});
