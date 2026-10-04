// deno test supabase/functions — no network and no database: the client is
// a recorder, in the same spirit as paymobPayouts_test.ts's fetch recorder.
//
// The point of the recorder is the second half of the brief's requirement.
// "Each action changes only what it should" is not provable by reading the
// reply, so every test asserts the exact list of tables written. A stray
// write shows up as a failure even when the response looks right — which
// is how `approveVerification` is held to touching only
// `verification_requests` and leaving `coach_profiles` to 0005's trigger.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { handleAdminRequest, type Db, type Deps, type Row } from './adminOps.ts';

const AT = '2026-10-03T12:00:00.000Z';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const COACH = '33333333-3333-4333-8333-333333333333';
const REPORT = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';

type Write = { table: string; values: Row; filters: Array<[string, unknown]> };
type Call = { name: string; body: Row; jwt: string };

/**
 * A tiny table store behind the slice of supabase-js that adminOps uses.
 * Writes are recorded AND applied, so a second attempt at the same row
 * really does find it in its new state — that is what makes the
 * "two admins click at once" tests meaningful rather than a mock replay.
 *
 * It does not implement PostgREST: `or()` is recorded and the whole table
 * comes back, and embedded selects are not parsed. Those strings are the
 * part of adminOps.ts only the real project can confirm.
 */
function fake(opts: { jwtUser?: string | null; admins?: string[]; tables?: Record<string, Row[]>; call?: { status: number; body: unknown } }) {
  const tables: Record<string, Row[]> = opts.tables ?? {};
  const admins = opts.admins ?? [];
  const writes: Write[] = [];
  const reads: Array<{ table: string; filters: Array<[string, unknown]>; or?: string; columns?: string }> = [];
  const calls: Call[] = [];

  const matches = (row: Row, filters: Array<[string, unknown]>) => filters.every(([c, v]) => row[c] === v);

  function query(table: string, update: Row | null) {
    const filters: Array<[string, unknown]> = [];
    let or: string | undefined;
    let columns: string | undefined;
    const rows = () => (table === 'admin_users' ? admins.map((id) => ({ profile_id: id })) : (tables[table] ?? []));

    const run = () => {
      if (update) {
        writes.push({ table, values: update, filters: [...filters] });
        const hit = rows().find((r) => matches(r, filters));
        if (!hit) return { data: [], error: null };
        Object.assign(hit, update);
        return { data: [{ ...hit }], error: null };
      }
      reads.push({ table, filters: [...filters], or, columns });
      // `or` is not evaluated: see the note above.
      const found = or ? rows() : rows().filter((r) => matches(r, filters));
      return { data: found.map((r) => ({ ...r })), error: null };
    };

    const q = {
      eq(c: string, v: unknown) { filters.push([c, v]); return q; },
      or(f: string) { or = f; return q; },
      order() { return q; },
      limit() { return q; },
      select(cols?: string) { if (cols) columns = cols; return q; },
      maybeSingle() {
        const { data, error } = run();
        return Promise.resolve({ data: data && data.length ? data[0] : null, error });
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(onFulfilled, onRejected);
      },
    };
    return q;
  }

  const db = {
    auth: {
      getUser: (_jwt: string) =>
        Promise.resolve({ data: { user: opts.jwtUser === undefined ? { id: ADMIN } : opts.jwtUser ? { id: opts.jwtUser } : null } }),
    },
    from: (table: string) => ({
      // Passes the column string through: it is what the embed tests read.
      select: (cols?: string) => query(table, null).select(cols),
      update: (values: Row) => query(table, values),
    }),
  };

  const deps: Deps = {
    db: db as unknown as Db,
    now: () => AT,
    callFunction: (name, body, jwt) => {
      calls.push({ name, body, jwt });
      return Promise.resolve(opts.call ?? { status: 200, body: { requests: [] } });
    },
  };
  return { deps, writes, reads, calls, tables };
}

