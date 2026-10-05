import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';

/**
 * Unread messages on the tab bar, and the in-app sound (store/unread.ts).
 * Reported 5 Oct: a coach's inbox showed "1" on a member's row, but the
 * Messages tab showed nothing and nothing made a sound, so on any other
 * screen a new message went unnoticed.
 *
 * Realtime is a stub that delivers to every subscribed handler, and the
 * chime is counted instead of played.
 */

const COACH = 'coach-1';
const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const client = (id, name, extra = {}) => ({
  id, coach_id: COACH, member_id: null, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: 'Life coaching · Basic', specialty: 'Life coaching', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''),
  avatar_bg: '#3E6FB0', active: true, progress: 40, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: 'Sleep better', focus: '', signup_completed_at: null,
  created_at: '2026-09-01T00:00:00Z', blocked_by_member_at: null, blocked_by_coach_at: null, ...extra,
});
const msg = (id, clientId, role, body, at) => ({ id, client_id: clientId, sender_role: role, sender_id: role === 'coach' ? COACH : MEMBER, body, created_at: at });

const coachTables = () => ({
  profiles: [{ id: COACH, full_name: 'Yara Nabil', phone: '', country_code: '+20', email: 'y@x.com', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null, account_status: 'active', role: 'coach' }],
  coach_profiles: [{ profile_id: COACH, title: 'Life coaching', cert: '', bio: 'Coach.', languages: ['Arabic'], session_mode: 'online', experience_years: 3, certifications: [], cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z' }],
  clients: [client('c-rana', 'Rana Adel', { member_id: MEMBER }), client('c-omar', 'Omar Said')],
  client_private: [], tasks: [], packages: [], payments: [], subscriptions: [], offerings: [], session_requests: [], time_blocks: [], sessions: [], weekly_availability: [],
  messages: [
    msg('m1', 'c-rana', 'coach', 'How did the week go?', '2026-09-27T08:00:00Z'),
    msg('m2', 'c-rana', 'client', 'Better, slept 7 hours', '2026-09-27T09:00:00Z'),
    msg('m3', 'c-rana', 'client', 'Thanks for the plan', '2026-09-27T10:00:00Z'),
  ],
  // Read after m2, so m3 is the one unread.
  message_reads: [{ client_id: 'c-rana', reader_role: 'coach', last_read_at: '2026-09-27T09:30:00Z' }],
});

const memberTables = () => ({
  profiles: [{ id: MEMBER, full_name: 'Rana Adel', phone: '', country_code: '+20', email: 'rana@x.com', account_status: 'active' }],
  clients: [client('c-rana', 'Rana Adel', { member_id: MEMBER })],
  coach_directory: [{ coach_id: COACH, full_name: 'Yara Nabil', title: 'Life coaching', verified: true, rating_count: 0, rating_avg: null, bio: '', certifications: [], avatar_photo_url: null, cover_photo_url: null }],
  tasks: [], mood_checkins: [], packages: [], sessions: [], time_blocks: [], session_requests: [], ratings: [],
  // The coach's m1 is after the member's own cursor: one unread.
  messages: coachTables().messages,
  message_reads: [{ client_id: 'c-rana', reader_role: 'client', last_read_at: '2026-09-27T07:00:00Z' }],
});

async function open(browser, { role = 'coach', lang = 'en', screen, params, prefs } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([r, l, p]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    if (p) localStorage.setItem(r === 'coach' ? 'rafiq_pro_notif_prefs' : 'rafiq_notif_prefs', JSON.stringify(p));
  }, [role === 'coach' ? 'coach' : 'client', lang, prefs ?? null]);
  await page.reload();
  const uid = role === 'coach' ? COACH : MEMBER;
  await installFakeSupabase(page, { userId: uid, tables: role === 'coach' ? coachTables() : memberTables() });
  // Realtime: every subscribed handler for `messages` hears every insert;
  // a handler with a client filter only its own thread's.
  await page.evaluate(async () => {
    const real = (await import('/src/lib/supabase.ts')).getSupabase();
    window.__fake.channels = [];
    real.channel = (name) => ({
      name, handlers: [],
      on(type, filter, cb) { this.handlers.push({ filter, cb }); return this; },
      subscribe() { window.__fake.channels.push(this); return this; },
    });
    real.removeChannel = async (ch) => { window.__fake.channels = window.__fake.channels.filter((c) => c !== ch); return 'ok'; };
    window.__chimes = 0;
    (await import('/src/store/unread.ts')).setChimePlayer(() => { window.__chimes += 1; });
  });
  await signIn(page, uid);
  await go(page, screen ?? (role === 'coach' ? 'main' : 'clientHome'), params);
  return { page, ctx, errs };
}

async function go(page, screen, params) {
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params]);
  await page.waitForTimeout(350);
}

