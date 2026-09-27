/**
 * The three admin-only queues (LAUNCH-CHECKLIST.md §2, §9):
 * pro_reports, verification_requests, account_deletion_requests.
 *
 * All three share a shape (supabase/migrations/0005_app_parity.sql,
 * "Things only Rafiq resolves"): the signed-in user can file a new row and
 * read their own back, but the columns that record an outcome — status,
 * reviewer/resolution notes, resolved_at/reviewed_at/processed_at — are
 * not in the app's grants. Only the admin panel, running as service_role,
 * resolves these. So every function here is a fire-and-record insert, not
 * a workflow.
 *
 * Same result shape as auth.ts: { ok: true, data } | a typed failure. A
 * `not_configured` result means the caller should fall back to
 * mockStore's local behaviour, exactly like every other screen that
 * checks isSupabaseConfigured() today.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Enums } from './database.types';

export type ReportReason = Enums<'report_reason'>;

export type QueueErrorCode =
  | 'not_configured'
  | 'not_signed_in'
  /** The unique "one pending request at a time" index (0005) rejected a
      second filing — the desired end state (a pending request exists)
      already holds, so a caller can treat this the same as `ok: true`. */
  | 'already_pending'
  | 'unknown';

export interface QueueFailure {
  ok: false;
  code: QueueErrorCode;
  /** Raw upstream text, for logs — not for display, same rule as auth.ts. */
  message: string;
}

export type QueueResult<T> = { ok: true; data: T } | QueueFailure;

const NOT_CONFIGURED: QueueFailure = {
  ok: false,
  code: 'not_configured',
  message: 'Supabase credentials are missing — see .env.local.example.',
};

function fail(error: { message: string; code?: string }): QueueFailure {
  // Postgres unique_violation on one of the three tables' partial indexes.
  if (error.code === '23505') return { ok: false, code: 'already_pending', message: error.message };
  return { ok: false, code: 'unknown', message: error.message };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/**
 * A coach asks for their credentials to be reviewed. Filing one flips
 * coach_profiles.verification_status to 'pending' via 0005's own trigger
 * (sync_verification_status) — this only inserts the request row; the
 * app cannot and does not write verification_status directly (0004
 * revoked that column from its grants).
 */
export async function fileVerificationRequest(note = ''): Promise<QueueResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const coachId = await currentUserId();
  if (!coachId) return { ok: false, code: 'not_signed_in', message: 'No signed-in coach.' };
  const { error } = await getSupabase().from('verification_requests').insert({ coach_id: coachId, note });
  return error ? fail(error) : { ok: true, data: null };
}

/**
 * Either role asks for their account to be deleted. This only files the
 * request — processing it (anonymizing the profile, per
 * supabase/README.md's payments note) is deliberate admin work the queue
 * exists for, not something this insert triggers.
 */
export async function fileAccountDeletionRequest(): Promise<QueueResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const profileId = await currentUserId();
  if (!profileId) return { ok: false, code: 'not_signed_in', message: 'No signed-in user.' };
  const { error } = await getSupabase().from('account_deletion_requests').insert({ profile_id: profileId });
  return error ? fail(error) : { ok: true, data: null };
}

/**
 * A member reports their coach.
 *
 * Needs a real `clients` row id for `client_id` — the insert policy
 * (0005: reporter_id = auth.uid(), is_member_of(client_id), and coach_id
 * matching that row's own coach_id) means this cannot be exercised for
 * real until the member-side roster is real Supabase rows rather than
 * mockStore's demo strings ('sara' is not a `clients.id`) — LAUNCH-
 * CHECKLIST.md §2, "remove the demo identities". Written and tested now
 * so that conversion has nothing left to build here; not yet wired into
 * ClientCoach.tsx's report flow for the same reason (see the comment
 * there).
 */
export async function fileProReport(params: {
  clientId: string;
  coachId: string;
  reason: ReportReason;
  details?: string;
}): Promise<QueueResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const reporterId = await currentUserId();
  if (!reporterId) return { ok: false, code: 'not_signed_in', message: 'No signed-in member.' };
  const { error } = await getSupabase().from('pro_reports').insert({
    reporter_id: reporterId,
    coach_id: params.coachId,
    client_id: params.clientId,
    reason: params.reason,
    details: params.details ?? '',
  });
  return error ? fail(error) : { ok: true, data: null };
}
