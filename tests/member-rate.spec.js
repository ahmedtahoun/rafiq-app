import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 6, Rate Coach: signed in, the member rates
 * a session of their own from their Sessions screen, and the rating is a
 * `ratings` row for that relationship, coach and session
 * (src/lib/ratingData.ts; ratings_write_member, one per session). Never the
 * demo's local ratings.
 */

const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const client = (id, coachId, extra = {}) => ({
  id, coach_id: coachId, member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
  email: null, city: null, program: '', specialty: 'Nutrition', plan: 'Basic', initials: 'HM',
  avatar_bg: '#3E6FB0', active: true, progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: '', focus: '', signup_completed_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});
const session = (id, at, extra = {}) => ({
  id, client_id: 'rel-a', scheduled_at: at, time_block_id: null, attendance: null, attendance_set_by: null, recap: null, ...extra,
});

const tables = ({ ratings = [] } = {}) => ({
  profiles: [{ id: MEMBER, full_name: 'Hana M.', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' }],
  clients: [client('rel-a', 'coach-a')],
  coach_directory: [{
    coach_id: 'coach-a', full_name: 'Dina Farouk', title: 'Nutrition coaching', verified: true, rating_count: 4, rating_avg: 4.5,
    bio: '', certifications: [], avatar_photo_url: null, cover_photo_url: null,
  }],
  tasks: [], mood_checkins: [], packages: [], cancellations: [], session_requests: [], time_blocks: [], weekly_availability: [],
  sessions: [
    session('s-held', '2026-09-21T15:00:00Z', { attendance: 'attended', recap: 'Great first week' }),
    session('s-unmarked', '2026-09-23T15:00:00Z'),
    session('s-missed', '2026-09-24T15:00:00Z', { attendance: 'no_show' }),
    session('s-later', '2026-10-05T15:00:00Z'),
    session('s-other', '2026-09-20T15:00:00Z', { client_id: 'rel-other', attendance: 'attended' }),
  ],
  ratings,
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
  await go(page, 'clientSchedule');
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
const frame = (page) => page.locator('.phone-frame').first();
const row = (page, text) => page.locator('.client-schedule-history-row', { hasText: text });
const inserts = async (page) => (await dbCalls(page)).filter((c) => c.table === 'ratings' && c.op === 'insert');
const DEMO = /Yasmin|Sara Ahmed/;

test('Sessions offers Rate for a session they had, not one they missed', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ ratings: [{ id: 'r1', client_id: 'rel-a', coach_id: 'coach-a', session_id: 's-unmarked', rating: 3, comment: null }] }) });
  await expect(page.locator('.client-schedule-history-row')).toHaveCount(3);
  await expect(row(page, 'Great first week').getByRole('button', { name: 'Rate' })).toBeVisible();
  await expect(row(page, 'Missed session').getByRole('button', { name: 'Rate' })).toHaveCount(0);
  await expect(page.locator('.client-schedule-rated')).toHaveText('★★★');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('rating a session writes a ratings row, and Sessions shows it after', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await row(page, 'Great first week').getByRole('button', { name: 'Rate' }).click();
  expect(await appState(page)).toEqual({ screen: 'rateCoach', params: { sessionId: 's-held' } });
  await expect(page.locator('.rate-coach-heading')).toHaveText('How was your session with \u2068Dina Farouk\u2069?');
  await expect(page.locator('.rate-coach-sub')).toHaveText('\u2068Great first week\u2069 · Sep 21, 2026');
  await expect(frame(page)).not.toContainText(DEMO);

  const submit = page.getByRole('button', { name: 'Submit Review' });
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: '4 of 5 stars' }).click();
  await page.getByLabel('Anything you’d like to add? (optional)').fill('  Very practical advice  ');
  await submit.click();
  await expect(page.getByText('Thanks for your feedback!')).toBeVisible();
  // The coach's name is isolated in the sentence, as in the heading.
  await expect(page.locator('.rate-coach-done-body')).toContainText('helps \u2068Dina Farouk\u2069 improve');
  expect((await inserts(page)).map((c) => c.values)).toEqual([
    { client_id: 'rel-a', coach_id: 'coach-a', session_id: 's-held', rating: 4, comment: 'Very practical advice' },
  ]);
  // Nothing went to the demo's local ratings.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('rating')))).toEqual([]);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(row(page, 'Great first week').locator('.client-schedule-rated')).toHaveText('★★★★');
  await expect(row(page, 'Great first week').getByRole('button', { name: 'Rate' })).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a rating with no comment stores no comment, so it is no public review', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await go(page, 'rateCoach', { sessionId: 's-unmarked' });
  await page.getByRole('button', { name: '5 of 5 stars' }).click();
  await page.getByLabel('Anything you’d like to add? (optional)').fill('   ');
  await page.getByRole('button', { name: 'Submit Review' }).click();
  await expect(page.getByText('Thanks for your feedback!')).toBeVisible();
  expect((await dbRows(page, 'ratings'))[0]).toMatchObject({ session_id: 's-unmarked', rating: 5, comment: null });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed save says so and keeps the review; trying again sends it', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await go(page, 'rateCoach', { sessionId: 's-held' });
  await setFailing(page, ['ratings.insert']);
  await page.getByRole('button', { name: '2 of 5 stars' }).click();
  await page.getByLabel('Anything you’d like to add? (optional)').fill('Too short');
  await page.getByRole('button', { name: 'Submit Review' }).click();
  await expect(page.getByRole('alert')).toHaveText("Your review wasn't sent. Please try again.");
  await expect(page.getByText('Thanks for your feedback!')).toHaveCount(0);
  await expect(page.getByLabel('Anything you’d like to add? (optional)')).toHaveValue('Too short');

  await setFailing(page, []);
  await page.getByRole('button', { name: 'Submit Review' }).click();
  await expect(page.getByText('Thanks for your feedback!')).toBeVisible();
  expect(await dbRows(page, 'ratings')).toHaveLength(1);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a session rated meanwhile (one per session) says it is already rated', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await go(page, 'rateCoach', { sessionId: 's-held' });
  await page.evaluate(() => { window.__fake.refuse['ratings.insert'] = '23505'; });
  await page.getByRole('button', { name: '3 of 5 stars' }).click();
  await page.getByRole('button', { name: 'Submit Review' }).click();
  await expect(page.getByRole('alert')).toHaveText("You've already rated this session.");
  expect(errs).toEqual([]);
  await ctx.close();
});

