import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';

/**
 * Earnings → "Export CSV", a Rafiq Elite Pro feature.
 *
 * Three things worth a test rather than a glance:
 *
 * - **Who sees it.** Free and Pro Plus must not, and a lapsed Elite Pro is
 *   free again (0024's coach_plan, planFromRow), so the button goes with
 *   the plan and not with the row.
 * - **The exact bytes.** A CSV is parsed by something else, so "looks
 *   right" is not a standard. The seeded ledger has an Arabic name, a name
 *   with a comma in it, a refund, a pending row and a null method.
 * - **The zone.** `paid_at` is an instant the server stamped, so it formats
 *   in the device's zone. The newest row below is 22:30 UTC, which is the
 *   *next day* in Cairo — through the UTC calendar formatters it would
 *   export a day early.
 *
 * The button is an `<a download>` with a `data:` URL, like the two .ics
 * links (CoachPreview, ClientBooking), so the href is the file and a test
 * can read it without a real download.
 */

const UID = 'coach-1';
const NOW = new Date('2026-10-06T09:00:00Z');

const client = (id, name, extra = {}) => ({
  id, coach_id: UID, member_id: null, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: 'Life coaching · Basic', specialty: 'Life coaching', plan: 'Basic', initials: 'XX',
  avatar_bg: '#3E6FB0', active: true, progress: 40, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: '', focus: '', signup_completed_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});

const ARABIC = 'نور الهدى';
const COMMA = 'Ali, Jr.';

const tables = (sub) => ({
  clients: [client('c-ar', ARABIC), client('c-comma', COMMA)],
  client_private: [],
  tasks: [],
  sessions: [],
  packages: [],
  payments: [
    // 22:30 UTC on the 5th is 01:30 on the 6th in Cairo.
    { id: 'p-3', client_id: 'c-ar', kind: 'charge', amount: '1200.00', currency: 'EGP', state: 'completed', method: 'Cash', note: null, refund_of: null, paid_at: '2026-10-05T22:30:00Z', created_at: '2026-10-05T22:30:00Z' },
    { id: 'p-2', client_id: 'c-comma', kind: 'refund', amount: '300.50', currency: 'EGP', state: 'completed', method: 'Instapay', note: null, refund_of: 'p-1', paid_at: '2026-10-01T09:00:00Z', created_at: '2026-10-01T09:00:00Z' },
    { id: 'p-1', client_id: 'c-ar', kind: 'charge', amount: '800.00', currency: 'EGP', state: 'pending', method: null, note: null, refund_of: null, paid_at: '2026-09-28T09:00:00Z', created_at: '2026-09-28T09:00:00Z' },
  ],
  subscriptions: sub ? [{ coach_id: UID, ...sub }] : [],
  profiles: [{ id: UID, full_name: 'Dina Farouk', role: 'coach', account_status: 'active' }],
  offerings: [],
  time_blocks: [],
  weekly_availability: [],
  session_requests: [],
});

const ELITE = { tier: 'elite_pro', renews_at: null };

async function open(browser, { lang = 'en', data } = {}) {
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
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
  }, lang);
  await page.reload();
  await installFakeSupabase(page, { userId: UID, tables: data });
  await signIn(page, UID);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('earnings'));
  await page.waitForTimeout(400);
  return { page, ctx, errs };
}

/** The file the button would hand over. */
const exportedCsv = async (page) =>
  decodeURIComponent((await page.locator('.earnings-export').getAttribute('href')).replace(/^data:text\/csv;charset=utf-8,/, ''));

test('only an Elite Pro coach is offered the export', async ({ browser }) => {
  for (const [label, sub] of [['no subscription row (free)', null], ['Pro Plus', { tier: 'pro', renews_at: null }]]) {
    const { page, ctx, errs } = await open(browser, { data: tables(sub) });
    await expect(page.locator('.earnings-export'), label).toHaveCount(0);
    // The screen itself still works: the export is absent, not broken.
    await expect(page.locator('.earnings-summary-card'), label).toHaveCount(1);
    expect(errs, label).toEqual([]);
    await ctx.close();
  }

  const elite = await open(browser, { data: tables(ELITE) });
  await expect(elite.page.locator('.earnings-export')).toHaveText('Export CSV');
  expect(elite.errs).toEqual([]);
  await elite.ctx.close();
});

