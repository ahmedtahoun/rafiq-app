import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn } from './fakeSupabase.js';

/**
 * LAUNCH-CHECKLIST §2, "Remove the demo identities", the coach side —
 * tests/member-demo-identity.spec.js for the other half of the app.
 *
 * Signed in, nothing may read the demo coach (DEFAULT_PRO_ID,
 * 'pro-yasmin') or the demo roster. Every demo value lives in
 * localStorage under a `rafiq_` key, so the check is the same one the
 * member walk makes: record every key the app asks localStorage for, walk
 * every coach screen, and allow only the device's keys and the coach's
 * own. A screen reading `clients`, `coach_profile`, `templates` or
 * `offerings` fails here even if what it then renders happens to look
 * plausible.
 *
 * The screen text is checked too, because the two failures are different:
 * a key read with an empty demo store renders nothing visibly wrong, and
 * copy can carry a demo name that was pasted in rather than read.
 *
 * The clock is pinned to Mon 28 Sep 2026, 12:00 in Cairo (UTC+3), so
 * "today" is a fact the seed can be written against.
 */

const COACH = 'coach-1';
const MEMBER = 'member-1';
const NOW = new Date('2026-09-28T09:00:00Z');

const client = (id, name, extra = {}) => ({
  id, coach_id: COACH, member_id: null, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: 'Life coaching · Basic', specialty: 'Life coaching', plan: 'Basic', initials: name.split(' ').map((w) => w[0]).join(''),
  avatar_bg: '#3E6FB0', active: true, progress: 40, needs_checkin: false, next_session_at: null, next_session_type: null,
  program_completed: false, payment_status: 'due', goal: 'Sleep better', focus: '', signup_completed_at: null,
  invite_code: null, invite_expires_at: null, blocked_by_member_at: null, blocked_by_coach_at: null,
  created_at: '2026-09-01T00:00:00Z', ...extra,
});

/**
 * Every table the walk's screens read, seeded so each one shows content
 * rather than its empty state — an empty screen cannot show a demo name,
 * so a walk over empty states proves much less than it looks like it does.
 *
 * None of these names, titles or words appear in DEMO below: if a screen
 * swapped its real read for the demo one, what it renders changes.
 */
