import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * The Pro's catalogue: Offerings, OfferingDetail, Templates,
 * TemplateDetail.
 *
 * Offerings are what a member can book; templates are the reusable task
 * lists a Pro keeps. The tests cover the lifecycle of each, and one pins a
 * copy claim to what the code actually does — the help centre used to
 * promise that a new member got a starter task list from their matching
 * template, which nothing in the app has ever done.
 */

async function open(browser, { screen = 'offerings', lang = 'en', dark = false, seed = null, params = null } = {}) {
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
const n = (page, sel) => page.locator(sel).count();
const go = async (page, screen) => {
  await page.evaluate(async (s) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(s);
  }, screen);
  await page.waitForTimeout(400);
};

// ---------------------------------------------------------------------------

test('Offerings: the list is the catalogue, in full', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);

  const offerings = await store(page, `(m) => m.getOfferings().map(o => o.name)`);
  expect.soft(await n(page, '.offerings-card'), 'every offering has a row').toBe(offerings.length);

  const names = (await page.locator('.offerings-card-name').allInnerTexts()).map((x) => x.trim());
  expect.soft(names, 'and they are the ones in the store').toEqual(offerings);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Offerings: a free offering shows as free, not as zero money', async ({ browser }) => {
  const { page, ctx } = await open(browser);

  // The seed has an Intro Call at 0 — the one price that must not render as
  // a bare "0" next to a currency.
  const intro = await store(page, `(m) => m.getOffering('off-intro')`);
  expect.soft(intro.price, 'the intro call is free in the data').toBe(0);

  const row = page.locator('.offerings-card').filter({ hasText: 'Intro Call' }).first();
  const price = (await row.locator('.offerings-card-price').innerText()).trim();
  expect.soft(/^0(\s|$)/.test(price), 'not shown as a bare zero').toBe(false);

  await ctx.close();
});

test('Offerings: creating one adds a real row that opens for editing', async ({ browser }) => {
  const { page, ctx } = await open(browser);

  const before = await store(page, `(m) => m.getOfferings().length`);
  await page.locator('.offerings-new').click();
  await page.waitForTimeout(500);

  const after = await store(page, `(m) => m.getOfferings()`);
  expect.soft(after.length, 'the catalogue grew by one').toBe(before + 1);

  // Creating goes straight into the detail screen for the new row, the same
  // shape as AddClient — a blank record the Pro fills in immediately.
  const screen = await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().screen);
  expect.soft(screen, 'lands on the detail screen').toBe('offeringDetail');
  const selected = await store(page, `(m) => m.getSelectedOfferingId()`);
  expect.soft(selected, 'and the selected offering is the new one').toBe(after[after.length - 1].id);

  await ctx.close();
});

test('Offerings: deleting one removes it from the catalogue', async ({ browser }) => {
  const { page, ctx } = await open(browser);

  const before = await store(page, `(m) => m.getOfferings().map(o => o.id)`);
  await store(page, `(m) => m.deleteOffering('off-workshop')`);
  await go(page, 'main');
  await go(page, 'offerings');

  const after = await store(page, `(m) => m.getOfferings().map(o => o.id)`);
  expect.soft(after.length, 'one fewer').toBe(before.length - 1);
  expect.soft(after.includes('off-workshop'), 'the deleted one is gone').toBe(false);
  expect.soft(await n(page, '.offerings-card'), 'the list reflects it').toBe(after.length);

  await ctx.close();
});

test('Offerings: an empty catalogue shows an empty state, not a blank screen', async ({ browser }) => {
  const seed = `(m) => m.getOfferings().forEach(o => m.deleteOffering(o.id))`;
  const { page, ctx, errs } = await open(browser, { seed });

  expect.soft(await store(page, `(m) => m.getOfferings().length`), 'catalogue is empty').toBe(0);
  expect.soft(await n(page, '.offerings-card'), 'no rows').toBe(0);
  expect.soft(await n(page, '.offerings-empty'), 'an empty state instead').toBe(1);
  expect.soft(errs, 'no page errors').toEqual([]);

  await ctx.close();
});

test('Templates: the list is the stored set, with its task counts', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'templates' });

  const templates = await store(page, `(m) => m.getTemplates().map(t => ({ name: t.name, tasks: t.tasks.length }))`);
  expect.soft(await n(page, '.templates-row'), 'a row per template').toBe(templates.length);

  const names = (await page.locator('.templates-row-name').allInnerTexts()).map((x) => x.trim());
  expect.soft(names, 'matching the store').toEqual(templates.map((t) => t.name));

  // Each row's meta names how many tasks the template carries, so a Pro can
  // tell a three-task starter from a five-task one without opening it.
  const meta = (await page.locator('.templates-row-meta').allInnerTexts()).map((x) => x.trim());
  templates.forEach((tpl, i) => {
    expect.soft(meta[i], `${tpl.name}: task count shown`).toContain(String(tpl.tasks));
  });

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Templates: creating one adds a real record', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'templates' });

  const before = await store(page, `(m) => m.getTemplates().length`);
  await page.locator('.templates-new').click();
  await page.waitForTimeout(500);

  const after = await store(page, `(m) => m.getTemplates()`);
  expect.soft(after.length, 'one more template').toBe(before + 1);
  expect.soft(after[after.length - 1].tasks.length, 'a new template starts empty').toBe(0);

  await ctx.close();
});

