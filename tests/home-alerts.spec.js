import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * Home's package and follow-up alerts, signed in (rosterData.ts's
 * fetchHomeAlerts). Both used to be skipped signed in, because packages and
 * session follow-ups were demo-store records: a coach whose member had run
 * out of sessions was told nothing. Now they come from the coach's own
 * `packages` rows and each member's latest attended session's `followed_up`.
 *
 * The rest of Home signed in is tests/home-real.spec.js.
 */

const UID = 'coach-1';
const NOW = new Date('2026-09-28T09:00:00Z'); // Mon 12:00 in Cairo

const coach = {
  profiles: [{
    id: UID, full_name: 'Ahmed Tahoun', phone: '', country_code: '+20', email: 'a@x.com', country: 'Egypt',
    country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: `${UID}/avatar.png`, account_status: 'active', role: 'coach',
  }],
  coach_profiles: [{
    profile_id: UID, title: 'Life coaching', cert: '', bio: 'Coach.', languages: ['Arabic'], session_mode: 'online',
    experience_years: 3, certifications: [], cover_photo_url: null, verification_status: 'unverified',
    signup_completed_at: '2026-09-01T00:00:00Z',
  }],
};

// Paid, booked next week and checked in: nothing else would flag them, so
// any alert below is the package's or the follow-up's.
const client = (id, name, extra = {}) => ({
  id, coach_id: UID, member_id: `m-${id}`, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: 'Life coaching · Basic', specialty: 'Life coaching', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''),
  avatar_bg: '#3E6FB0', active: true, progress: 40, needs_checkin: false, next_session_at: '2026-10-05T10:00:00Z', next_session_type: 'standard',
  program_completed: false, payment_status: 'paid', goal: '', focus: '', signup_completed_at: null, invite_code: null, invite_expires_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});
const pkg = (client_id, total, used, expires_at) => ({ client_id, total, used, expires_at });
const session = (id, client_id, scheduled_at, attendance, followed_up) => ({
  id, client_id, scheduled_at, ended_at: null, attendance, followed_up, recap: null, created_at: scheduled_at, updated_at: scheduled_at,
});

const LATER = '2026-12-01T00:00:00Z';
// Thu 1 Oct, 00:00 in Cairo: three days from Monday.
const IN_THREE_DAYS = '2026-09-30T21:00:00Z';

function tables() {
  return {
    ...coach,
    client_private: [], tasks: [], payments: [], offerings: [], time_blocks: [], session_requests: [],
    weekly_availability: [{ coach_id: UID, day_of_week: 0, enabled: true, start_hour: 10, end_hour: 18 }],
    clients: [
      client('c-rana', 'Rana Adel'),
      client('c-omar', 'Omar Said'),
      client('c-laila', 'Laila Hassan'),
      client('c-hany', 'Hany Fawzy'),
      client('c-mona', 'Mona Kamal'),
      client('c-tarek', 'Tarek Nabil'),
      client('c-sami', 'Sami Youssef'),
      client('c-other', 'Other Coach Member', { coach_id: 'coach-2' }),
    ],
    packages: [
      pkg('c-rana', 10, 2, '2026-09-20T00:00:00Z'), // expired
      pkg('c-omar', 5, 5, LATER), // used up
      pkg('c-laila', 10, 3, IN_THREE_DAYS), // expiring soon
      pkg('c-hany', 10, 3, LATER), // fine
      pkg('c-other', 1, 1, '2026-01-01T00:00:00Z'), // another coach's
    ],
    sessions: [
      // Mona's latest attended session wasn't followed up.
      session('s-mona-1', 'c-mona', '2026-09-10T10:00:00Z', 'attended', true),
      session('s-mona-2', 'c-mona', '2026-09-24T10:00:00Z', 'attended', false),
      // Tarek's older one wasn't, but his latest was: nothing to do.
      session('s-tarek-1', 'c-tarek', '2026-09-10T10:00:00Z', 'attended', false),
      session('s-tarek-2', 'c-tarek', '2026-09-24T10:00:00Z', 'attended', true),
      // Sami missed his latest: a no-show isn't a session to follow up.
      session('s-sami-1', 'c-sami', '2026-09-10T10:00:00Z', 'attended', true),
      session('s-sami-2', 'c-sami', '2026-09-24T10:00:00Z', 'no_show', false),
    ],
  };
}

async function open(browser, { lang = 'en', dark = false, fail = [], data = tables(), before } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  await installFakeSupabase(page, { userId: UID, tables: data, fail });
  await signIn(page, UID);
  if (before) await before(page);
  await go(page, 'main');
  return { page, ctx, errs };
}

async function go(page, screen) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), screen);
  await page.evaluate(() => window.__screenSettled());
}

const rows = (page) => page.locator('.main-attention-row');
const row = (page, name) => page.locator('.main-attention-row', { hasText: name });

const NOTES = {
  en: { expired: 'Package expired', usedUp: 'No sessions left', soon: 'Package expires in 3d', followUp: 'No follow-up since last session', renew: 'Renew' },
  ar: { expired: 'انتهت صلاحية الباقة', usedUp: 'لا توجد جلسات متبقية', soon: 'تنتهي الباقة خلال 3 يوم', followUp: 'لا متابعة منذ آخر جلسة', renew: 'تجديد' },
};