const tables = () => ({
  profiles: [
    {
      id: COACH, full_name: 'Nadia Shawky', phone: '10 555 0000', country_code: '+20', email: 'nadia@example.com',
      country: 'Egypt', country_flag: '🇪🇬', city: 'Alexandria', avatar_photo_url: null, account_status: 'active', role: 'coach',
    },
    { id: MEMBER, full_name: 'Tarek Zaki', phone: null, country_code: null, email: 'tarek@example.com' },
  ],
  coach_profiles: [{
    profile_id: COACH, title: 'Career coaching', cert: 'EMCC Practitioner', bio: 'Career coach in Alexandria.',
    languages: ['Arabic', 'English'], session_mode: 'online', experience_years: 4, certifications: ['EMCC Practitioner'],
    cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z',
  }],
  clients: [
    client('c-tarek', 'Tarek Zaki', { member_id: MEMBER, next_session_at: '2026-09-28T12:00:00Z', next_session_type: 'standard' }),
    client('c-dalia', 'Dalia Hegazy', { payment_status: 'paid', progress: 70 }),
    client('c-rashad', 'Rashad Lotfy', { active: false }),
  ],
  client_private: [
    { client_id: 'c-tarek', notes: 'Prefers mornings', is_favourite: true },
    { client_id: 'c-dalia', notes: '', is_favourite: false },
  ],
  tasks: [
    { id: 't-cv', client_id: 'c-tarek', title: 'Update the CV', description: '', due_at: '2026-09-25T21:00:00Z', due_has_time: false, recurring: false, done: false, created_at: '2026-09-01T00:00:00Z' },
    { id: 't-apply', client_id: 'c-tarek', title: 'Two applications', description: '', due_at: '2026-10-02T21:00:00Z', due_has_time: false, recurring: false, done: false, created_at: '2026-09-01T00:00:00Z' },
  ],
  sessions: [
    { id: 's-past', client_id: 'c-tarek', scheduled_at: '2026-09-21T12:00:00Z', time_block_id: null, attendance: 'attended', recap: 'Mapped three target roles', origin: 'coach_invited' },
    { id: 's-today', client_id: 'c-tarek', scheduled_at: '2026-09-28T12:00:00Z', time_block_id: 'tb-tarek', attendance: null, recap: null, origin: 'coach_invited' },
  ],
  packages: [{ client_id: 'c-tarek', total: 8, used: 3, expires_at: '2026-10-25T21:00:00Z' }],
  payments: [
    { id: 'pay-1', client_id: 'c-tarek', kind: 'charge', amount: 1200, currency: 'EGP', state: 'completed', method: 'Cash', note: null, refund_of: null, paid_at: '2026-09-20T10:00:00Z', created_at: '2026-09-20T10:00:00Z' },
    { id: 'pay-2', client_id: 'c-dalia', kind: 'charge', amount: 800, currency: 'EGP', state: 'completed', method: 'Cash', note: null, refund_of: null, paid_at: '2026-09-22T10:00:00Z', created_at: '2026-09-22T10:00:00Z' },
  ],
  time_blocks: [
    // Today 15:00–15:50 Cairo: Tarek's session, and a busy block on Friday.
    { id: 'tb-tarek', coach_id: COACH, client_id: 'c-tarek', kind: 'booked', label: 'Session · Tarek Zaki', starts_at: '2026-09-28T12:00:00Z', ends_at: '2026-09-28T12:50:00Z', session_type: 'standard' },
    { id: 'tb-busy', coach_id: COACH, client_id: null, kind: 'busy', label: 'Unavailable', starts_at: '2026-10-02T07:00:00Z', ends_at: '2026-10-02T09:00:00Z', session_type: null },
  ],
  weekly_availability: [
    { coach_id: COACH, day_of_week: 0, enabled: true, start_hour: 10, end_hour: 18 },
    { coach_id: COACH, day_of_week: 2, enabled: false, start_hour: 9, end_hour: 17 },
  ],
  offerings: [
    { id: 'off-session', coach_id: COACH, name: 'Career deep-dive', description: 'Map your next role.', type: 'session', duration: '50 min', format: 'online', price: 900, currency: 'EGP', session_count: null, active: true, created_at: '2026-09-01T00:00:00Z' },
    { id: 'off-pack', coach_id: COACH, name: 'Six-week sprint', description: '', type: 'program', duration: '6 weeks', format: 'both', price: 4800, currency: 'EGP', session_count: 6, active: true, created_at: '2026-09-02T00:00:00Z' },
  ],
  // `cadence` is 0005's template_cadence enum: 'Weekly', 'Bi-weekly',
  // '2x/week', '3x/week'. The fake does not enforce enums, so a value
  // outside it ('Monthly') seeds happily and then renders as a missing
  // i18n key — Templates maps cadence to a key through cadenceLabelKey.
  templates: [
    { id: 'tpl-sprint', coach_id: COACH, name: 'Interview sprint', specialty: 'Career coaching', plan: 'Basic', cadence: 'Weekly', icon: 'IS', bg: '#3E6FB0', tasks: ['Mock interview', 'Rewrite the CV'], created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
    { id: 'tpl-review', coach_id: COACH, name: 'Quarterly review', specialty: 'Career coaching', plan: 'Full Access', cadence: '2x/week', icon: 'QR', bg: '#B75C3D', tasks: ['List wins'], created_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' },
  ],
  messages: [
    { id: 'm1', client_id: 'c-tarek', sender_role: 'coach', sender_id: COACH, body: 'How did the week go?', created_at: '2026-09-27T08:00:00Z' },
    { id: 'm2', client_id: 'c-tarek', sender_role: 'client', sender_id: MEMBER, body: 'Two interviews booked', created_at: '2026-09-27T09:00:00Z' },
  ],
  message_reads: [{ client_id: 'c-tarek', reader_role: 'coach', last_read_at: '2026-09-27T08:30:00Z' }],
  // A request waiting on the coach, so Notifications has a row signed in.
  session_requests: [
    { id: 'req-1', member_id: MEMBER, coach_id: COACH, offering_id: null, requested_start: '2026-09-30T07:00:00Z', price: 0, currency: 'EGP', status: 'pending', created_at: '2026-09-27T10:00:00Z', responded_at: null, reschedule_of: null },
  ],
  subscriptions: [{ coach_id: COACH, tier: 'free', renews_at: null }],
  coach_payout_accounts: [{
    coach_id: COACH, issuer: 'vodafone', msisdn: '01098765432', bank_code: null, account_number: null,
    full_name: 'Nadia Shawky', national_id: '29912310104567',
  }],
  payouts: [],
  coach_directory: [],
  ratings: [],
  coach_reviews: [],
  mood_checkins: [],
  enrollments: [],
  notifications: [],
  cancellations: [],
  favourites: [],
});

async function open(browser, { data = tables() } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errs = [];
  // Warnings count here, not only errors. i18n's missing-key fallback
  // (i18n.ts:2250) is a console.warn, so a screen rendering a key as its
  // own name — the tell for a key built at runtime that came out
  // undefined — would otherwise walk straight past a passing test.
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (!['error', 'warning'].includes(m.type())) return;
    if (IGNORED_CONSOLE.test(m.text() + m.location().url)) return;
    errs.push(`${m.type()}: ${m.text()}`);
  });
  // Each screen is its own chunk (App.tsx), so the walk waits for the one
  // it navigated to rather than a delay that could measure the Suspense
  // fallback and report nothing wrong.
  await installScreenSettle(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify('coach'));
    localStorage.setItem('rafiq_lang', JSON.stringify('en'));
  });
  await page.reload();
  await installFakeSupabase(page, { userId: COACH, tables: data });
  // The thread and the inbox subscribe to new messages: a quiet channel,
  // as in messaging-remote.spec.js.
  await page.evaluate(async () => {
    const real = (await import('/src/lib/supabase.ts')).getSupabase();
    real.channel = (name) => ({ name, on() { return this; }, subscribe() { return this; } });
    real.removeChannel = async () => 'ok';
  });
  await signIn(page, COACH);
  // Every key the app asks localStorage for from here on. Installed after
  // signing in: the boot path reads the device's keys before any screen of
  // the walk is mounted, and those are not what this is looking for.
  await page.evaluate(() => {
    window.__keysRead = [];
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      window.__keysRead.push(key);
      return get.call(this, key);
    };
  });
  return { page, ctx, errs };
}

