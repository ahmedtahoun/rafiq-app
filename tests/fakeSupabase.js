/**
 * An in-page stand-in for the Supabase client, for screens that read and
 * write real rows once someone is signed in.
 *
 * The recorder stubs in native-oauth.spec.js / admin-queues.spec.js fake one
 * call each; profile screens chain select/eq/maybeSingle, update/eq/select
 * and storage uploads, so this keeps small in-memory tables instead and lets
 * a test assert on the rows that landed, not only on what was sent. Nothing
 * leaves the browser (tests/README.md, "Supabase configuration").
 *
 * It does not enforce RLS or column grants — supabase/tests/07_profiles.sql
 * does that against the real schema. Two things it does model, because
 * screens depend on them: a primary-key conflict on insert (23505), and 0005's
 * sync_verification_status trigger (filing a verification request makes the
 * coach's verification_status read 'pending').
 *
 * Usage, before signing in:
 *   await installFakeSupabase(page, { userId, tables: { profiles: [...] } });
 *   await signIn(page, userId);
 * then read back with dbRows(page, 'profiles') / dbCalls(page).
 */

const KEYS = {
  profiles: 'id', coach_profiles: 'profile_id', member_profiles: 'profile_id', coach_payout_accounts: 'coach_id',
  client_private: 'client_id', packages: 'client_id',
};

