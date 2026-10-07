import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { IGNORED_CONSOLE, installScreenSettle } from './helpers.js';
import { installFakeSupabase, signIn, dbCalls, MAX_ROWS } from './fakeSupabase.js';

/**
 * Profile → Privacy → "Download my data" (DownloadMyData.tsx,
 * memberExport.ts): one JSON file of everything about the member they can
 * read, Law 151/2020's right of access. The fake doesn't model RLS, so the
 * tables here also hold another member's rows: the export must leave them
 * out by asking for the member's own, and never read the coach's private
 * notes at all.
 *
 * The clock is pinned to Tue 6 Oct 2026, 12:00 in Cairo (UTC+3).
 */

const MEMBER = 'member-1';
const OTHER = 'member-2';
const COACH = 'coach-a';
const NOW = new Date('2026-10-06T09:00:00Z');

const rel = (id, memberId, name) => ({
  id, coach_id: COACH, member_id: memberId, full_name: name, age: null, phone: '', country_code: '+20', email: null, city: null,
  program: '', specialty: 'Career coaching', plan: 'Basic', initials: 'HM', avatar_bg: '#3E6FB0', active: true, progress: 0,
  needs_checkin: false, next_session_at: null, next_session_type: null, program_completed: false, payment_status: 'due',
  goal: 'A new role', focus: '', signup_completed_at: null, created_at: '2026-09-01T00:00:00Z',
});

const tables = () => ({
  profiles: [
    { id: MEMBER, full_name: 'Hana Mostafa', phone: '1001234567', country_code: '+20', email: 'hana@x.com', account_status: 'active', role: 'client' },
    { id: OTHER, full_name: 'Omar Other', phone: '', country_code: '+20', email: 'omar@x.com', account_status: 'active', role: 'client' },
    { id: COACH, full_name: 'Dina Farouk', role: 'coach', account_status: 'active', avatar_photo_url: null },
  ],
  member_profiles: [
    { profile_id: MEMBER, goal: 'Find a new job', focus: 'career', signup_completed_at: '2026-09-01T00:00:00Z' },
    { profile_id: OTHER, goal: 'OTHER-GOAL', focus: 'life', signup_completed_at: '2026-09-01T00:00:00Z' },
  ],
  coach_profiles: [{ profile_id: COACH, title: 'Career coaching' }],
  coach_directory: [{ coach_id: COACH, full_name: 'Dina Farouk', title: 'Career coaching', verified: true, rating_count: 0, rating_avg: null, bio: '', certifications: [], avatar_photo_url: null, cover_photo_url: null }],
  clients: [rel('rel-a', MEMBER, 'Hana Mostafa'), rel('rel-x', OTHER, 'Omar Other')],
  client_private: [{ client_id: 'rel-a', notes: 'COACH-PRIVATE-NOTE', is_favourite: false }],
  tasks: [
    { id: 't1', client_id: 'rel-a', title: 'Update your CV', done: false, due_at: '2026-10-08T09:00:00Z', created_at: '2026-10-01T09:00:00Z' },
    { id: 't9', client_id: 'rel-x', title: 'OTHER-TASK', done: false, due_at: null, created_at: '2026-10-01T09:00:00Z' },
  ],
  sessions: [{ id: 's1', client_id: 'rel-a', scheduled_at: '2026-10-01T09:00:00Z', attendance: 'attended', recap: 'Mapped two roles' }],
  mood_checkins: [{ id: 'm1', client_id: 'rel-a', mood: 'good', created_at: '2026-10-02T09:00:00Z' }],
  messages: [
    { id: 'msg1', client_id: 'rel-a', sender_role: 'client', sender_id: MEMBER, body: 'See you Thursday', created_at: '2026-10-03T09:00:00Z' },
    { id: 'msg9', client_id: 'rel-x', sender_role: 'client', sender_id: OTHER, body: 'OTHER-MESSAGE', created_at: '2026-10-03T09:00:00Z' },
  ],
  ratings: [{ id: 'r1', client_id: 'rel-a', coach_id: COACH, session_id: 's1', rating: 5, comment: 'Very clear.', created_at: '2026-10-02T09:00:00Z' }],
  agreements: [], packages: [], payments: [], enrollments: [], time_blocks: [], message_reads: [], weekly_availability: [],
  session_requests: [{ id: 'req1', member_id: MEMBER, coach_id: COACH, status: 'accepted', created_at: '2026-09-01T00:00:00Z' }],
  favourite_coaches: [{ member_id: MEMBER, coach_id: COACH, created_at: '2026-09-02T00:00:00Z' }],
  notifications: [
    { id: 'n1', recipient_id: MEMBER, kind: 'request-accepted', read: false, created_at: '2026-09-01T00:00:00Z' },
    { id: 'n9', recipient_id: OTHER, kind: 'OTHER-NOTE', read: false, created_at: '2026-09-01T00:00:00Z' },
  ],
});

async function open(browser, { lang = 'en', dark = false, signedIn = true, fail = [], data = tables() } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true });
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
    await installFakeSupabase(page, { userId: MEMBER, tables: data, fail });
    await signIn(page, MEMBER);
  }
  await page.evaluate(async () => (await import('/src/store/appStore.ts')).useAppStore.getState().nav('clientProfile'));
  await page.evaluate(() => window.__screenSettled());
  return { page, ctx, errs };
}

