import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * Task due dates.
 *
 * `Task.due` used to be a pre-composed English sentence — "Due Fri,
 * Oct 24" — written into the seed and, once AddTask started composing it
 * through `t()`, written into storage in whatever language the Pro
 * happened to be using. Three things followed from that:
 *
 *   it rendered in English on an Arabic screen;
 *   a task added in Arabic showed Arabic to English users forever;
 *   and `isTaskOverdue` decided overdue-ness by looking for the word
 *   "today" inside the sentence, so an Arabic task due today was never
 *   overdue and never reached the Pro's attention list.
 *
 * It is a timestamp now. These tests cover the rendering in both
 * languages, the overdue rule, and that the change did not move which
 * members count as having an overdue task.
 */

async function open(browser, { screen = 'clientDetail', lang = 'en', params = { clientId: 'sara' }, role = 'coach', seed = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([l, r]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_role', JSON.stringify(r));
  }, [lang, role]);
  await page.reload();
  if (seed) {
    await page.evaluate(async (src) => {
      const m = await import('/src/lib/mockStore.ts');
      await eval(src)(m);
    }, seed);
  }
  await page.evaluate(async ([s, p]) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(p ? { screen: s, params: p } : s);
  }, [screen, params]);
  await page.waitForTimeout(450);
  return { page, ctx, errs };
}

const store = (page, fn) => page.evaluate(async (src) => {
  const m = await import('/src/lib/mockStore.ts');
  return eval(src)(m);
}, fn);

// ---------------------------------------------------------------------------

test('due dates read the same in English as the design specified', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);

  const dues = (await page.locator('.client-detail-task-due').allInnerTexts()).map((x) => x.trim());
  // Exactly the three strings the seed used to carry as literals — relative
  // where it reads better, absolute otherwise, with the time only when one
  // was set.
  expect.soft(dues, 'the same labels, now derived').toEqual([
    'Due today, 6:00 PM',
    'Due tomorrow',
    'Due Fri, Oct 24',
  ]);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('due dates are in Arabic on an Arabic screen', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar' });

  const dues = (await page.locator('.client-detail-task-due').allInnerTexts()).map((x) => x.trim());
  expect.soft(dues.length, 'three tasks').toBe(3);
  for (const d of dues) {
    expect.soft(/[؀-ۿ]/.test(d), `"${d}" is Arabic`).toBe(true);
    expect.soft(/\bDue\b/.test(d), `"${d}" has no English "Due"`).toBe(false);
    expect.soft(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(d), `"${d}" has no English weekday`).toBe(false);
  }
  // Times keep Western digits, like every other number in the app.
  expect.soft(dues.some((d) => /6:00/.test(d)), 'the time is still readable').toBe(true);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('a task created in Arabic is overdue when it is due today', async ({ browser }) => {
  // This is the bug that mattered: the old rule looked for the English word
  // "today" in the stored sentence, so this task was invisible to the Pro.
  const { page, ctx } = await open(browser, {
    lang: 'ar',
    seed: `(m) => m.addTask('mona', { id: 'ar1', title: 'مهمة عربية', dueAtMs: m.TODAY_MS + 9 * 3600000, dueHasTime: true, done: false })`,
    params: { clientId: 'mona' },
  });

  const overdue = await store(page, `(m) => m.isTaskOverdue(m.getTasks('mona').find(t => t.id === 'ar1'))`);
  expect.soft(overdue, 'due today and open, so overdue').toBe(true);

  // And the member now reaches the Pro's attention list because of it.
  await page.evaluate(async () => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav('main');
  });
  await page.waitForTimeout(400);
  const rows = await page.locator('.main-attention-name').allInnerTexts();
  expect.soft(rows.map((x) => x.trim()).some((nm) => nm.includes('Mona')), 'Mona is flagged').toBe(true);

  await ctx.close();
});

