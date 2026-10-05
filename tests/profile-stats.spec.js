import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * The coach's Profile figures, signed in: reviews and rating, active
 * members, completion, the Messages badge, and what the delete-account sheet
 * says is still open. All of them used to come from the demo store, so a
 * real coach saw the demo roster's numbers — and the delete sheet could
 * refuse them over the demo's sessions. src/lib/coachStatsData.ts reads the
 * coach's own rows; the roster and inbox are the shared reads.
 *
 * The verification and filing-a-deletion flows are
 * tests/profile-delete-verify.spec.js.
 */

const UID = 'coach-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const coach = {
  profiles: [{
    id: UID, full_name: 'Rana Coach', phone: '10 555 0000', country_code: '+20', email: 'rana@x.com', country: 'Egypt',
    country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null, account_status: 'active', role: 'coach',
  }],
  coach_profiles: [{
    profile_id: UID, title: 'Nutrition', cert: 'ICF', bio: 'Real bio', languages: ['Arabic'], session_mode: 'online',
    experience_years: 4, certifications: ['ICF'], cover_photo_url: null, verification_status: 'unverified',
    signup_completed_at: '2026-09-01T00:00:00Z',
  }],
};

const client = (id, name, extra = {}) => ({
  id, coach_id: UID, member_id: `m-${id}`, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: 'Nutrition · Basic', specialty: 'Nutrition', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''),
  avatar_bg: '#3E6FB0', active: true, progress: 40, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'paid', goal: '', focus: '', signup_completed_at: null, invite_code: null, invite_expires_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});
const rating = (id, client_id, value, coach_id = UID) => ({ id, client_id, coach_id, session_id: null, rating: value, comment: '', created_at: '2026-09-20T10:00:00Z' });
const session = (id, client_id, scheduled_at, attendance = null) => ({ id, client_id, scheduled_at, ended_at: null, attendance, followed_up: false, recap: null });
const payout = (id, status, coach_id = UID) => ({ id, coach_id, amount: 500, currency: 'EGP', issuer: 'vodafone', status, created_at: '2026-09-20T10:00:00Z' });
const message = (id, client_id, sender_role, created_at) => ({ id, client_id, sender_role, body: 'Hi', created_at });

/** Nothing open: the delete sheet should offer the request. */
function calm() {
  return {
    ...coach,
    client_private: [], tasks: [], packages: [], payments: [],
    clients: [
      client('c-rana', 'Hana Adel', { progress: 40 }),
      client('c-omar', 'Omar Said', { progress: 60 }),
      client('c-old', 'Old Member', { active: false, progress: 100 }),
      client('c-other', 'Other Coach Member', { coach_id: 'coach-2' }),
    ],
    ratings: [
      rating('r1', 'c-rana', 5), rating('r2', 'c-omar', 4), rating('r3', 'c-old', 4),
      // Another coach's: not this coach's rating.
      rating('r4', 'c-other', 1, 'coach-2'),
    ],
    sessions: [
      session('s-past', 'c-rana', '2026-09-20T10:00:00Z'), // past, never marked: not "upcoming"
      session('s-cancelled', 'c-omar', '2026-10-02T10:00:00Z', 'cancelled'),
      session('s-held', 'c-old', '2026-09-10T10:00:00Z', 'attended'),
      session('s-other', 'c-other', '2026-10-02T10:00:00Z'), // another coach's
    ],
    payouts: [payout('p-done', 'success'), payout('p-failed', 'failed'), payout('p-other', 'requested', 'coach-2')],
    messages: [
      message('m1', 'c-rana', 'client', '2026-09-27T10:00:00Z'),
      message('m2', 'c-rana', 'client', '2026-09-27T11:00:00Z'),
      message('m3', 'c-omar', 'client', '2026-09-20T10:00:00Z'), // read already
      message('m4', 'c-omar', 'coach', '2026-09-27T12:00:00Z'), // the coach's own
    ],
    message_reads: [{ client_id: 'c-omar', reader_role: 'coach', last_read_at: '2026-09-21T00:00:00Z' }],
  };
}

/** One of each thing 0012 refuses a coach's deletion over. */
function busy() {
  const t = calm();
  t.sessions = [
    ...t.sessions,
    session('s-next-1', 'c-rana', '2026-10-01T10:00:00Z'),
    session('s-next-2', 'c-rana', '2026-10-08T10:00:00Z'), // same member: still one member
    session('s-next-3', 'c-old', '2026-10-03T10:00:00Z'), // archived, still a session to come
    session('s-dispute', 'c-omar', '2026-09-15T10:00:00Z', 'disputed'),
  ];
  t.payouts = [...t.payouts, payout('p-open', 'processing')];
  return t;
}

