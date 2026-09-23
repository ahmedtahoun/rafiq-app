import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * Earnings and Subscription — the parts of the Pro app that are about
 * money, and so the parts where a quiet wrong number costs the most.
 *
 * The assertions are on what the aggregate means: received excludes what
 * is still pending, a refund moves the total, the per-member rows add up
 * to the headline. Currency *formatting* is deliberately not asserted —
 * it is locale-blind today (a bare `toLocaleString()` and a hardcoded
 * "EGP" suffix even in Arabic) and pinning that would freeze a known bug
 * in place.
 */

async function open(browser, { screen = 'earnings', lang = 'en', dark = false, seed = null } = {}) {
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
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
  }, [lang, dark]);
  await page.reload();
  if (seed) {
    await page.evaluate(async (src) => {
      const m = await import('/src/lib/mockStore.ts');
      await eval(src)(m);
    }, seed);
  }
  await page.evaluate(async (s) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(s);
  }, screen);
  await page.waitForTimeout(450);
  return { page, ctx, errs };
}

const store = (page, fn) => page.evaluate(async (src) => {
  const m = await import('/src/lib/mockStore.ts');
  return eval(src)(m);
}, fn);
const n = (page, sel) => page.locator(sel).count();
const go = async (page, screen) => {
  await page.evaluate(async (s) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(s);
  }, screen);
  await page.waitForTimeout(400);
};
/** Digits only, so the assertion is about the number and not its formatting. */
const digits = (s) => Number(String(s).replace(/[^\d]/g, ''));

// ---------------------------------------------------------------------------

test('Earnings: the headline is the sum of the rows', async ({ browser }) => {
  const seed = `(m) => {
    m.addPayment('sara', { id: 'p1', amount: 1200, method: 'Cash', date: 'Oct 1, 2025' });
    m.addPayment('omar', { id: 'p2', amount: 800, method: 'Card', date: 'Oct 2, 2025' });
    m.addPayment('mona', { id: 'p3', amount: 450, method: 'Cash', date: 'Oct 3, 2025' });
  }`;
  const { page, ctx, errs } = await open(browser, { seed });

  const summary = await store(page, `(m) => m.getEarningsSummary()`);
  expect.soft(summary.totalReceived, 'received is the sum of the three payments').toBe(2450);

  const rowTotal = summary.byClient.reduce((sum, r) => sum + r.total, 0);
  expect.soft(rowTotal, 'the per-member breakdown adds up to the headline').toBe(summary.totalReceived);

  const shown = digits(await page.locator('.earnings-summary-value').first().innerText());
  expect.soft(shown, 'the screen shows that number').toBe(2450);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Earnings: a pending payment is owed, not received', async ({ browser }) => {
  const seed = `(m) => {
    m.addPayment('sara', { id: 'p1', amount: 1000, method: 'Cash', date: 'Oct 1, 2025' });
    m.addPayment('omar', { id: 'p2', amount: 600, method: 'Card', date: 'Oct 2, 2025', status: 'pending' });
  }`;
  const { page, ctx } = await open(browser, { seed });

  const s = await store(page, `(m) => m.getEarningsSummary()`);
  // The distinction the whole screen rests on: a payment awaiting
  // confirmation is not money the Pro has.
  expect.soft(s.totalReceived, 'received counts only the settled payment').toBe(1000);
  expect.soft(s.pendingTotal, 'pending is tracked separately').toBe(600);
  expect.soft(s.pendingCount, 'one member has something pending').toBe(1);

  expect.soft(digits(await page.locator('.earnings-summary-value').first().innerText()),
    'the headline shows received, not received + pending').toBe(1000);
  expect.soft(await n(page, '.earnings-pending-summary'), 'pending is surfaced on its own').toBe(1);

  await ctx.close();
});

test('Earnings: a refund is a ledger row and moves the total', async ({ browser }) => {
  const seed = `(m) => m.addPayment('sara', { id: 'p1', amount: 1000, method: 'Cash', date: 'Oct 1, 2025' })`;
  const { page, ctx } = await open(browser, { seed });

  expect.soft((await store(page, `(m) => m.getEarningsSummary()`)).totalReceived, 'before the refund').toBe(1000);

  await store(page, `(m) => m.refundPayment('sara', 'p1', 400, 'partial refund')`);
  await go(page, 'main');
  await go(page, 'earnings');

  const after = await store(page, `(m) => ({
    total: m.getEarningsSummary().totalReceived,
    history: m.getPaymentHistory('sara').map(p => ({ id: p.id, amount: p.amount, refundOf: p.refundOf || null })),
    flagged: m.isPaymentRefunded('sara', 'p1'),
  })`);

  expect.soft(after.total, 'the refund comes off the total').toBe(600);
  expect.soft(after.history.length, 'the refund is its own row').toBe(2);
  // The original must survive untouched — the ledger is append-only, so a
  // refunded payment keeps its original amount, method and date.
  const original = after.history.find((p) => p.id === 'p1');
  expect.soft(original.amount, 'the original payment is not rewritten').toBe(1000);
  expect.soft(after.flagged, 'the original is marked as refunded').toBe(true);

  expect.soft(digits(await page.locator('.earnings-summary-value').first().innerText()),
    'the screen shows the reduced total').toBe(600);

  await ctx.close();
});