for (const lang of ['en', 'ar']) {
  for (const dark of [false, true]) {
    test(`packages and follow-ups from the coach's own rows (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
      const { page, ctx, errs } = await open(browser, { lang, dark });
      const n = NOTES[lang];
      await expect(rows(page).locator('.main-attention-name')).toHaveText(['Rana Adel', 'Omar Said', 'Laila Hassan', 'Mona Kamal']);
      await expect(row(page, 'Rana Adel').locator('.main-attention-note')).toHaveText(n.expired);
      await expect(row(page, 'Omar Said').locator('.main-attention-note')).toHaveText(n.usedUp);
      await expect(row(page, 'Laila Hassan').locator('.main-attention-note')).toHaveText(n.soon);
      await expect(row(page, 'Mona Kamal').locator('.main-attention-note')).toHaveText(n.followUp);
      // A package alert offers Renew; the follow-up doesn't.
      for (const name of ['Rana Adel', 'Omar Said', 'Laila Hassan']) {
        await expect(row(page, name).locator('.main-action-btn', { hasText: n.renew })).toHaveCount(1);
      }
      await expect(row(page, 'Mona Kamal').locator('.main-action-btn', { hasText: n.renew })).toHaveCount(0);
      await expect(page.locator('.phone-frame')).not.toContainText(/Other Coach Member|Khaled|Sara Ahmed|Yasmin/);
      expect(errs).toEqual([]);
      await ctx.close();
    });
  }
}

test('Renew opens that member', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await row(page, 'Omar Said').locator('.main-action-btn', { hasText: 'Renew' }).click();
  const state = await page.evaluate(async () => {
    const s = (await import('/src/store/appStore.ts')).useAppStore.getState();
    return { screen: s.screen, clientId: s.params.clientId };
  });
  expect(state).toEqual({ screen: 'clientDetail', clientId: 'c-omar' });
  await ctx.close();
});

test('the reads name the coach\'s own clients, and only Remind writes', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await expect(rows(page)).toHaveCount(4);
  const calls = await dbCalls(page);
  for (const table of ['packages', 'sessions']) {
    const reads = calls.filter((c) => c.table === table);
    expect(reads.length, table).toBeGreaterThan(0);
    for (const r of reads) {
      expect(r.op).toBe('select');
      const ids = r.filters.find(([col, , op]) => col === 'client_id' && op === 'in')?.[1];
      expect(ids, `${table} filtered to named clients`).toBeTruthy();
      expect(ids).not.toContain('c-other');
    }
  }
  await ctx.close();
});

test('Remind on a follow-up records it, and the alert stays gone', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  await row(page, 'Mona Kamal').locator('.main-remind-btn').click();
  await expect.poll(async () => (await dbRows(page, 'sessions')).find((s) => s.id === 's-mona-2').followed_up).toBe(true);
  // Only that session: the rest are as they were.
  const others = (await dbRows(page, 'sessions')).filter((s) => s.id !== 's-mona-2');
  expect(others.map((s) => s.followed_up)).toEqual(tables().sessions.filter((s) => s.id !== 's-mona-2').map((s) => s.followed_up));

  await go(page, 'main');
  await expect(rows(page)).toHaveCount(3);
  await expect(row(page, 'Mona Kamal')).toHaveCount(0);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a follow-up that fails to save comes back', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await page.evaluate(() => { window.__fake.refuse['sessions.update'] = '42501'; });
  await row(page, 'Mona Kamal').locator('.main-remind-btn').click();
  await go(page, 'main');
  await expect(row(page, 'Mona Kamal')).toHaveCount(1);
  expect((await dbRows(page, 'sessions')).find((s) => s.id === 's-mona-2').followed_up).toBe(false);
  await ctx.close();
});

test('while packages are still loading, the list waits rather than show a partial one', async ({ browser }) => {
  const { page, ctx } = await open(browser, {
    before: (p) => p.evaluate(() => {
      window.__fake.held = { packages: new Promise((resolve) => { window.__releasePackages = resolve; }) };
    }),
  });
  // Mona's follow-up and the roster are known; the packages that outrank it are not.
  await expect(page.locator('.main-name')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator('.main-attention-row, .main-caught-up, .main-nudge-all')).toHaveCount(0);
  await page.evaluate(() => window.__releasePackages());
  await expect(rows(page)).toHaveCount(4);
  await ctx.close();
});

for (const lang of ['en', 'ar']) {
  test(`a failed read says so with a retry — not "all caught up", not the demo (${lang})`, async ({ browser }) => {
    const { page, ctx } = await open(browser, { lang, fail: ['packages'] });
    const card = page.locator('.main-section', { has: page.locator('.main-section-title', { hasText: lang === 'ar' ? 'يحتاج انتباهك' : 'Needs Your Attention' }) });
    await expect(card).toContainText(lang === 'ar' ? 'لم يتم تحميل من يحتاجون إليك.' : "Who needs you didn't load.");
    await expect(page.locator('.main-caught-up, .main-attention-row, .main-nudge-all')).toHaveCount(0);
    await expect(page.locator('.phone-frame')).not.toContainText(/Khaled|Sara Ahmed/);

    await setFailing(page, []);
    await card.getByRole('button', { name: lang === 'ar' ? 'حاول مرة أخرى' : 'Try again' }).click();
    await expect(rows(page)).toHaveCount(4);
    await ctx.close();
  });
}
