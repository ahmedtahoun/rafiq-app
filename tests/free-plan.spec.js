import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows } from './fakeSupabase.js';

/**
 * The plans (0020, 0024): Free holds 3 active members, Rafiq Pro Plus
 * (tier 'pro') 15, Rafiq Elite Pro (tier 'elite_pro') has no limit. Signed
 * in, the plan is the coach's `subscriptions` row: no row is free, a paid
 * tier whose renews_at has passed is free again.
 * supabase/tests/24_free_tier.sql and 29_plan_tiers.sql prove the database
 * refuses the member past the cap; these check the screens say so first,
 * and say it right in both languages.
 */

const UID = 'coach-1';
const NOW = new Date('2026-09-28T09:00:00Z'); // Mon 12:00 in Cairo

const client = (id, name, extra = {}) => ({
  id, coach_id: UID, member_id: null, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: 'Life coaching · Basic', specialty: 'Life coaching', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''),
  avatar_bg: '#3E6FB0', active: true, progress: 40, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: '', focus: '', signup_completed_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});

const NAMES = ['Rana Adel', 'Omar Said', 'Hala Nabil', 'Karim Fawzy'];

/** A coach with `active` active members and one archived, on `sub` (null: no row). */
const tables = (active, sub = null) => ({
  clients: [
    ...Array.from({ length: active }, (_, i) => client(`c-${i}`, NAMES[i] ?? `Member ${i + 1}`)),
    client('c-old', 'Old Member', { active: false }),
  ],
  client_private: [],
  tasks: [],
  sessions: [],
  packages: [],
  payments: [],
  subscriptions: sub ? [{ coach_id: UID, ...sub }] : [],
  profiles: [
    { id: UID, full_name: 'Dina Farouk', role: 'coach', account_status: 'active' },
    { id: 'm-hana', full_name: 'Hana Mostafa', phone: null, country_code: null, email: 'hana@x.com' },
  ],
  offerings: [],
  time_blocks: [],
  weekly_availability: [],
  session_requests: [
    // Tue 29 Sep, 10:00 Cairo: a free intro call from someone not on the roster.
    { id: 'req-hana', member_id: 'm-hana', coach_id: UID, offering_id: null, requested_start: '2026-09-29T07:00:00Z', price: 0, currency: 'EGP', status: 'pending', created_at: '2026-09-27T10:00:00Z', responded_at: null, reschedule_of: null },
  ],
});

async function open(browser, { lang = 'en', dark = false, data, screen = 'clients' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
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
  await installFakeSupabase(page, { userId: UID, tables: data });
  await signIn(page, UID);
  await go(page, screen);
  return { page, ctx, errs };
}

async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(300);
}
const currentScreen = async (page) => (await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState())).screen;

