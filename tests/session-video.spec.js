import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls, setFunctionReply } from './fakeSupabase.js';
import { installFakeCall } from './fakeVideoCall.js';

/**
 * 1:1 video, signed in (Daily). The session room used to be the design's
 * preview for everyone — a banner saying no real call happens, and no way
 * in from a real coach's Home or a real member's Sessions. Now Join shows
 * around a booking's own time, asks the `session-video` function for a
 * pass (supabase/functions/_shared/sessionVideo.ts decides who and when,
 * and that nothing records), and joins the call.
 *
 * No camera and no Daily here: the call is a fake swapped in through
 * videoCall.ts's setVideoCallFactory, recording what the screen asks of
 * it. It lives in tests/fakeVideoCall.js, shared with the store
 * screenshots (store/screenshots/shots.mjs).
 */

const COACH = 'coach-1';
const MEMBER = 'member-1';

const coachTables = () => ({
  profiles: [{ id: COACH, full_name: 'Laila Hafez', phone: '', country_code: '+20', email: 'l@x.com', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo', avatar_photo_url: null, account_status: 'active', role: 'coach' }],
  coach_profiles: [{ profile_id: COACH, title: 'Life coaching', cert: '', bio: 'Coach.', languages: ['Arabic'], session_mode: 'online', experience_years: 3, certifications: [], cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z' }],
  clients: [{
    id: 'c-rana', coach_id: COACH, member_id: 'm-rana', full_name: 'Rana Adel', age: null, phone: '', country_code: '+20', email: null, city: null,
    program: 'Life coaching · Basic', specialty: 'Life coaching', plan: 'Basic', initials: 'RA', avatar_bg: '#3E6FB0', active: true, progress: 40,
    needs_checkin: false, next_session_at: '2026-09-28T12:00:00Z', next_session_type: 'standard', program_completed: false, payment_status: 'paid',
    goal: '', focus: '', signup_completed_at: null, invite_code: null, invite_expires_at: null, created_at: '2026-09-01T00:00:00Z',
  }],
  client_private: [], tasks: [], packages: [], payments: [], subscriptions: [], offerings: [], session_requests: [], favourites: [],
  weekly_availability: [{ coach_id: COACH, day_of_week: 0, enabled: true, start_hour: 10, end_hour: 18 }],
  // Today, Monday 28 Sep, 15:00–15:50 in Cairo.
  time_blocks: [{ id: 'tb-1', coach_id: COACH, client_id: 'c-rana', kind: 'booked', label: 'Session · Rana Adel', starts_at: '2026-09-28T12:00:00Z', ends_at: '2026-09-28T12:50:00Z', session_type: 'standard' }],
  sessions: [{ id: 's-1', client_id: 'c-rana', scheduled_at: '2026-09-28T12:00:00Z', time_block_id: 'tb-1', attendance: null, attendance_set_by: null, recap: null }],
});

const memberTables = () => ({
  profiles: [{ id: MEMBER, full_name: 'Hana M.', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' }],
  clients: [{
    id: 'rel-a', coach_id: 'coach-a', member_id: MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20', email: null, city: null,
    program: '', specialty: '', plan: '', initials: 'HM', avatar_bg: '#3E6FB0', active: true, progress: 0, needs_checkin: false,
    next_session_at: '2026-09-29T07:00:00Z', next_session_type: 'standard', program_completed: false, payment_status: 'due', goal: '', focus: '',
    signup_completed_at: null, created_at: '2026-09-01T00:00:00Z',
  }],
  coach_directory: [{ coach_id: 'coach-a', full_name: 'Dina Farouk', title: 'Career coaching', verified: true, rating_count: 0, rating_avg: null, bio: '', certifications: [], avatar_photo_url: null, cover_photo_url: null }],
  tasks: [], mood_checkins: [], packages: [], cancellations: [], session_requests: [], ratings: [],
  // Tuesday 29 Sep, 10:00–10:50 in Cairo.
  time_blocks: [{ id: 'b-next', coach_id: 'coach-a', client_id: 'rel-a', kind: 'booked', label: 'Session · Hana Mostafa', starts_at: '2026-09-29T07:00:00Z', ends_at: '2026-09-29T07:50:00Z', session_type: 'standard' }],
  sessions: [{ id: 's-next', client_id: 'rel-a', scheduled_at: '2026-09-29T07:00:00Z', time_block_id: 'b-next', attendance: null, attendance_set_by: null, recap: null }],
});

const PASS = { url: 'https://rafiq.daily.co/rafiq-s-1', token: 'tok-1', role: 'coach', other_name: 'Rana Adel', closes_at: '2026-09-28T13:20:00Z' };

async function open(browser, { role = 'coach', lang = 'en', now, screen, params }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(now));
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(([r, l]) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
    localStorage.setItem('rafiq_lang', JSON.stringify(l));
  }, [role, lang]);
  await page.reload();
  const uid = role === 'coach' ? COACH : MEMBER;
  await installFakeSupabase(page, { userId: uid, tables: role === 'coach' ? coachTables() : memberTables() });
  await signIn(page, uid);
  await installFakeCall(page);
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav({ screen: s, params: p }), [screen, params ?? {}]);
  await page.waitForTimeout(400);
  return { page, ctx, errs };
}

/** Leave the room and open it again, the way someone would: Back, then
    Join. Waits for the room to really close between the two — nav() only
    schedules a render, and two back to back collapse into one. */
async function reopenRoom(page) {
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav({ screen: 'main' }));
  await expect(page.locator('.session-room')).toHaveCount(0);
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav({ screen: 'sessionRoom', params: { sessionId: 's-1' } }));
  await expect(page.locator('.session-room-prejoin')).toBeVisible();
}

const videoCalls = (page) => page.evaluate(() => window.__video.calls);
const state = (page) => page.evaluate(async () => {
  const s = (await import('/src/store/appStore.ts')).useAppStore.getState();
  return { screen: s.screen, params: s.params };
});

test('coach Home: Join appears 10 minutes before today\'s session, not hours before, and opens its call', async ({ browser }) => {
  const early = await open(browser, { now: '2026-09-28T09:00:00Z', screen: 'main' });
  await expect(early.page.locator('.main-session-row', { hasText: 'Rana Adel' })).toBeVisible();
  await expect(early.page.locator('.main-join-chip')).toHaveCount(0);
  await early.ctx.close();

  const { page, ctx, errs } = await open(browser, { now: '2026-09-28T11:50:00Z', screen: 'main' });
  await page.locator('.main-join-chip').click();
  expect(await state(page)).toEqual({ screen: 'sessionRoom', params: { sessionId: 's-1', name: 'Rana Adel' } });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('coach Schedule: the booking\'s sheet offers Join in its window', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { now: '2026-09-28T12:10:00Z', screen: 'schedule' });
  await page.locator('.schedule-block', { hasText: '3:00' }).first().click();
  await page.getByRole('button', { name: /join/i }).click();
  expect(await state(page)).toEqual({ screen: 'sessionRoom', params: { sessionId: 's-1', name: 'Rana Adel' } });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the call: asks for a pass, joins with it, waits for the other person, toggles, and leaves — never the demo preview', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { now: '2026-09-28T11:55:00Z', screen: 'sessionRoom', params: { sessionId: 's-1', name: 'Rana Adel' } });
  const frame = page.locator('.phone-frame');
  await expect(frame).not.toContainText(/Preview|isn't connected yet/);
  await setFunctionReply(page, 'session-video', 200, PASS);
  await page.locator('.session-room-join').click();

  await expect(page.locator('.session-room-live')).toBeVisible();
  expect((await dbCalls(page)).filter((c) => c.op === 'functions.invoke')).toEqual([{ op: 'functions.invoke', name: 'session-video', body: { session_id: 's-1' } }]);
  expect(await videoCalls(page)).toEqual([['join', PASS.url, PASS.token]]);
  await expect(frame).toContainText('Not recorded');
  await expect(page.locator('.session-room-stage-name')).toHaveText('Waiting for \u2068Rana Adel\u2069 to join…');

  await page.evaluate(() => window.__video.emit(true));
  await expect(page.locator('.session-room-stage-name')).toHaveText('Rana Adel');

  await page.getByRole('button', { name: 'Toggle microphone' }).click();
  await page.getByRole('button', { name: 'Toggle camera' }).click();
  await expect(page.getByRole('button', { name: 'Toggle microphone' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Leave' }).click();
  expect(await videoCalls(page)).toEqual([['join', PASS.url, PASS.token], ['mic', false], ['camera', false], ['leave']]);
  expect((await state(page)).screen).not.toBe('sessionRoom');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('too early, in Arabic: says when it opens, in Arabic, and lets them try again', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { lang: 'ar', now: '2026-09-28T09:00:00Z', screen: 'sessionRoom', params: { sessionId: 's-1', name: 'رنا عادل' } });
  await setFunctionReply(page, 'session-video', 409, { error: 'too_early', opens_at: '2026-09-28T11:50:00Z' });
  await page.locator('.session-room-join').click();
  // 11:50 UTC is 2:50 PM in Cairo.
  await expect(page.locator('.session-room-blocked')).toHaveText('تُفتح هذه الجلسة الساعة 2:50 م، قبل بدئها بعشر دقائق.');
  await expect(page.locator('.session-room-join')).toHaveText(/إعادة المحاولة|حاول/);
  expect(await videoCalls(page)).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('refusals that retrying won\'t fix offer no retry; ones that might, do', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { now: '2026-09-28T11:55:00Z', screen: 'sessionRoom', params: { sessionId: 's-1' } });
  const cases = [
    [409, 'blocked', 'This relationship is blocked.', false],
    [409, 'cancelled', 'This session was cancelled.', false],
    [409, 'ended', 'This session has ended.', false],
    [404, 'not_found', "This session isn't available.", false],
    [409, 'relationship_inactive', "This session can't take place: one of the two accounts isn't active.", false],
    [503, 'video_not_configured', "Video isn't available right now. Try again in a few minutes.", true],
    [503, 'recording_enabled_on_domain', "Video isn't available right now. Try again in a few minutes.", true],
  ];
  for (const [status, error, text, retry] of cases) {
    await reopenRoom(page);
    await setFunctionReply(page, 'session-video', status, { error });
    await page.locator('.session-room-join').click();
    await expect(page.locator('.session-room-blocked'), error).toHaveText(text);
    await expect(page.locator('.session-room-join'), error).toHaveCount(retry ? 1 : 0);
  }
  expect(await videoCalls(page)).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('when the window closes the call ends and says so; a dropped call can be rejoined', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { now: '2026-09-28T12:40:00Z', screen: 'sessionRoom', params: { sessionId: 's-1' } });
  await setFunctionReply(page, 'session-video', 200, PASS);
  await page.locator('.session-room-join').click();
  await expect(page.locator('.session-room-live')).toBeVisible();
  await page.evaluate(() => window.__video.end('ejected'));
  await expect(page.locator('.session-room-blocked')).toHaveText("The session's time is up.");
  await expect(page.locator('.session-room-join')).toHaveCount(0);

  await reopenRoom(page);
  await page.locator('.session-room-join').click();
  await expect(page.locator('.session-room-live')).toBeVisible();
  await page.evaluate(() => window.__video.end('error'));
  await expect(page.locator('.session-room-blocked')).toHaveText('The call dropped.');
  await page.locator('.session-room-join').click();
  await expect(page.locator('.session-room-live')).toBeVisible();
  expect(errs).toEqual([]);
  await ctx.close();
});

test('member Sessions: Join shows in the window and opens the call with the coach\'s name; not the day before', async ({ browser }) => {
  const before = await open(browser, { role: 'client', now: '2026-09-28T09:00:00Z', screen: 'clientSchedule' });
  await expect(before.page.locator('.client-schedule-upcoming-card')).toBeVisible();
  await expect(before.page.locator('.client-schedule-join')).toHaveCount(0);
  await before.ctx.close();

  const { page, ctx, errs } = await open(browser, { role: 'client', now: '2026-09-29T06:55:00Z', screen: 'clientSchedule' });
  await page.locator('.client-schedule-join').click();
  expect(await state(page)).toEqual({ screen: 'sessionRoom', params: { sessionId: 's-next', name: 'Dina Farouk' } });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('member Sessions: Join stays once the session has begun, until 30 minutes after it ends', async ({ browser }) => {
  // 07:00–07:50, and nothing booked after it: twenty minutes in, there is
  // no upcoming session left, but the call is still open.
  const { page, ctx, errs } = await open(browser, { role: 'client', now: '2026-09-29T07:20:00Z', screen: 'clientSchedule' });
  await expect(page.locator('.client-schedule-empty-upcoming')).toBeVisible();
  await page.locator('.client-schedule-join').click();
  expect(await state(page)).toEqual({ screen: 'sessionRoom', params: { sessionId: 's-next', name: 'Dina Farouk' } });
  expect(errs).toEqual([]);
  await ctx.close();

  const after = await open(browser, { role: 'client', now: '2026-09-29T08:25:00Z', screen: 'clientSchedule' });
  await expect(after.page.locator('.client-schedule-empty-upcoming')).toBeVisible();
  await expect(after.page.locator('.client-schedule-join')).toHaveCount(0);
  await after.ctx.close();
});
