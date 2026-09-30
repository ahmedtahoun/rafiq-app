import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls } from './fakeSupabase.js';

/**
 * Inviting a client who has no account (0013), both sides.
 *
 * A coach adds a walk-in by hand and 0008 stops them linking a member
 * account to it — user ids are not secret. The invite turns that around:
 * the coach issues a bearer code and the *member* claims it. So the two
 * things worth proving are that the coach can hand one out and take it
 * back, and that every way a claim can legitimately fail says which.
 */

const COACH = 'coach-1';
const MEMBER = 'member-1';
const OTHER = 'member-2';

const walkIn = (id, name, extra = {}) => ({
  id, coach_id: COACH, member_id: null, full_name: name, age: null, phone: '1001234567', country_code: '+20',
  email: null, city: null, program: '', specialty: '', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''),
  avatar_bg: '#3E6FB0', active: true, progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: '', focus: '', signup_completed_at: null,
  invite_code: null, invite_created_at: null, invite_expires_at: null, created_at: '2026-09-01T00:00:00Z', ...extra,
});

const coachTables = () => ({
  profiles: [{ id: COACH, full_name: 'Dina Farouk', role: 'coach', account_status: 'active' }],
  coach_profiles: [{ profile_id: COACH, title: 'Career coaching' }],
  clients: [walkIn('c-hana', 'Hana Mostafa'), walkIn('c-old', 'Karim Adel', { active: false })],
  tasks: [], packages: [], payments: [], sessions: [], client_private: [],
});

const memberTables = (clients) => ({
  profiles: [
    { id: MEMBER, full_name: 'Hana Mostafa', role: 'client', account_status: 'active' },
    { id: COACH, full_name: 'Dina Farouk', role: 'coach', avatar_photo_url: null, account_status: 'active' },
  ],
  coach_profiles: [{ profile_id: COACH, title: 'Career coaching' }],
  clients, tasks: [], packages: [], sessions: [], mood_checkins: [], coach_directory: [],
});

async function open(browser, { role, userId, tables, screen, params, lang = 'en', dark = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([r, l, d]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
    localStorage.setItem('rafiq_dark', JSON.stringify(d));
  }, [role, lang, dark]);
  await page.reload();
  await installFakeSupabase(page, { userId, tables });
  await signIn(page, userId);
  await page.evaluate(async ([s, p]) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(p ? { screen: s, params: p } : s);
  }, [screen, params ?? null]);
  await page.waitForTimeout(500);
  return { page, ctx, errs };
}

const openCoach = (browser, o = {}) =>
  open(browser, { role: 'coach', userId: COACH, tables: coachTables(), screen: 'clientDetail', params: { clientId: 'c-hana' }, ...o });
const openMember = (browser, clients, o = {}) =>
  open(browser, { role: 'client', userId: MEMBER, tables: memberTables(clients), screen: 'claimInvite', ...o });

const card = (page) => page.locator('.client-detail-invite-card');

// --- the coach's side ------------------------------------------------------

