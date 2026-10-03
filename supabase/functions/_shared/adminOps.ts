/**
 * Working Rafiq's queues: reports, coach verification, account deletions,
 * suspensions and user lookup. The logic lives here rather than in
 * `../admin/index.ts` for two reasons:
 *
 * 1. It is testable. Everything it touches — the database client, the
 *    clock, calls to other Edge Functions — is injected, so
 *    `adminOps_test.ts` can drive the real entry point and assert both
 *    the reply and *which writes happened*. A guard that only exists
 *    inside `Deno.serve` cannot be tested, and "a non-admin gets a 403"
 *    is the one behaviour here that must never regress.
 * 2. CI's `deno check` names its files explicitly and does not yet name
 *    `admin/index.ts`; `deno test` typechecks what the tests import, so
 *    keeping the logic here keeps it checked either way.
 *
 * Every entry point is a NAMED OPERATION with validated input. There is
 * deliberately no "run this query" or "update this table" operation: the
 * function holds the `service_role` key, so the set of things it can be
 * asked to do is a fixed list, not a parameter.
 */

export type Row = Record<string, unknown>;
export type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * The slice of supabase-js this module uses. Narrow on purpose: the real
 * client's types are far wider, and `admin/index.ts` casts to this so a
 * fake in the tests only has to implement what is actually called.
 */
export interface Query extends PromiseLike<Result<Row[]>> {
  eq(column: string, value: unknown): Query;
  or(filter: string): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(count: number): Query;
  select(columns?: string): Query;
  maybeSingle(): PromiseLike<Result<Row>>;
}

export interface Table {
  select(columns?: string): Query;
  update(values: Row): Query;
}

export interface Db {
  auth: { getUser(jwt: string): Promise<{ data: { user: { id: string } | null } }> };
  from(table: string): Table;
}

export interface Deps {
  db: Db;
  /** Now, as an ISO string. Injected so a test can assert the exact value written. */
  now(): string;
  /**
   * Calls another Edge Function as the caller. Deletions go through the
   * existing `account-deletion` function rather than a second copy of
   * its logic — it already runs the database half, clears Storage and
   * either deletes or locks the login, in an order that is safe to retry.
   */
  callFunction(name: string, body: Row, jwt: string): Promise<{ status: number; body: unknown }>;
}

export type Reply = { status: number; body: Row };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 2000;

function bad(detail: string): Reply {
  return { status: 422, body: { error: 'invalid_input', detail } };
}

/** A required uuid field. */
function uuid(body: Row, field: string): string | Reply {
  const value = body[field];
  if (typeof value !== 'string' || !UUID.test(value)) return bad(`${field} must be a uuid`);
  return value;
}

/**
 * An optional free-text note. Absent becomes '' rather than null: both
 * `resolution_note` and `reviewer_note` are plain text columns, and an
 * empty string keeps "reviewed, no comment" distinct from a null that
 * might mean the write never happened.
 */
function note(body: Row, field = 'note'): string | Reply {
  const value = body[field];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return bad(`${field} must be a string`);
  if (value.length > NOTE_MAX) return bad(`${field} is longer than ${NOTE_MAX} characters`);
  return value;
}

function isReply(v: unknown): v is Reply {
  return typeof v === 'object' && v !== null && 'status' in v;
}

/**
 * Report and verification rows carry two references to `profiles`, so the
 * embed names the joining column (`profiles!coach_id`) — without the hint
 * PostgREST cannot tell which relationship is meant.
 *
 * NOTE: a fake database cannot check this string. It models tables, not
 * PostgREST's query grammar, exactly as `tests/fakeSupabase.js` models
 * tables but not enums. These three selects are the part of this module
 * that only the real project can confirm; `admin/README.md` says so.
 */
const REPORT_COLUMNS =
  'id, reason, details, status, created_at, resolved_at, resolution_note, ' +
  'reporter:profiles!reporter_id(id, full_name, email), ' +
  'coach:profiles!coach_id(id, full_name, email, account_status)';

const VERIFICATION_COLUMNS =
  'id, note, status, submitted_at, reviewed_at, reviewer_note, ' +
  'coach:profiles!coach_id(id, full_name, email, account_status)';

const PROFILE_COLUMNS = 'id, full_name, email, role, account_status, created_at';

/**
 * Moves a queue row to a final state, but only from the state it is
 * supposed to be in: the `.eq('status', from)` means a second click, a
 * retry, or two admins working the same queue cannot action the same
 * report twice or review one request twice. No row back means someone
 * got there first, which is a 409, not a failure.
 */
async function settle(
  deps: Deps,
  table: string,
  id: string,
  from: string,
  to: string,
  fields: Row,
): Promise<Reply> {
  const { data, error } = await deps.db
    .from(table)
    .update({ status: to, ...fields })
    .eq('id', id)
    .eq('status', from)
    .select('id, status')
    .maybeSingle();
  if (error) return { status: 500, body: { error: 'update_failed', detail: error.message } };
  if (!data) return { status: 409, body: { error: 'not_in_expected_state', expected: from } };
  return { status: 200, body: { [table === 'pro_reports' ? 'report' : 'request']: data } };
}

/**
 * Strips a lookup term down to something that can only ever be a term.
 *
 * `,` `(` `)` and `\` are the characters that matter: `or=(...)` is a
 * comma-separated list, so a term containing one would add conditions of
 * its own — `a,role.eq.admin` would widen the search rather than narrow
 * it. `%` and `*` are only wildcards, so they cannot change which
 * columns are searched, but `%%` would make a two-character term mean
 * "every row"; dropping them also makes the search read literally, which
 * is what someone typing an email expects.
 */
function escapeFilter(term: string): string {
  return term.replace(/[,()\\*%]/g, ' ').trim();
}

