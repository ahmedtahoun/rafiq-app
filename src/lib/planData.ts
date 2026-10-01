/**
 * The coach's plan: free (3 active members) or Rafiq Pro (no limit).
 *
 *   Signed in  → the coach's `subscriptions` row (0001), read with the rule
 *                0021 enforces: no row, or a Pro whose renews_at has passed,
 *                is free.
 *   Signed out → mockStore's demo subscription, as before.
 *
 * Only service_role writes `subscriptions`, so the app cannot change its own
 * plan: a Pro is granted by billing, or by hand for a founding coach
 * (supabase/admin/README.md). The database refuses a 4th active member on
 * the free plan whatever the app shows; this is what lets the screens say
 * so before the coach hits it.
 */
import { getSubscription } from './mockStore';
import { useRemoteSession } from './remoteSession';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { useRemoteLoad } from '../store/remoteLoad';

/** Active members on the free plan. 0021's trigger holds the same number. */
export const FREE_MEMBER_CAP = 3;

export interface Plan {
  tier: 'free' | 'pro';
  /** When a Pro renews or ends, as an instant; null for free, and for a Pro
      with no end date. */
  renewsAt: string | null;
}

/** 0021's coach_on_pro(), in the app: a lapsed Pro is free. */
export function planFromRow(row: { tier: 'free' | 'pro'; renews_at: string | null } | null, nowMs: number): Plan {
  if (!row || row.tier !== 'pro') return { tier: 'free', renewsAt: null };
  if (row.renews_at && Date.parse(row.renews_at) <= nowMs) return { tier: 'free', renewsAt: null };
  return { tier: 'pro', renewsAt: row.renews_at };
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
  return plan.tier === 'free' && activeMembers >= FREE_MEMBER_CAP;
}
