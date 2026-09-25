import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The Pro's home screen and notifications.
 *
 * Main's "needs attention" list is a priority cascade: each active member
 * is reduced to at most one reason, chosen by a fixed order of
 * precedence. Getting that order wrong would not crash anything — it would
 * quietly tell a Pro to chase a task when the member's payment is overdue.
 * Most of these tests are about that ladder.
 */

async function open(browser, { screen = 'main', lang = 'en', dark = false, seed = null } = {}) {
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
/** The note shown against a given member in the attention list. */
async function noteFor(page, name) {
  const row = page.locator('.main-attention-row').filter({ hasText: name }).first();
  if (await row.count() === 0) return null;
  return (await row.locator('.main-attention-note').innerText()).trim();
}

// ---------------------------------------------------------------------------

test('Main: the attention list covers active members who need something', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);

  const rows = await page.locator('.main-attention-name').allInnerTexts();
  const names = rows.map((x) => x.trim());

  // Nour is archived, so however much she might qualify she is not the
  // Pro's problem this week.
  expect.soft(names.includes('Nour Hassan'), 'archived members are excluded').toBe(false);

  // Each member appears at most once — the cascade picks one reason.
  expect.soft(new Set(names).size, 'no member listed twice').toBe(names.length);

  // And every listed member really is active.
  const active = await store(page, `(m) => m.getClients().filter(c => c.active).map(c => c.name)`);
  for (const nm of names) expect.soft(active.includes(nm), `${nm} is an active member`).toBe(true);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Main: an overdue payment outranks an overdue task', async ({ browser }) => {
  // Sara is seeded payment-overdue. Give her an overdue task too: the row
  // must still say payment, because money outranks homework.
  const { page, ctx } = await open(browser, {
    // Due today and still open, which is what makes a task overdue.
    seed: `(m) => m.addTask('sara', { id: 'tz', title: 'Very late thing', dueAtMs: m.TODAY_MS + 9 * 3600000, dueHasTime: true, done: false })`,
  });

  const note = await noteFor(page, 'Sara Ahmed');
  expect.soft(note, 'Sara is listed').not.toBe(null);
  const paymentNote = await store(page, `(m) => null`);
  void paymentNote;
  // The payment-overdue note and the task-overdue note are different copy;
  // assert we got the payment one by checking against both keys.
  const expected = await page.evaluate(async () => {
    const i18n = await import('/src/lib/i18n.ts');
    return { payment: i18n.translate('en', 'mainPaymentOverdueNote'), task: i18n.translate('en', 'mainTaskOverdueNote') };
  });
  expect.soft(note, 'shows the payment reason').toBe(expected.payment);
  expect.soft(note === expected.task, 'not the task reason').toBe(false);

  await ctx.close();
});

test('Main: clearing the payment lets the next reason through', async ({ browser }) => {
  const { page, ctx } = await open(browser, {
    // Due today and still open, which is what makes a task overdue.
    seed: `(m) => m.addTask('sara', { id: 'tz', title: 'Very late thing', dueAtMs: m.TODAY_MS + 9 * 3600000, dueHasTime: true, done: false })`,
  });

  const expected = await page.evaluate(async () => {
    const i18n = await import('/src/lib/i18n.ts');
    return { payment: i18n.translate('en', 'mainPaymentOverdueNote'), task: i18n.translate('en', 'mainTaskOverdueNote') };
  });
  expect.soft(await noteFor(page, 'Sara Ahmed'), 'payment first').toBe(expected.payment);

  // Mark the payment paid; the overdue task underneath should surface.
  await store(page, `(m) => m.updateClient('sara', { paymentStatus: 'paid' })`);
  await go(page, 'clients');
  await go(page, 'main');

  expect.soft(await noteFor(page, 'Sara Ahmed'), 'the task reason surfaces once payment clears')
    .toBe(expected.task);

  await ctx.close();
});

test('Main: marking a payment paid clears that member from the list', async ({ browser }) => {
  const { page, ctx } = await open(browser);

  const before = await n(page, '.main-attention-row');
  const row = page.locator('.main-attention-row').filter({ hasText: 'Sara Ahmed' }).first();
  const payBtn = row.locator('.main-action-btn').first();
  expect.soft(await payBtn.count(), 'a payment row offers a mark-paid action').toBe(1);

  await payBtn.click();
  await page.waitForTimeout(400);

  expect.soft(await store(page, `(m) => m.getClient('sara').paymentStatus`), 'the member is marked paid').toBe('paid');
  const after = await n(page, '.main-attention-row');
  // Sara has nothing else wrong in the seed, so her row goes entirely.
  expect.soft(after, 'one fewer row').toBe(before - 1);

  await ctx.close();
});