/** A screen name, or { screen, params } for one that needs a subject. */
async function go(page, target) {
  await page.evaluate(async (s) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(s), target);
  const settled = await page.evaluate(() => window.__screenSettled());
  expect(settled, `${nameOf(target)} never settled`).toBe(true);
}
const nameOf = (target) => (typeof target === 'string' ? target : target.screen);
const frame = (page) => page.locator('.phone-frame').first();

/**
 * The demo coach, their roster, and the demo catalogue — what Offerings,
 * Profile and the share card would show if they read mockStore instead of
 * the coach's own rows.
 *
 * Only strings that can mean nothing else. Two kinds are deliberately
 * left out, because a pattern that can fire on correct output is worse
 * than no pattern:
 *
 * - The demo's 'Intro Call' and 'Consultation' are words a real coach
 *   would also use for a real offering.
 * - Every demo template is named '<specialty> · <plan>' ('Free Diving
 *   Coaching · Basic'), and EditClient's specialty picker renders those
 *   same specialties from i18n. Matching them passed only because the
 *   demo capitalises 'Diving' and the picker does not — luck, not a
 *   check. A demo read on Templates is caught by `rafiq_templates` in the
 *   key check below, which is the stronger signal anyway.
 */
const DEMO = new RegExp([
  'Yasmin El-Sayed', 'yasmin\\.elsayed@example\\.com',
  'Sara Ahmed', 'Omar Fathy', 'Mona Reda', 'Khaled Ibrahim', 'Laila Youssef', 'Nour Hassan',
  '8-Week Transformation Program', 'Goal-Setting Workshop', 'Group Reflection Circle',
].join('|'));

/**
 * Every coach screen that reads the coach's own data, in the order a coach
 * would meet them. The ones that need a subject carry it: deep-linking one
 * without its params renders the empty state, which would pass this walk
 * while showing nothing.
 */
const SCREENS = [
  'main',
  'clients',
  { screen: 'clientDetail', params: { clientId: 'c-tarek' } },
  { screen: 'editClient', params: { clientId: 'c-tarek' } },
  { screen: 'addTask', params: { clientId: 'c-tarek' } },
  'schedule',
  'addTimeBlock',
  'availability',
  'messagesInbox',
  { screen: 'messages', params: { clientId: 'c-tarek' } },
  'notifications',
  'offerings',
  { screen: 'offeringDetail', params: { offeringId: 'off-session' } },
  'templates',
  { screen: 'templateDetail', params: { templateId: 'tpl-sprint' } },
  'profile',
  'editProfile',
  'accountDetails',
  'previewProfile',
  'shareProfile',
  'subscription',
  'earnings',
  'payoutAccount',
];

