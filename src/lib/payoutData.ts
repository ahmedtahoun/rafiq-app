/**
 * The signed-in coach's payout account (coach_payout_accounts, 0007): where
 * the admin-only `payouts` Edge Function sends their money. The app only
 * saves the destination; it never calls Paymob and never creates a payout
 * (supabase/functions/payouts/README.md).
 *
 * The national ID and the account/wallet number are sensitive, so:
 * - a read hands the screen only their last four characters — the full
 *   values never leave this module;
 * - nothing here logs, and no result message carries a value or the
 *   upstream error text (a Postgres check violation's details quote the
 *   failing row). Messages are for logs and are never rendered anyway.
 *
 * Same result shape as auth.ts, adminQueues.ts and profileData.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { last4, type PayoutAccountRow, type PayoutIssuer } from './payoutAccount';

export type PayoutErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';

export type PayoutResult<T> = { ok: true; data: T } | { ok: false; code: PayoutErrorCode; message: string };

/** What the screen may know about a saved account. */
export interface PayoutAccountSummary {
  issuer: PayoutIssuer;
  fullName: string;
  /** instant_bank only. */
  bankCode: string | null;
  /** Of the wallet number or the bank account number / IBAN. */
  destinationLast4: string;
  nationalIdLast4: string;
}

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;

/** The step that failed and Postgres's error code — never error.message or
    error.details, which can quote the values written. */
function failed(step: string, error: { code?: string } | null) {
  return { ok: false, code: 'unknown', message: `coach_payout_accounts ${step} failed (${error?.code ?? 'no code'})` } as const;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

function summarize(row: PayoutAccountRow): PayoutAccountSummary {
  return {
    issuer: row.issuer,
    fullName: row.full_name,
    bankCode: row.bank_code,
    destinationLast4: last4(row.msisdn ?? row.account_number ?? ''),
    nationalIdLast4: last4(row.national_id),
  };
}

/** `data: null` — no account saved yet. */
export async function fetchOwnPayoutAccount(): Promise<PayoutResult<PayoutAccountSummary | null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;

  const { data, error } = await getSupabase()
    .from('coach_payout_accounts')
    .select('issuer, msisdn, bank_code, account_number, full_name, national_id')
    .eq('coach_id', uid)
    .maybeSingle();
  if (error) return failed('read', error);
  return { ok: true, data: data ? summarize(data) : null };
}

/**
 * Saves the coach's account, creating it the first time: insert, and only if
 * the row already exists (23505) update it. Not a PostgREST upsert, the same
 * as profileData.ts's writes. `row` must have passed validatePayoutAccount().
 */
export async function saveOwnPayoutAccount(row: PayoutAccountRow): Promise<PayoutResult<PayoutAccountSummary>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;

  const supabase = getSupabase();
  const inserted = await supabase.from('coach_payout_accounts').insert({ ...row, coach_id: uid });
  if (!inserted.error) return { ok: true, data: summarize(row) };
  if (inserted.error.code !== '23505') return failed('insert', inserted.error);

  const updated = await supabase.from('coach_payout_accounts').update(row).eq('coach_id', uid).select('coach_id');
  if (updated.error) return failed('update', updated.error);
  if (updated.data.length === 0) return failed('update', { code: 'no row' });
  return { ok: true, data: summarize(row) };
}
