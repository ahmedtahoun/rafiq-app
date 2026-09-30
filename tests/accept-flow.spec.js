import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 4, the accept flow: a member finds a real
 * coach (Discover), asks for a first session at one of their weekly hours
 * (CoachPreview), sees it waiting (MyCoaches); the coach sets those hours
 * (Availability) and answers the request (Notifications) — accepting runs
 * 0010's accept_session_request, which tests/fakeSupabase.js models and
 * supabase/tests/13_accept_flow.sql proves against the real schema.
 *
 * The page clock is pinned to noon on Mon 28 Sep 2026 in Cairo (UTC+3), like
 * roster-remote.spec.js.
 */

const COACH = 'coach-1';
const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z'); // Mon 12:00 in Cairo

const hours = (coachId, day, start, end, enabled = true) => ({ coach_id: coachId, day_of_week: day, enabled, start_hour: start, end_hour: end });
const directoryRow = (id, name, extra = {}) => ({
  coach_id: id, full_name: name, title: 'Career coaching · Life coaching', country: 'Egypt', country_flag: '🇪🇬',
  languages: ['Arabic', 'English'], experience_years: 6, verified: true, featured: false, from_price: 600,
  rating_count: 5, rating_avg: 4.8, bio: `${name} helps people find work they love.`, avatar_photo_url: null,
  session_mode: 'online', certifications: [], cover_photo_url: null, ...extra,
});
const request = (id, extra = {}) => ({
  id, member_id: 'm-hana', coach_id: COACH, offering_id: null, requested_start: '2026-09-29T07:00:00Z',
  price: 0, currency: 'EGP', status: 'pending', created_at: '2026-09-27T10:00:00Z', responded_at: null, ...extra,
});

const coachTables = () => ({
  profiles: [
    { id: COACH, full_name: 'Dina Farouk', role: 'coach', account_status: 'active' },
    { id: 'm-hana', full_name: 'Hana Mostafa', phone: '1001234567', country_code: '+20', email: 'hana@x.com' },
    { id: 'm-karim', full_name: 'Karim Adel', phone: null, country_code: null, email: 'karim@x.com' },
  ],
  offerings: [{ id: 'off-1', coach_id: COACH, name: 'Career session', price: 600, active: true }],
  session_requests: [
    // Tue 29 Sep, 10:00 Cairo — a free intro call.
    request('req-hana'),
    // Wed 30 Sep, 15:00 Cairo — a paid session.
    request('req-karim', { member_id: 'm-karim', offering_id: 'off-1', requested_start: '2026-09-30T12:00:00Z', price: 600, created_at: '2026-09-27T11:00:00Z' }),
  ],
  clients: [],
  time_blocks: [],
  sessions: [],
  weekly_availability: [hours(COACH, 0, 9, 17), hours(COACH, 2, 10, 14, false)],
});

const memberTables = () => ({
  profiles: [{ id: MEMBER, full_name: 'Hana Mostafa', phone: '', country_code: '+20' }],
  coach_directory: [
    directoryRow('coach-dina', 'Dina Farouk'),
    // New: two reviews, only free offerings, no hours set.
    directoryRow('coach-omar', 'Omar Nabil', { title: 'Yoga coaching', rating_count: 2, rating_avg: 5, from_price: null, experience_years: null, bio: '' }),
  ],
  weekly_availability: [
    // Monday 9–17 (today, from 13:00 on), Thursday 18:00–20:00.
    hours('coach-dina', 0, 9, 17), hours('coach-dina', 3, 18, 20),
  ],
  offerings: [
    { id: 'off-dina', coach_id: 'coach-dina', name: 'Career deep-dive', description: 'Map your next role.', type: 'session', duration: '60 min', format: 'online', price: 600, currency: 'EGP', active: true, created_at: '2026-09-01T00:00:00Z' },
    { id: 'off-old', coach_id: 'coach-dina', name: 'Retired offer', description: '', type: 'session', duration: '', format: 'online', price: 100, currency: 'EGP', active: false, created_at: '2026-08-01T00:00:00Z' },
  ],
  session_requests: [],
  clients: [],
});