async function open(browser, { lang = 'en', dark = false, tables = calm(), fail = [] } = {}) {
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
  await page.evaluate(([l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [lang, dark]);
  await page.reload();
  await installFakeSupabase(page, { userId: UID, tables, fail });
  await signIn(page, UID);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('profile'));
  await page.evaluate(() => window.__screenSettled());
  return { page, ctx, errs };
}

const statNums = (page) => page.locator('.profile-stat-num');
const messagesBadge = (page, lang = 'en') =>
  page.locator('.profile-row', { hasText: lang === 'ar' ? 'الرسائل' : 'Messages' }).locator('.profile-row-badge');
const DEMO = /Sara|Khaled|Yasmin|سارة|ياسمين/;

for (const lang of ['en', 'ar']) {
  for (const dark of [false, true]) {
    test(`the figures are the coach's own (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
      const { page, ctx, errs } = await open(browser, { lang, dark });
      // 3 reviews, 2 active members, (40 + 60) / 2 completion.
      await expect(statNums(page)).toHaveText(['3', '2', '50%']);
      // 5, 4, 4 is 4.3, and three is enough to show it.
      await expect(page.locator('.profile-rating-badge')).toHaveText('4.3');
      // Hana's two since the coach last read; Omar's was read, and his last is the coach's own.
      await expect(messagesBadge(page, lang)).toHaveText('2');
      await expect(page.locator('.profile-stats-failed')).toHaveCount(0);
      await expect(page.locator('.phone-frame')).not.toContainText(DEMO);
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('fewer than three reviews: the count, and no rating yet', async ({ browser }) => {
  const t = calm();
  t.ratings = t.ratings.slice(1);
  const { page, ctx } = await open(browser, { tables: t });
  await expect(statNums(page).first()).toHaveText('2');
  await expect(page.locator('.profile-rating-badge')).toHaveCount(0);
  await expect(page.locator('.profile-badge-soft')).toHaveText('Not enough reviews yet');
  await ctx.close();
});

test('a new coach: zeros, no badge — not the demo\'s', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, {
    tables: { ...coach, clients: [], client_private: [], tasks: [], ratings: [], sessions: [], payouts: [], messages: [], message_reads: [] },
  });
  await expect(statNums(page)).toHaveText(['0', '0', '0%']);
  await expect(messagesBadge(page)).toHaveCount(0);
  await expect(page.locator('.phone-frame')).not.toContainText(DEMO);
  expect(errs).toEqual([]);
  await ctx.close();
});

for (const lang of ['en', 'ar']) {
  test(`delete: what is open is read from the coach's rows (${lang})`, async ({ browser }) => {
    const { page, ctx } = await open(browser, { lang, tables: busy() });
    await page.locator('.profile-screen button', { hasText: lang === 'ar' ? 'حذف الحساب' : 'Delete Account' }).click();
    const sheet = page.locator('.profile-modal-card');
    await expect(sheet.locator('.profile-modal-title')).toHaveText(lang === 'ar' ? 'لا يمكن الحذف بعد' : "Can't delete yet");
    // Two members with a session to come (Hana's two count once), one
    // dispute, one payout in flight. Credits don't block a coach.
    await expect(sheet.locator('.profile-modal-body')).toHaveText(
      lang === 'ar'
        ? 'لا يزال لديك 2 عضو لديه جلسة قادمة، 1 نزاع مفتوح، 1 تحويل لم تتم تسويته بعد.'
        : 'You still have 2 member(s) with an upcoming session, 1 open dispute(s), 1 payout(s) not settled yet.',
    );
    await expect(sheet.locator('.profile-modal-btn-danger')).toHaveCount(0);
    await ctx.close();
  });
}

test('delete: nothing open in the coach\'s rows — the demo\'s sessions don\'t block them', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  // The demo store still has its seeded members, sessions and credits.
  const demoBlocked = await page.evaluate(async () => (await import('/src/lib/mockStore.ts')).getProActiveObligations().blocked);
  expect(demoBlocked).toBe(true);
  await page.locator('.profile-screen button', { hasText: 'Delete Account' }).click();
  await expect(page.locator('.profile-modal-title')).toHaveText('Delete your account?');
  await expect(page.locator('.profile-modal-btn-danger')).toHaveCount(1);
  await ctx.close();
});

test('the reads name the coach, and nothing is written', async ({ browser }) => {
  const { page, ctx } = await open(browser, { tables: busy() });
  await expect(statNums(page).first()).toHaveText('3');
  const calls = await dbCalls(page);
  for (const r of calls.filter((c) => ['ratings', 'payouts'].includes(c.table))) expect(r.filters).toContainEqual(['coach_id', UID]);
  for (const r of calls.filter((c) => c.table === 'sessions')) {
    const ids = r.filters.find(([col, , op]) => col === 'client_id' && op === 'in')?.[1];
    expect(ids).toBeTruthy();
    expect(ids).not.toContain('c-other');
  }
  expect(calls.filter((c) => ['insert', 'update', 'delete'].includes(c.op))).toEqual([]);
  await ctx.close();
});

for (const lang of ['en', 'ar']) {
  test(`a failed read says so with a retry, and shows no number it doesn't have (${lang})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang, fail: ['ratings'] });
    const failed = page.locator('.profile-stats-failed');
    await expect(failed).toContainText(lang === 'ar' ? 'لم يتم تحميل أرقامك.' : "Your numbers didn't load.");
    // Reviews unknown; members and completion come from the roster, which loaded.
    await expect(statNums(page)).toHaveText(['–', '2', '50%']);
    await expect(page.locator('.profile-rating-badge, .profile-badge-soft')).toHaveCount(0);
    await expect(page.locator('.phone-frame')).not.toContainText(DEMO);
    // The rest of Profile still works.
    await expect(page.locator('.profile-lang-toggle')).toBeVisible();

    await setFailing(page, []);
    await failed.getByRole('button', { name: lang === 'ar' ? 'حاول مرة أخرى' : 'Try again' }).click();
    await expect(statNums(page)).toHaveText(['3', '2', '50%']);
    await expect(failed).toHaveCount(0);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}