test('overdue now includes a date that has genuinely passed', async ({ browser }) => {
  const { page, ctx } = await open(browser, {
    seed: `(m) => m.addTask('sara', { id: 'past', title: 'Long overdue', dueAtMs: m.TODAY_MS - 5 * 86400000, done: false })`,
  });

  // The string rule only ever matched "today", so a task three days past its
  // date was quietly not overdue.
  expect.soft(await store(page, `(m) => m.isTaskOverdue(m.getTasks('sara').find(t => t.id === 'past'))`),
    'a past date is overdue').toBe(true);
  // Done still wins over the date.
  await store(page, `(m) => m.updateTask('sara', 'past', { done: true })`);
  expect.soft(await store(page, `(m) => m.isTaskOverdue(m.getTasks('sara').find(t => t.id === 'past'))`),
    'a completed task is never overdue').toBe(false);

  await ctx.close();
});

test('which members have an overdue task did not change', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'main', params: null });

  // Pinned against what the old string rule produced: khaled and laila each
  // have an open task due today, everyone else does not.
  const flagged = await store(page, `(m) => m.getClients().filter(c => m.getTasks(c.id).some(t => m.isTaskOverdue(t))).map(c => c.id)`);
  expect.soft(flagged.sort(), 'the same members as before the change').toEqual(['khaled', 'laila']);

  await ctx.close();
});

test('AddTask stores a timestamp, not a sentence', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'addTask', params: { clientId: 'sara' } });

  const before = await store(page, `(m) => m.getTasks('sara').length`);

  await page.locator('#task-title, .add-task-field input').first().fill('Structured task');
  await page.waitForTimeout(150);
  // Pick the tomorrow chip.
  await page.locator('.add-task-chip').nth(1).click();
  await page.waitForTimeout(150);
  await page.locator('.add-task-submit, button').filter({ hasText: /Save|Add Task/i }).last().click();
  await page.waitForTimeout(500);

  const tasks = await store(page, `(m) => m.getTasks('sara')`);
  expect.soft(tasks.length, 'the task was created').toBe(before + 1);
  const created = tasks[tasks.length - 1];
  expect.soft(typeof created.dueAtMs, 'due is a number').toBe('number');
  expect.soft(created.due, 'no sentence was stored').toBe(undefined);
  const todayMs = await store(page, `(m) => m.TODAY_MS`);
  expect.soft(created.dueAtMs, 'the tomorrow chip means tomorrow').toBe(todayMs + 86400000);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('AddTask takes an exact date and time from real inputs', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'addTask', params: { clientId: 'sara' } });

  // Real date/time inputs, so the value is ISO whatever the language.
  expect.soft(await page.locator('#task-date').getAttribute('type'), 'a date input').toBe('date');
  expect.soft(await page.locator('#task-time').getAttribute('type'), 'a time input').toBe('time');

  await page.locator('#task-title, .add-task-field input').first().fill('Exact task');
  await page.locator('#task-date').fill('2025-11-05');
  await page.locator('#task-time').fill('14:30');
  await page.waitForTimeout(200);
  await page.locator('.add-task-submit, button').filter({ hasText: /Save|Add Task/i }).last().click();
  await page.waitForTimeout(500);

  const created = await store(page, `(m) => m.getTasks('sara').slice(-1)[0]`);
  expect.soft(created.dueAtMs, 'the exact date and time were stored').toBe(Date.UTC(2025, 10, 5, 14, 30));
  expect.soft(created.dueHasTime, 'and it knows a time was set').toBe(true);

  await ctx.close();
});

test("ClientDetail's edit sheet preselects the task's real due date", async ({ browser }) => {
  const { page, ctx } = await open(browser);

  // Open the edit sheet for the task due tomorrow.
  const rows = page.locator('.client-detail-task-row');
  await rows.nth(1).click();
  await page.waitForTimeout(350);

  const selected = await page.locator('.client-detail-due-chip.is-selected').count();
  // The chips used to compare against hardcoded English sentences that never
  // matched what the seed stored, so nothing was ever selected.
  expect.soft(selected, 'the matching chip is selected').toBe(1);

  await ctx.close();
});
