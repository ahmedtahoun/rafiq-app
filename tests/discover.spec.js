import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';
import { DIRECTORY_MEMBER, directoryTables } from './directoryFixture.js';

/**
 * Discover and the coach page. The demo's eight fictional coaches are gone
 * (LAUNCH-CHECKLIST §2), so these run signed in over tests/directoryFixture.js's
 * test directory; signed out, Discover is empty and every coach page is
 * missing. Booking from the coach page is accept-flow.spec.js's.
 */

// Monday 28 September 2026, noon in Cairo.
const NOW = new Date('2026-09-28T09:00:00Z');

async function open(browser, { lang = 'en', dark = false, signedIn = true, data = directoryTables(), screen = 'discover' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // Two console errors are sandbox artefacts, not app faults: the agent
  // proxy's CA blocks Google Fonts, and there is no favicon in dev.
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
  await enter(page, { signedIn, data, screen });
  return { page, ctx, errs };
}
async function enter(page, { signedIn = true, data = directoryTables(), screen = 'discover' } = {}) {
  await installFakeSupabase(page, { userId: DIRECTORY_MEMBER, tables: data });
  if (signedIn) await signIn(page, DIRECTORY_MEMBER);
  await go(page, screen);
}
async function go(page, screen, params) {
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params]);
  await page.waitForTimeout(400);
}
const screenOf = (page) => page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen);
const count = (page, sel) => page.locator(sel).count();
const FICTIONAL = /Mariam Adel|Ahmed Nabil|Dina Kamal|Hana Farouk|Karim Adly|Rania Saeed|Youssef Adel|Tarek Hamdy|Nour Hassan|Omar Fathy|meditation sessions completely/;

test('signed out there is no directory: no fictional coaches, no sample stories', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { signedIn: false });
  await expect(page.getByText('No pros yet')).toBeVisible();
  expect(await count(page, '.discover-card')).toBe(0);
  expect(await count(page, '.discover-trend-card')).toBe(0);
  expect(await count(page, '.discover-story')).toBe(0);
  await expect(page.locator('body')).not.toContainText(FICTIONAL);
  // Nor can a coach page be reached by id.
  for (const id of ['mariam', 'dina', 'c-dina']) {
    await go(page, 'coachPreview', { coachId: id });
    await expect(page.locator('.coach-preview-missing-text')).toHaveText("This pro isn't available any more");
  }
  expect(errs).toEqual([]);
  await ctx.close();
});

