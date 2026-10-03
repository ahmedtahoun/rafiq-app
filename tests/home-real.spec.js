import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows } from './fakeSupabase.js';

/**
 * The coach's Home, signed in. It used to show the design's fixed demo to
 * every coach: "Yasmin El-Sayed", a 12-day streak, "3/5 sessions", a week
 * chart, and the demo roster's members, on a real coach's first screen.
 * Now every number is the coach's own, and a coach still setting up gets a
 * checklist whose steps tick themselves from real rows.
 */

const UID = 'coach-1';
const NOW = new Date('2026-09-28T09:00:00Z'); // Mon 12:00 in Cairo

const profile = ({ photo = false, bio = '' } = {}) => ({
  profiles: [{
    id: UID, full_name: 'Ahmed Tahoun', phone: '', country_code: '+20', email: 'a@x.com', country: 'Egypt',
    country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: photo ? `${UID}/avatar.png` : null, account_status: 'active', role: 'coach',
  }],
  coach_profiles: [{
    profile_id: UID, title: 'Life coaching', cert: '', bio, languages: ['Arabic'], session_mode: 'online',
    experience_years: 3, certifications: [], cover_photo_url: null, verification_status: 'unverified',
    signup_completed_at: '2026-09-01T00:00:00Z',
  }],
});

const client = (id, name, extra = {}) => ({
  id, coach_id: UID, member_id: `m-${id}`, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: 'Life coaching · Basic', specialty: 'Life coaching', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''),
  avatar_bg: '#3E6FB0', active: true, progress: 40, needs_checkin: false, next_session_at: '2026-09-28T12:00:00Z', next_session_type: 'standard',
  program_completed: false, payment_status: 'paid', goal: '', focus: '', signup_completed_at: null, invite_code: null, invite_expires_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});

const empty = { clients: [], client_private: [], tasks: [], sessions: [], packages: [], payments: [], subscriptions: [], offerings: [], time_blocks: [], weekly_availability: [], session_requests: [], favourites: [] };

/** A coach three weeks in: two members, one session today, one request waiting. */
const busy = () => ({
  ...empty,
  ...profile({ photo: true, bio: 'Life coach in Cairo.' }),
  clients: [
    client('c-rana', 'Rana Adel'),
    client('c-omar', 'Omar Said', { payment_status: 'overdue', next_session_at: null }),
    client('c-old', 'Old Member', { active: false }),
  ],
  weekly_availability: [{ coach_id: UID, day_of_week: 0, enabled: true, start_hour: 10, end_hour: 18 }],
  time_blocks: [
    // Today 15:00–15:50 Cairo, and one tomorrow that must not count as today.
    { id: 'tb-1', coach_id: UID, client_id: 'c-rana', kind: 'booked', label: 'Session', starts_at: '2026-09-28T12:00:00Z', ends_at: '2026-09-28T12:50:00Z', session_type: 'standard' },
    { id: 'tb-2', coach_id: UID, client_id: 'c-omar', kind: 'booked', label: 'Session', starts_at: '2026-09-29T08:00:00Z', ends_at: '2026-09-29T08:50:00Z', session_type: 'standard' },
  ],
  profiles: [...profile().profiles.map((p) => ({ ...p, avatar_photo_url: `${UID}/avatar.png` })), { id: 'm-hana', full_name: 'Hana Mostafa', phone: null, country_code: null, email: 'h@x.com' }],
  session_requests: [
    { id: 'req-1', member_id: 'm-hana', coach_id: UID, offering_id: null, requested_start: '2026-09-30T07:00:00Z', price: 0, currency: 'EGP', status: 'pending', created_at: '2026-09-27T10:00:00Z', responded_at: null, reschedule_of: null },
  ],
});

async function open(browser, { lang = 'en', tables }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  await installFakeSupabase(page, { userId: UID, tables });
  await signIn(page, UID);
  await go(page, 'main');
  return { page, ctx, errs };
}

async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.waitForTimeout(400);
}
const currentScreen = async (page) => (await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState())).screen;
const stat = (page, key) => page.locator(`.main-stat-${key} .main-stat-num`);

