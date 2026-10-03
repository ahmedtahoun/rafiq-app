import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, setFailing } from './fakeSupabase.js';

/**
 * Offerings, signed in. The screens wrote to the demo store even for a real
 * coach, so nothing they made reached `offerings`, and their coach page had
 * nothing for members to book. Now they read and write the coach's own rows
 * (src/lib/offeringData.ts); RLS keeps those to the coach
 * (offerings_write_own, 0001).
 */

const UID = 'coach-1';

const offering = (id, name, extra = {}) => ({
  id, coach_id: UID, name, description: '', type: 'session', duration: '50 min', format: 'online',
  price: 600, currency: 'EGP', session_count: null, active: true, created_at: `2026-09-0${id.slice(-1)}T00:00:00Z`, ...extra,
});

const tables = () => ({
  profiles: [{ id: UID, full_name: 'Ahmed Tahoun', phone: '', country_code: '+20', email: 'a@x.com', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null, account_status: 'active', role: 'coach' }],
  coach_profiles: [{ profile_id: UID, title: 'Life coaching', cert: '', bio: 'Coach.', languages: ['Arabic'], session_mode: 'online', experience_years: 3, certifications: [], cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z' }],
  offerings: [
    offering('off-1', 'Intro call', { price: 0, duration: '20 min' }),
    offering('off-2', 'Monthly package', { type: 'program', price: 2400, session_count: 4, duration: '4 weeks', format: 'both' }),
    offering('off-3', 'Old workshop', { type: 'workshop', active: false }),
    offering('off-4', 'Someone else', { coach_id: 'coach-2' }),
  ],
});

async function open(browser, { lang = 'en', screen = 'offerings', data = tables() } = {}) {
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
  await installFakeSupabase(page, { userId: UID, tables: data });
  await signIn(page, UID);
  await go(page, screen);
  return { page, ctx, errs };
}

async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(400);
}
const currentScreen = async (page) => (await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState())).screen;
const own = async (page) => (await dbRows(page, 'offerings')).filter((o) => o.coach_id === UID);

test('the list is the coach\'s own active offerings, not the demo catalogue', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(page.locator('.offerings-card-name')).toHaveText(['Intro call', 'Monthly package']);
  await expect(page.locator('.offerings-card', { hasText: 'Intro call' }).locator('.offerings-card-price')).toHaveText('Free');
  await expect(page.locator('.offerings-card', { hasText: 'Monthly package' }).locator('.offerings-card-price')).toHaveText('2,400 EGP');
  await expect(page.locator('.phone-frame')).not.toContainText(/1:1 Coaching Session|Goal-Setting Workshop|Old workshop|Someone else/);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a new offering is created on Save, not when the form opens; Cancel leaves nothing', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.offerings-new').click();
  await expect(page.locator('.offering-detail-title')).toHaveText('New Offering');
  await expect(page.locator('.offering-detail-delete')).toHaveCount(0);
  await page.locator('.offering-detail-cancel').click();
  expect(await own(page)).toHaveLength(3);

  await page.locator('.offerings-new').click();
  await page.locator('.offering-detail-chip', { hasText: 'Group Session' }).click();
  await page.locator('#oname').fill('Reflection circle');
  await page.locator('#odesc').fill('Six people, one evening a week.');
  await page.locator('#oduration').fill('90 min');
  await page.locator('#oprice').fill('350');
  await page.locator('.offering-detail-format-chip', { hasText: 'In-person' }).click();
  await page.locator('.offering-detail-save').click();

  await expect.poll(() => currentScreen(page)).toBe('offerings');
  const created = (await own(page)).find((o) => o.name === 'Reflection circle');
  expect(created).toMatchObject({
    coach_id: UID, type: 'group', description: 'Six people, one evening a week.', duration: '90 min',
    price: 350, format: 'in_person', session_count: null, active: true,
  });
  await expect(page.locator('.offerings-card-name')).toHaveText(['Intro call', 'Monthly package', 'Reflection circle']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('editing saves to the row; a blank session count is stored as none, never 0', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.offerings-card', { hasText: 'Monthly package' }).click();
  await expect(page.locator('#oname')).toHaveValue('Monthly package');
  await expect(page.locator('#ototal')).toHaveValue('4');
  // What the coach typed reads in its own direction: "4 weeks" read "weeks 4" in Arabic.
  for (const id of ['#oname', '#odesc', '#oduration']) await expect(page.locator(id)).toHaveAttribute('dir', 'auto');
  await page.locator('#oprice').fill('2600');
  await page.locator('#ototal').fill('');
  await page.locator('.offering-detail-save').click();
  await expect.poll(() => currentScreen(page)).toBe('offerings');
  expect((await own(page)).find((o) => o.id === 'off-2')).toMatchObject({ price: 2600, session_count: null, active: true });
  await expect(page.locator('.offerings-card', { hasText: 'Monthly package' }).locator('.offerings-card-price')).toHaveText('2,600 EGP');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('deleting archives the row: gone from the list, kept for the bookings that point at it', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await page.locator('.offerings-card', { hasText: 'Intro call' }).click();
  await page.locator('.offering-detail-delete').click();
  await page.locator('.offering-detail-confirm-delete').click();
  await expect.poll(() => currentScreen(page)).toBe('offerings');
  expect((await own(page)).find((o) => o.id === 'off-1')).toMatchObject({ active: false });
  await expect(page.locator('.offerings-card-name')).toHaveText(['Monthly package']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed save keeps the form and says so (Arabic)', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar' });
  await setFailing(page, ['offerings.insert']);
  await page.locator('.offerings-new').click();
  await page.locator('#oname').fill('جلسة تعارف');
  await page.locator('.offering-detail-save').click();
  await expect(page.locator('.offering-detail-error')).toHaveText('لم يتم حفظ العرض. حاول مرة أخرى.');
  expect(await currentScreen(page)).toBe('offeringDetail');
  await expect(page.locator('#oname')).toHaveValue('جلسة تعارف');
  expect(await own(page)).toHaveLength(3);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed read shows retry, never the demo catalogue', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('rafiq_role', JSON.stringify('coach')); });
  await page.reload();
  await installFakeSupabase(page, { userId: UID, tables: tables(), fail: ['offerings.select'] });
  await signIn(page, UID);
  await go(page, 'offerings');
  await expect(page.locator('.offerings-card')).toHaveCount(0);
  await expect(page.locator('.load-state')).toBeVisible();
  await ctx.close();
});

test('Preview Profile shows the coach\'s own offerings, and its Book button does nothing for the coach', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'previewProfile' });
  const frame = page.locator('.phone-frame');
  await expect(frame).toContainText('Intro call');
  await expect(frame).toContainText('Monthly package');
  await expect(frame).not.toContainText(/1:1 Coaching Session|Goal-Setting Workshop/);
  await expect(page.locator('.preview-profile-book')).toBeDisabled();
  expect(errs).toEqual([]);
  await ctx.close();
});
