/**
 * The signed-in coach's own payouts (the `payouts` ledger, 0007), newest
 * first, for Earnings. Read-only: the app can't create, send or change a
 * payout — that is the admin-only `payouts` Edge Function's job
 * (supabase/functions/payouts/README.md).
 *
 * Selects only what Earnings shows. Never `destination`: it is a snapshot
 * of the payout account the money went to, national ID included.
 *
 * Same result shape as auth.ts, adminQueues.ts and profileData.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Database } from './database.types';

export type PayoutStatus = Database['public']['Enums']['payout_status'];

export interface PayoutRecord {
  id: string;
  amount: number;
  /** ISO 4217, 'EGP' unless the Edge Function said otherwise. */
  currency: string;
  status: PayoutStatus;
  /** A real instant — display with fmt.instantDate, not fmt.date. */
  createdAt: string;
}

export type PayoutHistoryErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type PayoutHistoryResult<T> = { ok: true; data: T } | { ok: false; code: PayoutHistoryErrorCode; message: string };

export async function fetchOwnPayouts(): Promise<PayoutHistoryResult<PayoutRecord[]>> {
  if (!isSupabaseConfigured()) return { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' };
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, code: 'not_signed_in', message: 'No signed-in user.' };

  const { data, error } = await supabase
    .from('payouts')
    .select('id, amount, currency, status, created_at')
    .eq('coach_id', uid)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, code: 'unknown', message: error.message };

  return {
    ok: true,
    // numeric(12,2) — a number from PostgREST, but coerce in case it's ever a string.
    data: data.map((r) => ({ id: r.id, amount: Number(r.amount), currency: r.currency, status: r.status, createdAt: r.created_at })),
  };
}