export async function handleAdminRequest(deps: Deps, req: { jwt: string; body: Row }): Promise<Reply> {
  // Who is asking. Copied from payouts/index.ts and
  // account-deletion/index.ts: the JWT is verified by Supabase itself,
  // then membership of admin_users decides. admin_users has RLS on and no
  // grants, so only service_role can read it — which is why this check
  // cannot be moved into the browser.
  const jwt = req.jwt.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return { status: 401, body: { error: 'not_signed_in' } };

  const { data: auth } = await deps.db.auth.getUser(jwt);
  if (!auth.user) return { status: 401, body: { error: 'not_signed_in' } };

  const { data: admin } = await deps.db
    .from('admin_users')
    .select('profile_id')
    .eq('profile_id', auth.user.id)
    .maybeSingle();
  if (!admin) return { status: 403, body: { error: 'not_admin' } };

  const body = req.body;
  const at = deps.now();

  switch (body.op) {
    // ---- Reports ------------------------------------------------------
    case 'listReports': {
      const { data, error } = await deps.db
        .from('pro_reports')
        .select(REPORT_COLUMNS)
        .eq('status', 'open')
        .order('created_at', { ascending: true });
      if (error) return { status: 500, body: { error: 'list_failed', detail: error.message } };
      return { status: 200, body: { reports: data ?? [] } };
    }

    // `report_status` is ('open','actioned','dismissed') — there is no
    // 'closed'. So closing a report is two operations, not one taking a
    // status string: 'actioned' means Rafiq did something about it,
    // 'dismissed' means it needed nothing. Which one was chosen is the
    // record of the decision, so neither may stand in for the other.
    case 'actionReport':
    case 'dismissReport': {
      const id = uuid(body, 'report_id');
      if (isReply(id)) return id;
      const text = note(body);
      if (isReply(text)) return text;
      const to = body.op === 'actionReport' ? 'actioned' : 'dismissed';
      return await settle(deps, 'pro_reports', id, 'open', to, {
        resolved_at: at,
        resolution_note: text,
      });
    }

    // ---- Suspension ---------------------------------------------------
    // `profiles` has nowhere to record why, and this PR may not add a
    // migration, so the reason lives on the report that prompted it:
    // action the report with a note first, then suspend. The admin app's
    // report view does them in that order for exactly this reason.
    //
    // 'deleted' is never touched. It is set by process_account_deletion()
    // at the end of a deletion, and moving such an account back to
    // 'active' would resurrect someone who asked to be gone.
    case 'suspend':
    case 'unsuspend': {
      const id = uuid(body, 'profile_id');
      if (isReply(id)) return id;
      const [from, to] = body.op === 'suspend' ? ['active', 'suspended'] : ['suspended', 'active'];
      const { data, error } = await deps.db
        .from('profiles')
        .update({ account_status: to, updated_at: at })
        .eq('id', id)
        .eq('account_status', from)
        .select('id, account_status')
        .maybeSingle();
      if (error) return { status: 500, body: { error: 'update_failed', detail: error.message } };
      if (!data) return { status: 409, body: { error: 'not_in_expected_state', expected: from } };
      return { status: 200, body: { profile: data } };
    }

    // ---- Coach verification -------------------------------------------
    case 'listVerifications': {
      const { data, error } = await deps.db
        .from('verification_requests')
        .select(VERIFICATION_COLUMNS)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });
      if (error) return { status: 500, body: { error: 'list_failed', detail: error.message } };
      return { status: 200, body: { requests: data ?? [] } };
    }

    // Writes `verification_requests.status` and NOTHING ELSE. Migration
    // 0005's `verification_requests_sync` trigger already maps it onto
    // `coach_profiles.verification_status` (approved → verified,
    // rejected → unverified). Setting both here would give one field two
    // sources of truth, and they would disagree the first time one write
    // succeeded and the other did not.
    case 'approveVerification':
    case 'rejectVerification': {
      const id = uuid(body, 'request_id');
      if (isReply(id)) return id;
      const text = note(body);
      if (isReply(text)) return text;
      const to = body.op === 'approveVerification' ? 'approved' : 'rejected';
      return await settle(deps, 'verification_requests', id, 'pending', to, {
        reviewed_at: at,
        reviewer_note: text,
      });
    }

    // ---- Account deletions --------------------------------------------
    // Both delegate. `account-deletion` runs the database half (which
    // refuses while a session, credit, dispute or payout is open), clears
    // Storage, then deletes or locks the login, marking the request
    // completed only at the end so a failure leaves it safe to re-run.
    // Re-implementing any of that here would be a second thing to keep
    // correct. It does its own admin check on the same JWT.
    case 'listDeletions':
    case 'processDeletion': {
      const action = body.op === 'listDeletions' ? 'list' : 'process';
      const payload: Row = { action };
      if (action === 'process') {
        const id = uuid(body, 'request_id');
        if (isReply(id)) return id;
        payload.request_id = id;
      }
      const out = await deps.callFunction('account-deletion', payload, jwt);
      // Passed through as-is: that function's 409 ("something is still
      // open") and its message name what blocked the deletion, and the
      // admin reading it needs that, not a flattened 500.
      return { status: out.status, body: (out.body ?? {}) as Row };
    }

    // ---- User lookup --------------------------------------------------
    case 'lookupUser': {
      const raw = body.query;
      if (typeof raw !== 'string') return bad('query must be a string');
      const term = escapeFilter(raw);
      if (term.length < 2) return bad('query must be at least 2 characters');
      const { data, error } = await deps.db
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) return { status: 500, body: { error: 'lookup_failed', detail: error.message } };
      return { status: 200, body: { profiles: data ?? [] } };
    }

    default:
      return { status: 400, body: { error: 'unknown_op' } };
  }
}