test('TemplateDetail: deleting asks first, and only then removes it', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, {
    screen: 'templateDetail',
    params: { templateId: 'tpl-med-basic' },
  });

  // The screen opened on the template it was given, not on a default.
  const shown = await page.locator('.phone-frame').innerText();
  expect.soft(shown, 'opened on the requested template').toContain('Meditation');

  const before = await store(page, `(m) => m.getTemplates().map(t => t.id)`);

  await page.locator('.template-detail-delete').click();
  await page.waitForTimeout(300);
  expect.soft(await n(page, '.template-detail-confirm'), 'deleting asks first').toBe(1);
  expect.soft(await store(page, `(m) => m.getTemplates().length`), 'nothing deleted while asking').toBe(before.length);

  await page.locator('.template-detail-confirm-cancel').click();
  await page.waitForTimeout(300);
  expect.soft(await store(page, `(m) => m.getTemplates().length`), 'cancelling keeps it').toBe(before.length);

  // Confirming does remove it, and only it.
  await page.locator('.template-detail-delete').click();
  await page.waitForTimeout(300);
  await page.locator('.template-detail-confirm-delete').click();
  await page.waitForTimeout(450);

  const after = await store(page, `(m) => m.getTemplates().map(t => t.id)`);
  expect.soft(after.length, 'one fewer template').toBe(before.length - 1);
  expect.soft(after.includes('tpl-med-basic'), 'the right one went').toBe(false);
  expect.soft(after, 'and the rest are untouched').toEqual(before.filter((id) => id !== 'tpl-med-basic'));

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('TemplateDetail: editing a template writes through', async ({ browser }) => {
  const { page, ctx } = await open(browser, {
    screen: 'templateDetail',
    params: { templateId: 'tpl-life-basic' },
  });

  const before = await store(page, `(m) => m.getTemplate('tpl-life-basic').tasks.length`);

  // Add a task through the screen's own add row.
  const addInput = page.locator('.template-detail-add-row input').first();
  if (await addInput.count() > 0) {
    await addInput.fill('Evening reflection');
    await addInput.press('Enter');
    await page.waitForTimeout(350);
    const addBtn = page.locator('.template-detail-add-row button').first();
    if ((await store(page, `(m) => m.getTemplate('tpl-life-basic').tasks.length`)) === before && await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(350);
    }
  }

  const tasks = await store(page, `(m) => m.getTemplate('tpl-life-basic').tasks`);
  expect.soft(tasks.length, 'the task was added').toBe(before + 1);
  expect.soft(tasks, 'with the text that was typed').toContain('Evening reflection');

  await ctx.close();
});

test('the help centre does not promise template tasks the app never applies', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'helpCenter' });

  // What actually happens: a new member starts with no tasks, even when a
  // template matches their specialty and plan exactly.
  const result = await store(page, `(m) => {
    const tpl = m.getTemplates().find(t => t.specialty === 'Life coaching' && t.plan === 'Basic');
    const c = m.addClient({ name: 'Copy Check', age: 30, phone: '1', countryCode: '+20', specialty: 'Life coaching', plan: 'Basic', goal: '', notes: '' });
    return { templateTasks: tpl ? tpl.tasks.length : 0, memberTasks: m.getTasks(c.id).length };
  }`);
  expect.soft(result.templateTasks > 0, 'a matching template exists and has tasks').toBe(true);
  expect.soft(result.memberTasks, 'but the new member starts with none').toBe(0);

  // So the answer must not say otherwise. If template tasks are ever
  // applied on add, this is the test that says the copy can change back.
  const help = await page.locator('.phone-frame').innerText();
  expect.soft(/applied automatically/i.test(help), 'no claim of automatic application').toBe(false);
  expect.soft(/starter task list is applied/i.test(help), 'no starter-list promise').toBe(false);

  await ctx.close();
});

test('Catalogue screens render in Arabic and dark without raw keys', async ({ browser }) => {
  for (const screen of ['offerings', 'templates']) {
    const { page, ctx, errs } = await open(browser, { screen, lang: 'ar', dark: true });
    const body = await page.locator('.phone-frame').innerText();
    expect.soft(/[؀-ۿ]/.test(body), `${screen}: Arabic copy rendered`).toBe(true);
    expect.soft(/offerings[A-Z]|templates[A-Z]|offeringType[A-Z]|templateCadence/.test(body),
      `${screen}: no raw i18n keys`).toBe(false);
    expect.soft(errs, `${screen}: no page errors`).toEqual([]);
    await ctx.close();
  }
});
