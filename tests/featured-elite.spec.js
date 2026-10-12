import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';
import { DIRECTORY, DIRECTORY_MEMBER, directoryTables } from './directoryFixture.js';

/**
 * Rafiq Elite Pro's featured placement (0027). The directory marks a coach
 * on an active Elite Pro plan `featured` (supabase/tests/32 has who is and
 * isn't); here, a member's Discover lists that coach first, with the label,
 * in both languages. Nobody is on Elite Pro yet, so the coach is a fixture:
 * a row the directory would return for one.
 */

const ELITE = {
  ...DIRECTORY.find((c) => c.coach_id === 'c-laila'),
  coach_id: 'c-elite', full_name: 'Eman Elite', featured: true,
};
// The directory as the view returns it for this member: nobody else
// featured, and the Elite Pro coach last, so only the sort can put her first.
const rows = () => [...DIRECTORY.map((c) => ({ ...c, featured: false })), ELITE];

const LABEL = { en: 'FEATURED', ar: 'مميز' };

async function open(browser, { lang = 'en', dark = false, focus = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
  }, [lang, dark]);
  await page.reload();
  const tables = {
    ...directoryTables(),
    coach_directory: rows(),
    member_profiles: focus ? [{ profile_id: DIRECTORY_MEMBER, goal: 'Find a new job', focus, signup_completed_at: '2026-09-01T00:00:00Z' }] : [],
  };
  await installFakeSupabase(page, { userId: DIRECTORY_MEMBER, tables });
  await signIn(page, DIRECTORY_MEMBER);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('discover'));
  await expect(page.locator('.discover-card').first()).toBeVisible();
  return { page, ctx, errs };
}

for (const lang of ['en', 'ar']) {
  for (const dark of [false, true]) {
    test(`an Elite Pro coach is listed first, labelled (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
      const { page, ctx, errs } = await open(browser, { lang, dark });
      const first = page.locator('.discover-card').first();
      await expect(first.locator('.discover-card-name')).toHaveText('Eman Elite');
      await expect(first.locator('.discover-pill-accent')).toHaveText(LABEL[lang]);
      // The label is hers alone.
      await expect(page.locator('.discover-pill-accent')).toHaveCount(1);
      await expect(page.locator('.discover-card')).toHaveCount(DIRECTORY.length + 1);
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('featured outranks the member\'s own goal: it is the paid placement', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { focus: 'career' });
  const names = page.locator('.discover-card-name');
  await expect(names.nth(0)).toHaveText('Eman Elite');
  // Then the career coach who matches the goal.
  await expect(names.nth(1)).toHaveText('Dina Farouk');
  await expect(page.locator('.discover-card').nth(1)).toContainText('Matches your goal');
  expect(errs).toEqual([]);
  await ctx.close();
});