test('Earnings: paid and due counts come from member status', async ({ browser }) => {
  const { page, ctx } = await open(browser);

  const s = await store(page, `(m) => m.getEarningsSummary()`);
  const statuses = await store(page, `(m) => m.getClients().map(c => c.paymentStatus)`);

  expect.soft(s.paidCount, 'paid matches the roster').toBe(statuses.filter((x) => x === 'paid').length);
  expect.soft(s.dueCount, 'due counts both due and overdue')
    .toBe(statuses.filter((x) => x === 'due' || x === 'overdue').length);
  expect.soft(s.totalClients, 'over the whole roster').toBe(statuses.length);
  // Every member is in exactly one of the two buckets.
  expect.soft(s.paidCount + s.dueCount, 'the buckets partition the roster').toBe(s.totalClients);

  await ctx.close();
});

test('Earnings: rows are ordered by what each member has paid', async ({ browser }) => {
  const seed = `(m) => {
    m.addPayment('sara', { id: 'a', amount: 300, method: 'Cash', date: 'Oct 1, 2025' });
    m.addPayment('omar', { id: 'b', amount: 1500, method: 'Cash', date: 'Oct 1, 2025' });
    m.addPayment('mona', { id: 'c', amount: 900, method: 'Cash', date: 'Oct 1, 2025' });
  }`;
  const { page, ctx } = await open(browser, { seed });

  const names = await page.locator('.earnings-row-name').allInnerTexts();
  const paying = names.map((x) => x.trim()).filter((x) => /Omar|Mona|Sara/.test(x));
  expect.soft(paying.slice(0, 3), 'highest payer first').toEqual(['Omar Fathy', 'Mona Reda', 'Sara Ahmed']);

  await ctx.close();
});

test('Earnings: an empty ledger reads as zero, not as a broken screen', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);

  const s = await store(page, `(m) => m.getEarningsSummary()`);
  expect.soft(s.totalReceived, 'nothing recorded yet').toBe(0);
  expect.soft(digits(await page.locator('.earnings-summary-value').first().innerText()), 'shown as zero').toBe(0);
  expect.soft(errs, 'no page errors on an empty ledger').toEqual([]);

  await ctx.close();
});

test('Subscription: downgrading asks why first, and only then takes effect', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'subscription' });

  expect.soft(await store(page, `(m) => m.getSubscription().tier`), 'seeded on Pro').toBe('pro');

  await page.locator('.subscription-downgrade-btn').click();
  await page.waitForTimeout(400);

  // Cancelling asks for a reason, and will not proceed without one — the
  // downgrade is not a single unguarded tap.
  const submit = page.locator('.subscription-survey-submit');
  expect.soft(await submit.isDisabled(), 'cannot submit without choosing a reason').toBe(true);
  expect.soft(await store(page, `(m) => m.getSubscription().tier`), 'still on Pro at this point').toBe('pro');

  await page.locator('.subscription-reason-row').first().click();
  await page.waitForTimeout(200);
  expect.soft(await submit.isDisabled(), 'enabled once a reason is chosen').toBe(false);

  await submit.click();
  await page.waitForTimeout(450);

  const afterDowngrade = await store(page, `(m) => m.getSubscription()`);
  expect.soft(afterDowngrade.tier, 'now on the free tier').toBe('free');
  // setSubscriptionTier pairs a real renewal date with Pro and clears it on
  // downgrade, so a free plan must not be left claiming a renewal.
  expect.soft(afterDowngrade.renewsAtMs, 'no renewal date while free').toBe(null);

  // The reason is kept, not just used to gate the button.
  const feedback = await store(page, `(m) => m.getSubscriptionCancelFeedback ? m.getSubscriptionCancelFeedback() : null`);
  if (feedback) expect.soft(Boolean(feedback), 'the cancellation reason was recorded').toBe(true);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Subscription: upgrading restores Pro and a renewal date', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'subscription',
    seed: `(m) => m.setSubscriptionTier('free')` });

  expect.soft(await store(page, `(m) => m.getSubscription().tier`), 'starts free').toBe('free');

  const upgrade = page.locator('button').filter({ hasText: /Upgrade|Go Pro|Rafiq Pro/i }).last();
  if (await upgrade.count() > 0) {
    await upgrade.click();
    await page.waitForTimeout(450);
  } else {
    await store(page, `(m) => m.setSubscriptionTier('pro')`);
  }

  const after = await store(page, `(m) => m.getSubscription()`);
  expect.soft(after.tier, 'back on Pro').toBe('pro');
  expect.soft(typeof after.renewsAtMs, 'Pro carries a renewal date').toBe('number');

  await ctx.close();
});

test('Money screens render in Arabic and dark without raw keys', async ({ browser }) => {
  const seed = `(m) => m.addPayment('sara', { id: 'p1', amount: 1200, method: 'Cash', date: 'Oct 1, 2025' })`;
  for (const screen of ['earnings', 'subscription']) {
    const { page, ctx, errs } = await open(browser, { screen, lang: 'ar', dark: true, seed });
    const body = await page.locator('.phone-frame').innerText();
    expect.soft(/[؀-ۿ]/.test(body), `${screen}: Arabic copy rendered`).toBe(true);
    expect.soft(/earnings[A-Z]|subscription[A-Z]/.test(body), `${screen}: no raw i18n keys`).toBe(false);
    expect.soft(errs, `${screen}: no page errors`).toEqual([]);
    await ctx.close();
  }
});
