import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls, setFailing } from './fakeSupabase.js';

/**
 * SUPABASE-MIGRATION-PLAN.md step 5: messaging signed in — the coach's
 * thread (Messages), their inbox (MessagesInbox) and the member's thread
 * (CoachMessages) on Supabase, live delivery through Realtime, and blocking
 * from either side. Who may send and who may block is proven against the
 * real schema by supabase/tests/18_messaging.sql.
 *
 * Realtime and set_relationship_block() are faked here, on top of
 * tests/fakeSupabase.js, rather than in it.
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

const coachTables = (extra = {}) => ({
  clients: [
    client('c-rana', 'Rana Adel', { member_id: MEMBER, ...extra }),
    client('c-omar', 'Omar Said'),
  ],
  messages: [
    msg('m1', 'c-rana', 'coach', 'How did the week go?', '2026-09-27T08:00:00Z'),
    msg('m2', 'c-rana', 'client', 'Better, slept 7 hours', '2026-09-27T09:00:00Z'),
    msg('m3', 'c-rana', 'client', 'Thanks for the plan', '2026-09-27T10:00:00Z'),
    msg('m4', 'c-omar', 'coach', 'See you Thursday', '2026-09-26T10:00:00Z'),
  ],
  // The coach read Rana's thread after m2, so m3 is unread.
  message_reads: [{ client_id: 'c-rana', reader_role: 'coach', last_read_at: '2026-09-27T09:30:00Z' }],
});

const memberTables = () => ({
  profiles: [{ id: MEMBER, full_name: 'Rana Adel', phone: '', country_code: '+20', email: 'rana@x.com', account_status: 'active' }],
  clients: [client('c-rana', 'Rana Adel', { member_id: MEMBER })],
  coach_directory: [{
    coach_id: COACH, full_name: 'Yara Nabil', title: 'Life coaching', verified: true, rating_count: 0, rating_avg: null,
    bio: '', certifications: [], avatar_photo_url: null, cover_photo_url: null,
  }],
  messages: coachTables().messages.filter((m) => m.client_id === 'c-rana'),
});

/** Realtime channels and the block function, faked in the page. */
function installRealtimeAndBlocks(page, userId) {
  return page.evaluate(async (uid) => {
    const { getSupabase } = await import('/src/lib/supabase.ts');
    const real = getSupabase();
    window.__fake.channels = [];
    real.channel = (name) => {
      const ch = {
        name, handlers: [],
        on(type, filter, cb) { this.handlers.push({ filter, cb }); return this; },
        subscribe() { window.__fake.channels.push(this); window.__fake.calls.push({ op: 'channel.subscribe', name }); return this; },
      };
      return ch;
    };
    real.removeChannel = async (ch) => {
      window.__fake.channels = window.__fake.channels.filter((c) => c !== ch);
      window.__fake.calls.push({ op: 'channel.remove', name: ch.name });
      return 'ok';
    };
    const rpc = real.rpc.bind(real);
    real.rpc = async (fn, args) => {
      if (fn !== 'set_relationship_block') return rpc(fn, args);
      window.__fake.calls.push({ op: 'rpc', fn, args });
      if (window.__fake.fail.includes('rpc.set_relationship_block')) return { data: null, error: { message: 'network down', code: '08006' } };
      const c = (window.__fake.db.clients ?? []).find((x) => x.id === args.p_client);
      if (!c) return { data: { error: 'not_found' }, error: null };
      const at = args.p_blocked ? new Date().toISOString() : null;
      if (c.coach_id === uid) c.blocked_by_coach_at = at;
      else if (c.member_id === uid) c.blocked_by_member_at = at;
      return { data: { blocked_by_member: !!c.blocked_by_member_at, blocked_by_coach: !!c.blocked_by_coach_at }, error: null };
    };
  }, userId);
}

/** The other side sends: the row lands and every matching channel hears it. */
const deliver = (page, row) => page.evaluate((r) => {
  (window.__fake.db.messages ??= []).push(r);
  for (const ch of window.__fake.channels) {
    for (const h of ch.handlers) {
      if (h.filter.table === 'messages' && h.filter.filter === `client_id=eq.${r.client_id}`) h.cb({ new: r });
    }
  }
}, row);

async function open(browser, { role = 'coach', lang = 'en', tables, signedIn = true, screen, params } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
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
  }, [role === 'coach' ? 'coach' : 'client', lang]);
  await page.reload();
  const uid = role === 'coach' ? COACH : MEMBER;
  await installFakeSupabase(page, { userId: uid, tables: tables ?? (role === 'coach' ? coachTables() : memberTables()) });
  await installRealtimeAndBlocks(page, uid);
  if (signedIn) await signIn(page, uid);
  await go(page, screen, params);
  return { page, ctx, errs };
}

