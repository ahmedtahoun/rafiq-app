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

const KEYS = { profiles: 'id', coach_profiles: 'profile_id', member_profiles: 'profile_id' };

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
      log({ table: q.table, op: q.op, values: q.values ?? null, filters: q.filters });
      if (failing(q.table) || failing(`${q.table}.${q.op}`)) return { data: null, error: NETWORK };
      const rows = (db[q.table] ??= []);
      const matches = rows.filter((r) => q.filters.every(([c, v]) => r[c] === v));

      if (q.op === 'select') {
        return { data: q.single ? matches[0] ?? null : matches, error: null };
      }
      if (q.op === 'update') {
        for (const r of matches) Object.assign(r, q.values);
        return { data: q.returning ? matches.map((r) => ({ ...r })) : null, error: null };
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
      return { data: q.returning ? [{ ...row }] : null, error: null };
    }

    real.from = (table) => {
      const q = { table, op: 'select', values: null, filters: [], single: false, returning: false };
      const b = {
        select() { if (q.op !== 'select') q.returning = true; return b; },
        update(values) { q.op = 'update'; q.values = values; return b; },
        insert(values) { q.op = 'insert'; q.values = values; return b; },
        eq(col, val) { q.filters.push([col, val]); return b; },
        maybeSingle() { q.single = true; return b; },
        then(resolve, reject) { return Promise.resolve().then(() => run(q)).then(resolve, reject); },
      };
      return b;
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