/**
 * The device's own settings, the coach's own keyed values, and Supabase's
 * session keys. Everything else — `rafiq_clients`, `rafiq_coach_profile`,
 * `rafiq_templates`, `rafiq_offerings`, `rafiq_ratings_*` — is the demo.
 *
 * Three of these are worth saying out loud, because each looks like a
 * demo read until you follow it:
 *
 * - `pro_notif_prefs`, not `notif_prefs`: the coach's own notification
 *   switches (mockStore.ts:1057). `notif_prefs` (1902) is the member's.
 * - `message_draft_<clientId>`: an unsent draft, keyed by one of this
 *   coach's own roster rows. The inbox reads one per row, so this cannot
 *   be pinned to a single id.
 * - `nudged`: which member the coach has already nudged about which alert,
 *   keyed `<clientId>_<kind>` (Main.tsx:314). The coach's own action on
 *   their own members — not an identity. It is not keyed by coach, so two
 *   coaches sharing a device share it; that is a real but separate issue,
 *   noted in the PR rather than failed here.
 */
const ALLOWED = /^(rafiq_(role|lang|dark|pro_notif_prefs|nudged)|rafiq_message_draft_c-(tarek|dalia|rashad)|sb-.+)$/;

/**
 * The demo reads that are on `main` today, with the call site for each.
 *
 * This is a ratchet, not an exemption: the walk asserts the offenders it
 * finds are EXACTLY this map. A new screen reading the demo fails it, and
 * so does fixing one of these — at which point delete its entry here, and
 * the §2 box moves one screen closer to being tickable.
 *
 * Every one of them is `getClients()` reaching mockStore's six-member
 * DEFAULT_CLIENTS, directly or through a helper that walks it:
 *
 *   Profile.tsx:95   getProAggregateRating()  → clients, ratings_<demo id>
 *   Profile.tsx:99   getProActiveObligations()→ package_*, custom_blocks,
 *                                               session_logs_*
 *   Profile.tsx:106  getClients()             → clients
 *   Profile.tsx:111  getUnreadMessageCount()  → messages_*,
 *                                               messages_read_pro_*
 *   PreviewProfile.tsx:81  getProAggregateRating()
 *   PreviewProfile.tsx:82  getClients()
 *   PreviewProfile.tsx:86  getClients()
 *   PreviewProfile.tsx:87  getRatings(c.id)
 *   ShareProfile.tsx:83    getClients()
 *   ShareProfile.tsx:90    getProAggregateRating()
 */
const DEMO_RATINGS = ['sara', 'omar', 'mona', 'khaled', 'laila', 'nour'].map((id) => `rafiq_ratings_${id}`);
const KNOWN_DEMO_READS = {
  profile: [
    'rafiq_clients', ...DEMO_RATINGS,
    'rafiq_package_sara', 'rafiq_custom_blocks', 'rafiq_session_logs_sara',
    'rafiq_package_omar', 'rafiq_session_logs_omar',
    'rafiq_package_mona', 'rafiq_session_logs_mona',
    'rafiq_package_khaled', 'rafiq_session_logs_khaled',
    'rafiq_package_laila', 'rafiq_session_logs_laila',
    'rafiq_messages_read_pro_sara', 'rafiq_messages_sara',
    'rafiq_messages_read_pro_omar', 'rafiq_messages_omar',
    'rafiq_messages_read_pro_mona', 'rafiq_messages_mona',
    'rafiq_messages_read_pro_khaled', 'rafiq_messages_khaled',
    'rafiq_messages_read_pro_laila', 'rafiq_messages_laila',
    'rafiq_messages_read_pro_nour', 'rafiq_messages_nour',
  ],
  previewProfile: ['rafiq_clients', ...DEMO_RATINGS],
  shareProfile: ['rafiq_clients', ...DEMO_RATINGS],
};

/** The keys this screen asked for, and the recorder emptied for the next. */
const keysOf = (page) => page.evaluate(() => {
  const keys = [...new Set(window.__keysRead)];
  window.__keysRead = [];
  return keys;
});