test('free, with room: no banner, and Add Member opens the form', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables(2) });
  await expect(page.locator('.clients-card')).toHaveCount(3);
  await expect(page.locator('.clients-cap-banner')).toHaveCount(0);
  await go(page, 'addClient');
  await expect(page.locator('#acname')).toBeVisible();
  await expect(page.locator('.add-client-cap')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

for (const [lang, dark] of [['en', false], ['ar', true]]) {
  test(`free and full: the roster says so, Add Member explains instead of a form, and plans are one tap away (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang, dark, data: tables(3) });
    const banner = page.locator('.clients-cap-banner');
    await expect(banner).toHaveCount(1);
    await expect(banner).toContainText('3/3');

    await go(page, 'addClient');
    const cap = page.locator('.add-client-cap');
    await expect(cap).toBeVisible();
    await expect(page.locator('#acname')).toHaveCount(0);
    await expect(cap).toContainText(lang === 'ar' ? 'باقتك المجانية ممتلئة' : 'Your free plan is full');
    await expect(cap).toContainText(lang === 'ar' ? 'تتسع لـ 3 أعضاء' : 'holds 3 active members');

    await cap.getByRole('button').click();
    expect(await currentScreen(page)).toBe('subscription');
    await expect(page.locator('.subscription-hero-sub')).toHaveText(lang === 'ar' ? 'أنت على الباقة المجانية — حتى 3 أعضاء نشطين.' : "You're on the Free plan — up to 3 active members.");
    // No self-serve downgrade or upgrade signed in: billing isn't built.
    // Both paid plans are above Free, so both say "coming soon".
    await expect(page.locator('.subscription-downgrade-btn')).toHaveCount(0);
    await expect(page.locator('.subscription-upgrade-soon')).toHaveCount(2);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('Pro Plus granted by hand: room below 15, "Active", and how to change the plan', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables(4, { tier: 'pro', renews_at: null }) });
  await expect(page.locator('.clients-card')).toHaveCount(5);
  await expect(page.locator('.clients-cap-banner')).toHaveCount(0);
  await go(page, 'addClient');
  await expect(page.locator('#acname')).toBeVisible();

  await go(page, 'subscription');
  await expect(page.locator('.subscription-hero-plan')).toHaveText('Rafiq Pro Plus');
  await expect(page.locator('.subscription-hero-sub')).toHaveText('Active');
  await expect(page.locator('.subscription-downgrade-btn')).toHaveCount(0);
  await expect(page.locator('.subscription-disclaimer')).toContainText('support@rafiqpro.com');
  // What Pro Plus offers is only what it does.
  const pro = page.locator('.subscription-plan-card[data-tier="pro"]');
  await expect(pro).toContainText('Up to 15 active members');
  await expect(pro).not.toContainText(/verified|featured|priority/i);
  // Elite Pro is above it, so only that card says "coming soon".
  await expect(page.locator('.subscription-upgrade-soon')).toHaveCount(1);
  await expect(page.locator('.subscription-plan-card[data-tier="elite_pro"] .subscription-upgrade-soon')).toHaveCount(1);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a Pro that has lapsed is on the free plan again', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables(4, { tier: 'pro', renews_at: '2026-09-27T00:00:00Z' }) });
  await expect(page.locator('.clients-cap-banner')).toContainText('4/3');
  await go(page, 'addClient');
  await expect(page.locator('.add-client-cap')).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a Pro renewing next month shows the renewal date, in the device zone', async ({ browser }) => {
  // 23:30 UTC on 27 Oct is 02:30 on 28 Oct in Cairo: a real instant, so the
  // date is Cairo's (CLAUDE.md, "Two kinds of time").
  const { page, ctx, errs } = await open(browser, { data: tables(1, { tier: 'pro', renews_at: '2026-10-27T23:30:00Z' }), screen: 'subscription' });
  await expect(page.locator('.subscription-hero-sub')).toHaveText('Renews on Oct 28, 2026');
  expect(errs).toEqual([]);
  await ctx.close();
});

for (const lang of ['en', 'ar']) {
  test(`accepting a request at the limit says why, and the request waits (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang, data: tables(3), screen: 'notifications' });
    await page.locator('.notifications-row').first().click();
    const sheet = page.locator('.notifications-sheet');
    await sheet.getByRole('button', { name: lang === 'ar' ? 'قبول' : 'Accept' }).click();
    await expect(sheet).toContainText(lang === 'ar' ? 'باقتك تتسع لـ 3 من الأعضاء النشطين' : 'Your plan holds 3 active members');
    expect((await dbRows(page, 'session_requests')).find((r) => r.id === 'req-hana').status).toBe('pending');
    expect((await dbRows(page, 'clients')).filter((c) => c.active)).toHaveLength(3);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

for (const [lang, dark] of [['en', false], ['ar', true]]) {
  test(`Pro Plus and full at 15: its own banner, its own cap screen, and accepting says 15 (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang, dark, data: tables(15, { tier: 'pro', renews_at: null }) });
    const banner = page.locator('.clients-cap-banner');
    await expect(banner).toContainText('15/15');
    await expect(banner).toContainText(lang === 'ar' ? 'رفيق إيليت برو' : 'Rafiq Elite Pro');

    await go(page, 'addClient');
    const cap = page.locator('.add-client-cap');
    await expect(cap).toBeVisible();
    await expect(page.locator('#acname')).toHaveCount(0);
    await expect(cap).toContainText(lang === 'ar' ? 'باقة رفيق برو بلس ممتلئة' : 'Your Rafiq Pro Plus plan is full');
    await expect(cap).toContainText(lang === 'ar' ? 'تتسع لـ 15 عضوًا نشطًا' : 'holds 15 active members');

    await go(page, 'notifications');
    await page.locator('.notifications-row').first().click();
    const sheet = page.locator('.notifications-sheet');
    await sheet.getByRole('button', { name: lang === 'ar' ? 'قبول' : 'Accept' }).click();
    await expect(sheet).toContainText(lang === 'ar' ? 'باقتك تتسع لـ 15 من الأعضاء النشطين' : 'Your plan holds 15 active members');
    expect((await dbRows(page, 'session_requests')).find((r) => r.id === 'req-hana').status).toBe('pending');
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('Elite Pro granted by hand: past 15, no banner, and nothing above it to sell', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { data: tables(16, { tier: 'elite_pro', renews_at: null }) });
  await expect(page.locator('.clients-cap-banner')).toHaveCount(0);
  await go(page, 'addClient');
  await expect(page.locator('#acname')).toBeVisible();

  await go(page, 'notifications');
  await page.locator('.notifications-row').first().click();
  await page.locator('.notifications-sheet').getByRole('button', { name: 'Accept' }).click();
  await expect.poll(async () => (await dbRows(page, 'session_requests')).find((r) => r.id === 'req-hana').status).toBe('accepted');

  await go(page, 'subscription');
  await expect(page.locator('.subscription-hero-plan')).toHaveText('Rafiq Elite Pro');
  await expect(page.locator('.subscription-plan-card[data-tier="elite_pro"] .subscription-plan-badge')).toHaveText('Current plan');
  await expect(page.locator('.subscription-upgrade-soon')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

for (const lang of ['en', 'ar']) {
  test(`the plans and their prices, and Elite Pro's unbuilt features say so (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang, data: tables(1), screen: 'subscription' });
    const ar = lang === 'ar';
    const pro = page.locator('.subscription-plan-card[data-tier="pro"]');
    const elite = page.locator('.subscription-plan-card[data-tier="elite_pro"]');
    await expect(page.locator('.subscription-plan-card')).toHaveCount(3);
    await expect(pro).toContainText(ar ? 'رفيق برو بلس' : 'Rafiq Pro Plus');
    await expect(pro.locator('.subscription-plan-price')).toHaveText(ar ? '450 جنيه / شهريًا' : '450 EGP / month');
    await expect(pro.locator('.subscription-plan-yearly')).toContainText(ar ? '4,500 جنيه' : '4,500 EGP / year');
    await expect(elite).toContainText(ar ? 'رفيق إيليت برو' : 'Rafiq Elite Pro');
    await expect(elite.locator('.subscription-plan-price')).toHaveText(ar ? '900 جنيه / شهريًا' : '900 EGP / month');
    await expect(elite.locator('.subscription-plan-yearly')).toContainText(ar ? '9,000 جنيه' : '9,000 EGP / year');
    // Featured placement and the CSV export don't exist yet: each carries
    // its own tag, and nothing else on the card does.
    const soon = elite.locator('.subscription-plan-feature', { has: page.locator('.subscription-feature-soon') });
    await expect(soon).toHaveCount(2);
    await expect(soon.first()).toContainText(ar ? 'ظهور مميّز' : 'Featured placement in Discover');
    await expect(soon.last()).toContainText('CSV');
    await expect(pro.locator('.subscription-feature-soon')).toHaveCount(0);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('photos are not a Pro feature: a free coach can add their own', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
  });
  await page.reload();
  await page.evaluate(async () => (await import('/src/lib/mockStore.ts')).setSubscriptionTier('free'));
  await go(page, 'editProfile');
  await expect(page.locator('label[for="avatarFileInput"]').first()).toBeVisible();
  await expect(page.locator('label[for="coverFileInput"]')).toBeVisible();
  await expect(page.locator('.phone-frame')).not.toContainText(/Pro Plus/);
  await ctx.close();
});