const openReport = () => ({ id: REPORT, status: 'open', reason: 'no_show', details: 'did not show', coach_id: COACH });
const pendingRequest = () => ({ id: REQUEST, status: 'pending', coach_id: COACH, note: 'certified 2024' });
const activeProfile = () => ({ id: COACH, account_status: 'active', full_name: 'A Coach' });

const ask = (deps: Deps, body: Row, jwt = 'Bearer admin-jwt') => handleAdminRequest(deps, { jwt, body });

// ---------------------------------------------------------------------------
// The guard. These two are the reason the logic is not inside Deno.serve.
// ---------------------------------------------------------------------------

Deno.test('no session: 401, and nothing is read or written', async () => {
  const f = fake({ jwtUser: null, admins: [ADMIN] });
  assertEquals(await ask(f.deps, { op: 'listReports' }), { status: 401, body: { error: 'not_signed_in' } });
  assertEquals(f.writes, []);
  assertEquals(f.reads, []);
});

Deno.test('an empty Authorization header never reaches getUser', async () => {
  const f = fake({ admins: [ADMIN] });
  assertEquals(await ask(f.deps, { op: 'listReports' }, ''), { status: 401, body: { error: 'not_signed_in' } });
  assertEquals(await ask(f.deps, { op: 'listReports' }, 'Bearer   '), { status: 401, body: { error: 'not_signed_in' } });
  assertEquals(f.reads, []);
});

Deno.test('a signed-in non-admin: 403, and nothing happens', async () => {
  // Signed in as an ordinary member, and admin_users is empty of them.
  const f = fake({ jwtUser: MEMBER, admins: [ADMIN], tables: { pro_reports: [openReport()], profiles: [activeProfile()] } });
  for (const body of [
    { op: 'listReports' },
    { op: 'actionReport', report_id: REPORT },
    { op: 'suspend', profile_id: COACH },
    { op: 'approveVerification', request_id: REQUEST },
    { op: 'processDeletion', request_id: REQUEST },
    { op: 'lookupUser', query: 'coach' },
  ]) {
    assertEquals(await ask(f.deps, body), { status: 403, body: { error: 'not_admin' } });
  }
  // The guard runs before every operation, so no table was touched and
  // the deletion function was never called.
  assertEquals(f.writes, []);
  assertEquals(f.calls, []);
  assertEquals(f.tables.pro_reports?.[0].status, 'open');
  assertEquals(f.tables.profiles?.[0].account_status, 'active');
});