test('the coach issues a code on a walk-in row, and can take it back', async ({ browser }) => {
  const { page, ctx, errs } = await openCoach(browser);
  await expect(card(page)).toHaveCount(1);
  await expect(card(page)).toContainText('Hana Mostafa');
  // Nothing is issued until asked for.
  await expect(page.locator('.client-detail-invite-code')).toHaveCount(0);

  await page.getByRole('button', { name: 'Invite them' }).click();
  await expect(page.locator('.client-detail-invite-code')).toBeVisible();
  const code = (await page.locator('.client-detail-invite-code').innerText()).trim();
  expect(code.length, 'a code is shown to read out').toBeGreaterThan(0);

  const stored = (await dbRows(page, 'clients')).find((c) => c.id === 'c-hana');
  expect(stored.invite_code, 'the same code is on the row').toBe(code);
  expect(Date.parse(stored.invite_expires_at) > Date.now(), 'it has a future expiry').toBe(true);

  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.locator('.client-detail-invite-code')).toHaveCount(0);
  expect((await dbRows(page, 'clients')).find((c) => c.id === 'c-hana').invite_code, 'cleared').toBe(null);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('no invite card on a member who already has an account', async ({ browser }) => {
  const tables = coachTables();
  tables.clients[0].member_id = MEMBER;
  const { page, ctx, errs } = await openCoach(browser, { tables });
  await expect(card(page)).toHaveCount(0);
  // And nothing asked 0013 for one.
  expect((await dbCalls(page)).filter((c) => c.fn === 'create_client_invite')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('an archived member is refused, with the reason', async ({ browser }) => {
  // The card is hidden on an archived row, so drive the refusal through the
  // store the way a stale screen would.
  const { page, ctx, errs } = await openCoach(browser);
  const refusal = await page.evaluate(async () => {
    const m = await import('/src/lib/rosterData.ts');
    const r = await m.createClientInvite('c-old');
    return r.ok ? null : `${r.code}:${r.message}`;
  });
  expect(refusal, 'archived rows cannot be invited').toBe('refused:archived');
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- the member's side -----------------------------------------------------

async function withCode(code = 'T3ST000000', extra = {}) {
  return [walkIn('c-hana', 'Hana Mostafa', {
    invite_code: code,
    invite_created_at: new Date().toISOString(),
    invite_expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    ...extra,
  })];
}

test('the member sees whose roster it is before joining, then joins', async ({ browser }) => {
  const { page, ctx, errs } = await openMember(browser, await withCode());

  // Nothing is claimed by typing: the button needs a full code first.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.locator('#invite-code').fill('T3ST000000');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue' }).click();

  // The coach is named before the member commits — they cannot read
  // `clients`, so without this they would be confirming blind.
  await expect(page.locator('.claim-invite-coach-name')).toHaveText('Dina Farouk');
  await expect(page.locator('.claim-invite-confirm-body')).toContainText('Hana Mostafa');
  // Peeking must not have spent it.
  expect((await dbRows(page, 'clients'))[0].member_id, 'not linked by peeking').toBe(null);

  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.locator('.claim-invite-done-title')).toBeVisible();
  const row = (await dbRows(page, 'clients'))[0];
  expect(row.member_id, 'the member now holds the row').toBe(MEMBER);
  expect(row.invite_code, 'and the code is spent').toBe(null);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('every way a code can fail says which', async ({ browser }) => {
  const cases = [
    ['a code nobody issued', [walkIn('c-hana', 'Hana Mostafa')], 'T3ST000000', /couldn't find that code/i],
    ['an expired code', await withCode('T3ST000000', { invite_expires_at: new Date(Date.now() - 1000).toISOString() }), 'T3ST000000', /expired/i],
    ['a code already claimed by someone else', await withCode('T3ST000000', { member_id: OTHER }), 'T3ST000000', /already been used/i],
  ];
  for (const [what, clients, code, expected] of cases) {
    const { page, ctx, errs } = await openMember(browser, clients);
    await page.locator('#invite-code').fill(code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('.claim-invite-error'), what).toHaveText(expected);
    // A refusal never gets as far as the confirm step.
    await expect(page.locator('.claim-invite-coach-name')).toHaveCount(0);
    expect(errs, what).toEqual([]);
    await ctx.close();
  }
});

test('a code for a row this member already holds names the coach', async ({ browser }) => {
  const { page, ctx, errs } = await openMember(browser, await withCode('T3ST000000', { member_id: MEMBER }));
  await page.locator('#invite-code').fill('T3ST000000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.claim-invite-error')).toContainText('Dina Farouk');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the coach cannot claim their own invite', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, {
    role: 'coach', userId: COACH, tables: memberTables(await withCode()), screen: 'claimInvite',
  });
  await page.locator('#invite-code').fill('T3ST000000');
  await page.getByRole('button', { name: 'Continue' }).click();
  // profiles.role is 'coach', so 0013 refuses before it even looks the code up.
  await expect(page.locator('.claim-invite-error')).toContainText(/members/i);
  expect((await dbRows(page, 'clients'))[0].member_id, 'nothing linked').toBe(null);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('repeated wrong guesses are rate limited', async ({ browser }) => {
  // The code is a bearer token, so peek and claim are guessing oracles.
  const { page, ctx, errs } = await openMember(browser, await withCode());
  for (let i = 0; i < 10; i++) {
    await page.locator('#invite-code').fill(`WR0NG0000${i}`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('.claim-invite-error')).toBeVisible();
  }
  // The eleventh is refused on the limit, not on the code — even the real one.
  await page.locator('#invite-code').fill('T3ST000000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.claim-invite-error')).toHaveText(/too many tries/i);
  expect((await dbRows(page, 'clients'))[0].member_id, 'still unclaimed').toBe(null);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the invite flow reads right in Arabic and dark', async ({ browser }) => {
  const { page, ctx, errs } = await openMember(browser, await withCode(), { lang: 'ar', dark: true });
  const title = await page.locator('.claim-invite-title').innerText();
  expect(title).toMatch(/[؀-ۿ]/);
  // The code itself is Crockford base32 and stays left to right.
  await page.locator('#invite-code').fill('T3ST000000');
  expect(await page.locator('#invite-code').evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
  await page.getByRole('button').filter({ hasText: /متابعة/ }).click();
  await expect(page.locator('.claim-invite-coach-name')).toHaveText('Dina Farouk');
  const body = await page.locator('.claim-invite-confirm-body').innerText();
  expect(body, 'no untranslated English left in the sentence').not.toMatch(/Joining links|record/i);
  expect(errs).toEqual([]);
  await ctx.close();
});