test('nothing to rate: no session named, not theirs, not yet, missed, or already rated', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ ratings: [{ id: 'r1', client_id: 'rel-a', coach_id: 'coach-a', session_id: 's-unmarked', rating: 3, comment: null }] }) });
  for (const params of [undefined, { sessionId: 's-other' }, { sessionId: 's-later' }, { sessionId: 's-missed' }, { sessionId: 'nope' }]) {
    await go(page, 'rateCoach', params);
    await expect(page.getByText('Nothing to rate yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Review' })).toHaveCount(0);
  }
  await go(page, 'rateCoach', { sessionId: 's-unmarked' });
  await expect(page.getByText("You've already rated this session.")).toBeVisible();
  await expect(frame(page)).not.toContainText(DEMO);
  expect(await inserts(page)).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read shows retry, never the demo’s session', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await setFailing(page, ['ratings.select']);
  await go(page, 'rateCoach', { sessionId: 's-held' });
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(DEMO);
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.rate-coach-heading')).toContainText('Dina Farouk');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic and dark', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true });
  await row(page, 'Great first week').getByRole('button', { name: 'تقييم' }).click();
  await expect(page.locator('.rate-coach-heading')).toContainText('كيف كانت جلستك مع');
  await expect(page.locator('.rate-coach-heading')).toContainText('Dina Farouk');
  await page.getByRole('button', { name: '5 من 5 نجوم' }).click();
  await page.getByRole('button', { name: 'إرسال التقييم' }).click();
  await expect(page.getByText('شكرًا لملاحظاتك!')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(errs).toEqual([]);
  await ctx.close();
});
