/**
 * What the signed-in coach has been paid, from the `payments` ledger (0001):
 * Earnings' totals and per-member rows. Signed out, Earnings stays on
 * mockStore's getEarningsSummary over the demo roster.
 *
 * - The ledger has no coach column: a row belongs to a relationship
 *   (`client_id`). RLS already limits it to the coach's own (payments_select),
 *   and the query names the coach's own clients as well rather than relying
 *   on that alone.
 * - Received is what came in less what went back: completed charges minus
 *   refunds, which are their own rows (kind 'refund'). A pending row is owed,
 *   not received, and counts only towards `pending`. A charge whose state is
 *   'refunded' still counts — its refund row is what takes it back out, so
 *   counting both nets it to zero, the way ClientDetail's history reads.
 * - Every row is EGP: `currency` defaults to it and nothing in the app sets
 *   another, as in ClientDetail.
 *
 * Same result shape as rosterData.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Client, EarningsSummary } from './mockStore';

export type EarningsErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type EarningsResult<T> = { ok: true; data: T } | { ok: false; code: EarningsErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

/** One relationship's ledger, summed. A client with no rows has no entry. */
export interface LedgerTotals {
  received: number;
  pending: number;
}

export async function fetchOwnLedgerTotals(): Promise<EarningsResult<Record<string, LedgerTotals>>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) return NOT_SIGNED_IN;

  const clients = await supabase.from('clients').select('id').eq('coach_id', uid);
  if (clients.error) return unknown(clients.error);
  const ids = clients.data.map((c) => c.id);
  if (ids.length === 0) return { ok: true, data: {} };

  const payments = await supabase.from('payments').select('client_id, kind, amount, state').in('client_id', ids);
  if (payments.error) return unknown(payments.error);

  const totals: Record<string, LedgerTotals> = {};
  for (const p of payments.data) {
    const t = (totals[p.client_id] ??= { received: 0, pending: 0 });
    const amount = Number(p.amount);
    if (p.state === 'pending') {
      // A pending refund would be money not yet sent back; nothing writes
      // one today, and it isn't owed to the coach, so it is left out.
      if (p.kind === 'charge') t.pending += amount;
    } else {
      t.received += p.kind === 'refund' ? -amount : amount;
    }
  }
  return { ok: true, data: totals };
}

/**
 * The roster and its ledger in getEarningsSummary's shape, so Earnings has
 * one rendering path. Paid and due count the active members — the ones Home
 * counts too; an archived member listed as "due" isn't owed anything this
 * month. The list keeps an archived member who has ledger rows, since that
 * money is part of the total above it.
 */
export function summarizeEarnings(clients: Client[], ledger: Record<string, LedgerTotals>): EarningsSummary {
  const active = clients.filter((c) => c.active);
  const listed = clients.filter((c) => c.active || ledger[c.id]);
  const byClient = listed.map((c) => ({
    clientId: c.id,
    clientName: c.name,
    total: ledger[c.id]?.received ?? 0,
    pending: ledger[c.id]?.pending ?? 0,
  }));
  const sum = (pick: (t: LedgerTotals) => number) => Object.values(ledger).reduce((s, t) => s + pick(t), 0);
  return {
    totalReceived: sum((t) => t.received),
    pendingTotal: sum((t) => t.pending),
    pendingCount: Object.values(ledger).filter((t) => t.pending > 0).length,
    paidCount: active.filter((c) => c.paymentStatus === 'paid').length,
    dueCount: active.filter((c) => c.paymentStatus === 'due' || c.paymentStatus === 'overdue').length,
    totalClients: active.length,
    byClient,
  };
}