const COPY = {
  en: { section: 'Privacy', button: 'Download my data' },
  ar: { section: 'الخصوصية', button: 'تنزيل بياناتي' },
};
const wholeRows = async (page) => (await dbCalls(page)).filter((c) => c.op === 'select' && c.columns === '*');

for (const [lang, dark] of [['en', false], ['ar', true]]) {
  test(`the member downloads everything about them, and nobody else's (${lang}${dark ? ', dark' : ''})`, async ({ browser }) => {
    const { page, ctx, errs } = await open(browser, { lang, dark });
    const section = page.locator('.client-profile-privacy');
    await expect(section.locator('.client-profile-section-label')).toHaveText(COPY[lang].section);
    // Nothing is gathered until they ask.
    expect(await wholeRows(page)).toEqual([]);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      section.getByRole('button', { name: new RegExp(COPY[lang].button) }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('rafiq-my-data-2026-10-06.json');
    const file = await readFile(await download.path(), 'utf8');
    const data = JSON.parse(file);

    expect([data.format, data.version, data.exported_at]).toEqual(['rafiq-member-export', 1, NOW.toISOString()]);
    expect([data.profile.id, data.profile.email, data.goals.goal]).toEqual([MEMBER, 'hana@x.com', 'Find a new job']);
    expect(data.relationships.map((r) => r.relationship.id)).toEqual(['rel-a']);
    const [r] = data.relationships;
    expect([r.tasks.map((x) => x.title), r.sessions.map((x) => x.recap), r.check_ins.map((x) => x.mood)])
      .toEqual([['Update your CV'], ['Mapped two roles'], ['good']]);
    expect([r.messages.map((x) => x.body), r.reviews.map((x) => x.comment)]).toEqual([['See you Thursday'], ['Very clear.']]);
    expect([data.session_requests.length, data.favourite_coaches.length, data.notifications.map((n) => n.id)]).toEqual([1, 1, ['n1']]);
    // Never another member's rows, and never the coach's private notes.
    expect(file).not.toMatch(/OTHER-|omar@x\.com|COACH-PRIVATE-NOTE/);
    expect((await dbCalls(page)).some((c) => c.table === 'client_private' && c.columns === '*')).toBe(false);

    // A second try is one tap away.
    await expect(section.locator('.client-profile-download-link')).toContainText('rafiq-my-data-2026-10-06.json');
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test('a long conversation comes out whole, past the API\'s row limit', async ({ browser }) => {
  // The fake returns at most MAX_ROWS rows to one request, as the real API
  // does with supabase/config.toml's max_rows, and says nothing about it.
  expect((await readFile('supabase/config.toml', 'utf8')).match(/^max_rows = (\d+)$/m)?.[1]).toBe(String(MAX_ROWS));
  const data = tables();
  const many = (n, row) => Array.from({ length: n }, (_, i) => row(String(i).padStart(4, '0')));
  data.messages.push(...many(1500, (i) => ({ id: `msg-${i}`, client_id: 'rel-a', sender_role: 'coach', sender_id: COACH, body: `Message ${i}`, created_at: '2026-10-04T09:00:00Z' })));
  data.notifications.push(...many(1200, (i) => ({ id: `n-${i}`, recipient_id: MEMBER, kind: 'message', read: true, created_at: '2026-10-04T09:00:00Z' })));
  const { page, ctx, errs } = await open(browser, { data });

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download my data/ }).click()]);
  const out = JSON.parse(await readFile(await download.path(), 'utf8'));
  const ids = out.relationships[0].messages.map((m) => m.id);
  expect([ids.length, new Set(ids).size]).toEqual([1501, 1501]);
  expect(ids).toContain('msg-1499');
  expect(out.notifications).toHaveLength(1201);
  // A page at a time, in the key's order, until a page comes back short.
  // (Only the export's: Profile reads messages for its own reasons too.)
  const reads = (await dbCalls(page)).filter((c) => c.table === 'messages' && c.op === 'select' && c.columns === '*');
  expect(reads.map((c) => [c.order, c.range])).toEqual([[['id', true], [0, 999]], [['id', true], [1000, 1999]]]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a read that fails says so and hands over nothing', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await page.evaluate(() => { window.__fake.fail = ['mood_checkins']; });
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.getByRole('button', { name: /Download my data/ }).click();
  await expect(page.locator('.client-profile-download-error')).toHaveText("Couldn't prepare your data. Please try again.");
  await expect(page.locator('.client-profile-download-link')).toHaveCount(0);
  expect(downloaded).toBe(false);

  // Try again, once the read works.
  await page.evaluate(() => { window.__fake.fail = []; });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download my data/ }).click()]);
  expect(JSON.parse(await readFile(await download.path(), 'utf8')).relationships[0].check_ins).toHaveLength(1);
  await ctx.close();
});

test('signed out, there is no account to export', async ({ browser }) => {
  const { page, ctx } = await open(browser, { signedIn: false });
  await expect(page.locator('.client-profile-section-label').first()).toBeVisible();
  await expect(page.locator('.client-profile-privacy')).toHaveCount(0);
  await ctx.close();
});