const deliver = (page, row) => page.evaluate((r) => {
  (window.__fake.db.messages ??= []).push(r);
  for (const ch of window.__fake.channels) {
    for (const h of ch.handlers) {
      if (h.filter.table !== 'messages') continue;
      if (h.filter.filter && h.filter.filter !== `client_id=eq.${r.client_id}`) continue;
      h.cb({ new: r });
    }
  }
}, row);

const chimes = (page) => page.evaluate(() => window.__chimes);
const tab = (page, name) => page.locator('.bottom-nav-item', { hasText: name });

for (const [lang, name, label] of [['en', 'Messages', 'Messages, 1 unread'], ['ar', 'الرسائل', 'الرسائل، 1 غير مقروءة']]) {
  test(`coach: the Messages tab shows what's unread (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang });
    await expect(tab(page, name).locator('.bottom-nav-badge')).toHaveText('1');
    await expect(tab(page, name)).toHaveAttribute('aria-label', label);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('coach on Home: a member\'s new message raises the badge and chimes once', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await deliver(page, msg('m4', 'c-rana', 'client', 'One more question', '2026-09-28T08:59:00Z'));
  await expect(tab(page, 'Messages').locator('.bottom-nav-badge')).toHaveText('2');
  expect(await chimes(page)).toBe(1);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('no chime for the coach\'s own message, inside the open thread, or with notifications off', async ({ browser }) => {
  let { page, ctx } = await open(browser);
  await deliver(page, msg('m4', 'c-rana', 'coach', 'Sent from another device', '2026-09-28T08:59:00Z'));
  await page.waitForTimeout(200);
  expect(await chimes(page), 'own message').toBe(0);
  await ctx.close();

  ({ page, ctx } = await open(browser, { screen: 'messages', params: { clientId: 'c-rana' } }));
  await deliver(page, msg('m5', 'c-rana', 'client', 'Are you there?', '2026-09-28T08:59:00Z'));
  await page.waitForTimeout(200);
  expect(await chimes(page), 'thread open').toBe(0);
  await ctx.close();

  ({ page, ctx } = await open(browser, { prefs: { enabled: false, sessions: true, payments: true } }));
  await deliver(page, msg('m6', 'c-rana', 'client', 'Hello?', '2026-09-28T08:59:00Z'));
  await expect(tab(page, 'Messages').locator('.bottom-nav-badge'), 'the badge still counts').toHaveText('2');
  expect(await chimes(page), 'notifications off').toBe(0);
  await ctx.close();
});

test('reading the thread clears the badge when the coach leaves it', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await expect(tab(page, 'Messages').locator('.bottom-nav-badge')).toHaveText('1');
  await go(page, 'messages', { clientId: 'c-rana' });
  await go(page, 'messagesInbox');
  await expect(tab(page, 'Messages').locator('.bottom-nav-badge')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('member: the badge is on Your Pro, where their thread is, and the coach\'s message chimes', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { role: 'client' });
  await expect(tab(page, 'Your Pro').locator('.bottom-nav-badge')).toHaveText('1');
  await deliver(page, msg('m7', 'c-rana', 'coach', 'See you Thursday', '2026-09-28T08:59:00Z'));
  await expect(tab(page, 'Your Pro').locator('.bottom-nav-badge')).toHaveText('2');
  expect(await chimes(page)).toBe(1);
  expect(errs).toEqual([]);
  await ctx.close();
});
