/**
 * The coach's plan: Free (3 active members), Rafiq Pro Plus (15, tier
 * 'pro') or Rafiq Elite Pro (no limit, tier 'elite_pro'). 0024.
 *
 *   Signed in  → the coach's `subscriptions` row (0001), read with the rule
 *                0024 enforces: no row, or a paid tier whose renews_at has
 *                passed, is free.
 *   Signed out → mockStore's demo subscription, as before.
 *
 * Only service_role writes `subscriptions`, so the app cannot change its own
 * plan: a paid tier is granted by billing, or by hand for a founding coach
 * (supabase/admin/README.md). The database refuses the member past a plan's
 * cap whatever the app shows; this is what lets the screens say so before
 * the coach hits it.
 */
import { getSubscription, type PlanTier } from './mockStore';
import { useRemoteSession } from './remoteSession';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { useRemoteLoad } from '../store/remoteLoad';

export type { PlanTier };

/** Active members each plan holds; null is no limit. 0024's
    coach_member_cap() holds the same numbers. */
export const MEMBER_CAP: Record<PlanTier, number | null> = { free: 3, pro: 15, elite_pro: null };

/** Active members on the free plan. */
export const FREE_MEMBER_CAP = 3;

export interface Plan {
  tier: PlanTier;
  /** When a paid tier renews or ends, as an instant; null for free, and for
      a paid tier with no end date. */
  renewsAt: string | null;
}

/** 0024's coach_plan(), in the app: a lapsed paid tier is free. */
export function planFromRow(row: { tier: PlanTier; renews_at: string | null } | null, nowMs: number): Plan {
  if (!row || row.tier === 'free') return { tier: 'free', renewsAt: null };
  if (row.renews_at && Date.parse(row.renews_at) <= nowMs) return { tier: 'free', renewsAt: null };
  return { tier: row.tier, renewsAt: row.renews_at };
}

/** True on either paid tier. */
export function isPaid(plan: Plan): boolean {
  return plan.tier !== 'free';
}

export async function fetchOwnPlan(): Promise<{ ok: true; data: Plan } | { ok: false }> {
  if (!isSupabaseConfigured()) return { ok: false };
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false };
  const { data, error } = await supabase.from('subscriptions').select('tier, renews_at').eq('coach_id', uid).maybeSingle();
  if (error) return { ok: false };
  return { ok: true, data: planFromRow(data, Date.now()) };
}

export type PlanView =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; plan: Plan; remote: boolean };

export function usePlan(): PlanView {
  const remote = useRemoteSession();
  const load = useRemoteLoad('own_plan', remote, fetchOwnPlan);
  if (!remote) {
    const sub = getSubscription();
    return { status: 'ready', remote: false, plan: { tier: sub.tier, renewsAt: sub.renewsAtMs === null ? null : new Date(sub.renewsAtMs).toISOString() } };
  }
  if (load.status === 'ready') return { status: 'ready', remote: true, plan: load.data };
  return load;
}

/** True when a coach on this plan can't make another member active. */
export function atMemberCap(plan: Plan, activeMembers: number): boolean {
  const cap = MEMBER_CAP[plan.tier];
  return cap !== null && activeMembers >= cap;
}