Deno.test('an unknown op is refused, not guessed at', async () => {
  const f = fake({ admins: [ADMIN] });
  assertEquals(await ask(f.deps, { op: 'updateTable', table: 'profiles' }), { status: 400, body: { error: 'unknown_op' } });
  assertEquals(await ask(f.deps, { op: 'query', sql: 'select 1' }), { status: 400, body: { error: 'unknown_op' } });
  assertEquals(f.writes, []);
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

Deno.test('listReports reads the open ones and writes nothing', async () => {
  const f = fake({ admins: [ADMIN], tables: { pro_reports: [openReport()] } });
  const out = await ask(f.deps, { op: 'listReports' });
  assertEquals(out.status, 200);
  assertEquals((out.body.reports as Row[]).length, 1);
  assertEquals(f.reads.at(-1)?.filters, [['status', 'open']]);
  assertEquals(f.writes, []);
});

Deno.test('actionReport actions that report, with the note and time, and touches nothing else', async () => {
  const f = fake({ admins: [ADMIN], tables: { pro_reports: [openReport()], profiles: [activeProfile()] } });
  const out = await ask(f.deps, { op: 'actionReport', report_id: REPORT, note: 'Coach warned.' });
  assertEquals(out.status, 200);

  // Exactly one write, to one table.
  assertEquals(f.writes.map((w) => w.table), ['pro_reports']);
  assertEquals(f.writes[0].values, { status: 'actioned', resolved_at: AT, resolution_note: 'Coach warned.' });
  // Conditional on the row still being open, so two admins cannot both action it.
  assertEquals(f.writes[0].filters, [['id', REPORT], ['status', 'open']]);
  // Suspension is a separate decision; actioning a report never suspends.
  assertEquals(f.tables.profiles?.[0].account_status, 'active');
});

Deno.test('dismissReport records the other outcome, not the same one', async () => {
  const f = fake({ admins: [ADMIN], tables: { pro_reports: [openReport()] } });
  assertEquals((await ask(f.deps, { op: 'dismissReport', report_id: REPORT })).status, 200);
  assertEquals(f.writes[0].values.status, 'dismissed');
  // An omitted note is '', so "reviewed, no comment" is distinguishable
  // from a null that could mean the write never landed.
  assertEquals(f.writes[0].values.resolution_note, '');
});

Deno.test('a report already resolved cannot be resolved twice', async () => {
  const f = fake({ admins: [ADMIN], tables: { pro_reports: [openReport()] } });
  assertEquals((await ask(f.deps, { op: 'actionReport', report_id: REPORT })).status, 200);
  const second = await ask(f.deps, { op: 'dismissReport', report_id: REPORT, note: 'oops' });
  assertEquals(second, { status: 409, body: { error: 'not_in_expected_state', expected: 'open' } });
  // The first decision stands.
  assertEquals(f.tables.pro_reports?.[0].status, 'actioned');
  assertEquals(f.tables.pro_reports?.[0].resolution_note, '');
});

Deno.test('bad input is refused before any write', async () => {
  const f = fake({ admins: [ADMIN], tables: { pro_reports: [openReport()] } });
  assertEquals(await ask(f.deps, { op: 'actionReport', report_id: 'all' }), {
    status: 422, body: { error: 'invalid_input', detail: 'report_id must be a uuid' },
  });
  assertEquals((await ask(f.deps, { op: 'actionReport' })).status, 422);
  assertEquals((await ask(f.deps, { op: 'actionReport', report_id: REPORT, note: 'x'.repeat(2001) })).status, 422);
  assertEquals((await ask(f.deps, { op: 'actionReport', report_id: REPORT, note: 42 })).status, 422);
  assertEquals(f.writes, []);
  assertEquals(f.tables.pro_reports?.[0].status, 'open');
});

// ---------------------------------------------------------------------------
// Suspension
// ---------------------------------------------------------------------------

Deno.test('suspend and unsuspend move account_status, and only that', async () => {
  const f = fake({ admins: [ADMIN], tables: { profiles: [activeProfile()] } });
  assertEquals((await ask(f.deps, { op: 'suspend', profile_id: COACH })).status, 200);
  assertEquals(f.tables.profiles?.[0].account_status, 'suspended');
  assertEquals(f.writes.map((w) => w.table), ['profiles']);
  assertEquals(f.writes[0].values, { account_status: 'suspended', updated_at: AT });

  assertEquals((await ask(f.deps, { op: 'unsuspend', profile_id: COACH })).status, 200);
  assertEquals(f.tables.profiles?.[0].account_status, 'active');
});

Deno.test('suspending twice is a 409, not a second write', async () => {
  const f = fake({ admins: [ADMIN], tables: { profiles: [{ ...activeProfile(), account_status: 'suspended' }] } });
  assertEquals(await ask(f.deps, { op: 'suspend', profile_id: COACH }), {
    status: 409, body: { error: 'not_in_expected_state', expected: 'active' },
  });
});

Deno.test('a deleted account is never reactivated', async () => {
  // process_account_deletion() sets 'deleted' at the end of a deletion.
  // Bringing that account back would resurrect someone who asked to be gone.
  const f = fake({ admins: [ADMIN], tables: { profiles: [{ ...activeProfile(), account_status: 'deleted' }] } });
  assertEquals((await ask(f.deps, { op: 'unsuspend', profile_id: COACH })).status, 409);
  assertEquals((await ask(f.deps, { op: 'suspend', profile_id: COACH })).status, 409);
  assertEquals(f.tables.profiles?.[0].account_status, 'deleted');
});

// ---------------------------------------------------------------------------
// Verification — the trigger owns coach_profiles
// ---------------------------------------------------------------------------

Deno.test('approveVerification writes the request only, never coach_profiles', async () => {
  const f = fake({ admins: [ADMIN], tables: { verification_requests: [pendingRequest()], coach_profiles: [{ profile_id: COACH, verification_status: 'pending' }] } });
  const out = await ask(f.deps, { op: 'approveVerification', request_id: REQUEST, note: 'ICF checked' });
  assertEquals(out.status, 200);

  // The whole point: one write, to one table. 0005's
  // verification_requests_sync trigger maps it onto
  // coach_profiles.verification_status, so writing that here as well
  // would give one field two sources of truth.
  assertEquals(f.writes.map((w) => w.table), ['verification_requests']);
  assertEquals(f.writes[0].values, { status: 'approved', reviewed_at: AT, reviewer_note: 'ICF checked' });
  assertEquals(f.writes[0].filters, [['id', REQUEST], ['status', 'pending']]);
  // Untouched here — the database changes it.
  assertEquals(f.tables.coach_profiles?.[0].verification_status, 'pending');
});

Deno.test('rejectVerification is the other outcome, same single write', async () => {
  const f = fake({ admins: [ADMIN], tables: { verification_requests: [pendingRequest()] } });
  assertEquals((await ask(f.deps, { op: 'rejectVerification', request_id: REQUEST, note: 'no evidence' })).status, 200);
  assertEquals(f.writes.map((w) => w.table), ['verification_requests']);
  assertEquals(f.writes[0].values.status, 'rejected');
});

Deno.test('a request already reviewed cannot be reviewed again', async () => {
  const f = fake({ admins: [ADMIN], tables: { verification_requests: [pendingRequest()] } });
  assertEquals((await ask(f.deps, { op: 'approveVerification', request_id: REQUEST })).status, 200);
  assertEquals((await ask(f.deps, { op: 'rejectVerification', request_id: REQUEST })).status, 409);
  assertEquals(f.tables.verification_requests?.[0].status, 'approved');
});

// ---------------------------------------------------------------------------
// The embeds. A fake cannot resolve a PostgREST relationship, so these pin
// the SHAPE the select strings are meant to have — which is the one thing
// that can be checked here, and the thing a first draft got wrong.
// ---------------------------------------------------------------------------

Deno.test('listVerifications embeds through coach_profiles, not straight to profiles', async () => {
  const f = fake({ admins: [ADMIN], tables: { verification_requests: [pendingRequest()] } });
  await ask(f.deps, { op: 'listVerifications' });
  const cols = f.reads.at(-1)?.columns ?? '';

  // verification_requests.coach_id references coach_profiles(profile_id)
  // (0005), and coach_profiles.profile_id references profiles(id) (0001).
  // There is no verification_requests -> profiles relationship at all, so
  // asking for one is an error from the database every time.
  assert(cols.includes('coach:coach_profiles!coach_id('), `embed must go through coach_profiles: ${cols}`);
  assert(cols.includes('profile:profiles!profile_id('), `and then on to profiles: ${cols}`);
  assert(!cols.includes('coach:profiles!'), `must not embed profiles directly: ${cols}`);
});

Deno.test('listReports names the joining column, because pro_reports points at profiles twice', async () => {
  const f = fake({ admins: [ADMIN], tables: { pro_reports: [openReport()] } });
  await ask(f.deps, { op: 'listReports' });
  const cols = f.reads.at(-1)?.columns ?? '';

  // reporter_id and coach_id both reference profiles(id) (0005), so an
  // unqualified `profiles(...)` is ambiguous and PostgREST refuses it.
  assert(cols.includes('reporter:profiles!reporter_id('), `reporter embed must name its column: ${cols}`);
  assert(cols.includes('coach:profiles!coach_id('), `coach embed must name its column: ${cols}`);
});

Deno.test('listVerifications reads the pending ones and writes nothing', async () => {
  const f = fake({ admins: [ADMIN], tables: { verification_requests: [pendingRequest()] } });
  const out = await ask(f.deps, { op: 'listVerifications' });
  assertEquals(out.status, 200);
  assertEquals(f.reads.at(-1)?.filters, [['status', 'pending']]);
  assertEquals(f.writes, []);
});

// ---------------------------------------------------------------------------
// Deletions — delegated, not re-implemented
// ---------------------------------------------------------------------------

Deno.test('processDeletion delegates to account-deletion as the caller, and writes nothing itself', async () => {
  const f = fake({ admins: [ADMIN], call: { status: 200, body: { request_id: REQUEST, auth: 'delete' } } });
  const out = await ask(f.deps, { op: 'processDeletion', request_id: REQUEST });
  assertEquals(out, { status: 200, body: { request_id: REQUEST, auth: 'delete' } });
  assertEquals(f.calls, [{ name: 'account-deletion', body: { action: 'process', request_id: REQUEST }, jwt: 'admin-jwt' }]);
  // No deletion logic here: Storage, the login and the queue row are all
  // that function's, in an order that is safe to re-run.
  assertEquals(f.writes, []);
});

Deno.test("account-deletion's refusal reaches the admin unflattened", async () => {
  // 55006 is "something is still open", and the message names what. An
  // admin needs that, not a 500.
  const f = fake({ admins: [ADMIN], call: { status: 409, body: { error: 'not_processed', code: '55006', detail: 'an unsettled payout remains' } } });
  const out = await ask(f.deps, { op: 'processDeletion', request_id: REQUEST });
  assertEquals(out.status, 409);
  assertEquals(out.body.detail, 'an unsettled payout remains');
});

Deno.test('processDeletion validates the id before calling anything', async () => {
  const f = fake({ admins: [ADMIN] });
  assertEquals((await ask(f.deps, { op: 'processDeletion', request_id: 'latest' })).status, 422);
  assertEquals(f.calls, []);
});

Deno.test('listDeletions delegates too, rather than reading the table twice', async () => {
  const f = fake({ admins: [ADMIN], call: { status: 200, body: { requests: [] } } });
  assertEquals((await ask(f.deps, { op: 'listDeletions' })).status, 200);
  assertEquals(f.calls, [{ name: 'account-deletion', body: { action: 'list' }, jwt: 'admin-jwt' }]);
});

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

Deno.test('lookupUser searches email and name, and writes nothing', async () => {
  const f = fake({ admins: [ADMIN], tables: { profiles: [activeProfile()] } });
  const out = await ask(f.deps, { op: 'lookupUser', query: 'coach' });
  assertEquals(out.status, 200);
  assertEquals(f.reads.at(-1)?.or, 'email.ilike.%coach%,full_name.ilike.%coach%');
  assertEquals(f.writes, []);
});

Deno.test('lookupUser refuses a term too short to be a search', async () => {
  const f = fake({ admins: [ADMIN], tables: { profiles: [activeProfile()] } });
  assertEquals((await ask(f.deps, { op: 'lookupUser', query: 'a' })).status, 422);
  assertEquals((await ask(f.deps, { op: 'lookupUser', query: '' })).status, 422);
  assertEquals((await ask(f.deps, { op: 'lookupUser', query: 42 })).status, 422);
  // The admin_users check is itself a read, so the assertion is that
  // `profiles` was never searched — not that nothing was read at all.
  assertEquals(f.reads.filter((r) => r.table === 'profiles'), []);
});

Deno.test("a lookup term cannot break out of PostgREST's filter grammar", async () => {
  const f = fake({ admins: [ADMIN], tables: { profiles: [activeProfile()] } });
  // Commas and parens would otherwise add conditions to the or() filter.
  await ask(f.deps, { op: 'lookupUser', query: 'a%,role.eq.admin,x(' });
  assertEquals(f.reads.at(-1)?.or, 'email.ilike.%a  role.eq.admin x%,full_name.ilike.%a  role.eq.admin x%');
});