async function go(page, screen, params) {
  await page.evaluate(async ([s, p]) => (await import('/src/store/appStore.ts')).useAppStore.getState().nav(p ? { screen: s, params: p } : s), [screen, params]);
  await page.waitForTimeout(300);
}

const frame = (page) => page.locator('.phone-frame').first();
const composer = (page) => page.getByRole('textbox');
const calls = async (page, pred) => (await dbCalls(page)).filter(pred);

// --- The coach's thread ---------------------------------------------------------------

test('coach: the real thread, not the demo one, and sending stores it as the coach', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'messages', params: { clientId: 'c-rana' } });
  await expect(frame(page)).toContainText('Thanks for the plan');
  await expect(frame(page).locator('.messages-bubble')).toHaveCount(3);

  await composer(page).fill('Great — keep it up');
  await composer(page).press('Enter');
  await expect(frame(page).locator('.messages-bubble')).toHaveCount(4);
  const inserts = await calls(page, (c) => c.table === 'messages' && c.op === 'insert');
  expect(inserts.map((c) => c.values)).toEqual([{ client_id: 'c-rana', sender_role: 'coach', sender_id: COACH, body: 'Great — keep it up' }]);
  await expect(composer(page)).toHaveValue('');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('coach: the member\'s reply arrives live, once, and leaving unsubscribes', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'messages', params: { clientId: 'c-rana' } });
  await expect(frame(page).locator('.messages-bubble')).toHaveCount(3);
  const row = msg('m9', 'c-rana', 'client', 'On my way', '2026-09-28T09:00:00Z');
  await deliver(page, row);
  await deliver(page, row); // a duplicate delivery must not show twice
  await expect(frame(page).locator('.messages-bubble')).toHaveCount(4);
  await expect(frame(page)).toContainText('On my way');
  // Another thread's message is not this thread's.
  await deliver(page, msg('m10', 'c-omar', 'client', 'Not for Rana', '2026-09-28T09:01:00Z'));
  await expect(frame(page)).not.toContainText('Not for Rana');

  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForTimeout(200);
  // The thread's own channel closes. The app-wide one for the tab bar's
  // unread badge (store/unread.ts, 'messages:mine') stays open on purpose.
  expect(await page.evaluate(() => window.__fake.channels.map((c) => c.name).filter((n) => n !== 'messages:mine'))).toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('coach: opening the thread marks it read for the coach', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'messages', params: { clientId: 'c-rana' } });
  await expect(frame(page).locator('.messages-bubble')).toHaveCount(3);
  await expect.poll(async () => (await dbRows(page, 'message_reads')).find((r) => r.client_id === 'c-rana' && r.reader_role === 'coach')?.last_read_at)
    .toBe(NOW.toISOString());
  await ctx.close();
});

test('coach: a failed send keeps the draft and says so', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'messages', params: { clientId: 'c-rana' } });
  await expect(frame(page).locator('.messages-bubble')).toHaveCount(3);
  await setFailing(page, ['messages.insert']);
  await composer(page).fill('Are you there?');
  await composer(page).press('Enter');
  await expect(page.getByRole('alert')).toContainText("Couldn't send");
  await expect(composer(page)).toHaveValue('Are you there?');
  await expect(frame(page).locator('.messages-bubble')).toHaveCount(3);
  await ctx.close();
});

// --- Blocking ----------------------------------------------------------------------------

