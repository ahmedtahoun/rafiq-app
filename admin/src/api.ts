import { SUPABASE_URL, getSupabase } from './supabase';

/**
 * Every call this tool can make. The names match the Edge Function's
 * operations one for one; there is no generic "query" or "update", by
 * design — the function holds the service_role key, so what it will do
 * is a fixed list rather than something this app composes.
 */
export type Op =
  | { op: 'listReports' }
  | { op: 'actionReport'; report_id: string; note: string }
  | { op: 'dismissReport'; report_id: string; note: string }
  | { op: 'suspend'; profile_id: string }
  | { op: 'unsuspend'; profile_id: string }
  | { op: 'listVerifications' }
  | { op: 'approveVerification'; request_id: string; note: string }
  | { op: 'rejectVerification'; request_id: string; note: string }
  | { op: 'listDeletions' }
  | { op: 'processDeletion'; request_id: string }
  | { op: 'lookupUser'; query: string }
  | { op: 'listPayouts'; status?: PayoutStatus }
  | { op: 'createPayout'; coach_id: string; amount: number; comment?: string }
  | { op: 'sendPayout'; payout_id: string }
  | { op: 'syncPayout'; payout_id: string };

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail?: string) {
    // What the admin sees, so it names the row's state rather than
    // "request failed": a 409 here means someone else got there first.
    super(detail ? `${code}: ${detail}` : code);
  }
}

export async function call<T = Record<string, unknown>>(body: Op): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'not_signed_in');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let parsed: Record<string, unknown> = {};
  try {
    parsed = await res.json();
  } catch {
    throw new ApiError(res.status, 'bad_response');
  }
  if (!res.ok) {
    throw new ApiError(res.status, String(parsed.error ?? 'failed'), parsed.detail ? String(parsed.detail) : undefined);
  }
  return parsed as T;
}

// ---- Row shapes, as the function returns them ----------------------------

export type Person = { id: string; full_name: string; email: string | null; account_status?: string };

export type Report = {
  id: string;
  reason: string;
  details: string;
  created_at: string;
  reporter: Person | null;
  coach: Person | null;
};

/**
 * The coach arrives nested. `verification_requests.coach_id` references
 * `coach_profiles(profile_id)`, not `profiles`, so the function embeds
 * through `coach_profiles` and the person is one level down. `coachOf`
 * is the only place that shape is known.
 */
export type Verification = {
  id: string;
  note: string;
  submitted_at: string;
  coach: { profile: Person | null } | null;
};

export const coachOf = (v: Verification): Person | null => v.coach?.profile ?? null;

export type Deletion = {
  id: string;
  profile_id: string;
  requested_at: string;
  note: string | null;
  profiles: { full_name: string; email: string | null; role: string } | null;
};

export type Profile = Person & { role: string; account_status: string; created_at: string };

/** `payout_status` in 0007, in the order a payout moves through it. */
export const PAYOUT_STATUSES = ['requested', 'processing', 'pending', 'success', 'failed', 'unknown'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/**
 * `destination` arrives masked — `••••1234` — and that is the only form
 * this app ever sees. The full account number and msisdn stay on the
 * server (`maskDestination` in `_shared/paymobPayouts.ts`), and the
 * national ID never reaches the payout row at all.
 *
 * The coach is nested for the same reason a verification's is:
 * `payouts.coach_id` references `coach_profiles(profile_id)`, so the
 * function embeds through it. `payoutCoachOf` is the only place that
 * shape is known.
 */
export type Payout = {
  id: string;
  amount: number;
  currency: string;
  issuer: string;
  status: PayoutStatus;
  comment: string | null;
  destination: { msisdn: string | null; bank_code: string | null; account_number: string | null; full_name: string } | null;
  paymob_transaction_id: string | null;
  status_description: string | null;
  created_at: string;
  sent_at: string | null;
  settled_at: string | null;
  coach: { profile: Person | null } | null;
};

export const payoutCoachOf = (p: Payout): Person | null => p.coach?.profile ?? null;
