import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls } from './fakeSupabase.js';

/**
 * Phone notifications, the app's half (src/lib/push.ts): registering this
 * phone for whoever is signed in, never asking at launch, asking only after
 * PushAsk explains why, the Profile switches deciding which banners come,
 * and sign-out taking the phone off the account. The server half is
 * supabase/functions/push-send and supabase/tests/28_push_devices.sql.
 *
 * A browser has no push plugin, so a "phone" here is push.ts's `pushPlugin`
 * swapped for a stand-in before sign-in — the module the app loads is the
 * same instance (same URL through Vite), the way native-system-bars.spec.js
 * stands in for the status bar.
 */

const COACH = 'coach-1';
const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z'); // Mon 12:00 in Cairo

const coachTables = () => ({
  profiles: [{ id: COACH, full_name: 'Dina Farouk', role: 'coach', account_status: 'active', phone: '', country_code: '+20', email: 'd@x.com', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null }],
  coach_profiles: [{ profile_id: COACH, title: 'Career coaching', cert: '', bio: '', languages: [], session_mode: 'online', experience_years: 2, certifications: [], cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z' }],
  session_requests: [], clients: [], client_private: [], tasks: [], time_blocks: [], sessions: [], weekly_availability: [],
  offerings: [], ratings: [], payouts: [], messages: [], message_reads: [], device_tokens: [],
});

const memberTables = () => ({
  profiles: [{ id: MEMBER, full_name: 'Hana Mostafa', phone: '', country_code: '+20', email: 'h@x.com', account_status: 'active', role: 'client' }],
  member_profiles: [{ profile_id: MEMBER, goal: '', focus: 'career', signup_completed_at: '2026-09-01T00:00:00Z' }],
  coach_directory: [{
    coach_id: 'coach-dina', full_name: 'Dina Farouk', title: 'Career coaching', country: 'Egypt', country_flag: '🇪🇬', languages: ['Arabic'],
    experience_years: 6, verified: true, featured: false, from_price: 600, rating_count: 0, rating_avg: null, bio: '', avatar_photo_url: null,
    session_mode: 'online', certifications: [], cover_photo_url: null,
  }],
  weekly_availability: [{ coach_id: 'coach-dina', day_of_week: 0, enabled: true, start_hour: 9, end_hour: 17 }],
  offerings: [{ id: 'off-dina', coach_id: 'coach-dina', name: 'Career deep-dive', description: '', type: 'session', duration: '60 min', format: 'online', price: 600, currency: 'EGP', active: true, created_at: '2026-09-01T00:00:00Z' }],
  session_requests: [], clients: [], time_blocks: [], coach_reviews: [], favourite_coaches: [], notifications: [], device_tokens: [],
});

/**
 * `phone`: null for a plain browser; otherwise the permission the phone
 * reports ('granted' | 'prompt' | 'denied') and what it answers when asked.
 */
async function open(browser, { role = 'coach', lang = 'en', dark = false, phone = { permission: 'granted', answer: 'granted' } } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await installScreenSettle(page);
  await page.goto('/');
  await page.evaluate(([r, l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [role, lang, dark]);
  await page.reload();
  const uid = role === 'coach' ? COACH : MEMBER;
  await installFakeSupabase(page, { userId: uid, tables: role === 'coach' ? coachTables() : memberTables() });
  if (phone) {
    await page.evaluate(async (p) => {
      const m = await import('/src/lib/push.ts');
      window.__push = { permission: p.permission, answer: p.answer, asked: 0, registered: 0, token: p.token ?? 'tok-1' };
      Object.assign(m.pushPlugin, {
        available: () => true,
        platform: () => 'android',
        checkPermission: async () => window.__push.permission,
        requestPermission: async () => {
          window.__push.asked++;
          window.__push.permission = window.__push.answer;
          return window.__push.permission;
        },
        register: async () => {
          window.__push.registered++;
          // A slow first answer from Apple or Google, when a test asks for one.
          const wait = (window.__push.delays ?? []).shift() ?? 0;
          if (wait) await new Promise((r) => setTimeout(r, wait));
          return window.__push.token;
        },
        onTap: (h) => {
          window.__push.tap = h;
          return () => {};
        },
      });
    }, phone);
  }
  await signIn(page, uid);
  return { page, ctx, errs };
}

async function go(page, target) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), target);
  await page.evaluate(() => window.__screenSettled());
}
const push = (page) => page.evaluate(() => window.__push);
const rpcs = async (page, fn) => (await dbCalls(page)).filter((c) => c.op === 'rpc' && c.fn === fn).map((c) => c.args);
const lastRegistration = async (page) => (await rpcs(page, 'register_device')).at(-1);

// --- Registering -----------------------------------------------------------------------------

test('signed in with permission given, this phone is registered: language, zone, nothing muted — and nothing is asked', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect.poll(() => lastRegistration(page)).toEqual({ p_token: 'tok-1', p_platform: 'android', p_lang: 'en', p_time_zone: 'Africa/Cairo', p_muted: [] });
  expect((await push(page)).asked).toBe(0);
  expect((await dbRows(page, 'device_tokens')).map((d) => d.user_id)).toEqual([COACH]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('never asked at launch: a phone that hasn\'t answered yet registers nothing', async ({ browser }) => {
  const { page, ctx } = await open(browser, { phone: { permission: 'prompt', answer: 'granted' } });
  await go(page, 'main');
  await page.waitForTimeout(300);
  expect((await push(page)).asked).toBe(0);
  expect(await rpcs(page, 'register_device')).toEqual([]);
  await ctx.close();
});

test('the banners follow the app\'s language', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await expect.poll(() => lastRegistration(page)).toMatchObject({ p_lang: 'en' });
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().setLang('ar'));
  await expect.poll(() => lastRegistration(page)).toMatchObject({ p_lang: 'ar' });
  expect((await dbRows(page, 'device_tokens'))[0].lang).toBe('ar');
  await ctx.close();
});

// --- The switches ------------------------------------------------------------------------------

test('coach: Profile\'s switches decide which banners come; the master switch takes the phone off', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await go(page, 'profile');
  const card = page.locator('.profile-notif-card');
  await expect(card.locator('.profile-notif-scope')).toHaveText('These control your Notifications feed and the notifications on this phone.');
  await expect(card.locator('.push-phone-row')).toContainText('Notifications on this phone');
  await expect(card.locator('.push-phone-state')).toHaveText('On');
  const row = (label) => card.locator('.profile-notif-sub-row', { hasText: label }).locator('button');
  await expect(card.locator('.profile-notif-sub-label')).toHaveText(['New session requests', 'Payments received', 'New messages', 'Tasks completed']);

  await row('New messages').click();
  await expect.poll(() => lastRegistration(page)).toMatchObject({ p_muted: ['messages'] });
  await row('New session requests').click();
  await row('Tasks completed').click();
  await expect.poll(() => lastRegistration(page)).toMatchObject({ p_muted: ['sessions', 'messages', 'tasks'] });
  // Payments are never pushed: that switch is the in-app feed's alone.
  await row('Payments received').click();
  await expect.poll(() => lastRegistration(page)).toMatchObject({ p_muted: ['sessions', 'messages', 'tasks'] });

  await card.locator('.profile-notif-main button').click();
  await expect.poll(() => rpcs(page, 'unregister_device')).toEqual([{ p_token: 'tok-1' }]);
  expect(await dbRows(page, 'device_tokens')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('two switches flipped quickly reach the server in order, even if the first answer is slow', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await go(page, 'profile');
  await expect.poll(() => lastRegistration(page)).toBeTruthy();
  const card = page.locator('.profile-notif-card');
  const row = (label) => card.locator('.profile-notif-sub-row', { hasText: label }).locator('button');
  await page.evaluate(() => { window.__push.delays = [400, 0]; });
  await row('New messages').click();
  await row('Tasks completed').click();
  await expect.poll(async () => (await rpcs(page, 'register_device')).length).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(600);
  expect((await dbRows(page, 'device_tokens'))[0].muted).toEqual(['messages', 'tasks']);
  expect((await lastRegistration(page)).p_muted).toEqual(['messages', 'tasks']);
  await ctx.close();
});

test('member: session, task and message switches map to the same three', async ({ browser }) => {
  const { page, ctx } = await open(browser, { role: 'client' });
  await go(page, 'clientProfile');
  const card = page.locator('.client-profile-notif-card');
  await expect(card.locator('.push-phone-state')).toHaveText('On');
  const subs = card.locator('.client-profile-notif-sub-row button');
  await subs.nth(0).click();
  await subs.nth(1).click();
  await expect.poll(() => lastRegistration(page)).toMatchObject({ p_muted: ['sessions', 'tasks'] });
  await subs.nth(2).click();
  await expect.poll(() => lastRegistration(page)).toMatchObject({ p_muted: ['sessions', 'messages', 'tasks'] });
  await ctx.close();
});

// --- Asking -------------------------------------------------------------------------------------

test('member: after their first request the app explains, and only "Turn on" shows the phone\'s prompt', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { role: 'client', phone: { permission: 'prompt', answer: 'granted' } });
  await go(page, { screen: 'coachPreview', params: { coachId: 'coach-dina' } });
  await page.locator('.coach-preview-time', { hasText: '3:00 PM' }).click();
  await page.locator('.coach-preview-primary').click();
  await expect(page.locator('.coach-preview-confirmed')).toBeVisible();
  const sheet = page.locator('.sheet-panel');
  await expect(sheet).toContainText('Get notifications on your phone?');
  await expect(sheet).toContainText("We'll let you know when your coach answers");
  expect((await push(page)).asked).toBe(0);

  await sheet.getByRole('button', { name: 'Turn on' }).click();
  await expect(sheet).toHaveCount(0);
  expect((await push(page)).asked).toBe(1);
  await expect.poll(() => lastRegistration(page)).toMatchObject({ p_token: 'tok-1', p_muted: [] });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('coach: Notifications offers it once; "Not now" is remembered, and Profile is the way back', async ({ browser }) => {
  const { page, ctx } = await open(browser, { phone: { permission: 'prompt', answer: 'denied' } });
  await go(page, 'notifications');
  const sheet = page.locator('.sheet-panel');
  await expect(sheet).toContainText('We\'ll tell you the moment a member asks for a session');
  await sheet.getByRole('button', { name: 'Not now' }).click();
  await expect(sheet).toHaveCount(0);
  expect((await push(page)).asked).toBe(0);

  await go(page, 'main');
  await go(page, 'notifications');
  await page.waitForTimeout(300);
  await expect(page.locator('.sheet-panel')).toHaveCount(0);

  await go(page, 'profile');
  const phoneRow = page.locator('.profile-notif-card .push-phone-row');
  await phoneRow.getByRole('button', { name: 'Turn on' }).click();
  // The phone said no: the row says where to change that, and nothing is registered.
  await expect(phoneRow.locator('.push-phone-state')).toHaveText("Off in your phone's settings");
  expect((await push(page)).asked).toBe(1);
  expect(await rpcs(page, 'register_device')).toEqual([]);
  await ctx.close();
});

test('Arabic and dark: the sheet and the row read in Arabic', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', dark: true, phone: { permission: 'prompt', answer: 'granted' } });
  await go(page, 'notifications');
  const sheet = page.locator('.sheet-panel');
  await expect(sheet).toContainText('هل تريد تلقي الإشعارات على هاتفك؟');
  await expect(sheet.getByRole('button', { name: 'تفعيل' })).toBeVisible();
  await sheet.getByRole('button', { name: 'ليس الآن' }).click();
  await go(page, 'profile');
  await expect(page.locator('.profile-notif-card .push-phone-row')).toContainText('الإشعارات على هذا الهاتف');
  await expect(page.locator('.profile-notif-card .profile-notif-scope')).toHaveText('تتحكم هذه الخيارات في قائمة الإشعارات وفي الإشعارات على هذا الهاتف.');
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Signing out, tapping a banner, and a browser ----------------------------------------------

test('signing out takes the phone off the account before the session ends', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await expect.poll(() => lastRegistration(page)).toBeTruthy();
  await page.evaluate(async () => (await import('/src/lib/auth.ts')).signOut());
  const calls = (await dbCalls(page)).map((c) => (c.op === 'rpc' ? c.fn : c.op));
  const unregister = calls.lastIndexOf('unregister_device');
  expect(unregister).toBeGreaterThan(-1);
  expect(calls.indexOf('auth.signOut')).toBeGreaterThan(unregister);
  expect(await dbRows(page, 'device_tokens')).toEqual([]);
  await ctx.close();
});

test('a tapped banner opens what it is about', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  const targets = await page.evaluate(async () => {
    const { pushTarget } = await import('/src/lib/push.ts');
    return {
      coachMessage: pushTarget({ kind: 'message', client_id: 'c1' }, 'coach'),
      coachTask: pushTarget({ kind: 'task-completed', client_id: 'c1' }, 'coach'),
      coachRequest: pushTarget({ kind: 'request-received' }, 'coach'),
      memberMessage: pushTarget({ kind: 'message', client_id: 'c1' }, 'client'),
      memberAnswer: pushTarget({ kind: 'request-accepted' }, 'client'),
    };
  });
  expect(targets).toEqual({
    coachMessage: { screen: 'messages', params: { clientId: 'c1' } },
    coachTask: { screen: 'clientDetail', params: { clientId: 'c1' } },
    coachRequest: { screen: 'notifications', params: {} },
    memberMessage: { screen: 'coachMessages', params: {} },
    memberAnswer: { screen: 'clientNotifications', params: {} },
  });
  await page.evaluate(async () => {
    (await import('/src/lib/push.ts')).initPushTaps();
    window.__push.tap({ kind: 'request-received', notification_id: 'n1' });
  });
  expect((await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState())).screen).toBe('notifications');
  await ctx.close();
});

test('in a browser: no phone row, no phone-only switches, the in-app wording, and nothing registered', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { phone: null });
  await go(page, 'profile');
  const card = page.locator('.profile-notif-card');
  await expect(card.locator('.profile-notif-scope')).toHaveText('These control your in-app Notifications feed.');
  await expect(card.locator('.push-phone-row')).toHaveCount(0);
  await expect(card.locator('.profile-notif-sub-label')).toHaveText(['New session requests', 'Payments received']);
  await go(page, 'notifications');
  await page.waitForTimeout(300);
  await expect(page.locator('.sheet-panel')).toHaveCount(0);
  expect((await dbCalls(page)).filter((c) => c.op === 'rpc' && /device/.test(c.fn))).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});
