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
    // refuse: { 'table.op': 'SQLSTATE' } — a write the database would
    // refuse under its policies (RLS isn't modelled), e.g. '42501'.
    window.__fake = { db, calls: [], fail: [...fail], refuse: {} };
    const log = (entry) => window.__fake.calls.push(JSON.parse(JSON.stringify(entry)));
    const failing = (what) => window.__fake.fail.includes(what);
    const NETWORK = { message: 'network down', code: '08006' };

    function run(q) {
      log({ table: q.table, op: q.op, values: q.values ?? null, filters: q.filters, ...(q.columns ? { columns: q.columns } : {}), ...(q.order ? { order: q.order } : {}), ...(q.limit != null ? { limit: q.limit } : {}) });
      if (failing(q.table) || failing(`${q.table}.${q.op}`)) return { data: null, error: NETWORK };
      const refused = window.__fake.refuse[`${q.table}.${q.op}`];
      if (refused) return { data: null, error: { message: `refused (${refused})`, code: refused } };
      const rows = (db[q.table] ??= []);
      const test = (r, [c, v, op]) =>
        op === 'in' ? v.includes(r[c])
          : op === 'gte' ? Date.parse(r[c]) >= Date.parse(v)
            : op === 'lt' ? Date.parse(r[c]) < Date.parse(v)
              // is(col, null): a missing column reads as null, as in Postgres.
              : op === 'is' ? (r[c] ?? null) === v
                : r[c] === v;
      const matches = rows.filter((r) => q.filters.every((f) => test(r, f)));

      if (q.op === 'select') {
        if (q.order) {
          const [col, asc] = q.order;
          matches.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
        }
        const limited = q.limit != null ? matches.slice(0, q.limit) : matches;
        return { data: q.single ? limited[0] ?? null : limited, error: null };
      }
      if (q.op === 'update') {
        for (const r of matches) Object.assign(r, q.values);
        return { data: q.returning ? matches.map((r) => ({ ...r })) : null, error: null };
      }
      if (q.op === 'delete') {
        db[q.table] = rows.filter((r) => !matches.includes(r));
        return { data: q.returning ? matches.map((r) => ({ ...r })) : null, error: null };
      }
      // insert
      const key = KEYS[q.table] ?? 'id';
      // Column defaults the app relies on, as Postgres would fill them (0001).
      const DEFAULTS = {
        offerings: { active: true, currency: 'EGP', created_at: new Date().toISOString() },
        templates: { created_at: new Date().toISOString() },
      };
      const row = { ...DEFAULTS[q.table], ...q.values };
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
        is(col, val) { q.filters.push([col, val, 'is']); return b; },
        order(col, { ascending = true } = {}) { q.order = [col, ascending]; return b; },
        limit(n) { q.limit = n; return b; },
        maybeSingle() { q.single = true; return b; },
        single() { q.single = true; return b; },
        // window.__fake.held[table], a promise, keeps that table's reads
        // waiting until it resolves: what a screen shows while one read is
        // still on its way.
        then(resolve, reject) { return Promise.resolve(window.__fake.held?.[table]).then(() => run(q)).then(resolve, reject); },
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
        if (blocks.some((o) => o.id !== b.id && o.coach_id === userId && ['booked', 'busy'].includes(o.kind) && Date.parse(o.starts_at) < end && Date.parse(o.ends_at) > start)) {
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
        // A move request for it goes with it (0017's on delete cascade).
        db.session_requests = (db.session_requests ?? []).filter((x) => x.reschedule_of !== b.id);
      }
      refreshNext(b.client_id);
      return { data: null, error: null };
    }

    // 0012's mark_attendance, the same way: its refusals, then one package
    // credit for held or missed (never a free intro, never past the total)
    // and the session marked. 16_mark_attendance.sql proves the real one.
    function markAttendance(args) {
      if (args.p_outcome === 'cancelled') return refuse('23514');
      const x = (db.sessions ??= []).find((r) => r.id === args.p_session);
      const client = x && (db.clients ??= []).find((c) => c.id === x.client_id && c.coach_id === userId);
      if (!client) return refuse('P0002');
      if (x.attendance) return refuse('55000');
      if (Date.parse(x.scheduled_at) > Date.now()) return refuse('22023');
      let charged = false;
      if (args.p_outcome !== 'disputed') {
        const block = (db.time_blocks ?? []).find((b) => b.id === x.time_block_id);
        const pkg = (db.packages ??= []).find((p) => p.client_id === x.client_id);
        if (block?.session_type !== 'intro' && pkg && pkg.used < pkg.total) {
          pkg.used += 1;
          charged = true;
        }
      }
      Object.assign(x, { attendance: args.p_outcome, attendance_set_by: 'coach', attendance_set_at: new Date().toISOString() });
      return { data: charged, error: null };
    }

    // 0013's member_cancel_session, the same way: the member's own session
    // only, then the record, the session cancelled, the block freed, a
    // credit for a late cancel (never a free intro), and the next session.
    // 17_member_cancel_session.sql proves the real one.
    function memberCancel(args) {
      const x = (db.sessions ??= []).find((r) => r.id === args.p_session);
      const client = x && (db.clients ??= []).find((c) => c.id === x.client_id && c.member_id === userId);
      if (!client) return refuse('P0002');
      if (x.attendance) return refuse('55000');
      if (Date.parse(x.scheduled_at) <= Date.now()) return refuse('22023');
      const blocks = (db.time_blocks ??= []);
      const block = blocks.find((b) => b.id === x.time_block_id);
      const hours = Math.round((Date.parse(x.scheduled_at) - Date.now()) / 36000) / 100;
      const late = hours < 12;
      (db.cancellations ??= []).push({
        id: `cancellations-${db.cancellations.length + 1}`, client_id: x.client_id, time_block_id: x.time_block_id,
        cancelled_by_role: 'client', cancelled_by: userId, hours_until_session: hours, within_grace: !late, reason: null,
      });
      Object.assign(x, { attendance: 'cancelled', attendance_set_by: 'client', attendance_set_at: new Date().toISOString() });
      db.time_blocks = blocks.filter((b) => b !== block);
      if (block) db.session_requests = (db.session_requests ?? []).filter((r) => r.reschedule_of !== block.id);
      let charged = false;
      const pkg = (db.packages ??= []).find((p) => p.client_id === x.client_id);
      if (late && block?.session_type !== 'intro' && pkg && pkg.used < pkg.total) {
        pkg.used += 1;
        charged = true;
      }
      refreshNext(x.client_id);
      return { data: charged, error: null };
    }

    // 0013's four invite functions. They *return* refusals as
    // {error: '...'} rather than raising, because a raised error would roll
    // back the rate-limit attempt they counted — so these do the same, and
    // the failure counter is modelled too, since it changes behaviour.
    const DAY = 86400000;
    function inviteCheck(code) {
      const norm = String(code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
      const me = (db.profiles ??= []).find((p) => p.id === userId);
      const attempts = (db.client_invite_attempts ??= []);
      const fail = (err) => {
        attempts.push({ profile_id: userId, at: Date.now() });
        return { err };
      };
      if (!userId) return { err: 'not_signed_in' };
      if (me?.role === 'coach') return fail('not_a_member');
      if (attempts.filter((a) => a.profile_id === userId && a.at > Date.now() - 3600000).length >= 10) {
        return { err: 'rate_limited' };
      }
      const c = (db.clients ??= []).find((x) => x.invite_code && x.invite_code === norm);
      if (!c) return fail('not_found');
      if (c.invite_expires_at && Date.parse(c.invite_expires_at) <= Date.now()) return fail('expired');
      if (c.coach_id === userId) return fail('own_invite');
      if (c.member_id === userId) return { c, err: 'already_linked' };
      if (c.member_id) return fail('already_used');
      return { c };
    }
    function clientInvite(fn, args) {
      const clients = (db.clients ??= []);
      if (fn === 'create_client_invite') {
        const c = clients.find((x) => x.id === args.p_client && x.coach_id === userId);
        if (!c) return { data: { error: 'not_found' }, error: null };
        if (c.member_id) return { data: { error: 'already_linked' }, error: null };
        if (!c.active) return { data: { error: 'archived' }, error: null };
        c.invite_code = `T3ST${String(clients.indexOf(c)).padStart(6, '0')}`.slice(0, 10);
        c.invite_created_at = new Date().toISOString();
        c.invite_expires_at = new Date(Date.now() + 14 * DAY).toISOString();
        return { data: { code: c.invite_code, expires_at: c.invite_expires_at }, error: null };
      }
      if (fn === 'revoke_client_invite') {
        const c = clients.find((x) => x.id === args.p_client && x.coach_id === userId);
        if (!c) return { data: { error: 'not_found' }, error: null };
        c.invite_code = null;
        c.invite_created_at = null;
        c.invite_expires_at = null;
        return { data: { ok: true }, error: null };
      }
      const chk = inviteCheck(args.p_code);
      if (fn === 'peek_client_invite') {
        if (chk.err && chk.err !== 'already_linked') return { data: { error: chk.err }, error: null };
        const coach = (db.profiles ??= []).find((p) => p.id === chk.c.coach_id) ?? {};
        const cp = (db.coach_profiles ??= []).find((x) => x.profile_id === chk.c.coach_id) ?? {};
        return {
          data: {
            error: chk.err ?? null,
            coach_id: chk.c.coach_id,
            coach_name: coach.full_name ?? null,
            coach_title: cp.title ?? null,
            coach_photo: coach.avatar_photo_url ?? null,
            client_name: chk.c.full_name ?? null,
          },
          error: null,
        };
      }
      // claim
      if (chk.err) return { data: { error: chk.err }, error: null };
      chk.c.member_id = userId;
      chk.c.invite_code = null;
      chk.c.invite_created_at = null;
      chk.c.invite_expires_at = null;
      return { data: { client_id: chk.c.id, coach_id: chk.c.coach_id }, error: null };
    }

    // 0026: the coach's own switch, and the lookup anyone may make.
    // window.__fake.publicCode is the code the "server" makes (default 'k7m2qx').
    function publicPage(fn, args) {
      const coaches = (db.coach_profiles ??= []);
      if (fn === 'set_public_page') {
        const me = coaches.find((c) => c.profile_id === userId);
        if (!me) return refuse('42501');
        if (args.p_on && !me.public_code) me.public_code = window.__fake.publicCode ?? 'k7m2qx';
        me.public_page = args.p_on === true;
        return { data: me.public_code ?? null, error: null };
      }
      const code = String(args.p_code ?? '').trim().toLowerCase();
      const c = coaches.find((x) => x.public_code === code && x.public_page && !x.unlisted);
      const p = c && (db.profiles ??= []).find((x) => x.id === c.profile_id);
      if (!c || !p || (p.account_status && p.account_status !== 'active')) return { data: null, error: null };
      return { data: { coach_id: c.profile_id, full_name: p.full_name, title: c.title ?? '' }, error: null };
    }

    real.rpc = async (fn, args) => {
      log({ op: 'rpc', fn, args });
      // window.__fake.rpcDelay (ms) keeps a call in flight, for a test that
      // acts while it is.
      if (window.__fake.rpcDelay) await new Promise((r) => setTimeout(r, window.__fake.rpcDelay));
      if (failing(`rpc.${fn}`)) return { data: null, error: NETWORK };
      if (fn === 'reschedule_booking' || fn === 'cancel_booking') return changeBooking(fn, args);
      if (fn === 'mark_attendance') return markAttendance(args);
      if (fn.endsWith('_client_invite')) return clientInvite(fn, args);
      if (fn === 'member_cancel_session') return memberCancel(args);
      if (fn === 'set_public_page' || fn === 'public_coach_page') return publicPage(fn, args);
      if (fn !== 'accept_session_request') return refuse('42883');
      const r = (db.session_requests ??= []).find((x) => x.id === args.p_request && x.coach_id === userId);
      if (!r) return refuse('P0002');
      if (r.status !== 'pending') return refuse('55000');
      const start = Date.parse(r.requested_start);
      if (start <= Date.now()) return refuse('22023');
      // 0017: a block from either side, or an inactive member, refuses it.
      const pair = (db.clients ??= []).find((c) => c.coach_id === userId && c.member_id === r.member_id);
      const member = (db.profiles ??= []).find((p) => p.id === r.member_id);
      if ((pair && (pair.blocked_by_member_at || pair.blocked_by_coach_at)) || (member && member.account_status && member.account_status !== 'active')) {
        return refuse('42501');
      }
      if (r.reschedule_of) {
        // A move: the booking and its session, keeping the length.
        const b = (db.time_blocks ??= []).find((x) => x.id === r.reschedule_of && x.coach_id === userId && x.kind === 'booked');
        if (!b) return refuse('55000');
        if (Date.parse(b.starts_at) <= Date.now()) return refuse('22023');
        const moveEnd = start + (Date.parse(b.ends_at) - Date.parse(b.starts_at));
        if (db.time_blocks.some((o) => o.id !== b.id && o.coach_id === userId && ['booked', 'busy'].includes(o.kind) && Date.parse(o.starts_at) < moveEnd && Date.parse(o.ends_at) > start)) {
          return refuse('23P01');
        }
        r.status = 'accepted';
        r.responded_at = new Date().toISOString();
        b.starts_at = new Date(start).toISOString();
        b.ends_at = new Date(moveEnd).toISOString();
        for (const x of (db.sessions ??= [])) if (x.time_block_id === b.id) x.scheduled_at = b.starts_at;
        refreshNext(b.client_id);
        return { data: b.client_id, error: null };
      }
      const intro = !r.offering_id && Number(r.price) === 0;
      const end = start + (intro ? 20 : 50) * 60000;
      const blocks = (db.time_blocks ??= []);
      if (blocks.some((b) => b.coach_id === userId && ['booked', 'busy'].includes(b.kind) && Date.parse(b.starts_at) < end && Date.parse(b.ends_at) > start)) {
        return refuse('23P01');
      }
      // 0024: past the plan's cap (free 3, Pro Plus 15, Elite Pro none) the
      // member is refused, and the whole accept with it. 24_free_tier.sql
      // and 29_plan_tiers.sql prove the real trigger.
      const sub = (db.subscriptions ?? []).find((x) => x.coach_id === userId);
      const paid = sub && ['pro', 'elite_pro'].includes(sub.tier) && (!sub.renews_at || Date.parse(sub.renews_at) > Date.now());
      const cap = !paid ? 3 : sub.tier === 'pro' ? 15 : null;
      const existing = (db.clients ??= []).find((c) => c.coach_id === userId && c.member_id === r.member_id);
      const activeNow = db.clients.filter((c) => c.coach_id === userId && c.active).length;
      if (cap !== null && !(existing && existing.active) && activeNow >= cap) return refuse('53400');
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

    // Realtime: a quiet channel. Signed in, the app always holds one
    // (store/unread.ts), and the real client would open a websocket to
    // whatever .env.local points at — locally, the live project — and keep
    // retrying it. A spec that delivers messages replaces these after
    // installing the fake (unread-badge.spec.js, messaging-remote.spec.js).
    real.channel = (name) => ({ name, on() { return this; }, subscribe() { return this; } });
    real.removeChannel = async () => 'ok';

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

    // Edge Functions: each answers whatever the test set with
    // setFunctionReply, the way supabase-js reports it — data on a 2xx, a
    // FunctionsHttpError carrying the Response otherwise. Unset is a
    // network failure, so no test reaches a real function by accident.
    window.__fake.functionReplies = {};
    const functions = {
      invoke: async (name, opts) => {
        log({ op: 'functions.invoke', name, body: opts?.body ?? null });
        const reply = window.__fake.functionReplies[name];
        if (!reply || failing(`functions.${name}`)) return { data: null, error: { name: 'FunctionsFetchError', message: 'network down' } };
        if (reply.status >= 200 && reply.status < 300) return { data: reply.body, error: null };
        const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
          name: 'FunctionsHttpError',
          context: new Response(JSON.stringify(reply.body), { status: reply.status }),
        });
        return { data: null, error };
      },
    };
    Object.defineProperty(real, 'functions', { value: functions, configurable: true });
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

/** What an Edge Function answers next: `{ status, body }`. */
export const setFunctionReply = (page, name, status, body) =>
  page.evaluate(([n, st, b]) => { window.__fake.functionReplies[n] = { status: st, body: b }; }, [name, status, body]);