for (const lang of ['en', 'ar']) {
  test(`a brand-new coach sees their own name, zeros, and how to get set up (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang, tables: { ...empty, ...profile() } });
    const frame = page.locator('.phone-frame');
    await expect(page.locator('.main-name')).toHaveText('Ahmed Tahoun');
    await expect(frame).not.toContainText(/Yasmin|ياسمين|Sara Ahmed|streak|مواظبة/);
    await expect(page.locator('.main-ring, .main-week-card, .main-streak')).toHaveCount(0);
    for (const key of ['members', 'today', 'requests']) await expect(stat(page, key)).toHaveText('0');
    await expect(page.locator('.main-bell-dot')).toHaveCount(0);
    // No members: no payments card, and nothing needs attention.
    await expect(page.locator('.main-earnings-card')).toHaveCount(0);
    await expect(page.locator('.main-attention-row')).toHaveCount(0);

    const setup = page.locator('.main-setup');
    await expect(setup).toContainText(lang === 'ar' ? 'جهّز حسابك' : 'Get set up');
    await expect(setup).toContainText(lang === 'ar' ? 'تم 0 من 3' : '0 of 3 done');
    await expect(setup.locator('.main-setup-step:not(.is-done)')).toHaveCount(3);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('each setup step opens the screen that completes it', async ({ browser }) => {
  for (const [i, screen] of [[0, 'editProfile'], [1, 'availability'], [2, 'addClient']]) {
    const { page, ctx, errs } = await open(browser, { tables: { ...empty, ...profile() } });
    await page.locator('.main-setup-step').nth(i).click();
    expect(await currentScreen(page)).toBe(screen);
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('setup steps tick themselves from real rows, and the card goes when all are done', async ({ browser }) => {
  // Hours set and a member added, but no photo: 2 of 3.
  const partial = { ...busy(), ...profile({ photo: false, bio: 'Life coach in Cairo.' }) };
  let { page, ctx } = await open(browser, { tables: partial });
  await expect(page.locator('.main-setup')).toContainText('2 of 3 done');
  await expect(page.locator('.main-setup-step:not(.is-done)')).toHaveText(['Add your photo and bio']);
  await ctx.close();

  ({ page, ctx } = await open(browser, { tables: busy() }));
  await expect(page.locator('.main-stats')).toBeVisible();
  await expect(page.locator('.main-setup')).toHaveCount(0);
  await ctx.close();
});

test('a working coach: real counts, today\'s real session, and who needs them', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { tables: busy() });
  await expect(stat(page, 'members')).toHaveText('2');
  await expect(stat(page, 'today')).toHaveText('1');
  await expect(stat(page, 'requests')).toHaveText('1');
  await expect(page.locator('.main-bell-dot')).toHaveCount(1);

  // Today: Rana at 3 PM; Omar's session is tomorrow.
  await expect(page.locator('.main-session-name')).toHaveText(['Rana Adel']);
  await expect(page.locator('.main-session-time-num')).toHaveText('3:00');
  // The session room is the demo's: signed in, no Join.
  await expect(page.locator('.main-join-chip')).toHaveCount(0);

  await expect(page.locator('.main-earnings-amount')).toHaveText('1 of 2 members paid up');

  // Omar: payment overdue. Marking him paid writes his row.
  const omar = page.locator('.main-attention-row', { hasText: 'Omar Said' });
  await expect(omar.locator('.main-attention-note')).toHaveText('Payment overdue');
  await omar.locator('.main-action-btn', { hasText: 'Mark paid' }).click();
  await expect.poll(async () => (await dbRows(page, 'clients')).find((c) => c.id === 'c-omar').payment_status).toBe('paid');
  await expect(page.locator('.main-earnings-amount')).toHaveText('2 of 2 members paid up');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a walk-in member with no account has no message button', async ({ browser }) => {
  const t = busy();
  t.clients = t.clients.map((c) => (c.id === 'c-omar' ? { ...c, member_id: null } : c));
  const { page, ctx, errs } = await open(browser, { tables: t });
  const omar = page.locator('.main-attention-row', { hasText: 'Omar Said' });
  await expect(omar).toHaveCount(1);
  await expect(omar.locator('.main-remind-btn')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a reminder drafts its message in the coach\'s language (demo, Arabic)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify('ar'));
  });
  await page.reload();
  await go(page, 'main');
  await page.locator('.main-attention-row', { hasText: 'Khaled Ibrahim' }).locator('.main-remind-btn').click();
  await page.waitForTimeout(300);
  const draft = await page.evaluate(async () => (await import('/src/lib/mockStore.ts')).getMessageDraft('khaled'));
  expect(draft).toMatch(/^مرحبًا Khaled،/);
  await ctx.close();
});
