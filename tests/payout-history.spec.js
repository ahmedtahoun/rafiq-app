import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * Payout history on Earnings: the coach's own rows from the payouts ledger
 * (0007), through tests/fakeSupabase.js. RLS on the real table (a coach
 * reads only their own payouts, and can't write any) is proven by
 * supabase/tests/08_payouts.sql.
 *
 * The suite runs in Africa/Cairo (playwright.config.ts), which is what lets
 * the midnight case below tell the two date formatters apart.
 */

const UID = 'user-123';

// 22:30 UTC on the 27th is 01:30 on the 28th in Cairo (UTC+3 until the end
// of October): a real instant, so it must read as the 28th.
const LATE_NIGHT = '2026-09-27T22:30:00Z';

const payout = (id, amount, status, created_at, extra = {}) => ({
  id, coach_id: UID, amount, currency: 'EGP', issuer: 'vodafone', status, created_at,
  destination: { msisdn: '01098765432', full_name: 'Rana Coach', national_id: '29912310104567' },
  ...extra,
});

const ALL_STATUSES = [
  payout('p1', 1200, 'requested', '2026-09-01T09:00:00Z'),
  payout('p2', 5400, 'success', LATE_NIGHT),
  payout('p3', 800, 'failed', '2026-08-15T09:00:00Z'),
  payout('p4', 300.5, 'processing', '2026-09-10T09:00:00Z'),
  payout('p5', 250, 'pending', '2026-09-12T09:00:00Z'),
  payout('p6', 99, 'unknown', '2026-09-05T09:00:00Z'),
  // Someone else's payout — RLS hides it for real; the query must not rely on that alone.
  payout('other', 7777, 'success', '2026-09-20T09:00:00Z', { coach_id: 'someone-else' }),
];

async function open(browser, { lang = 'en', dark = false, payouts = [], fail, signedIn = true } = {}) {
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
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [lang, dark]);
  await page.reload();
  await installFakeSupabase(page, { tables: { payouts }, fail });
  if (signedIn) await signIn(page, UID);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('earnings'));
  await page.waitForTimeout(300);
  return { page, ctx, errs };
}

const section = (page) => page.locator('.earnings-payouts');
const rowTexts = (page) => page.locator('.earnings-payout-row').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));

test('a real instant formats in the device zone; calendar values stay in UTC', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async (at) => {
    const f = await import('/src/lib/format.ts');
    const ms = Date.parse(at);
    return { en: f.formatInstantDate('en', at), ar: f.formatInstantDate('ar', at), fromMs: f.formatInstantDate('en', ms), calendar: f.formatDisplayDate('en', ms) };
  }, LATE_NIGHT);
  expect(out.en).toBe('Sep 28, 2026');
  expect(out.ar).toBe('28 سبتمبر 2026');
  expect(out.fromMs).toBe('Sep 28, 2026');
  // The calendar formatter reads the UTC day — right for the fixed week,
  // wrong for a payout, which is why there are two.
  expect(out.calendar).toBe('Sep 27, 2026');
});

test('signed out, Earnings has no payouts section and asks Supabase for nothing', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { signedIn: false, payouts: ALL_STATUSES });
  await expect(page.locator('.earnings-summary-card')).toBeVisible();
  await expect(section(page)).toHaveCount(0);
  expect((await dbCalls(page)).filter((c) => c.table === 'payouts')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('no payouts yet', async ({ browser }) => {
  for (const [lang, text] of [['en', 'No payouts yet'], ['ar', 'لا توجد دفعات بعد']]) {
    const { page, ctx, errs } = await open(browser, { lang });
    await expect(section(page).locator('.earnings-empty')).toHaveText(text);
    await expect(page.locator('.earnings-payout-row')).toHaveCount(0);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('the coach sees their own payouts, newest first, with amount, status and date', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { payouts: ALL_STATUSES });
  await expect(page.locator('.earnings-payout-row')).toHaveCount(6);
  expect(await rowTexts(page)).toEqual([
    '5,400 EGP Sep 28, 2026 Paid',
    '250 EGP Sep 12, 2026 Pending',
    '300.50 EGP Sep 10, 2026 Processing',
    '99 EGP Sep 5, 2026 Checking status',
    '1,200 EGP Sep 1, 2026 Requested',
    '800 EGP Aug 15, 2026 Failed',
  ]);

  // Asked for its own rows, newest first, and never for the destination
  // snapshot (it holds the national ID).
  const reads = (await dbCalls(page)).filter((c) => c.table === 'payouts');
  expect(reads.length).toBeGreaterThan(0);
  for (const r of reads) {
    expect(r.op).toBe('select');
    expect(r.filters).toEqual([['coach_id', UID]]);
    expect(r.order).toEqual(['created_at', false]);
    expect(r.columns).not.toMatch(/destination|\*/);
  }
  expect(await section(page).innerText()).not.toContain('7,777');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('in Arabic and dark mode, statuses and dates are Arabic and readable', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true, payouts: ALL_STATUSES });
  await expect(page.locator('.earnings-payout-row')).toHaveCount(6);
  expect(await section(page).locator('h2').innerText()).toBe('دفعات الأرباح');
  const rows = await rowTexts(page);
  expect(rows[0]).toBe('5,400 جنيه 28 سبتمبر 2026 تم الدفع');
  expect(await page.locator('.earnings-payout-status').allInnerTexts()).toEqual(['تم الدفع', 'قيد الانتظار', 'قيد المعالجة', 'جارٍ التحقق من الحالة', 'تم الطلب', 'فشلت']);
  expect(rows.join(' ')).not.toMatch(/[A-Za-z]{3,}/);

  const colors = await page.locator('.earnings-payouts, .earnings-payouts *').evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
  expect(colors).not.toContain('rgb(0, 0, 0)');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read says so with a retry, and doesn\'t claim there are no payouts', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { payouts: ALL_STATUSES, fail: ['payouts.select'] });
  await expect(section(page).getByRole('alert')).toContainText("Couldn't load your payouts.");
  await expect(section(page)).not.toContainText('No payouts yet');
  // The rest of Earnings still renders.
  await expect(page.locator('.earnings-summary-card')).toBeVisible();

  await setFailing(page, []);
  await section(page).getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.earnings-payout-row')).toHaveCount(6);
  expect(errs).toEqual([]);
  await ctx.close();
});
