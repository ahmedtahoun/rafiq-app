import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';
import { DIRECTORY_MEMBER, directoryTables } from './directoryFixture.js';

/**
 * A member's saved coaches (the hearts on Discover and a coach's page) are
 * their own `favourite_coaches` rows (src/lib/favouriteData.ts; RLS
 * favourite_coaches_own, 0005). They used to live in this phone's
 * localStorage, shared by whoever signed in on it and lost on a new phone.
 */

const NOW = new Date('2026-09-28T09:00:00Z');

const withFavourites = (rows) => ({
  ...directoryTables(),
  favourite_coaches: rows.map(([member, coach]) => ({ member_id: member, coach_id: coach, created_at: '2026-09-20T00:00:00Z' })),
});
// Dina saved by this member; Omar, and Dina too, by someone else.
const saved = () => withFavourites([[DIRECTORY_MEMBER, 'c-dina'], ['member-2', 'c-omar'], ['member-2', 'c-dina']]);
const theirs = async (page) => (await dbRows(page, 'favourite_coaches')).filter((r) => r.member_id === 'member-2').map((r) => r.coach_id).sort();

async function open(browser, { lang = 'en', data = saved(), fail, screen = 'discover', params } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
    // What an older build left on this phone: never read again.
    localStorage.setItem('rafiq_fav_coaches', JSON.stringify({ 'c-karim': true }));
  }, lang);
  await page.reload();
  await installFakeSupabase(page, { userId: DIRECTORY_MEMBER, tables: data, fail });
  await signIn(page, DIRECTORY_MEMBER);
  await go(page, screen, params);
  return { page, ctx, errs };
}
async function go(page, screen, params) {
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params]);
  await page.waitForTimeout(400);
}
const heart = (page, name) => page.locator('.discover-card', { hasText: name }).locator('.discover-heart');
const pageHeart = (page) => page.locator('.coach-preview-icon-btn[aria-pressed]');
const own = async (page) => (await dbRows(page, 'favourite_coaches')).filter((r) => r.member_id === DIRECTORY_MEMBER).map((r) => r.coach_id).sort();

test('Discover shows the member\'s own saved coaches, not the phone\'s or anyone else\'s', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(heart(page, 'Dina Farouk')).toHaveAttribute('aria-pressed', 'true');
  await expect(heart(page, 'Omar Nabil')).toHaveAttribute('aria-pressed', 'false');
  await expect(heart(page, 'Karim Mansour')).toHaveAttribute('aria-pressed', 'false');
  const read = (await dbCalls(page)).find((c) => c.table === 'favourite_coaches' && c.op === 'select');
  expect(read.filters).toEqual([['member_id', DIRECTORY_MEMBER]]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a heart saves and un-saves the coach for this member', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await heart(page, 'Salma Fouad').click();
  await expect(heart(page, 'Salma Fouad')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => own(page)).toEqual(['c-dina', 'c-salma']);

  await heart(page, 'Dina Farouk').click();
  await expect(heart(page, 'Dina Farouk')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => own(page)).toEqual(['c-salma']);
  // Someone else's are untouched, their Dina included, and nothing went to the phone.
  expect(await theirs(page)).toEqual(['c-dina', 'c-omar']);
  expect(await page.evaluate(() => localStorage.getItem('rafiq_fav_coaches'))).toBe(JSON.stringify({ 'c-karim': true }));
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the coach page\'s heart is the same saved coach, both ways', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'coachPreview', params: { coachId: 'c-dina' } });
  await expect(pageHeart(page)).toHaveAttribute('aria-pressed', 'true');
  await pageHeart(page).click();
  await expect(pageHeart(page)).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => own(page)).toEqual([]);

  await go(page, 'coachPreview', { coachId: 'c-tamer' });
  await expect(pageHeart(page)).toHaveAttribute('aria-pressed', 'false');
  await pageHeart(page).click();
  await expect.poll(() => own(page)).toEqual(['c-tamer']);
  await go(page, 'discover');
  await expect(heart(page, 'Tamer Said')).toHaveAttribute('aria-pressed', 'true');
  await expect(heart(page, 'Dina Farouk')).toHaveAttribute('aria-pressed', 'false');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a heart that fails to save goes back, and says so (Arabic)', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar' });
  await setFailing(page, ['favourite_coaches.insert', 'favourite_coaches.delete']);
  await heart(page, 'Salma Fouad').click();
  await expect(page.locator('.discover-fav-error')).toHaveText('لم يتم الحفظ. حاول مرة أخرى.');
  await expect(heart(page, 'Salma Fouad')).toHaveAttribute('aria-pressed', 'false');
  expect(await own(page)).toEqual(['c-dina']);

  await go(page, 'coachPreview', { coachId: 'c-dina' });
  await pageHeart(page).click();
  await expect(page.locator('.coach-preview-fav-error')).toHaveText('لم يتم الحفظ. حاول مرة أخرى.');
  await expect(pageHeart(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await own(page)).toEqual(['c-dina']);

  // Once it can save again, the next tap does and the message goes.
  await setFailing(page, []);
  await pageHeart(page).click();
  await expect(pageHeart(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.coach-preview-fav-error')).toHaveCount(0);
  await expect.poll(() => own(page)).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read of saved coaches shows retry, not empty hearts', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { fail: ['favourite_coaches.select'] });
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(page.locator('.discover-heart')).toHaveCount(0);
  await setFailing(page, []);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(heart(page, 'Dina Farouk')).toHaveAttribute('aria-pressed', 'true');

  await setFailing(page, ['favourite_coaches.select']);
  await go(page, 'coachPreview', { coachId: 'c-dina' });
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(pageHeart(page)).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});
