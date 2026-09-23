import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';


async function open(browser, { lang = 'en', dark = false, member = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // Two console errors are sandbox artefacts, not app faults: the agent
  // proxy's CA blocks Google Fonts, and there is no favicon in dev.
  const IGNORE = /ERR_CERT_AUTHORITY_INVALID|favicon\.ico/;
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([lang, dark, member]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(lang));
    localStorage.setItem('rafiq_dark', JSON.stringify(dark));
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
    if (!member) localStorage.setItem('rafiq_clients', JSON.stringify([]));
  }, [lang, dark, member]);
  await page.reload();
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('discover');
  });
  await page.waitForTimeout(500);
  return { page, ctx, errs };
}
const screenOf = (page) => page.evaluate(async () => {
  const m = await import('/src/store/appStore.ts');
  return m.useAppStore.getState().screen;
});
const count = (page, sel) => page.locator(sel).count();

test('DISCOVER: renders', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  expect.soft(String(await screenOf(page)), 'screen').toBe('discover');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  expect.soft(String(await count(page, '.discover-card')), 'coach cards').toBe('8');
  expect.soft(String(await count(page, '.discover-rail-item')), 'specialty rail (All + 8 specialties)').toBe('9');
  expect.soft(String(await count(page, '.discover-trend-card')), 'trending cards').toBe('3');
  expect.soft(String(await count(page, '.discover-story')), 'member stories').toBe('2');
  expect.soft(String(await count(page, '.bottom-nav')), 'bottom nav present').toBe('1');


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
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('DISCOVER: arabic search (prototype could not do this)', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar' });
  const input = page.locator('.discover-search input');
  await input.click();
  await input.pressSequentially('يوغا', { delay: 20 });
  await page.waitForTimeout(300);
  const n = await count(page, '.discover-card');
  expect.soft(String(n), 'searching the Arabic specialty word matches').toBe('1');

  expect.soft(String(errs.length), 'no errors').toBe('0');
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
  // price "850+"
  await page.locator('.discover-chip', { hasText: '850+' }).first().click();
  await page.waitForTimeout(200);
  await page.locator('.discover-filter-apply').click();
  await page.waitForTimeout(300);
  const pricey = await count(page, '.discover-card');
  expect.soft(String(pricey < 8 && pricey > 0), 'price filter narrows').toBe('true');
  expect.soft(String(await count(page, '.discover-filter-dot')), 'filter dot now shown').toBe('1');
  await page.locator('.discover-filter-btn').click();
  await page.waitForTimeout(250);
  await page.locator('.discover-filter-clear').click();
  await page.waitForTimeout(200);
  await page.locator('.discover-filter-apply').click();
  await page.waitForTimeout(300);
  expect.soft(String(await count(page, '.discover-card')), 'clear all restores').toBe('8');
  expect.soft(String(await count(page, '.discover-filter-dot')), 'filter dot cleared').toBe('0');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('DISCOVER: favourites persist', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  expect.soft(String(await count(page, '.discover-heart-on')), 'nothing saved initially').toBe('0');
  await page.locator('.discover-heart').first().click();
  await page.waitForTimeout(250);
  expect.soft(String(await count(page, '.discover-heart-on')), 'heart turns on').toBe('1');
  await page.reload();
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('discover');
  });
  await page.waitForTimeout(500);
  expect.soft(String(await count(page, '.discover-heart-on')), 'survives a reload').toBe('1');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('COACH PREVIEW: open a coach', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  const name = await page.locator('.discover-card-name').first().innerText();
  await page.locator('.discover-card-main').first().click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'navigated').toBe('coachPreview');
  expect.soft(String(await page.locator('.coach-preview-name').innerText()), 'shows the coach tapped').toBe(String(name));
  expect.soft(String(await count(page, '.coach-preview-stat')), 'stats').toBe('3');
  expect.soft(String(await count(page, '.coach-preview-offering')), 'two offerings').toBe('2');
  expect.soft(String(await count(page, '.coach-preview-day')), 'six days').toBe('6');
  expect.soft(String(await count(page, '.coach-preview-time-on')), 'a slot is preselected').toBe('1');
  expect.soft(String(await page.locator('.coach-preview-primary').isDisabled()), 'book button enabled').toBe('false');

  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('COACH PREVIEW: booking flow', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.discover-card-main').first().click();
  await page.waitForTimeout(400);

  // switch to the free intro offering
  await page.locator('.coach-preview-offering').nth(1).click();
  await page.waitForTimeout(200);
  expect.soft(String(await count(page, '.coach-preview-offering-on')), 'intro offering selected').toBe('1');

  await page.locator('.coach-preview-primary').click();
  await page.waitForTimeout(400);
  expect.soft(String(await count(page, '.coach-preview-confirmed')), 'confirmation shown').toBe('1');
  expect.soft(String(await count(page, '.coach-preview-receipt-row')), 'receipt rows').toBe('3');
  expect.soft(String(await count(page, 'a[download="session.ics"]')), 'ics link offered').toBe('1');
  const href = await page.locator('a[download="session.ics"]').getAttribute('href');
  expect.soft(String(href.startsWith('data:text/calendar')), 'ics is a calendar payload').toBe('true');
  expect.soft(String(decodeURIComponent(href).includes('DTSTART:2025')), '  has a DTSTART').toBe('true');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rafiq_coach_requests') || '[]'));
  expect.soft(String(stored.length), 'request persisted').toBe('1');
  expect.soft(String(stored[0].price), '  free intro recorded at 0').toBe('0');
  expect.soft(String(stored[0].requestedAtMs > 0), '  carries a timestamp').toBe('true');

  await page.locator('.coach-preview-primary').click(); // Done
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'Done returns to discover').toBe('discover');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('COACH PREVIEW: empty day + week paging', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.discover-card-main').first().click();
  await page.waitForTimeout(400);
  // Friday (index 4) is empty in week 1
  await page.locator('.coach-preview-day').nth(4).click();
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

  expect.soft(String(await page.locator('.coach-preview-time-taken').first().isDisabled()), 'booked slots are disabled').toBe('true');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('COACH PREVIEW: bad coachId', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav({ screen: 'coachPreview', params: { coachId: 'nobody' } });
  });
  await page.waitForTimeout(400);
  expect.soft(String(await count(page, '.coach-preview-missing')), 'shows not-found instead of crashing').toBe('1');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('SWITCHING COACHES RESETS BOOKING STATE', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.discover-card-main').first().click();
  await page.waitForTimeout(350);
  await page.locator('.coach-preview-offering').nth(1).click(); // pick intro
  await page.waitForTimeout(200);
  const firstName = await page.locator('.coach-preview-name').innerText();
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav({ screen: 'coachPreview', params: { coachId: 'tarek' } });
  });
  await page.waitForTimeout(400);
  const secondName = await page.locator('.coach-preview-name').innerText();
  expect.soft(String(firstName !== secondName), 'coach changed').toBe('true');
  const label = await page.locator('.coach-preview-primary').innerText();
  expect.soft(String(label.includes('Intro')), 'offering reset to the paid default').toBe('false');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});

test('NAV WIRING', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('clientHome');
  });
  await page.waitForTimeout(400);
  await page.locator('.bottom-nav-item').first().click();
  await page.waitForTimeout(400);
  expect.soft(String(await screenOf(page)), 'ClientHome nav reaches Discover').toBe('discover');

  await page.locator('.discover-card-main').first().click();
  await page.waitForTimeout(350);
  await page.locator('.coach-preview-icon-btn').first().click();
  await page.waitForTimeout(350);
  expect.soft(String(await screenOf(page)), 'back returns to discover').toBe('discover');
  expect.soft(String(errs.length), 'no errors').toBe('0');
  await ctx.close();
});