test('DISCOVER: renders', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  expect.soft(String(await screenOf(page)), 'screen').toBe('discover');
  expect.soft(String(await count(page, '.discover-card')), 'coach cards').toBe('8');
  expect.soft(String(await count(page, '.discover-rail-item')), 'specialty rail (All + 8 specialties)').toBe('9');
  expect.soft(String(await count(page, '.discover-trend-card')), 'trending cards').toBe('3');
  // No sample stories: members' own reviews only (coach_reviews, step 6).
  expect.soft(String(await count(page, '.discover-story')), 'no sample stories').toBe('0');
  expect.soft(String(await count(page, '.bottom-nav')), 'bottom nav present').toBe('1');
  await expect(page.locator('body')).not.toContainText(FICTIONAL);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('DISCOVER: search', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  const input = page.locator('.discover-search input');
  await input.click();
  await input.pressSequentially('dina', { delay: 20 });
  await page.waitForTimeout(300);
  expect.soft(String(await count(page, '.discover-card')), 'search by name narrows to 1').toBe('1');
  expect.soft(String((await page.locator('.discover-card-name').innerText()).includes('Dina')), '  it is Dina').toBe('true');
  await page.locator('.discover-search-clear').click();
  await page.waitForTimeout(200);
  expect.soft(String(await count(page, '.discover-card')), 'clear restores all').toBe('8');
  await input.click();
  await input.pressSequentially('yoga', { delay: 20 });
  await page.waitForTimeout(300);
  expect.soft(String(await count(page, '.discover-card')), 'search by specialty label').toBe('1');
  await input.fill('');
  await input.pressSequentially('zzzz', { delay: 20 });
  await page.waitForTimeout(300);
  expect.soft(String(await count(page, '.discover-empty')), 'no-match shows empty state').toBe('1');
  expect.soft(String(await count(page, '.discover-card')), '  no cards').toBe('0');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('DISCOVER: arabic search (prototype could not do this)', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar' });
  const input = page.locator('.discover-search input');
  await input.click();
  await input.pressSequentially('يوغا', { delay: 20 });
  await page.waitForTimeout(300);
  expect.soft(String(await count(page, '.discover-card')), 'searching the Arabic specialty word matches').toBe('1');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('DISCOVER: specialty rail + filters', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.discover-rail-item').nth(2).click();
  await page.waitForTimeout(250);
  const railN = await count(page, '.discover-card');
  expect.soft(String(railN < 8 && railN > 0), 'specialty chip narrows').toBe('true');
  await page.locator('.discover-rail-item').first().click();
  await page.waitForTimeout(250);
  expect.soft(String(await count(page, '.discover-card')), 'All restores').toBe('8');

  expect.soft(String(await count(page, '.discover-filter-dot')), 'filter dot hidden initially').toBe('0');
  await page.locator('.discover-filter-btn').click();
  await page.waitForTimeout(300);
  expect.soft(String(await count(page, '.discover-filters')), 'sheet opened').toBe('1');
  // price "850+": 900, 950 and 1100.
  await page.locator('.discover-chip', { hasText: '850+' }).first().click();
  await page.waitForTimeout(200);
  await page.locator('.discover-filter-apply').click();
  await page.waitForTimeout(300);
  expect.soft(String(await count(page, '.discover-card')), 'price filter narrows').toBe('3');
  expect.soft(String(await count(page, '.discover-filter-dot')), 'filter dot now shown').toBe('1');
  await page.locator('.discover-filter-btn').click();
  await page.waitForTimeout(250);
  await page.locator('.discover-filter-clear').click();
  await page.waitForTimeout(200);
  await page.locator('.discover-filter-apply').click();
  await page.waitForTimeout(300);
  expect.soft(String(await count(page, '.discover-card')), 'clear all restores').toBe('8');
  expect.soft(String(await count(page, '.discover-filter-dot')), 'filter dot cleared').toBe('0');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('DISCOVER: favourites persist', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  expect.soft(String(await count(page, '.discover-heart-on')), 'nothing saved initially').toBe('0');
  await page.locator('.discover-heart').first().click();
  await page.waitForTimeout(250);
  expect.soft(String(await count(page, '.discover-heart-on')), 'heart turns on').toBe('1');
  await page.reload();
  await enter(page);
  expect.soft(String(await count(page, '.discover-heart-on')), 'survives a reload').toBe('1');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('COACH PREVIEW: open a coach', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  // Featured first: Dina.
  const name = await page.locator('.discover-card-name').first().innerText();
  await page.locator('.discover-card-main').first().click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'navigated').toBe('coachPreview');
  expect.soft(String(await page.locator('.coach-preview-name').innerText()), 'shows the coach tapped').toBe(String(name));
  expect.soft(String(await count(page, '.coach-preview-stat')), 'stats').toBe('3');
  expect.soft(String(await count(page, '.coach-preview-offering')), 'her offering and the intro call').toBe('2');
  expect.soft(String(await count(page, '.coach-preview-day')), 'a week of days').toBe('7');
  expect.soft(String(await count(page, '.coach-preview-time-on')), 'a slot is preselected').toBe('1');
  expect.soft(String(await page.locator('.coach-preview-primary').isDisabled()), 'book button enabled').toBe('false');
  // None of the demo's invented content: a review quote, a member count.
  await expect(page.locator('body')).not.toContainText(/really helped me make progress|Members/);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('COACH PREVIEW: empty day + week paging', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await go(page, 'coachPreview', { coachId: 'c-dina' });
  // Dina works only on Mondays: Tuesday (index 1) is empty.
  await page.locator('.coach-preview-day').nth(1).click();
  await page.waitForTimeout(250);
  expect.soft(String(await count(page, '.coach-preview-no-times')), 'empty day shows its message').toBe('1');
  expect.soft(String(await page.locator('.coach-preview-primary').isDisabled()), '  book button disabled').toBe('true');

  const w1 = await page.locator('.coach-preview-week-label').innerText();
  await page.locator('.coach-preview-week-next').click();
  await page.waitForTimeout(250);
  const w2 = await page.locator('.coach-preview-week-label').innerText();
  expect.soft(String(w1 !== w2), 'week advanced').toBe('true');
  expect.soft(String(await count(page, '.coach-preview-time-on')), '  selection cleared on week change').toBe('0');

  await page.locator('.coach-preview-next-available').click();
  await page.waitForTimeout(300);
  expect.soft(String(await count(page, '.coach-preview-time-on')), 'next-available jumps to a real slot').toBe('1');
  expect.soft(String(await page.locator('.coach-preview-primary').isDisabled()), '  book button enabled again').toBe('false');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('COACH PREVIEW: bad coachId', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await go(page, 'coachPreview', { coachId: 'nobody' });
  expect.soft(String(await count(page, '.coach-preview-missing')), 'shows not-found instead of crashing').toBe('1');
  // An id that does not resolve is not a search that matched nothing.
  const missing = await page.locator('.coach-preview-missing-text').innerText();
  expect.soft(String(/match your search/i.test(missing)), '  and not the search-failed wording').toBe('false');
  expect.soft(missing, '  says the pro is gone').toBe("This pro isn't available any more");
  expect(errs).toEqual([]);
  await ctx.close();
});

test('SWITCHING COACHES RESETS BOOKING STATE', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await go(page, 'coachPreview', { coachId: 'c-dina' });
  await page.locator('.coach-preview-offering').nth(1).click(); // pick intro
  await page.waitForTimeout(200);
  const firstName = await page.locator('.coach-preview-name').innerText();
  await go(page, 'coachPreview', { coachId: 'c-tamer' });
  const secondName = await page.locator('.coach-preview-name').innerText();
  expect.soft(String(firstName !== secondName), 'coach changed').toBe('true');
  // His own first offering, not the intro call picked on Dina's page.
  await expect(page.locator('.coach-preview-offering-on')).toContainText('Open water dive');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('NAV WIRING', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: directoryTables({ relationship: true }), screen: 'clientHome' });
  // Discover left the tab bar (five tabs a side, 1 Oct 2026): a member with
  // a coach reaches it from Your Pro → My pros → Find a pro.
  await page.locator('.bottom-nav-item', { hasText: 'Your Pro' }).click();
  await page.waitForTimeout(400);
  await page.locator('.client-coach-hero-btn').first().click();
  await page.waitForTimeout(400);
  await page.locator('.my-coaches-find').click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'Your Pro → My pros reaches Discover').toBe('discover');

  await page.locator('.discover-card-main').first().click();
  await page.waitForTimeout(350);
  await page.locator('.coach-preview-icon-btn').first().click();
  await page.waitForTimeout(350);
  expect.soft(String(await screenOf(page)), 'back returns to discover').toBe('discover');
  expect(errs).toEqual([]);
  await ctx.close();
});
