import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * Earnings, signed in: the coach's own roster and `payments` ledger
 * (src/lib/earningsData.ts). It used to show the demo store's totals and
 * members to every coach. RLS on the real table is proven by
 * supabase/tests; the fake doesn't model it, so the other coach's row
 * below is there to prove the query names the coach's own clients itself.
 *
 * Signed out it stays on the demo: tests/pro-money.spec.js.
 */

const UID = 'coach-1';

const client = (id, name, extra = {}) => ({
  id, coach_id: UID, member_id: `m-${id}`, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: 'Life coaching · Basic', specialty: 'Life coaching', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''),
  avatar_bg: '#3E6FB0', active: true, progress: 40, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'paid', goal: '', focus: '', signup_completed_at: null, invite_code: null, invite_expires_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});

let n = 0;
const pay = (client_id, amount, extra = {}) => ({
  id: `pay-${++n}`, client_id, kind: 'charge', amount, currency: 'EGP', state: 'completed', method: 'Cash', note: null,
  refund_of: null, paid_at: '2026-09-20T10:00:00Z', created_at: '2026-09-20T10:00:00Z', ...extra,
});

const empty = { clients: [], client_private: [], tasks: [], payments: [], payouts: [] };

/**
 * Rana paid 1000 and 500, and 200 of the 500 went back. Omar owes and has
 * 300 awaiting confirmation. Old Member is archived but paid 250, so that
 * money stays in the total and on the list; Gone is archived with nothing
 * and drops off. The other coach's client and payment must not appear.
 */
function ledger() {
  const rana500 = pay('c-rana', 500);
  return {
    ...empty,
    clients: [
      client('c-rana', 'Rana Adel'),
      client('c-omar', 'Omar Said', { payment_status: 'overdue' }),
      client('c-old', 'Old Member', { active: false, payment_status: 'due' }),
      client('c-gone', 'Gone Member', { active: false, payment_status: 'due' }),
      client('c-other', 'Other Coach Member', { coach_id: 'coach-2' }),
    ],
    payments: [
      pay('c-rana', 1000),
      rana500,
      pay('c-rana', 200, { kind: 'refund', refund_of: rana500.id, note: 'Missed session' }),
      pay('c-omar', 300, { state: 'pending' }),
      pay('c-old', 250),
      pay('c-other', 9999),
    ],
  };
}

async function open(browser, { lang = 'en', dark = false, tables, fail = [] }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await installScreenSettle(page);
  await page.goto('/');
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [lang, dark]);
  await page.reload();
  await installFakeSupabase(page, { userId: UID, tables, fail });
  await signIn(page, UID);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('earnings'));
  await page.evaluate(() => window.__screenSettled());
  return { page, ctx, errs };
}

/** The number in a money label, in either language's digits. */
const amountOf = (s) => Number(String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, ''));
const DEMO = /Sara|Omar Khaled|Nour|Karim|Layla|Yasmin|سارة|ياسمين/;

