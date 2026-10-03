import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 6, My Programs and Program Detail: signed
 * in, the member's own enrollments with the coach they're viewing
 * (src/lib/programData.ts), each with its offering, never the demo
 * member's. RLS (enrollments_select via can_see_client) keeps them to the
 * member; the query asks only for the relationship being viewed.
 */

const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const client = (id, coachId, extra = {}) => ({
  id, coach_id: coachId, member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
  email: null, city: null, program: '', specialty: 'Nutrition', plan: 'Basic', initials: 'HM',
  avatar_bg: '#3E6FB0', active: true, progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: 'Eat more greens', focus: '', signup_completed_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});
const coach = (id, name) => ({
  coach_id: id, full_name: name, title: 'Nutrition coaching', verified: true, rating_count: 4, rating_avg: 4.5,
  bio: '', certifications: [], avatar_photo_url: null, cover_photo_url: null,
});
const offering = (id, name, extra = {}) => ({
  id, coach_id: 'coach-a', name, description: '', type: 'program', duration: '8 weeks', format: 'online',
  price: 2400, currency: 'EGP', session_count: 8, active: true, created_at: '2026-08-01T00:00:00Z', ...extra,
});
const enrollment = (clientId, offeringId, extra = {}) => ({
  client_id: clientId, offering_id: offeringId, sessions_completed: 0, enrolled_at: '2026-09-01T10:00:00Z',
  milestone_reviewed_at: null, ...extra,
});

const tables = ({ enrollments, clientExtra = {}, goal = 'Sleep through the night', relationships = true } = {}) => ({
  profiles: [{ id: MEMBER, full_name: 'Hana M.', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' }],
  clients: relationships ? [client('rel-a', 'coach-a', { next_session_at: '2026-09-29T07:00:00Z', next_session_type: 'standard', ...clientExtra })] : [],
  coach_directory: [coach('coach-a', 'Dina Farouk')],
  tasks: [], mood_checkins: [], packages: [], sessions: [],
  member_profiles: [{ profile_id: MEMBER, goal, focus: 'nutrition', signup_completed_at: '2026-09-01T00:00:00Z' }],
  offerings: [
    offering('off-reset', 'Nutrition Reset'),
    offering('off-check', 'Weekly check-ins', { type: 'session', session_count: null, duration: '30 min' }),
    // Archived since: a member's history still names it.
    offering('off-old', 'Spring Detox', { session_count: 4, active: false }),
  ],
  enrollments: enrollments ?? [
    enrollment('rel-a', 'off-reset', { sessions_completed: 2, enrolled_at: '2026-09-10T10:00:00Z' }),
    enrollment('rel-a', 'off-check', { sessions_completed: 5, enrolled_at: '2026-08-20T10:00:00Z' }),
    enrollment('rel-a', 'off-old', { sessions_completed: 4, enrolled_at: '2026-05-03T10:00:00Z', milestone_reviewed_at: '2026-06-01T10:00:00Z' }),
    // Someone else's relationship.
    enrollment('rel-other', 'off-reset', { sessions_completed: 7 }),
  ],
});

async function open(browser, { lang = 'en', dark = false, data = tables(), fail } = {}) {
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
  await signIn(page, MEMBER);
  await go(page, 'myPrograms');
  return { page, ctx, errs };
}
async function go(page, screen, params) {
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params]);
  await page.waitForTimeout(300);
}
const appState = (page) => page.evaluate(async () => {
  const { screen, params } = (await import('/src/store/appStore.ts')).useAppStore.getState();
  return { screen, params };
});
const rows = (page) => page.locator('.my-programs-row');
const frame = (page) => page.locator('.phone-frame').first();
const DEMO = /8-Week Transformation|1:1 Coaching Session|Feel more in control/;