test('a lapsed Elite Pro is free again, and loses the export', async ({ browser }) => {
  // renews_at in the past: planFromRow reads it as free, like coach_plan().
  const { page, ctx, errs } = await open(browser, { data: tables({ tier: 'elite_pro', renews_at: '2026-10-01T00:00:00Z' }) });
  await expect(page.locator('.earnings-export')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the CSV is exactly the ledger, escaped, in the device zone', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables(ELITE) });
  const csv = await exportedCsv(page);

  // A BOM, or Excel on Windows reads the Arabic name in the system codepage.
  expect(csv.startsWith('﻿'), 'starts with a UTF-8 BOM').toBe(true);

  expect(csv).toBe(
    '﻿date,member,kind,amount,currency,state,method\n'
    // "Oct 6, 2026" carries a comma of its own, so the date is quoted too —
    // not only the names. 22:30 UTC on the 5th, the 6th in Cairo.
    + '"Oct 6, 2026",نور الهدى,charge,1200.00,EGP,completed,Cash\n'
    // The name with a comma is quoted; a refund keeps its own sign-free
    // amount and is named by `kind`.
    + '"Oct 1, 2026","Ali, Jr.",refund,300.50,EGP,completed,Instapay\n'
    // A pending charge is exported as pending, and a null method is empty
    // rather than the string "null".
    + '"Sep 28, 2026",نور الهدى,charge,800.00,EGP,pending,\n',
  );

  // Order is already pinned by the comparison above — newest first, as the
  // query asks for and as the on-screen payout history shows it. A second,
  // looser check of the same property was here and came out: it parsed
  // dates by splitting on '","', which only occurs on the one row whose
  // name is quoted.

  expect(await page.locator('.earnings-export').getAttribute('download')).toBe('rafiq-earnings-2026-10-06.csv');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a member name that starts a formula is exported as text', async ({ browser }) => {
  // A member picks their own name. Opened in Excel or Sheets, a field that
  // starts with =, +, -, @ runs as a formula, so the export must not hand
  // the coach a spreadsheet with a member's formula in it.
  const data = tables(ELITE);
  data.clients.push(
    client('c-eq', '=HYPERLINK("http://x.test","click")'),
    client('c-plus', '+1 trick'),
    client('c-at', '@SUM(1,1)'),
  );
  data.payments = [
    { id: 'q-1', client_id: 'c-eq', kind: 'charge', amount: '100.00', currency: 'EGP', state: 'completed', method: 'Cash', note: null, refund_of: null, paid_at: '2026-10-03T09:00:00Z', created_at: '2026-10-03T09:00:00Z' },
    { id: 'q-2', client_id: 'c-plus', kind: 'charge', amount: '100.00', currency: 'EGP', state: 'completed', method: 'Cash', note: null, refund_of: null, paid_at: '2026-10-02T09:00:00Z', created_at: '2026-10-02T09:00:00Z' },
    { id: 'q-3', client_id: 'c-at', kind: 'charge', amount: '100.00', currency: 'EGP', state: 'completed', method: 'Cash', note: null, refund_of: null, paid_at: '2026-10-01T09:00:00Z', created_at: '2026-10-01T09:00:00Z' },
  ];
  const { page, ctx, errs } = await open(browser, { data });
  const rows = (await exportedCsv(page)).split('\n').slice(1, 4);
  expect(rows[0]).toBe('"Oct 3, 2026","\'=HYPERLINK(""http://x.test"",""click"")",charge,100.00,EGP,completed,Cash');
  expect(rows[1]).toBe('"Oct 2, 2026",\'+1 trick,charge,100.00,EGP,completed,Cash');
  // Its comma quotes it too, with the ' inside the quotes.
  expect(rows[2]).toBe('"Oct 1, 2026","\'@SUM(1,1)",charge,100.00,EGP,completed,Cash');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Arabic: the button is Arabic and the file still parses', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', data: tables(ELITE) });
  await expect(page.locator('.earnings-export')).toHaveText('تصدير CSV');
  const csv = await exportedCsv(page);
  // The header stays in English: these are column names something else
  // parses, not copy anyone reads on a screen.
  expect(csv).toContain('date,member,kind,amount,currency,state,method');
  // Amounts stay Latin-digit and unformatted even under `ar` — toFixed, not
  // Intl, for exactly this reason.
  expect(csv).toContain('1200.00');
  expect(csv).not.toMatch(/[٠-٩]/);
  // The date column does localise, which is what fmt.instantDate means.
  expect(csv).toContain('أكتوبر');
  expect(errs).toEqual([]);
  await ctx.close();
});
