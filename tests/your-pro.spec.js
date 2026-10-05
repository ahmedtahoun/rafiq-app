import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';

/**
 * The member's "Your Pro" (ClientCoach.tsx), simplified:
 * - a tab root, so no back arrow;
 * - the rating only when there is one, never a "not enough reviews" chip;
 * - the unread count on the Message button, the tab bar's red badge;
 * - in a session's join window, a full-width "Join session" under the hero
 *   that opens the call; otherwise the Sessions card has the next date;
 * - no "Payment due": a member can't pay in the app yet;
 * - the Reviews/Sessions/Months row only with real numbers.
 * Order: hero, Join, Message/Book, Sessions/Tasks, About, Report.
 *
 * The clock is pinned to Mon 28 Sep 2026, 12:00 in Cairo (UTC+3).
 */

const MEMBER = 'member-1';
const COACH = 'coach-a';
const NOW = new Date('2026-09-28T09:00:00Z');
const MIN = 60_000;
const at = (offsetMin) => new Date(NOW.getTime() + offsetMin * MIN).toISOString();

function tables({ rating = { count: 0, avg: null }, signupAt = null, payment = 'overdue', sessions = [], blocks = [], messages = [], reads = [] } = {}) {
  return {
    profiles: [{ id: MEMBER, full_name: 'Hana M.', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active', role: 'client' }],
    member_profiles: [{ profile_id: MEMBER, goal: '', focus: 'career', signup_completed_at: '2026-09-01T00:00:00Z' }],
    clients: [{
      id: 'rel-a', coach_id: COACH, member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
      email: null, city: null, program: '', specialty: 'Career coaching', plan: 'Basic', initials: 'HM', avatar_bg: '#3E6FB0',
      active: true, progress: 0, needs_checkin: false,
      next_session_at: sessions.find((s) => !s.attendance && Date.parse(s.scheduled_at) > NOW.getTime())?.scheduled_at ?? null,
      next_session_type: null, program_completed: false, payment_status: payment, goal: '', focus: '',
      signup_completed_at: signupAt, created_at: '2026-09-01T00:00:00Z',
    }],
    coach_directory: [{
      coach_id: COACH, full_name: 'Dina Farouk', title: 'Career coaching', verified: true, rating_count: rating.count, rating_avg: rating.avg,
      bio: 'Helps people find work they love.', certifications: [], avatar_photo_url: null, cover_photo_url: null,
    }],
    sessions, time_blocks: blocks, messages, message_reads: reads,
    tasks: [], packages: [], mood_checkins: [], session_requests: [], weekly_availability: [], ratings: [], notifications: [],
  };
}

const session = (id, startMin, attendance = null) => ({ id, client_id: 'rel-a', scheduled_at: at(startMin), time_block_id: `tb-${id}`, attendance, recap: null });
const block = (id, startMin, lenMin = 50) => ({ id: `tb-${id}`, coach_id: COACH, client_id: 'rel-a', kind: 'booked', label: 'Session', starts_at: at(startMin), ends_at: at(startMin + lenMin), session_type: 'standard' });

async function open(browser, { lang = 'en', dark = false, data = tables(), signedIn = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await installScreenSettle(page);
  await page.goto('/');
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('client'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [lang, dark]);
  await page.reload();
  if (signedIn) {
    await installFakeSupabase(page, { userId: MEMBER, tables: data });
    await signIn(page, MEMBER);
  }
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientCoach'));
  await page.evaluate(() => window.__screenSettled());
  return { page, ctx, errs };
}

/** WCAG contrast ratio of an element's text against its own background. */
const contrast = (loc) => loc.evaluate((el) => {
  const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const cs = getComputedStyle(el);
  const [a, b] = [lum(rgb(cs.color)), lum(rgb(cs.backgroundColor))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});

/** The scroll's sections, in order, by what they are. */
const order = (page) => page.locator('.client-coach-scroll > *').evaluateAll((els) => els.map((e) => {
  const c = e.className;
  if (c.includes('client-coach-join')) return 'join';
  if (c.includes('client-coach-actions')) return 'actions';
  if (c.includes('client-coach-quick')) return 'quick';
  if (c.includes('client-coach-section')) return 'about';
  if (c.includes('client-coach-stats')) return 'stats';
  if (c.includes('client-coach-report')) return 'report';
  return c;
}));

const COPY = {
  en: { join: 'Join session', message: 'Message', notEnough: 'Not enough reviews yet', due: /Payment (due|overdue)/ },
  ar: { join: 'الانضمام للجلسة', message: 'مراسلة', notEnough: 'لا توجد تقييمات كافية بعد', due: /الدفع (مستحق|متأخر)/ },
};

for (const lang of ['en', 'ar']) {
  for (const dark of [false, true]) {
    test(`a new relationship: no back arrow, no rating chip, no payment, no row of dashes (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
      const { page, ctx, errs } = await open(browser, { lang, dark });
      const frame = page.locator('.phone-frame');
      await expect(page.locator('.client-coach-name')).toHaveText('Dina Farouk');
      await expect(page.locator('.client-coach-hero button')).toHaveCount(0);
      await expect(page.locator('.client-coach-rating')).toHaveCount(0);
      await expect(frame).not.toContainText(COPY[lang].notEnough);
      // Overdue on the coach's side; the member isn't shown it.
      await expect(page.locator('.client-coach-payment')).toHaveCount(0);
      await expect(frame).not.toContainText(COPY[lang].due);
      await expect(page.locator('.client-coach-stats')).toHaveCount(0);
      await expect(frame).not.toContainText('—');
      await expect(page.locator('.client-coach-join')).toHaveCount(0);
      expect(await order(page)).toEqual(['actions', 'quick', 'about', 'report']);
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('the rating, and the stats that are real, show when there are some', async ({ browser }) => {
  // Five reviews; two sessions held; together since July.
  const data = tables({
    rating: { count: 5, avg: 4.6 }, signupAt: '2026-07-01T00:00:00Z',
    sessions: [session('s1', -60 * 24 * 14, 'attended'), session('s2', -60 * 24 * 7, 'attended')],
    blocks: [block('s1', -60 * 24 * 14), block('s2', -60 * 24 * 7)],
  });
  const { page, ctx, errs } = await open(browser, { data });
  await expect(page.locator('.client-coach-rating')).toContainText('4.6');
  await expect(page.locator('.client-coach-rating-count')).toHaveText('(5)');
  await expect(page.locator('.client-coach-stat-value')).toHaveText(['5', '2', '3']);
  expect(await order(page)).toEqual(['actions', 'quick', 'about', 'stats', 'report']);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('only the stats that are real: months alone is a row of one', async ({ browser }) => {
  const { page, ctx } = await open(browser, { data: tables({ signupAt: '2026-08-01T00:00:00Z' }) });
  await expect(page.locator('.client-coach-stat')).toHaveCount(1);
  await expect(page.locator('.client-coach-stat-value')).toHaveText(['2']);
  await ctx.close();
});

for (const lang of ['en', 'ar']) {
  test(`unread messages show on the Message button, as on the tab bar (${lang})`, async ({ browser }) => {
    const data = tables({
      messages: [
        { id: 'm1', client_id: 'rel-a', sender_role: 'coach', sender_id: COACH, body: 'Hi', created_at: at(-120) },
        { id: 'm2', client_id: 'rel-a', sender_role: 'coach', sender_id: COACH, body: 'Ready?', created_at: at(-30) },
        { id: 'm3', client_id: 'rel-a', sender_role: 'client', sender_id: MEMBER, body: 'Yes', created_at: at(-20) },
      ],
      reads: [{ client_id: 'rel-a', reader_role: 'member', last_read_at: at(-180) }],
    });
    const { page, ctx, errs } = await open(browser, { lang, data });
    const button = page.locator('.client-coach-primary');
    const badge = button.locator('.client-coach-message-badge');
    await expect(badge).toHaveText('2');
    await expect(badge).toHaveClass(/bottom-nav-badge/);
    await expect(page.locator('.bottom-nav-badge').filter({ hasNot: page.locator('.client-coach-message-badge') }).last()).toHaveText('2');
    await expect(button).toHaveAttribute('aria-label', new RegExp(COPY[lang].message));
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('nothing unread: no badge on the button', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await expect(page.locator('.client-coach-message-badge')).toHaveCount(0);
  await expect(page.locator('.client-coach-primary')).not.toHaveAttribute('aria-label', /.+/);
  await ctx.close();
});

for (const lang of ['en', 'ar']) {
  for (const dark of [false, true]) {
    test(`in the join window, "Join session" is first and opens the call (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
      const data = tables({ sessions: [session('s-now', 5)], blocks: [block('s-now', 5)] });
      const { page, ctx, errs } = await open(browser, { lang, dark, data });
      const join = page.locator('.client-coach-join');
      await expect(join).toHaveText(COPY[lang].join);
      expect(await order(page)).toEqual(['join', 'actions', 'quick', 'about', 'report']);
      // Full width of the content, directly under the hero.
      const [btn, actions, hero] = await Promise.all(
        [join, page.locator('.client-coach-actions'), page.locator('.client-coach-hero')].map((l) => l.boundingBox()),
      );
      expect(Math.abs(btn.width - actions.width)).toBeLessThan(2);
      // On screen, not just in the DOM: under the hero, above Message / Book.
      expect(btn.y - (hero.y + hero.height)).toBeGreaterThanOrEqual(0);
      expect(btn.y - (hero.y + hero.height)).toBeLessThan(32);
      expect(btn.y + btn.height).toBeLessThanOrEqual(actions.y);
      // Readable in both themes (WCAG AA for its text).
      expect(await contrast(join)).toBeGreaterThanOrEqual(4.5);
      await join.click();
      const state = await page.evaluate(async () => {
        const s = (await import('/src/store/appStore.ts')).useAppStore.getState();
        return { screen: s.screen, sessionId: s.params.sessionId };
      });
      expect(state).toEqual({ screen: 'sessionRoom', sessionId: 's-now' });
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('a session under way still offers Join, until 30 minutes after it ends', async ({ browser }) => {
  // Started 20 minutes ago, 50 long: 30 minutes left, then the late window.
  const data = tables({ sessions: [session('s-live', -20), session('s-later', 60 * 24 * 3)], blocks: [block('s-live', -20), block('s-later', 60 * 24 * 3)] });
  const { page, ctx } = await open(browser, { data });
  await expect(page.locator('.client-coach-join')).toBeVisible();
  await page.locator('.client-coach-join').click();
  expect((await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState())).params.sessionId).toBe('s-live');
  await ctx.close();
});

test('outside the window: no Join, and the Sessions card has the next date', async ({ browser }) => {
  const data = tables({ sessions: [session('s-tomorrow', 60 * 24)], blocks: [block('s-tomorrow', 60 * 24)] });
  const { page, ctx } = await open(browser, { data });
  await expect(page.locator('.client-coach-join')).toHaveCount(0);
  const card = page.locator('.client-coach-quick-card').first();
  await expect(card.locator('.client-coach-quick-value')).toHaveText(/Tomorrow|Tue/);
  await expect(card.locator('.client-coach-quick-value')).not.toHaveText(/Join/);
  await ctx.close();
});

test('the window opens while the screen is open', async ({ browser }) => {
  // Starts in 15 minutes: the call opens 10 minutes before.
  const data = tables({ sessions: [session('s-soon', 15)], blocks: [block('s-soon', 15)] });
  const { page, ctx } = await open(browser, { data });
  await expect(page.locator('.client-coach-join')).toHaveCount(0);
  await page.clock.setFixedTime(new Date(NOW.getTime() + 6 * MIN));
  await page.clock.runFor(31_000);
  await expect(page.locator('.client-coach-join')).toBeVisible();
  await ctx.close();
});

test('signed out, the demo is simplified the same way', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { signedIn: false });
  await expect(page.locator('.client-coach-name')).toBeVisible();
  await expect(page.locator('.client-coach-hero button')).toHaveCount(0);
  await expect(page.locator('.client-coach-payment')).toHaveCount(0);
  await expect(page.locator('.phone-frame')).not.toContainText(COPY.en.notEnough);
  await expect(page.locator('.client-coach-stat-value')).not.toContainText(['—']);
  expect(errs).toEqual([]);
  await ctx.close();
});