// A 1×1 PNG, so a signed photo URL renders without a network request.
export const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function installFakeSupabase(page, { userId = 'user-123', tables = {}, fail = [] } = {}) {
  return page.evaluate(async ({ userId, tables, fail, KEYS, TINY_PNG_DATA_URL }) => {
    const { getSupabase } = await import('/src/lib/supabase.ts');
    const real = getSupabase();

    const db = {};
    for (const [name, rows] of Object.entries(tables)) {
      db[name] = rows.map((r) => ({ ...r }));
    }
    window.__fake = { db, calls: [], fail: [...fail] };
    const log = (entry) => window.__fake.calls.push(JSON.parse(JSON.stringify(entry)));
    const failing = (what) => window.__fake.fail.includes(what);
    const NETWORK = { message: 'network down', code: '08006' };

    function run(q) {
      log({ table: q.table, op: q.op, values: q.values ?? null, filters: q.filters, ...(q.columns ? { columns: q.columns } : {}), ...(q.order ? { order: q.order } : {}) });
      if (failing(q.table) || failing(`${q.table}.${q.op}`)) return { data: null, error: NETWORK };
      const rows = (db[q.table] ??= []);
      const test = (r, [c, v, op]) =>
        op === 'in' ? v.includes(r[c])
          : op === 'gte' ? Date.parse(r[c]) >= Date.parse(v)
            : op === 'lt' ? Date.parse(r[c]) < Date.parse(v)
              : r[c] === v;
      const matches = rows.filter((r) => q.filters.every((f) => test(r, f)));

      if (q.op === 'select') {
        if (q.order) {
          const [col, asc] = q.order;
          matches.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
        }
        return { data: q.single ? matches[0] ?? null : matches, error: null };
      }
      if (q.op === 'update') {
        for (const r of matches) Object.assign(r, q.values);
        return { data: q.returning ? matches.map((r) => ({ ...r })) : null, error: null };
      }
      if (q.op === 'delete') {
        db[q.table] = rows.filter((r) => !matches.includes(r));
        return { data: null, error: null };
      }
      // insert
      const key = KEYS[q.table] ?? 'id';
      const row = { ...q.values };
      if (!(key in row)) row[key] = `${q.table}-${rows.length + 1}`;
      if (rows.some((r) => r[key] === row[key])) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
      }
      rows.push(row);
      if (q.table === 'verification_requests') {
        const coach = (db.coach_profiles ??= []).find((r) => r.profile_id === row.coach_id);
        if (coach) coach.verification_status = 'pending';
      }
      if (!q.returning) return { data: null, error: null };
      return { data: q.single ? { ...row } : [{ ...row }], error: null };
    }

    real.from = (table) => {
      const q = { table, op: 'select', values: null, filters: [], single: false, returning: false, order: null };
      const b = {
        select(columns) { if (q.op !== 'select') q.returning = true; else q.columns = columns ?? '*'; return b; },
        update(values) { q.op = 'update'; q.values = values; return b; },
        insert(values) { q.op = 'insert'; q.values = values; return b; },
        delete() { q.op = 'delete'; return b; },
        eq(col, val) { q.filters.push([col, val]); return b; },
        in(col, vals) { q.filters.push([col, vals, 'in']); return b; },
        // Timestamps only: compared as instants, as Postgres does.
        gte(col, val) { q.filters.push([col, val, 'gte']); return b; },
        lt(col, val) { q.filters.push([col, val, 'lt']); return b; },
        order(col, { ascending = true } = {}) { q.order = [col, ascending]; return b; },
        maybeSingle() { q.single = true; return b; },
        single() { q.single = true; return b; },
        then(resolve, reject) { return Promise.resolve().then(() => run(q)).then(resolve, reject); },
      };
      return b;
    };

    // 0010's accept_session_request, as the database runs it: the same
    // refusals (by SQLSTATE), then the request, roster row, booked block,
    // session and next session in one step. 13_accept_flow.sql proves the
    // real function; this lets screens drive it.
    const refuse = (code) => ({ data: null, error: { message: `refused (${code})`, code } });
    // 0011's reschedule_booking / cancel_booking, the same way: the same
    // refusals, then block, session and next session together.
    // 15_booking_changes.sql proves the real ones.
    function refreshNext(clientId) {
      const client = (db.clients ??= []).find((c) => c.id === clientId);
      if (!client) return;
      const next = (db.sessions ??= [])
        .filter((x) => x.client_id === clientId && Date.parse(x.scheduled_at) > Date.now() && !x.attendance)
        .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
      client.next_session_at = next ? next.scheduled_at : null;
      client.next_session_type = next ? ((db.time_blocks ?? []).find((b) => b.id === next.time_block_id)?.session_type ?? null) : null;
    }
    function changeBooking(fn, args) {
      const blocks = (db.time_blocks ??= []);
      const b = blocks.find((x) => x.id === args.p_block && x.coach_id === userId);
      if (!b) return refuse('P0002');
      if (b.kind !== 'booked' || !b.client_id) return refuse('55000');
      if (Date.parse(b.starts_at) <= Date.now()) return refuse('22023');
      const sessions = (db.sessions ??= []);
      if (fn === 'reschedule_booking') {
        const start = Date.parse(args.p_start);
        if (start <= Date.now()) return refuse('22023');
        const end = start + (Date.parse(b.ends_at) - Date.parse(b.starts_at));
        if (blocks.some((o) => o.id !== b.id && o.coach_id === userId && o.kind === 'booked' && Date.parse(o.starts_at) < end && Date.parse(o.ends_at) > start)) {
          return refuse('23P01');
        }
        b.starts_at = new Date(start).toISOString();
        b.ends_at = new Date(end).toISOString();
        for (const x of sessions) if (x.time_block_id === b.id) x.scheduled_at = b.starts_at;
      } else {
        const hours = Math.round((Date.parse(b.starts_at) - Date.now()) / 36000) / 100;
        (db.cancellations ??= []).push({
          id: `cancellations-${db.cancellations.length + 1}`, client_id: b.client_id, time_block_id: null,
          cancelled_by_role: 'coach', cancelled_by: userId, hours_until_session: hours, within_grace: hours >= 12, reason: null,
        });
        for (const x of sessions) {
          if (x.time_block_id === b.id) Object.assign(x, { attendance: 'cancelled', attendance_set_by: 'coach', time_block_id: null });
        }
        db.time_blocks = blocks.filter((x) => x !== b);
      }
      refreshNext(b.client_id);
      return { data: null, error: null };
    }

    real.rpc = async (fn, args) => {
      log({ op: 'rpc', fn, args });
      if (failing(`rpc.${fn}`)) return { data: null, error: NETWORK };
      if (fn === 'reschedule_booking' || fn === 'cancel_booking') return changeBooking(fn, args);
      if (fn !== 'accept_session_request') return refuse('42883');
      const r = (db.session_requests ??= []).find((x) => x.id === args.p_request && x.coach_id === userId);
      if (!r) return refuse('P0002');
      if (r.status !== 'pending') return refuse('55000');
      const start = Date.parse(r.requested_start);
      if (start <= Date.now()) return refuse('22023');
      const intro = !r.offering_id && Number(r.price) === 0;
      const end = start + (intro ? 20 : 50) * 60000;
      const blocks = (db.time_blocks ??= []);
      if (blocks.some((b) => b.coach_id === userId && b.kind === 'booked' && Date.parse(b.starts_at) < end && Date.parse(b.ends_at) > start)) {
        return refuse('23P01');
      }
      r.status = 'accepted';
      r.responded_at = new Date().toISOString();
      const who = (db.profiles ??= []).find((p) => p.id === r.member_id) ?? {};
      const offering = (db.offerings ??= []).find((o) => o.id === r.offering_id);
      const clients = (db.clients ??= []);
      let client = clients.find((c) => c.coach_id === userId && c.member_id === r.member_id);
      const name = who.full_name ?? '';
      if (!client) {
        client = {
          id: `clients-${clients.length + 1}`, coach_id: userId, member_id: r.member_id, full_name: name,
          initials: name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase(),
          avatar_bg: '#3E6FB0', phone: who.phone ?? null, country_code: who.country_code ?? null, email: who.email ?? null,
          program: offering?.name ?? '', plan: 'Basic', specialty: '', age: null, city: null, goal: '', focus: '',
          active: true, progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null,
          program_completed: false, payment_status: 'due', signup_completed_at: null, created_at: new Date().toISOString(),
        };
        clients.push(client);
      } else {
        client.active = true;
      }
      const block = {
        id: `time_blocks-${blocks.length + 1}`, coach_id: userId, client_id: client.id, kind: 'booked',
        label: `Session · ${name}`, starts_at: r.requested_start, ends_at: new Date(end).toISOString(), session_type: intro ? 'intro' : 'standard',
      };
      blocks.push(block);
      const sessions = (db.sessions ??= []);
      sessions.push({ id: `sessions-${sessions.length + 1}`, client_id: client.id, scheduled_at: r.requested_start, time_block_id: block.id, recap: null, attendance: null });
      const next = sessions
        .filter((x) => x.client_id === client.id && Date.parse(x.scheduled_at) > Date.now() && !x.attendance)
        .map((x) => Date.parse(x.scheduled_at))
        .sort((a, b) => a - b)[0];
      if (next === start) {
        client.next_session_at = r.requested_start;
        client.next_session_type = intro ? 'intro' : 'standard';
      }
      return { data: client.id, error: null };
    };

    real.auth.getUser = async () => ({ data: { user: userId ? { id: userId } : null }, error: null });
    real.auth.signOut = async () => { log({ op: 'auth.signOut' }); return { error: null }; };

    const storage = {
      from: (bucket) => ({
        upload: async (path, file, opts) => {
          log({ op: 'storage.upload', bucket, path, size: file.size, contentType: opts?.contentType });
          return failing('storage.upload') ? { data: null, error: NETWORK } : { data: { path }, error: null };
        },
        createSignedUrl: async () => ({ data: { signedUrl: TINY_PNG_DATA_URL }, error: null }),
        remove: async (paths) => { log({ op: 'storage.remove', bucket, paths }); return { data: [], error: null }; },
      }),
    };
    Object.defineProperty(real, 'storage', { value: storage, configurable: true });
  }, { userId, tables, fail, KEYS, TINY_PNG_DATA_URL });
}

/** Marks the app signed in as `userId`, the way session.ts does after a
    real sign-in — without routing, so a test can then nav wherever. */
export function signIn(page, userId = 'user-123') {
  return page.evaluate(async (uid) => {
    const { useAppStore } = await import('/src/store/appStore.ts');
    useAppStore.getState().setSession(uid);
  }, userId);
}

export const dbRows = (page, table) => page.evaluate((t) => window.__fake.db[t] ?? [], table);
export const dbCalls = (page) => page.evaluate(() => window.__fake.calls);
export const setFailing = (page, fail) => page.evaluate((f) => { window.__fake.fail = f; }, fail);