async function open(browser, { role, userId, tables, lang = 'en', dark = false, signedIn = true, screen, params, fail } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
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
  await installFakeSupabase(page, { userId, tables, fail });
  if (signedIn) await signIn(page, userId);
  await go(page, screen, params);
  return { page, ctx, errs };
}
const openCoach = (browser, opts = {}) => open(browser, { role: 'coach', userId: COACH, tables: coachTables(), screen: 'notifications', ...opts });
const openMember = (browser, opts = {}) => open(browser, { role: 'client', userId: MEMBER, tables: memberTables(), screen: 'discover', ...opts });

async function go(page, screen, params) {
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params]);
  await page.waitForTimeout(300);
}
const currentScreen = (page) => page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState());
const frame = (page) => page.locator('.phone-frame').first();
const callsTo = async (page, table, op) => (await dbCalls(page)).filter((c) => c.table === table && (!op || c.op === op));
const byId = async (page, table, id) => (await dbRows(page, table)).find((r) => r.id === id);

// --- Coach: weekly hours ---------------------------------------------------------

test('signed out, Availability is still the demo week and asks Supabase for nothing', async ({ browser }) => {
  const { page, ctx, errs } = await openCoach(browser, { signedIn: false, screen: 'availability' });
  await expect(page.locator('.availability-day-card')).toHaveCount(7);
  expect(await callsTo(page, 'weekly_availability')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the coach sees their own hours, turns a day on, and edits a range', async ({ browser }) => {
  const { page, ctx, errs } = await openCoach(browser, { screen: 'availability' });
  const day = (name) => page.locator('.availability-day-card', { hasText: name });
  await expect(day('Monday').getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await expect(day('Monday')).toContainText('9:00 AM – 5:00 PM');
  // A day with no row, and a day stored as off, are both off.
  await expect(day('Tuesday').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await expect(day('Wednesday').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  expect((await callsTo(page, 'weekly_availability', 'select'))[0].filters).toEqual([['coach_id', COACH]]);

  // Tuesday has no row yet: the update finds nothing, so it is inserted.
  await day('Tuesday').getByRole('switch').click();
  await expect(day('Tuesday').getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  const tue = (await dbRows(page, 'weekly_availability')).find((r) => r.day_of_week === 1);
  expect(tue).toMatchObject({ coach_id: COACH, enabled: true, start_hour: 9, end_hour: 17 });

  // Wednesday's stored hours come back when it's turned on again.
  await day('Wednesday').getByRole('switch').click();
  await expect(day('Wednesday')).toContainText('10:00 AM – 2:00 PM');
  expect((await dbRows(page, 'weekly_availability')).filter((r) => r.day_of_week === 2)).toHaveLength(1);

  await day('Monday').locator('.availability-day-range-btn').click();
  await page.locator('.availability-chip-section').nth(1).getByRole('button', { name: '6:30 PM' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(day('Monday')).toContainText('9:00 AM – 6:30 PM');
  expect((await dbRows(page, 'weekly_availability')).find((r) => r.day_of_week === 0)).toMatchObject({ start_hour: 9, end_hour: 18.5 });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed save keeps the stored hours on screen and the sheet open, and says so', async ({ browser }) => {
  const { page, ctx, errs } = await openCoach(browser, { screen: 'availability' });
  const monday = page.locator('.availability-day-card', { hasText: 'Monday' });
  await setFailing(page, ['weekly_availability.update']);
  await monday.locator('.availability-day-range-btn').click();
  await page.locator('.availability-chip-section').nth(1).getByRole('button', { name: '6:30 PM' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText("Your hours weren't saved");
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(monday).toContainText('9:00 AM – 5:00 PM');
  await monday.getByRole('switch').click();
  await expect(page.getByRole('alert')).toContainText("Your hours weren't saved");
  await expect(monday.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  expect((await dbRows(page, 'weekly_availability')).find((r) => r.day_of_week === 0)).toMatchObject({ enabled: true, end_hour: 17 });
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Coach: answering requests ---------------------------------------------------

test('Notifications lists the requests waiting on the coach — never the demo feed', async ({ browser }) => {
  const { page, ctx, errs } = await openCoach(browser);
  const rows = page.locator('.notifications-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('⁨Karim Adel⁩ requested a session');
  await expect(rows.nth(0)).toContainText('Wed, Sep 30, 3:00 PM · Career session');
  await expect(rows.nth(1)).toContainText('Tue, Sep 29, 10:00 AM · Intro Call');
  await expect(frame(page)).not.toContainText('Mark all');
  expect((await callsTo(page, 'session_requests', 'select'))[0].filters).toEqual([['coach_id', COACH], ['status', 'pending']]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the bell on Home shows a dot only while a request is waiting', async ({ browser }) => {
  const { page, ctx } = await openCoach(browser, { screen: 'main' });
  await expect(page.locator('.main-bell-dot')).toHaveCount(1);
  await ctx.close();

  const tables = coachTables();
  tables.session_requests = tables.session_requests.map((r) => ({ ...r, status: 'declined' }));
  const second = await openCoach(browser, { screen: 'main', tables });
  await expect(second.page.locator('.main-bell-dot')).toHaveCount(0);
  await second.ctx.close();
});

test('accepting books the session and puts the member on the roster', async ({ browser }) => {
  // Clients first, so the roster is already loaded (and empty) when the request is accepted.
  const { page, ctx, errs } = await openCoach(browser, { screen: 'clients' });
  await expect(page.locator('.clients-card')).toHaveCount(0);
  await go(page, 'notifications');
  await page.locator('.notifications-row', { hasText: 'Hana' }).click();
  const sheet = page.locator('.notifications-sheet');
  await expect(sheet).toContainText('Tue, Sep 29, 10:00 AM');
  await expect(sheet).toContainText('Intro Call');
  await expect(sheet).toContainText('Free');
  await sheet.getByRole('button', { name: 'Accept' }).click();

  await expect(page.locator('.notifications-banner')).toContainText('Booked — ⁨Hana Mostafa⁩ is on your Clients list now.');
  await expect(page.locator('.notifications-row')).toHaveCount(1);
  const rpc = (await dbCalls(page)).filter((c) => c.op === 'rpc');
  expect(rpc).toEqual([{ op: 'rpc', fn: 'accept_session_request', args: { p_request: 'req-hana' } }]);
  expect((await byId(page, 'session_requests', 'req-hana')).status).toBe('accepted');
  const [row] = await dbRows(page, 'clients');
  expect(row).toMatchObject({ coach_id: COACH, member_id: 'm-hana', full_name: 'Hana Mostafa', next_session_at: '2026-09-29T07:00:00Z' });

  // The roster re-read: the new member is on Clients, their session next.
  await go(page, 'clients');
  await expect(page.locator('.clients-card', { hasText: 'Hana Mostafa' })).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('declining answers only that request, and only while it is open', async ({ browser }) => {
  const { page, ctx, errs } = await openCoach(browser);
  await page.locator('.notifications-row', { hasText: 'Karim' }).click();
  await page.locator('.notifications-sheet').getByRole('button', { name: 'Decline' }).click();
  await expect(page.locator('.notifications-row')).toHaveCount(1);
  const [call] = await callsTo(page, 'session_requests', 'update');
  expect(call.values).toMatchObject({ status: 'declined' });
  expect(call.filters).toEqual([['id', 'req-karim'], ['status', 'pending']]);
  expect((await byId(page, 'session_requests', 'req-karim')).status).toBe('declined');
  expect(await dbRows(page, 'clients')).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a time that clashes with a booked session is refused in the sheet, and nothing changes', async ({ browser }) => {
  const tables = coachTables();
  tables.time_blocks.push({ id: 'b-1', coach_id: COACH, client_id: 'c-x', kind: 'booked', starts_at: '2026-09-29T06:30:00Z', ends_at: '2026-09-29T07:20:00Z' });
  const { page, ctx, errs } = await openCoach(browser, { tables });
  await page.locator('.notifications-row', { hasText: 'Hana' }).click();
  await page.locator('.notifications-sheet').getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.notifications-sheet').getByRole('alert')).toHaveText('This time clashes with a booked session, or time you marked unavailable.');
  expect((await byId(page, 'session_requests', 'req-hana')).status).toBe('pending');
  expect(await dbRows(page, 'clients')).toEqual([]);
  await expect(page.locator('.notifications-row')).toHaveCount(2);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('time the coach marked unavailable is refused the same way', async ({ browser }) => {
  const tables = coachTables();
  tables.time_blocks.push({ id: 'b-busy', coach_id: COACH, client_id: null, kind: 'busy', starts_at: '2026-09-29T06:00:00Z', ends_at: '2026-09-29T08:00:00Z' });
  const { page, ctx, errs } = await openCoach(browser, { tables });
  await page.locator('.notifications-row', { hasText: 'Hana' }).click();
  await page.locator('.notifications-sheet').getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.notifications-sheet').getByRole('alert')).toHaveText('This time clashes with a booked session, or time you marked unavailable.');
  expect((await byId(page, 'session_requests', 'req-hana')).status).toBe('pending');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a request whose time has passed, or that was withdrawn meanwhile, says which', async ({ browser }) => {
  const tables = coachTables();
  tables.session_requests[0].requested_start = '2026-09-28T08:00:00Z'; // 11:00 today — gone by.
  const { page, ctx, errs } = await openCoach(browser, { tables });
  await page.locator('.notifications-row', { hasText: 'Hana' }).click();
  await page.locator('.notifications-sheet').getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.notifications-sheet').getByRole('alert')).toHaveText(
    'This time has already passed. Decline it so ⁨Hana Mostafa⁩ can pick another.',
  );
  await page.keyboard.press('Escape');
  await page.locator('.sheet-backdrop').click({ position: { x: 5, y: 5 } });

  // Karim withdraws while the list is on screen.
  await page.evaluate(() => { window.__fake.db.session_requests.find((r) => r.id === 'req-karim').status = 'withdrawn'; });
  await page.locator('.notifications-row', { hasText: 'Karim' }).click();
  await page.locator('.notifications-sheet').getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.notifications-banner')).toHaveText('This request was withdrawn or already answered.');
  await expect(page.locator('.notifications-row')).toHaveCount(1);
  expect((await byId(page, 'session_requests', 'req-karim')).status).toBe('withdrawn');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a failed accept keeps the request and says so', async ({ browser }) => {
  const { page, ctx, errs } = await openCoach(browser, { fail: ['rpc.accept_session_request'] });
  await page.locator('.notifications-row', { hasText: 'Hana' }).click();
  await page.locator('.notifications-sheet').getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('.notifications-sheet').getByRole('alert')).toHaveText('Something went wrong. Please try again.');
  expect((await byId(page, 'session_requests', 'req-hana')).status).toBe('pending');
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Member: finding a coach and asking ------------------------------------------

test('signed in, Discover lists the real coaches — never the demo directory or its sample stories', async ({ browser }) => {
  const { page, ctx, errs } = await openMember(browser);
  const cards = page.locator('.discover-card');
  await expect(cards).toHaveCount(2);
  const text = await frame(page).innerText();
  expect(text).not.toMatch(/Mariam Adel|Dina Kamal|Nour Hassan|meditation sessions/);

  const dina = cards.filter({ hasText: 'Dina Farouk' });
  await expect(dina).toContainText('Career coaching');
  await expect(dina).toContainText('4.8');
  await expect(dina).toContainText('600 EGP');
  await expect(dina).toContainText('Available today');
  // Two reviews aren't a rating; no paid offering is free; no years, none shown.
  const omar = cards.filter({ hasText: 'Omar Nabil' });
  await expect(omar).toContainText('New');
  await expect(omar).toContainText('Free');
  await expect(omar).not.toContainText('yrs');
  await expect(omar).not.toContainText('Available today');

  // Available today: Omar has set no hours at all.
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.locator('.discover-chip', { hasText: 'Today' }).click();
  await page.getByRole('button', { name: /Show results/ }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Dina Farouk');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('an empty directory says the marketplace is still filling up, not that the search failed', async ({ browser }) => {
  // Discover will be empty until real pros sign up. "No pros match your
  // search", over a search box nobody has typed in, reads like the screen
  // is broken — and the rail, filters and trending rail are all empty
  // furniture around it.
  const tables = memberTables();
  tables.coach_directory = [];
  const { page, ctx, errs } = await open(browser, { role: 'client', userId: MEMBER, tables, screen: 'discover' });

  await expect(page.locator('.discover-no-coaches')).toHaveCount(1);
  await expect(page.locator('.discover-no-coaches-title')).toHaveText('No pros yet');
  const text = await frame(page).innerText();
  expect(text).not.toMatch(/match your search/i);

  // Nothing to search, filter or scroll through, so none of it is shown.
  await expect(page.locator('.discover-searchbar')).toHaveCount(0);
  await expect(page.locator('.discover-rail')).toHaveCount(0);
  await expect(page.locator('.discover-card')).toHaveCount(0);
  await expect(page.locator('.discover-trend-card')).toHaveCount(0);
  // Still reachable: the member is not trapped on a dead screen.
  await expect(page.locator('.bottom-nav')).toHaveCount(1);

  expect(errs).toEqual([]);
  await ctx.close();
});

test('an empty directory reads right in Arabic', async ({ browser }) => {
  const tables = memberTables();
  tables.coach_directory = [];
  const { page, ctx, errs } = await open(browser, { role: 'client', userId: MEMBER, tables, screen: 'discover', lang: 'ar', dark: true });
  const title = await page.locator('.discover-no-coaches-title').innerText();
  expect(title).toMatch(/[\u0600-\u06FF]/);
  expect(title).not.toMatch(/pros|yet/i);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('CoachPreview is the real coach: their bio, offerings, and slots from their weekly hours', async ({ browser }) => {
  const { page, ctx, errs } = await openMember(browser, { screen: 'coachPreview', params: { coachId: 'coach-dina' } });
  await expect(page.locator('.coach-preview-name')).toHaveText('Dina Farouk');
  await expect(page.locator('.coach-preview-bio')).toHaveText('Dina Farouk helps people find work they love.');
  await expect(frame(page)).not.toContainText('Message');
  const offerings = page.locator('.coach-preview-offering');
  await expect(offerings).toHaveCount(2);
  await expect(offerings.nth(0)).toContainText('Career deep-dive');
  await expect(offerings.nth(0)).toContainText('60 min · Online');
  await expect(offerings.nth(1)).toContainText('Intro Call');
  await expect(frame(page)).not.toContainText('Retired offer');

  // Monday 28 Sep, noon: today's openings start at 1 PM; the last fits 50 minutes before 5.
  await expect(page.locator('.coach-preview-next-value')).toHaveText('MON 28 — 1:00 PM');
  await expect(page.locator('.coach-preview-time')).toHaveText(['1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM']);
  await expect(page.locator('.coach-preview-day')).toHaveCount(7);
  await expect(page.locator('.coach-preview-week-label')).toHaveText('Sep 28 – Oct 4');
  // Thursday: 6–8 PM.
  await page.locator('.coach-preview-day', { hasText: '1' }).filter({ hasText: 'THU' }).click();
  await expect(page.locator('.coach-preview-time')).toHaveText(['6:00 PM', '7:00 PM']);
  await page.locator('.coach-preview-day').filter({ hasText: 'TUE' }).click();
  await expect(page.locator('.coach-preview-no-times')).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('asking for a paid session, then a free intro: one open request, at the time picked', async ({ browser }) => {
  const { page, ctx, errs } = await openMember(browser, { screen: 'coachPreview', params: { coachId: 'coach-dina' } });
  await page.locator('.coach-preview-time', { hasText: '3:00 PM' }).click();
  await page.locator('.coach-preview-primary').click();
  await expect(page.locator('.coach-preview-confirmed')).toBeVisible();
  await expect(page.locator('.coach-preview-receipt')).toContainText('MON 28 — 3:00 PM');
  await expect(page.locator('.coach-preview-receipt')).toContainText('600 EGP');
  let rows = await dbRows(page, 'session_requests');
  expect(rows).toHaveLength(1);
  // 15:00 in Cairo is 12:00 UTC.
  expect(rows[0]).toMatchObject({ member_id: MEMBER, coach_id: 'coach-dina', offering_id: 'off-dina', requested_start: '2026-09-28T12:00:00.000Z', price: 600, currency: 'EGP', status: 'pending' });

  // Done, then back to the coach from Discover: the open request is named,
  // and a new time replaces it.
  await page.getByRole('button', { name: 'Done' }).click();
  expect((await currentScreen(page)).screen).toBe('discover');
  await page.locator('.discover-card-main', { hasText: 'Dina Farouk' }).click();
  await expect(page.locator('.coach-preview-bar-note')).toHaveText("You've asked for MON 28 — 3:00 PM. Sending a new time replaces that request.");
  await page.locator('.coach-preview-offering', { hasText: 'Intro Call' }).click();
  await page.locator('.coach-preview-day').filter({ hasText: 'THU' }).click();
  await page.locator('.coach-preview-time', { hasText: '7:00 PM' }).click();
  await page.locator('.coach-preview-primary').click();
  await expect(page.locator('.coach-preview-confirmed')).toContainText('This intro session is free');
  rows = await dbRows(page, 'session_requests');
  expect(rows.map((r) => r.status)).toEqual(['withdrawn', 'pending']);
  expect(rows[1]).toMatchObject({ offering_id: null, price: 0, requested_start: '2026-10-01T16:00:00.000Z' });
  const withdraw = (await callsTo(page, 'session_requests', 'update')).at(-1);
  // Never a pending move of a booked session (0017): that's another request.
  expect(withdraw.filters).toEqual([['member_id', MEMBER], ['coach_id', 'coach-dina'], ['status', 'pending'], ['reschedule_of', null, 'is']]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a coach with no hours says so and can’t be booked; a failed send stays on the picker', async ({ browser }) => {
  const { page, ctx, errs } = await openMember(browser, { screen: 'coachPreview', params: { coachId: 'coach-omar' } });
  await expect(page.locator('.coach-preview-no-times')).toHaveText("⁨Omar Nabil⁩ hasn't set their hours yet — check back soon.");
  await expect(page.locator('.coach-preview-primary')).toBeDisabled();
  await expect(page.locator('.coach-preview-offering')).toHaveCount(1);
  await expect(frame(page)).not.toContainText('About');
  // No years on their profile reads as unknown, not zero.
  await expect(page.locator('.coach-preview-stat').nth(1)).toContainText('—');

  await go(page, 'coachPreview', { coachId: 'coach-dina' });
  await setFailing(page, ['session_requests.insert']);
  await page.locator('.coach-preview-primary').click();
  await expect(page.getByRole('alert')).toHaveText("Your request wasn't sent. Please try again.");
  await expect(page.locator('.coach-preview-confirmed')).toHaveCount(0);

  // If the earlier request can't be withdrawn, nothing new is sent either.
  await setFailing(page, ['session_requests.update']);
  await page.locator('.coach-preview-primary').click();
  await expect(page.getByRole('alert')).toHaveText("Your request wasn't sent. Please try again.");
  expect(await callsTo(page, 'session_requests', 'insert')).toHaveLength(1);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('MyCoaches shows the member’s open requests, and one opens that coach again', async ({ browser }) => {
  const tables = memberTables();
  tables.session_requests.push(
    { id: 'r-1', member_id: MEMBER, coach_id: 'coach-dina', offering_id: 'off-dina', requested_start: '2026-10-01T16:00:00Z', price: 600, status: 'pending', created_at: '2026-09-27T10:00:00Z' },
    { id: 'r-old', member_id: MEMBER, coach_id: 'coach-omar', offering_id: null, requested_start: '2026-09-20T16:00:00Z', price: 0, status: 'declined', created_at: '2026-09-19T10:00:00Z' },
  );
  const { page, ctx, errs } = await openMember(browser, { tables, screen: 'myCoaches' });
  const pending = page.locator('.my-coaches-pending', { hasText: 'Pending' });
  await expect(pending).toHaveCount(1);
  await expect(pending).toContainText('Dina Farouk');
  await expect(pending).toContainText('Requested: Thu, Oct 1, 7:00 PM');
  await pending.click();
  const state = await currentScreen(page);
  expect([state.screen, state.params.coachId]).toEqual(['coachPreview', 'coach-dina']);
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- Both languages, both themes -------------------------------------------------

test('Arabic and dark: the request sheet and the real preview read right', async ({ browser }) => {
  const coach = await openCoach(browser, { lang: 'ar', dark: true });
  await coach.page.locator('.notifications-row').first().click();
  await expect(coach.page.locator('.notifications-sheet')).toContainText('قبول');
  await expect(coach.page.locator('.notifications-sheet')).toContainText('الأربعاء، 30 سبتمبر');
  expect(await coach.page.locator('html').getAttribute('dir')).toBe('rtl');
  expect(coach.errs).toEqual([]);
  await coach.ctx.close();

  const member = await openMember(browser, { lang: 'ar', dark: true, screen: 'coachPreview', params: { coachId: 'coach-dina' } });
  await expect(member.page.locator('.coach-preview-time').first()).toHaveText('1:00 م');
  await expect(member.page.locator('.coach-preview-week-label')).toHaveText('28 سبتمبر – 4 أكتوبر');
  expect(member.errs).toEqual([]);
  await member.ctx.close();
});