for (const lang of ['en', 'ar']) {
  for (const dark of [false, true]) {
    test(`the coach's own ledger: received, pending, paid and due (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
      const { page, ctx, errs } = await open(browser, { lang, dark, tables: ledger() });
      const frame = page.locator('.phone-frame');
      await expect(page.locator('.earnings-summary-card')).toBeVisible();

      // 1000 + 500 − 200 + 250. The pending 300 is owed, not received, and
      // the other coach's 9999 is not this coach's money.
      expect(amountOf(await page.locator('.earnings-summary-value').innerText())).toBe(1550);
      const pending = page.locator('.earnings-pending-summary');
      await expect(pending).toContainText(lang === 'ar' ? 'بانتظار التأكيد' : 'awaiting confirmation');
      expect(amountOf((await pending.innerText()).split('·')[1])).toBe(300);
      // Active members only: Rana paid, Omar overdue.
      await expect(page.locator('.earnings-paid-count')).toContainText(lang === 'ar' ? '1/2' : '1/2');
      expect(amountOf(await page.locator('.earnings-due-count').innerText())).toBe(1);

      // Ordered by what each has paid; the archived member with money stays,
      // the one without drops off.
      await expect(page.locator('.earnings-row-name')).toHaveText(['Rana Adel', 'Old Member', 'Omar Said']);
      const totals = await page.locator('.earnings-row-total').allInnerTexts();
      expect(totals.map(amountOf)).toEqual([1300, 250, 0]);
      await expect(page.locator('.earnings-row').nth(2).locator('.earnings-row-pending')).toBeVisible();
      // A member's name is their own text: isolated in either direction.
      await expect(page.locator('.earnings-row-name bdi')).toHaveCount(3);

      await expect(frame).not.toContainText(DEMO);
      await expect(frame).not.toContainText(/Other Coach Member|9,?999/);
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('the ledger is read for the coach\'s own clients only, and never written', async ({ browser }) => {
  const { page, ctx } = await open(browser, { tables: ledger() });
  await expect(page.locator('.earnings-summary-card')).toBeVisible();
  const calls = await dbCalls(page);
  const reads = calls.filter((c) => c.table === 'payments');
  expect(reads.length).toBeGreaterThan(0);
  for (const r of reads) {
    expect(r.op).toBe('select');
    const ids = r.filters.find(([col, , op]) => col === 'client_id' && op === 'in')?.[1];
    expect(ids, 'filtered to named clients').toBeTruthy();
    expect([...ids].sort()).toEqual(['c-gone', 'c-old', 'c-omar', 'c-rana']);
  }
  const clientReads = calls.filter((c) => c.table === 'clients');
  for (const r of clientReads) expect(r.filters).toContainEqual(['coach_id', UID]);
  expect(calls.filter((c) => c.op !== 'select' && ['payments', 'clients'].includes(c.table))).toEqual([]);
  await ctx.close();
});

for (const lang of ['en', 'ar']) {
  test(`a new coach sees zero and no members — not the demo's (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang, tables: empty });
    await expect(page.locator('.earnings-summary-card')).toBeVisible();
    expect(amountOf(await page.locator('.earnings-summary-value').innerText())).toBe(0);
    await expect(page.locator('.earnings-empty').first()).toHaveText(lang === 'ar' ? 'لا يوجد أعضاء بعد' : 'No members yet');
    await expect(page.locator('.earnings-row')).toHaveCount(0);
    await expect(page.locator('.earnings-pending-summary, .earnings-due-count')).toHaveCount(0);
    await expect(page.locator('.phone-frame')).not.toContainText(DEMO);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('a failed read shows the error and a retry that works — never the demo totals', async ({ browser }) => {
  const { page, ctx } = await open(browser, { tables: ledger(), fail: ['payments'] });
  await expect(page.locator('.phone-frame')).toHaveCount(1);
  const alert = page.locator('.load-state[role="alert"]');
  await expect(alert).toBeVisible();
  await expect(page.locator('.earnings-summary-card')).toHaveCount(0);
  await expect(page.locator('.phone-frame')).not.toContainText(DEMO);

  await setFailing(page, []);
  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.earnings-summary-card')).toBeVisible();
  expect(amountOf(await page.locator('.earnings-summary-value').innerText())).toBe(1550);
  await ctx.close();
});

test('a member row opens that member', async ({ browser }) => {
  const { page, ctx } = await open(browser, { tables: ledger() });
  await page.locator('.earnings-row', { hasText: 'Rana Adel' }).click();
  const state = await page.evaluate(async () => {
    const s = (await import('/src/store/appStore.ts')).useAppStore.getState();
    return { screen: s.screen, params: s.params };
  });
  expect(state.screen).toBe('clientDetail');
  expect(state.params.clientId).toBe('c-rana');
  await ctx.close();
});
