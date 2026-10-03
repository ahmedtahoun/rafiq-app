import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 6, reviews: signed in, the coach's page
 * and Discover show members' own reviews from the `coach_reviews` view
 * (src/lib/reviewData.ts) — only ratings with a comment, signed with a
 * first name and last initial (`reviewer_name`). A reviewer's full name is
 * never read for this, let alone shown.
 */

const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const directoryRow = (id, name, extra = {}) => ({
  coach_id: id, full_name: name, title: 'Career coaching', country: 'Egypt', country_flag: '🇪🇬',
  languages: ['Arabic', 'English'], experience_years: 6, verified: true, featured: false, from_price: 600,
  rating_count: 5, rating_avg: 4.8, bio: '', avatar_photo_url: null,
  session_mode: 'online', certifications: [], cover_photo_url: null, ...extra,
});
const review = (id, coachId, name, comment, createdAt, rating = 5) => ({
  id, coach_id: coachId, rating, comment, created_at: createdAt, reviewer_name: name, avatar_bg: '#3E6FB0',
});

const tables = ({ reviews } = {}) => ({
  profiles: [{ id: MEMBER, full_name: 'Hana Mostafa', phone: '', country_code: '+20' }],
  coach_directory: [
    directoryRow('coach-dina', 'Dina Farouk'),
    directoryRow('coach-omar', 'Omar Nabil', { title: 'Yoga coaching', rating_count: 1, rating_avg: 4 }),
  ],
  weekly_availability: [],
  offerings: [],
  session_requests: [],
  clients: [],
  coach_reviews: reviews ?? [
    review('r0', 'coach-dina', 'Mona K.', 'The first session was the turning point.', '2026-09-10T10:00:00Z', 5),
    review('r1', 'coach-dina', 'Karim S.', 'Clear, practical, kind.', '2026-09-20T10:00:00Z', 5),
    review('r2', 'coach-dina', 'Laila A.', 'Helped me prepare for interviews.', '2026-09-25T10:00:00Z', 4),
    review('r3', 'coach-omar', 'Hana M.', 'Calm and patient.', '2026-09-26T10:00:00Z', 5),
    // A coach no longer listed: not on Discover.
    review('r4', 'coach-gone', 'Sami R.', 'Great coach.', '2026-09-27T10:00:00Z', 5),
  ],
});

async function open(browser, { lang = 'en', dark = false, data = tables(), screen = 'discover', params, fail } = {}) {
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
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params]);
  await page.waitForTimeout(300);
  return { page, ctx, errs };
}
const memberReviews = (page) => page.locator('.coach-preview-member-review');
const stories = (page) => page.locator('.discover-story');
const reviewReads = async (page) => (await dbCalls(page)).filter((c) => c.table === 'coach_reviews');
const DEMO = /Nour Hassan|Omar Fathy|really helped me make progress/;

test('the coach’s page shows their members’ reviews, newest first, signed with a first name and initial', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'coachPreview', params: { coachId: 'coach-dina' } });
  await expect(page.getByRole('heading', { name: 'What members say' })).toBeVisible();
  await expect(page.locator('.coach-preview-review-count').first()).toHaveText('5 reviews');
  await expect(memberReviews(page)).toHaveCount(3);
  await expect(memberReviews(page).locator('.coach-preview-reviewer-name')).toHaveText(['Laila A.', 'Karim S.', 'Mona K.']);
  await expect(memberReviews(page).nth(0)).toContainText('Helped me prepare for interviews.');
  await expect(memberReviews(page).nth(0)).toContainText('Sep 25, 2026');
  await expect(memberReviews(page).nth(0).getByRole('img', { name: '4 of 5 stars' })).toHaveText('★★★★');
  await expect(page.locator('.phone-frame').first()).not.toContainText(DEMO);

  // Every read (StrictMode runs the load twice in dev) is the view's own
  // columns for this coach, newest first, five at most.
  const reads = await reviewReads(page);
  expect(reads.length).toBeGreaterThan(0);
  for (const read of reads) expect(read).toEqual(expect.objectContaining({
    op: 'select',
    filters: [['coach_id', 'coach-dina']],
    columns: 'id, coach_id, rating, comment, created_at, reviewer_name, avatar_bg',
    order: ['created_at', false],
    limit: 5,
  }));
  // Nothing else is read for a reviewer's name.
  expect((await dbCalls(page)).filter((c) => c.table === 'clients' || (c.table === 'profiles' && c.op === 'select' && c.filters.some(([, v]) => v !== MEMBER)))).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a coach with no reviews yet and too few ratings has no reviews section', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'coachPreview', params: { coachId: 'coach-omar' }, data: tables({ reviews: [] }) });
  await expect(page.getByText('Omar Nabil').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What members say' })).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a new coach’s reviews show even before there are enough for an average', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'coachPreview', params: { coachId: 'coach-omar' } });
  await expect(page.getByRole('heading', { name: 'What members say' })).toBeVisible();
  await expect(page.getByText('reviews', { exact: false }).filter({ hasText: /^\d+ reviews$/ })).toHaveCount(0);
  await expect(memberReviews(page)).toHaveCount(1);
  await expect(memberReviews(page)).toContainText('Calm and patient.');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read of the reviews shows retry on the coach’s page', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'coachPreview', params: { coachId: 'coach-dina' }, fail: ['coach_reviews.select'] });
  await expect(page.locator('.load-state')).toBeVisible();
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(memberReviews(page)).toHaveCount(3);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Discover’s stories are members’ real reviews of coaches on the list, never the demo’s', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(page.getByRole('heading', { name: 'Member Stories' })).toBeVisible();
  await expect(stories(page)).toHaveCount(3);
  await expect(stories(page).locator('.discover-story-name')).toHaveText(['Hana M.', 'Laila A.', 'Karim S.']);
  await expect(stories(page).nth(0).locator('.discover-story-meta')).toHaveText('with ⁨Omar Nabil⁩ · Sep 26, 2026');
  await expect(stories(page).nth(1)).toContainText('Helped me prepare for interviews.');
  // Only the three newest; Mona's is the fourth.
  await expect(page.locator('.discover-scroll')).not.toContainText('Sami R.');
  await expect(page.locator('.discover-scroll')).not.toContainText('Mona K.');
  await expect(page.locator('.discover-scroll')).not.toContainText(DEMO);
  const [read] = await reviewReads(page);
  expect(read).toMatchObject({ op: 'select', filters: [], order: ['created_at', false], limit: 20 });
  expect(read.columns).not.toContain('full_name');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('with no reviews yet, Discover has no stories section', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ reviews: [] }) });
  await expect(page.locator('.discover-card').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Member Stories' })).toHaveCount(0);
  await expect(page.locator('.discover-scroll')).not.toContainText(DEMO);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read of the reviews shows retry on Discover, never the demo’s stories', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['coach_reviews.select'] });
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(DEMO);
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(stories(page)).toHaveCount(3);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic and dark', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true });
  await expect(page.getByRole('heading', { name: 'قصص الأعضاء' })).toBeVisible();
  await expect(stories(page).nth(0).locator('.discover-story-meta')).toContainText('مع ⁨Omar Nabil⁩');
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav({ screen: 'coachPreview', params: { coachId: 'coach-dina' } }));
  await expect(page.getByRole('heading', { name: 'آراء الأعضاء' })).toBeVisible();
  await expect(memberReviews(page)).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(errs).toEqual([]);
  await ctx.close();
});