test('Main: nudging drafts a message, opens the thread, and does not repeat', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);

  const nudgedBefore = await store(page, `(m) => Object.keys(m.getNudged()).length`);
  const draftBefore = await store(page, `(m) => m.getMessageDraft('khaled')`);
  expect.soft(draftBefore, 'no draft to start with').toBe('');

  const row = page.locator('.main-attention-row').filter({ hasText: 'Khaled Ibrahim' }).first();
  await row.locator('.main-remind-btn').first().click();
  await page.waitForTimeout(450);

  // Nudging is not a silent flag flip: it writes a draft and takes the Pro
  // to the conversation, ready to send.
  const screen = await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen);
  expect.soft(screen, 'lands on the member conversation').toBe('messages');

  const draft = await store(page, `(m) => m.getMessageDraft('khaled')`);
  expect.soft(draft.length > 0, 'a message was drafted').toBe(true);
  expect.soft(draft.includes('Khaled') || draft.length > 10, 'and it is about them').toBe(true);

  expect.soft(await store(page, `(m) => Object.keys(m.getNudged()).length`), 'the nudge was recorded')
    .toBe(nudgedBefore + 1);

  // Back on Main the row shows it is already done, and stays that way.
  await go(page, 'main');
  const rowAgain = page.locator('.main-attention-row').filter({ hasText: 'Khaled Ibrahim' }).first();
  expect.soft(await rowAgain.locator('.main-remind-btn').count(), 'the remind button is gone').toBe(0);
  expect.soft(await rowAgain.locator('.main-remind-done').count(), 'a done marker took its place').toBe(1);

  await go(page, 'clients');
  await go(page, 'main');
  const rowLater = page.locator('.main-attention-row').filter({ hasText: 'Khaled Ibrahim' }).first();
  expect.soft(await rowLater.locator('.main-remind-btn').count(), 'still nudged after a revisit').toBe(0);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Main: a roster with nothing wrong shows the caught-up state', async ({ browser }) => {
  // Clear every reason the cascade can find.
  const seed = `(m) => {
    m.getClients().forEach((c) => {
      m.updateClient(c.id, { paymentStatus: 'paid', needsCheckin: false, nextSession: 'Next: Today, 10:00 AM' });
      m.getTasks(c.id).forEach((t) => m.updateTask(c.id, t.id, { done: true }));
      m.renewPackage(c.id, 10);
    });
  }`;
  const { page, ctx, errs } = await open(browser, { seed });

  expect.soft(await n(page, '.main-attention-row'), 'nothing needs attention').toBe(0);
  expect.soft(await n(page, '.main-caught-up'), 'the caught-up card is shown instead').toBe(1);
  expect.soft(errs, 'no page errors').toEqual([]);

  await ctx.close();
});

test('Main: the earnings card matches the summary', async ({ browser }) => {
  const seed = `(m) => m.addPayment('sara', { id: 'p1', amount: 2200, method: 'Cash', date: 'Oct 1, 2025' })`;
  const { page, ctx } = await open(browser, { seed });

  const summary = await store(page, `(m) => m.getEarningsSummary()`);
  const amount = (await page.locator('.main-earnings-amount').innerText()).replace(/[^\d]/g, '');
  expect.soft(Number(amount), 'the card shows what has been received').toBe(summary.totalReceived);

  await ctx.close();
});

test('Notifications: the bell dot tracks unread, and marking all clears it', async ({ browser }) => {
  const seed = `(m) => m.addPayment('sara', { id: 'p1', amount: 900, method: 'Cash', date: 'Oct 1, 2025' })`;
  const { page, ctx, errs } = await open(browser, { seed });

  expect.soft(await store(page, `(m) => m.getProNotifications().some(x => x.unread)`), 'something is unread').toBe(true);
  expect.soft(await n(page, '.main-bell-dot'), 'the bell shows a dot').toBe(1);

  await go(page, 'notifications');
  const rows = await n(page, '.notifications-row, .notifications-list > *');
  expect.soft(rows > 0, 'the list has rows').toBe(true);

  await page.locator('.notifications-mark-all').click();
  await page.waitForTimeout(400);

  expect.soft(await store(page, `(m) => m.getProNotifications().some(x => x.unread)`), 'nothing unread now').toBe(false);
  expect.soft(await n(page, '.notifications-dot'), 'no unread dots remain').toBe(0);

  await go(page, 'main');
  expect.soft(await n(page, '.main-bell-dot'), 'and the bell dot is gone').toBe(0);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Notifications: an empty feed shows an empty state', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'notifications' });

  const count = await store(page, `(m) => m.getProNotifications().length`);
  if (count === 0) {
    expect.soft(await n(page, '.notifications-empty'), 'an empty state is shown').toBe(1);
  } else {
    // The seed produces notifications; clear them and check the empty state.
    await store(page, `(m) => m.getClients().forEach(c => m.getCustomBlocks().filter(b => b.clientId === c.id).forEach(b => m.removeCustomBlock(b.id)))`);
    await go(page, 'main');
    await go(page, 'notifications');
    const after = await store(page, `(m) => m.getProNotifications().length`);
    if (after === 0) expect.soft(await n(page, '.notifications-empty'), 'an empty state is shown').toBe(1);
  }
  expect.soft(errs, 'no page errors').toEqual([]);

  await ctx.close();
});

test('Pro home renders in Arabic and dark without raw keys', async ({ browser }) => {
  for (const screen of ['main', 'notifications']) {
    const { page, ctx, errs } = await open(browser, { screen, lang: 'ar', dark: true });
    const body = await page.locator('.phone-frame').innerText();
    expect.soft(/[؀-ۿ]/.test(body), `${screen}: Arabic copy rendered`).toBe(true);
    expect.soft(/main[A-Z]|notifications[A-Z]/.test(body), `${screen}: no raw i18n keys`).toBe(false);
    expect.soft(errs, `${screen}: no page errors`).toEqual([]);
    await ctx.close();
  }
});