test('coach blocks after confirming, and unblocks', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'messages', params: { clientId: 'c-rana' } });
  await page.getByRole('button', { name: 'Block \u2068Rana\u2069' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await calls(page, (c) => c.fn === 'set_relationship_block')).toEqual([]);

  await page.getByRole('button', { name: 'Block \u2068Rana\u2069' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Block' }).click();
  await expect(frame(page)).toContainText('You blocked Rana. Unblock to message again.');
  await expect(composer(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Unblock \u2068Rana\u2069' }).click();
  await expect(composer(page)).toBeVisible();
  const rpcs = await calls(page, (c) => c.fn === 'set_relationship_block');
  expect(rpcs.map((c) => c.args)).toEqual([{ p_client: 'c-rana', p_blocked: true }, { p_client: 'c-rana', p_blocked: false }]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('coach: blocked by the member, the coach can\'t write and can\'t lift it', async ({ browser }) => {
  const { page, ctx } = await open(browser, {
    tables: coachTables({ blocked_by_member_at: '2026-09-27T12:00:00Z' }), screen: 'messages', params: { clientId: 'c-rana' },
  });
  await expect(frame(page)).toContainText("You can't message Rana — this relationship is blocked.");
  await expect(composer(page)).toHaveCount(0);
  // Their own button still offers Block, not Unblock: the member's block isn't theirs.
  await expect(page.getByRole('button', { name: 'Block \u2068Rana\u2069' })).toBeVisible();
  await ctx.close();
});

test('a failed block says so and changes nothing', async ({ browser }) => {
  const { page, ctx } = await open(browser, { screen: 'messages', params: { clientId: 'c-rana' } });
  await setFailing(page, ['rpc.set_relationship_block']);
  await page.getByRole('button', { name: 'Block \u2068Rana\u2069' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Block' }).click();
  await expect(frame(page)).toContainText("Couldn't update the block.");
  await expect(composer(page)).toBeVisible();
  await ctx.close();
});

// --- The inbox ---------------------------------------------------------------------------

test('coach inbox: real previews, unread counts from message_reads, latest first', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'messagesInbox' });
  const rows = frame(page).locator('.messages-inbox-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Rana Adel');
  await expect(rows.nth(0)).toContainText('Thanks for the plan');
  await expect(rows.nth(0).getByLabel('1 unread')).toBeVisible();
  await expect(rows.nth(1)).toContainText('You: See you Thursday');
  await expect(rows.nth(1).locator('.messages-inbox-badge')).toHaveCount(0);
  await expect(frame(page)).not.toContainText(/Sara Ahmed|Omar Fathy/);
  expect(errs).toEqual([]);
  await ctx.close();
});

// --- The member's thread -------------------------------------------------------------------

test('member: their own coach\'s thread; a send is stored as the member', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { role: 'client', screen: 'coachMessages' });
  await expect(frame(page)).toContainText('Yara Nabil');
  await expect(frame(page).locator('.coach-messages-bubble')).toHaveCount(3);
  await composer(page).fill('See you soon');
  await composer(page).press('Enter');
  await expect(frame(page).locator('.coach-messages-bubble')).toHaveCount(4);
  const inserts = await calls(page, (c) => c.table === 'messages' && c.op === 'insert');
  expect(inserts.map((c) => c.values)).toEqual([{ client_id: 'c-rana', sender_role: 'client', sender_id: MEMBER, body: 'See you soon' }]);
  await deliver(page, msg('m11', 'c-rana', 'coach', 'Great!', '2026-09-28T09:02:00Z'));
  await expect(frame(page)).toContainText('Great!');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('member: blocking their coach', async ({ browser }) => {
  const { page, ctx } = await open(browser, { role: 'client', screen: 'coachMessages' });
  await page.getByRole('button', { name: 'Block \u2068Yara\u2069' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Block' }).click();
  await expect(frame(page)).toContainText('You blocked Yara.');
  expect((await dbRows(page, 'clients'))[0].blocked_by_member_at).not.toBeNull();
  await ctx.close();
});

test('member with no coach yet sees the way to Discover, not the demo thread', async ({ browser }) => {
  const tables = { ...memberTables(), clients: [], messages: [] };
  const { page, ctx } = await open(browser, { role: 'client', tables, screen: 'coachMessages' });
  await expect(frame(page)).toContainText(/no coach yet|No coach yet/i);
  await expect(frame(page)).not.toContainText('Yasmin');
  await ctx.close();
});

// --- Signed out, and Arabic ----------------------------------------------------------------

test('signed out, the demo thread still works and asks Supabase for nothing', async ({ browser }) => {
  const { page, ctx } = await open(browser, { signedIn: false, screen: 'messages', params: { clientId: 'sara' } });
  await composer(page).fill('Demo hello');
  await composer(page).press('Enter');
  await expect(frame(page)).toContainText('Demo hello');
  expect(await calls(page, (c) => c.table === 'messages' || c.fn === 'set_relationship_block')).toEqual([]);
  await ctx.close();
});

test('Arabic: the block confirmation names the member, isolated', async ({ browser }) => {
  const { page, ctx } = await open(browser, { lang: 'ar', screen: 'messages', params: { clientId: 'c-rana' } });
  await page.getByRole('button', { name: /حظر/ }).first().click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('حظر ⁨Rana⁩؟');
  await ctx.close();
});
