/**
 * The signed-in member's programs (SUPABASE-MIGRATION-PLAN.md step 6): their
 * `enrollments` in one relationship, each with the offering it is for.
 *
 * A member may read their own relationships' enrollments (enrollments_select,
 * via can_see_client) and any offering (offerings_select_all), archived ones
 * included, so a program the coach has since stopped selling still shows
 * under its name. Writing progress is the coach's.
 *
 * `enrolledAtMs` is a real instant (epoch ms), not wall-clock: show it with
 * fmt.instantDate.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { OFFERING_COLUMNS, toOffering, type OfferingRow } from './offeringData';
import { programProgressOf, type ProgramProgress } from './mockStore';

export type ProgramErrorCode = 'not_configured' | 'unknown';
export type ProgramResult<T> = { ok: true; data: T } | { ok: false; code: ProgramErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

/** A program's progress, plus whether the member has rated reaching its
    milestone (milestone_reviewed_at). */
export type MemberProgram = ProgramProgress & { milestoneReviewed: boolean };

interface EnrollmentRow {
  offering_id: string;
  sessions_completed: number;
  enrolled_at: string;
  milestone_reviewed_at: string | null;
}

/** The relationship's enrollments, newest first. */
export async function fetchMemberPrograms(clientId: string): Promise<ProgramResult<MemberProgram[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const sb = getSupabase();
  const enrolled = await sb
    .from('enrollments')
    .select('offering_id, sessions_completed, enrolled_at, milestone_reviewed_at')
    .eq('client_id', clientId)
    .order('enrolled_at', { ascending: false });
  if (enrolled.error) return unknown(enrolled.error);
  const rows = enrolled.data as EnrollmentRow[];
  if (rows.length === 0) return { ok: true, data: [] };

  const offered = await sb.from('offerings').select(OFFERING_COLUMNS).in('id', rows.map((r) => r.offering_id));
  if (offered.error) return unknown(offered.error);
  const byId = new Map((offered.data as OfferingRow[]).map((o) => [o.id, toOffering(o)]));

  // offering_id restricts deletes (0005), so every enrollment has its
  // offering; one that somehow doesn't is left out rather than nameless.
  const data = rows.flatMap((r) => {
    const offering = byId.get(r.offering_id);
    if (!offering) return [];
    return [{
      ...programProgressOf(offering, r.sessions_completed, Date.parse(r.enrolled_at)),
      milestoneReviewed: r.milestone_reviewed_at !== null,
    }];
  });
  return { ok: true, data };
}

/** The goal the member gave at onboarding (member_profiles.goal, 0006);
    null if they skipped it or wrote nothing. */
export async function fetchOwnGoal(): Promise<ProgramResult<string | null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const sb = getSupabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { ok: false, code: 'unknown', message: 'No signed-in user.' };
  const { data, error } = await sb.from('member_profiles').select('goal').eq('profile_id', auth.user.id).maybeSingle();
  if (error) return unknown(error);
  return { ok: true, data: data?.goal?.trim() || null };
}