test('My Programs lists the member\'s own enrollments, newest first, not the demo\'s', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).locator('.my-programs-name')).toHaveText(['Nutrition Reset', 'Weekly check-ins', 'Spring Detox']);
  await expect(rows(page).nth(0)).toContainText('25%');
  await expect(rows(page).nth(1)).toContainText('Ongoing');
  await expect(rows(page).nth(2)).toContainText('100%');
  // The member's next session, from their roster row, in Cairo's wall time.
  await expect(rows(page).nth(0)).toContainText('Next: Tue, 10:00 AM');
  await expect(frame(page)).not.toContainText(DEMO);
  const read = (await dbCalls(page)).find((c) => c.table === 'enrollments');
  expect(read).toMatchObject({ op: 'select', filters: [['client_id', 'rel-a']] });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('opening a program shows its real progress, dates and goal', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await rows(page).nth(0).click();
  expect(await appState(page)).toEqual({ screen: 'programDetail', params: { offeringId: 'off-reset' } });
  await expect(page.locator('.program-detail-name')).toHaveText('Nutrition Reset');
  await expect(page.locator('.program-detail-ring-value')).toHaveText('25%');
  await expect(page.locator('.program-detail-fraction')).toHaveText('2/8');
  await expect(page.locator('.program-detail-goal-text')).toHaveText('Eat more greens');
  await expect(page.locator('.program-detail-history-row')).toHaveCount(1);
  await expect(page.locator('.program-detail-history-row')).toContainText(/Sep 10, 2026|10 Sept? 2026/);
  await expect(page.locator('.program-detail-link-title')).toHaveText('Tue, 10:00 AM');
  await expect(frame(page)).not.toContainText(DEMO);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a finished program shows its milestone, and the review only once it was given', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await rows(page).nth(2).click();
  await expect(page.locator('.program-detail-name')).toHaveText('Spring Detox');
  await expect(page.locator('.program-detail-complete')).toHaveText('Completed');
  await expect(page.locator('.program-detail-history-label')).toHaveText(['Enrolled', 'Milestone reached', 'Reviewed']);
  await ctx.close();

  // Finished, not yet reviewed.
  const data = tables();
  data.enrollments.find((e) => e.offering_id === 'off-old').milestone_reviewed_at = null;
  const second = await open(browser, { data });
  await go(second.page, 'programDetail', { offeringId: 'off-old' });
  await expect(second.page.locator('.program-detail-history-label')).toHaveText(['Enrolled', 'Milestone reached']);
  expect([...errs, ...second.errs]).toEqual([]);
  await second.ctx.close();
});

test('the goal falls back to the member\'s own, and is never invented', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ clientExtra: { goal: '' } }) });
  await go(page, 'programDetail', { offeringId: 'off-reset' });
  await expect(page.locator('.program-detail-goal-text')).toHaveText('Sleep through the night');
  await ctx.close();

  const second = await open(browser, { data: tables({ clientExtra: { goal: '' }, goal: '' }) });
  await go(second.page, 'programDetail', { offeringId: 'off-reset' });
  await expect(second.page.locator('.program-detail-name')).toHaveText('Nutrition Reset');
  await expect(second.page.locator('.program-detail-goal')).toHaveCount(0);
  await expect(frame(second.page)).not.toContainText(DEMO);
  expect([...errs, ...second.errs]).toEqual([]);
  await second.ctx.close();
});

test('a program that isn\'t theirs is "not found"', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await go(page, 'programDetail', { offeringId: 'off-nope' });
  await expect(page.getByText('Program not found')).toBeVisible();
  await go(page, 'programDetail');
  await expect(page.getByText('Program not found')).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('no programs: booking goes to the coach\'s page, never the demo booking screen', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ enrollments: [], clientExtra: { next_session_at: null } }) });
  await expect(page.getByText("You're not enrolled in any programs yet")).toBeVisible();
  await page.getByRole('button', { name: 'Book a session' }).click();
  expect(await appState(page)).toEqual({ screen: 'coachPreview', params: { coachId: 'coach-a' } });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a member no coach has accepted yet sees how to find one', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ relationships: false }) });
  await expect(page.getByText('No coach yet')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(frame(page)).not.toContainText(DEMO);
  expect((await dbCalls(page)).some((c) => c.table === 'enrollments')).toBe(false);
  expect(errs).toEqual([]);
  await ctx.close();
});

for (const what of ['enrollments.select', 'offerings.select']) {
  test(`a failed read (${what}) shows retry, never the demo's programs`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { fail: [what] });
    await expect(page.locator('.load-state')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(DEMO);
    await setFailing(page, []);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(rows(page)).toHaveCount(3);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('a failed read of the goal on Program Detail shows retry', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['member_profiles.select'] });
  await go(page, 'programDetail', { offeringId: 'off-reset' });
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(DEMO);
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.program-detail-name')).toHaveText('Nutrition Reset');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic and dark', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true });
  await expect(rows(page).nth(1)).toContainText('مستمر');
  await rows(page).nth(0).click();
  await expect(page.locator('.program-detail-history-label')).toHaveText(['الالتحاق']);
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(errs).toEqual([]);
  await ctx.close();
});
