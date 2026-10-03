import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';
import { DIRECTORY_MEMBER, directoryTables } from './directoryFixture.js';

/**
 * The first batch from the UI/UX review (1 Oct 2026): text that broke in
 * Arabic, and copy that said something the app doesn't do. Signed out, on
 * the demo data, which is where each of these showed up.
 */

async function open(browser, { lang = 'en', role = 'coach', screen, params, at } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  if (at) await page.clock.setFixedTime(new Date(at));
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([r, l]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
  }, [role, lang]);
  await page.reload();
  if (screen) await go(page, screen, params);
  return { page, ctx, errs };
}

async function go(page, screen, params) {
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params ?? null]);
  await page.waitForTimeout(300);
}

/** Where on screen a piece of an element's text starts, in px from the left. */
async function xOf(locator, needle) {
  return locator.evaluate((el, n) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const i = node.textContent.indexOf(n);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + n.length);
      return range.getBoundingClientRect().left;
    }
    throw new Error(`"${n}" not found`);
  }, needle);
}

test('Schedule: hour labels follow the language, not "AM 8"', async ({ browser }) => {
  for (const [lang, first] of [['en', '8 AM'], ['ar', '8 ص']]) {
    const { page, ctx, errs } = await open(browser, { lang, screen: 'schedule' });
    const labels = page.locator('.schedule-hour-label');
    await expect(labels.first()).toHaveText(first);
    if (lang === 'ar') expect(await labels.allInnerTexts()).not.toContainEqual(expect.stringMatching(/AM|PM/));
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('Schedule: a block\'s time range is in the app language, and reads right to left in Arabic', async ({ browser }) => {
  // It was one English string under dir="ltr": "9:00 AM – 1:00 PM" on an Arabic screen.
  for (const [lang, text] of [['en', '9:00 AM – 1:00 PM'], ['ar', '9:00 ص – 1:00 م']]) {
    const { page, ctx, errs } = await open(browser, { lang, screen: 'schedule' });
    // The demo Wednesday's busy morning.
    const range = page.locator('.schedule-block-range').first();
    await expect(range).toHaveText(text);
    const [start, end] = [await xOf(range, '9:00'), await xOf(range, '1:00')];
    if (lang === 'ar') expect(start, 'the start time sits on the right').toBeGreaterThan(end);
    else expect(start).toBeLessThan(end);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('Arabic: a task title starting with a digit keeps its order, on the member page and the member Home', async ({ browser }) => {
  // Rendered without <bdi>, "10-minute evening walk" read "minute evening walk-10".
  for (const [role, screen, params, sel] of [
    ['coach', 'clientDetail', { clientId: 'sara' }, '.client-detail-task-title'],
    ['client', 'clientHome', undefined, '.client-home-task-title'],
  ]) {
    const { page, ctx, errs } = await open(browser, { lang: 'ar', role, screen, params });
    const title = page.locator(sel, { hasText: 'evening walk' });
    await expect(title).toHaveCount(1);
    expect(await xOf(title, '10'), `${screen}: "10" sits before "minute"`).toBeLessThan(await xOf(title, 'minute'));
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('Arabic: the member goal on the coach side is shown whole, not cut from its first words', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', screen: 'clientDetail', params: { clientId: 'sara' } });
  const goal = page.locator('.client-detail-goal-text');
  await expect(goal).toContainText('Build a consistent morning routine');
  const clipped = await goal.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(false);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('coach page: the next free time is a real day, in the app language', async ({ browser }) => {
  // It once read "WED 13 — 10:00 am": 13 Oct 2025 was a Monday, and "am"
  // stayed English in Arabic. The demo's coaches are gone, so this is a real
  // coach's page (tests/directoryFixture.js), on Monday 28 Sep 2026 at noon
  // in Cairo: her next free hour is today's 1 PM.
  for (const [lang, next] of [['en', /^MON 28 — 1:00 PM$/], ['ar', /^إثنين 28 — 1:00 م$/]]) {
    const { page, ctx, errs } = await open(browser, { lang, role: 'client', at: '2026-09-28T09:00:00Z' });
    await installFakeSupabase(page, { userId: DIRECTORY_MEMBER, tables: directoryTables() });
    await signIn(page, DIRECTORY_MEMBER);
    await go(page, 'coachPreview', { coachId: 'c-laila' });
    await expect(page.locator('.coach-preview-next-value')).toHaveText(next);
    expect(await page.locator('.phone-frame').innerText()).not.toMatch(/\b(am|pm)\b/);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('Home greets by the time of day', async ({ browser }) => {
  // Cairo is UTC+3 in the suite (playwright.config.ts).
  for (const [role, screen, sel, at, lang, text] of [
    ['coach', 'main', '.main-eyebrow', '2026-10-01T16:30:00Z', 'en', 'Good evening'],
    ['coach', 'main', '.main-eyebrow', '2026-10-01T05:00:00Z', 'en', 'Good morning'],
    ['client', 'clientHome', '.client-home-greeting', '2026-10-01T11:00:00Z', 'ar', 'نهارك سعيد'],
    ['client', 'clientHome', '.client-home-greeting', '2026-10-01T20:00:00Z', 'ar', 'مساء الخير'],
  ]) {
    const { page, ctx, errs } = await open(browser, { lang, role, screen, at });
    // textContent, not innerText: the eyebrow is uppercased by CSS.
    expect(await page.locator(sel).textContent(), `${screen} at ${at}`).toBe(text);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

// "Recommended for you" only when the list matches the member's goal: the
// demo's coaches are gone, so this is tests/discover-goal.spec.js's, signed
// in over a real directory and the member's own goal.

test('Profile has no Share button while the share link goes nowhere', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile' });
  await expect(page.locator('.profile-quick-btn')).toHaveCount(2);
  await expect(page.locator('.profile-quick-btn', { hasText: 'Share' })).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('coach sign-up: no dangling comma before the name is typed', async ({ browser }) => {
  for (const [lang, empty, typed] of [['en', 'Welcome to Rafiq Pro', 'Welcome to Rafiq Pro, Ahmed'], ['ar', 'مرحبًا بك في رفيق', 'مرحبًا بك في رفيق، Ahmed']]) {
    const { page, ctx, errs } = await open(browser, { lang, screen: 'onboarding' });
    const title = page.locator('.onboarding-title');
    await expect(title).toHaveText(empty);
    await page.locator('#oname').fill('Ahmed Tahoun');
    await expect(title).toHaveText(typed);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});