test('signed in, no coach screen reads or shows the demo coach', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  // Collected per screen rather than asserted inside the loop, so one run
  // names every screen that reads the demo instead of stopping at the
  // first — which is the difference between a finding and a bisect.
  const offenders = {};
  for (const target of SCREENS) {
    await go(page, target);
    await expect(page.locator('.load-state'), nameOf(target)).toHaveCount(0);
    await expect(page.locator('.phone-frame'), nameOf(target)).toHaveCount(1);
    await expect(frame(page), nameOf(target)).not.toContainText(DEMO);
    const demoKeys = (await keysOf(page)).filter((k) => !ALLOWED.test(k));
    if (demoKeys.length) offenders[nameOf(target)] = demoKeys;
  }
  // Exact, not a subset: this fails on a new offender AND on a fixed one.
  expect(offenders).toEqual(KNOWN_DEMO_READS);
  expect(errs).toEqual([]);
  await ctx.close();
});

/**
 * What the three screens above actually show for it, which is the reason
 * they matter rather than a tidiness point.
 *
 * `getClients()` with nothing stored returns mockStore's DEFAULT_CLIENTS —
 * six members, all active — so the count is the demo's six however many
 * the coach really has. This coach has two. PreviewProfile is what a
 * prospective member is shown, and ShareProfile is the card that gets
 * sent, so the number is a claim about the coach's practice.
 *
 * Marked `test.fail()`, not `fixme`: the body runs, and it asserts the
 * CORRECT number. Playwright expects the failure, so CI is green while the
 * bug stands — and the day the read is fixed this test "unexpectedly
 * passes" and goes red, which is the reminder to drop the marker and the
 * matching KNOWN_DEMO_READS entries. `fixme` would not run it at all.
 */
test('the share card and the public preview count the coach’s own members', async ({ browser }) => {
  // Inside the body, so it marks this test only: at file scope it would
  // mark every test in the file as expected-to-fail.
  test.fail();
  const { page, ctx } = await open(browser);
  for (const [screen, selector] of [
    ['shareProfile', '.share-profile-stat-value'],
    ['previewProfile', '.preview-profile-stat-value'],
  ]) {
    await go(page, screen);
    // Two active on this roster: Tarek and Dalia. Rashad is archived.
    await expect(page.locator(selector).filter({ hasText: /^\d+$/ }).first(), screen).toHaveText('2');
  }
  await ctx.close();
});

/**
 * The walk above would pass on an empty screen, so this is the other half
 * of it: each screen of the walk shows something of the coach's own. Break
 * a screen's real read and the walk goes quiet while this goes red.
 */
test('every screen of the walk shows the coach’s own data, not an empty state', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser);
  const shows = [
    ['main', /Nadia|Tarek Zaki/],
    ['clients', /Tarek Zaki/],
    [{ screen: 'clientDetail', params: { clientId: 'c-tarek' } }, /Update the CV/],
    // A form: the name sits in an input's value, which is not text
    // content. The goal and the private note are the coach's own rows and
    // are rendered as text, so they are the evidence here.
    [{ screen: 'editClient', params: { clientId: 'c-tarek' } }, /Prefers mornings/],
    ['schedule', /Tarek Zaki/],
    ['availability', /10:00|18:00|6:00/],
    ['messagesInbox', /Tarek Zaki/],
    [{ screen: 'messages', params: { clientId: 'c-tarek' } }, /Two interviews booked/],
    ['notifications', /Tarek Zaki/],
    ['offerings', /Career deep-dive/],
    // An edit form, like editClient: the name is an input's value. The
    // description is this offering's own row and renders as text.
    [{ screen: 'offeringDetail', params: { offeringId: 'off-session' } }, /Map your next role/],
    ['templates', /Interview sprint/],
    [{ screen: 'templateDetail', params: { templateId: 'tpl-sprint' } }, /Mock interview/],
    ['profile', /Nadia Shawky/],
    // Another edit form. The bio and the credential are this coach's own
    // rows and render as text.
    ['editProfile', /Career coach in Alexandria/],
    ['accountDetails', /nadia@example\.com/],
    ['previewProfile', /Nadia Shawky/],
    ['shareProfile', /Nadia Shawky/],
    ['earnings', /Tarek Zaki|1,200|2,000/],
    ['payoutAccount', /8765|Vodafone|vodafone/],
  ];
  for (const [target, expected] of shows) {
    await go(page, target);
    await expect(frame(page), nameOf(target)).toContainText(expected);
  }
  expect(errs).toEqual([]);
  await ctx.close();
});
