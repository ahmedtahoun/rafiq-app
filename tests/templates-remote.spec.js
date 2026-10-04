import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, setFailing } from './fakeSupabase.js';

/**
 * Session templates, signed in. Profile → Templates showed the demo's
 * fourteen templates to a real coach, and everything they made or changed
 * went to this phone's localStorage. Now Templates and TemplateDetail read
 * and write the coach's own `templates` rows (src/lib/templateData.ts);
 * RLS keeps those to the coach (templates_own, 0005).
 */

const UID = 'coach-1';

const template = (id, name, extra = {}) => ({
  id, coach_id: UID, name, specialty: 'Life coaching', plan: 'Basic', cadence: 'Weekly', icon: 'XX', bg: '#3E6FB0',
  tasks: [], created_at: `2026-09-0${id.slice(-1)}T00:00:00Z`, updated_at: `2026-09-0${id.slice(-1)}T00:00:00Z`, ...extra,
});

const tables = ({ templates } = {}) => ({
  profiles: [{ id: UID, full_name: 'Ahmed Tahoun', phone: '', country_code: '+20', email: 'a@x.com', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null, account_status: 'active', role: 'coach' }],
  coach_profiles: [{ profile_id: UID, title: 'Life coaching', cert: '', bio: 'Coach.', languages: ['Arabic'], session_mode: 'online', experience_years: 3, certifications: [], cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z' }],
  templates: templates ?? [
    template('tpl-1', 'Career sprint', { specialty: 'Career coaching', cadence: 'Bi-weekly', icon: 'CS', tasks: ['Update CV', 'Two applications'] }),
    template('tpl-2', 'Sleep reset', { specialty: 'Sleep coaching', plan: 'Full Access', icon: 'SR', tasks: ['Sleep log'] }),
    template('tpl-3', 'Not mine', { coach_id: 'coach-2' }),
  ],
});

async function open(browser, { lang = 'en', screen = 'templates', data = tables(), fail = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
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
  await installFakeSupabase(page, { userId: UID, tables: data, fail });
  await signIn(page, UID);
  await go(page, screen);
  return { page, ctx, errs };
}

async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(400);
}
const currentScreen = async (page) => (await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState())).screen;
const own = async (page) => (await dbRows(page, 'templates')).filter((r) => r.coach_id === UID);
// The demo's seeded templates, none of which a real coach should see.
const DEMO = /Life Coaching · Basic|Meditation · Basic|Parenting Coaching · Basic/;

test('the list is the coach\'s own templates, not the demo\'s', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(page.locator('.templates-row-name')).toHaveText(['Career sprint', 'Sleep reset']);
  await expect(page.locator('.templates-row', { hasText: 'Career sprint' }).locator('.templates-row-icon')).toHaveText('CS');
  await expect(page.locator('.templates-row', { hasText: 'Career sprint' }).locator('.templates-row-meta')).toHaveText('Bi-weekly sessions · 2 starter tasks');
  await expect(page.locator('.phone-frame')).not.toContainText(DEMO);
  await expect(page.locator('.phone-frame')).not.toContainText('Not mine');
  await expect(page.locator('.templates-empty')).toHaveCount(0);
  // Nothing applies a template when a member is added (pro-catalogue.spec.js
  // holds the help centre to the same), so the intro mustn't promise it.
  await expect(page.locator('.templates-intro')).not.toContainText(/automatic/i);
  // Nothing was written to the demo store along the way.
  expect(await page.evaluate(() => localStorage.getItem('rafiq_templates'))).toBeNull();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a coach with no templates sees an empty state, in both languages', async ({ browser }) => {
  for (const [lang, title] of [['en', 'No templates yet'], ['ar', 'لا توجد قوالب بعد']]) {
    const { page, ctx, errs } = await open(browser, { lang, data: tables({ templates: [] }) });
    await expect(page.locator('.templates-empty-title')).toHaveText(title);
    await expect(page.locator('.templates-intro')).not.toContainText(/automatic|تلقائي/i);
    await expect(page.locator('.templates-row')).toHaveCount(0);
    await expect(page.locator('.phone-frame')).not.toContainText(DEMO);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('a new template is created on Save, not when the form opens; Cancel leaves nothing', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.templates-new').click();
  await expect(page.locator('.template-detail-heading')).toHaveText('New Template');
  await expect(page.locator('.template-detail-delete')).toHaveCount(0);
  // No name, nothing to save.
  await expect(page.locator('.template-detail-save')).toBeDisabled();
  await page.locator('.template-detail-cancel').click();
  await expect.poll(() => currentScreen(page)).toBe('templates');
  expect(await own(page)).toHaveLength(2);

  await page.locator('.templates-new').click();
  await page.locator('#template-name').fill('Yoga · Morning');
  await page.locator('.template-detail-chip', { hasText: 'Yoga coaching' }).click();
  await page.locator('.template-detail-chip', { hasText: 'Full Access' }).click();
  await page.locator('.template-detail-chip', { hasText: '3x/week' }).click();
  const add = page.locator('.template-detail-add-row input');
  await add.fill('Sun salutation');
  await add.press('Enter');
  await add.fill('Posture check');
  await add.press('Enter');
  // Tasks wait for Save: the row doesn't exist yet.
  expect(await own(page)).toHaveLength(2);
  await page.locator('.template-detail-save').click();

  await expect.poll(() => currentScreen(page)).toBe('templates');
  expect((await own(page)).find((r) => r.name === 'Yoga · Morning')).toMatchObject({
    coach_id: UID, specialty: 'Yoga coaching', plan: 'Full Access', cadence: '3x/week',
    tasks: ['Sun salutation', 'Posture check'], icon: 'YM',
  });
  await expect(page.locator('.templates-row-name')).toHaveText(['Career sprint', 'Sleep reset', 'Yoga · Morning']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('editing saves every field, tasks included, only on Save', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.templates-row', { hasText: 'Career sprint' }).click();
  await expect(page.locator('#template-name')).toHaveValue('Career sprint');
  await expect(page.locator('.template-detail-task-label')).toHaveText(['Update CV', 'Two applications']);
  // What the coach typed reads in its own direction.
  await expect(page.locator('#template-name')).toHaveAttribute('dir', 'auto');

  await page.locator('.template-detail-task', { hasText: 'Two applications' }).locator('.template-detail-task-remove').click();
  const add = page.locator('.template-detail-add-row input');
  await add.fill('Mock interview');
  await add.press('Enter');
  expect((await own(page)).find((r) => r.id === 'tpl-1').tasks).toEqual(['Update CV', 'Two applications']);

  await page.locator('#template-name').fill('Job hunt');
  await page.locator('.template-detail-chip', { hasText: 'Weekly' }).first().click();
  await page.locator('.template-detail-save').click();
  await expect.poll(() => currentScreen(page)).toBe('templates');
  expect((await own(page)).find((r) => r.id === 'tpl-1')).toMatchObject({
    name: 'Job hunt', cadence: 'Weekly', tasks: ['Update CV', 'Mock interview'], icon: 'JH', specialty: 'Career coaching',
  });
  await expect(page.locator('.templates-row-name')).toHaveText(['Job hunt', 'Sleep reset']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('Cancel on an edit leaves the row as it was', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.templates-row', { hasText: 'Sleep reset' }).click();
  await page.locator('.template-detail-task-remove').first().click();
  await page.locator('#template-name').fill('Changed');
  await page.locator('.template-detail-cancel').click();
  await expect.poll(() => currentScreen(page)).toBe('templates');
  expect((await own(page)).find((r) => r.id === 'tpl-2')).toMatchObject({ name: 'Sleep reset', tasks: ['Sleep log'] });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('deleting removes the row', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.templates-row', { hasText: 'Sleep reset' }).click();
  await page.locator('.template-detail-delete').click();
  await expect(page.locator('.template-detail-confirm-body')).toContainText('Sleep reset');
  await page.locator('.template-detail-confirm-delete').click();
  await expect.poll(() => currentScreen(page)).toBe('templates');
  expect((await own(page)).map((r) => r.id)).toEqual(['tpl-1']);
  await expect(page.locator('.templates-row-name')).toHaveText(['Career sprint']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed save or delete keeps the form and says so (Arabic)', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar' });
  await setFailing(page, ['templates.insert', 'templates.delete']);
  await page.locator('.templates-new').click();
  await page.locator('#template-name').fill('تمارين التنفس');
  await page.locator('.template-detail-save').click();
  await expect(page.locator('.template-detail-error')).toHaveText('لم يتم حفظ القالب. حاول مرة أخرى.');
  expect(await currentScreen(page)).toBe('templateDetail');
  await expect(page.locator('#template-name')).toHaveValue('تمارين التنفس');
  expect(await own(page)).toHaveLength(2);

  await page.locator('.template-detail-cancel').click();
  await page.locator('.templates-row', { hasText: 'Sleep reset' }).click();
  await page.locator('.template-detail-delete').click();
  await page.locator('.template-detail-confirm-delete').click();
  await expect(page.locator('.template-detail-error')).toHaveText('لم يتم حذف القالب. حاول مرة أخرى.');
  expect(await currentScreen(page)).toBe('templateDetail');
  expect(await own(page)).toHaveLength(2);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read shows retry, never the demo templates; retry loads them', async ({ browser }) => {
  const { page, ctx } = await open(browser, { fail: ['templates.select'] });
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(page.locator('.templates-row')).toHaveCount(0);
  await expect(page.locator('.phone-frame')).not.toContainText(DEMO);

  await setFailing(page, []);
  await page.locator('.load-state button', { hasText: /try again|retry/i }).click();
  await expect(page.locator('.templates-row-name')).toHaveText(['Career sprint', 'Sleep reset']);
  await ctx.close();
});

test('TemplateDetail: a failed read shows retry, never the demo template of the same id', async ({ browser }) => {
  const { page, ctx } = await open(browser, { fail: ['templates.select'] });
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav({ screen: 'templateDetail', params: { templateId: 'tpl-life-basic' } }));
  await expect(page.locator('.load-state')).toBeVisible();
  await expect(page.locator('#template-name')).toHaveCount(0);
  await expect(page.locator('.phone-frame')).not.toContainText(DEMO);
  await ctx.close();
});

test('a template id that no longer exists says so instead of an empty form', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'templates' });
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav({ screen: 'templateDetail', params: { templateId: 'tpl-gone' } }));
  await expect(page.locator('.template-detail-missing')).toBeVisible();
  await expect(page.locator('.template-detail-save')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('signed out, the demo templates are unchanged', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('rafiq_role', JSON.stringify('coach')); });
  await page.reload();
  await go(page, 'templates');
  await expect(page.locator('.templates-row')).toHaveCount(14);
  await expect(page.locator('.templates-row-name').first()).toHaveText('Life Coaching · Basic');
  await ctx.close();
});
