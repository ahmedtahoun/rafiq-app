import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 6, Discover's goal matching: signed in,
 * the goal that floats matching coaches up and captions the list is the
 * member's own focus from onboarding (member_profiles.focus, the slug
 * ClientOnboarding stores — the `icon` key of a SPECIALTIES entry), never
 * the demo member's. "Recommended for you" shows only when a coach on the
 * list really matches it.
 */

const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const coach = (id, name, specialty) => ({
  coach_id: id, full_name: name, title: `${specialty} · Coaching`, country: 'Egypt', country_flag: '🇪🇬',
  languages: ['Arabic', 'English'], experience_years: 5, verified: true, featured: false, from_price: 500,
  rating_count: 4, rating_avg: 4.6, bio: '', avatar_photo_url: null, session_mode: 'online',
  certifications: [], cover_photo_url: null,
});

const tables = ({ focus = 'career', profile = true } = {}) => ({
  profiles: [{ id: MEMBER, full_name: 'Hana Mostafa', phone: '', country_code: '+20' }],
  // A yoga coach first, so floating the career coach up is visible.
  coach_directory: [coach('coach-yoga', 'Omar Nabil', 'Yoga coaching'), coach('coach-career', 'Dina Farouk', 'Career coaching')],
  weekly_availability: [],
  member_profiles: profile ? [{ profile_id: MEMBER, goal: 'Find a new job', focus, signup_completed_at: '2026-09-01T00:00:00Z' }] : [],
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
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('discover'));
  await page.waitForTimeout(300);
  return { page, ctx, errs };
}
// The list's own heading — not the "Trending this week" one beside it.
const heading = (page) => page.locator('.discover-section-title').filter({ hasNotText: /Trending|الأكثر رواجًا/ });
const names = (page) => page.locator('.discover-card .discover-card-name');
const pills = (page) => page.locator('.discover-card .discover-pill-green');

test('the member’s own focus floats matching coaches up and captions the list', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(heading(page)).toHaveText('Recommended for you');
  await expect(page.getByText('Matched to your Career coaching goal')).toBeVisible();
  await expect(names(page).first()).toHaveText('Dina Farouk');
  await expect(pills(page)).toHaveCount(1);
  await expect(page.locator('.discover-card', { hasText: 'Dina Farouk' })).toContainText('Matches your goal');
  const read = (await dbCalls(page)).find((c) => c.table === 'member_profiles');
  expect(read).toMatchObject({ op: 'select', filters: [['profile_id', MEMBER]] });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a focus no coach on the list offers claims no match', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ focus: 'sleep' }) });
  await expect(heading(page)).toHaveText('Pros on Rafiq');
  await expect(pills(page)).toHaveCount(0);
  await expect(names(page).first()).toHaveText('Omar Nabil');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a member who skipped onboarding has no goal, and nothing claims one', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables({ profile: false }) });
  await expect(heading(page)).toHaveText('Pros on Rafiq');
  await expect(pills(page)).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a search narrows the list, so it is no longer "recommended"', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.getByRole('textbox', { name: 'Search pros or specialties' }).fill('Dina');
  await expect(heading(page)).toHaveText('Pros on Rafiq');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read of the goal shows retry, never the demo member’s goal', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['member_profiles.select'] });
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(heading(page)).toHaveCount(0);
  await page.evaluate(() => { window.__fake.fail = []; });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(heading(page)).toHaveText('Recommended for you');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic and dark', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true });
  await expect(heading(page)).toHaveText('موصى به لك');
  await expect(page.locator('.discover-card', { hasText: 'Dina Farouk' })).toContainText('يناسب هدفك');
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  expect(errs).toEqual([]);
  await ctx.close();
});
