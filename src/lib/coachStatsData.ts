/**
 * The signed-in coach's own numbers on Profile: their rating, and what is
 * still open on their account (the delete-account sheet). Signed out,
 * Profile stays on mockStore's getProAggregateRating and
 * getProActiveObligations over the demo roster.
 *
 * - Rating: every `ratings` row for the coach — what Discover's
 *   `coach_directory` averages too, so the two agree. RLS lets a coach read
 *   the ratings on their own relationships (ratings_select).
 * - Open items are exactly what process_account_deletion (0012) refuses a
 *   coach over: a session still to come that nobody has marked, a disputed
 *   one, and a payout not settled yet. A member's unused credits block the
 *   member's deletion, not the coach's, so they aren't counted here.
 *
 * Same result shape as rosterData.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type CoachStatsErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type CoachStatsResult<T> = { ok: true; data: T } | { ok: false; code: CoachStatsErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

/** 0012's "not yet settled" payout states. */
const UNSETTLED_PAYOUTS = ['requested', 'processing', 'pending', 'unknown'] as const;

export interface CoachStats {
  ratingCount: number;
  /** 0 with no ratings. */
  ratingAvg: number;
  /** Members (on any relationship, archived too) with a session still to come. */
  upcomingClients: number;
  openDisputes: number;
  unsettledPayouts: number;
}

export async function fetchOwnCoachStats(nowIso: string = new Date().toISOString()): Promise<CoachStatsResult<CoachStats>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) return NOT_SIGNED_IN;

  const [clients, ratings, payouts] = await Promise.all([
    supabase.from('clients').select('id').eq('coach_id', uid),
    supabase.from('ratings').select('rating').eq('coach_id', uid),
    supabase.from('payouts').select('id').eq('coach_id', uid).in('status', [...UNSETTLED_PAYOUTS]),
  ]);
  if (clients.error) return unknown(clients.error);
  if (ratings.error) return unknown(ratings.error);
  if (payouts.error) return unknown(payouts.error);

  let upcomingClients = 0;
  let openDisputes = 0;
  const ids = clients.data.map((c) => c.id);
  if (ids.length > 0) {
    const [upcoming, disputed] = await Promise.all([
      supabase.from('sessions').select('client_id').in('client_id', ids).is('attendance', null).gte('scheduled_at', nowIso),
      supabase.from('sessions').select('id').in('client_id', ids).eq('attendance', 'disputed'),
    ]);
    if (upcoming.error) return unknown(upcoming.error);
    if (disputed.error) return unknown(disputed.error);
    upcomingClients = new Set(upcoming.data.map((s) => s.client_id)).size;
    openDisputes = disputed.data.length;
  }

  const ratingCount = ratings.data.length;
  const ratingAvg = ratingCount > 0 ? ratings.data.reduce((sum, r) => sum + r.rating, 0) / ratingCount : 0;
  return { ok: true, data: { ratingCount, ratingAvg, upcomingClients, openDisputes, unsettledPayouts: payouts.data.length } };
}
