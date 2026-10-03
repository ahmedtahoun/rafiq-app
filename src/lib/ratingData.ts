/**
 * The member rating a session with their coach (SUPABASE-MIGRATION-PLAN.md
 * step 6): `ratings`, one per session (ratings_one_per_session, 0005).
 *
 * A member may write a rating only for their own relationship, naming that
 * relationship's coach and one of its sessions (ratings_write_member). The
 * comment is what the coach's public page shows, through the
 * `coach_reviews` view, signed with a first name and last initial only.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { toWallMs } from './wallClock';

export type RatingErrorCode = 'not_configured' | 'already' | 'refused' | 'unknown';
export type RatingResult<T> = { ok: true; data: T } | { ok: false; code: RatingErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

/** A session the member can rate. */
export interface SessionToRate {
  sessionId: string;
  atWallMs: number;
  recap: string;
  /** Their rating, if they've already given one. */
  rated: number | null;
}

/**
 * The session, if it is one of this relationship's that has happened and
 * the member attended (or the coach hasn't marked it): null otherwise.
 */
export async function fetchSessionToRate(clientId: string, sessionId: string): Promise<RatingResult<SessionToRate | null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const sb = getSupabase();
  const [session, rating] = await Promise.all([
    sb.from('sessions').select('id, scheduled_at, recap, attendance').eq('id', sessionId).eq('client_id', clientId).maybeSingle(),
    sb.from('ratings').select('rating').eq('session_id', sessionId).maybeSingle(),
  ]);
  if (session.error) return unknown(session.error);
  if (rating.error) return unknown(rating.error);
  const s = session.data;
  if (!s || Date.parse(s.scheduled_at) > Date.now() || s.attendance === 'cancelled' || s.attendance === 'no_show') {
    return { ok: true, data: null };
  }
  return {
    ok: true,
    data: { sessionId: s.id, atWallMs: toWallMs(s.scheduled_at), recap: s.recap ?? '', rated: rating.data?.rating ?? null },
  };
}

/**
 * Rate one session. `already`: it has a rating (one per session).
 * `refused`: RLS said no — not this member's session or coach.
 */
export async function rateSession(input: {
  clientId: string;
  coachId: string;
  sessionId: string;
  rating: number;
  comment: string;
}): Promise<RatingResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().from('ratings').insert({
    client_id: input.clientId,
    coach_id: input.coachId,
    session_id: input.sessionId,
    rating: input.rating,
    // Empty isn't a review: coach_reviews shows only rows with a comment.
    comment: input.comment.trim() || null,
  });
  if (error) {
    const code: RatingErrorCode = error.code === '23505' ? 'already' : error.code === '42501' ? 'refused' : 'unknown';
    return { ok: false, code, message: error.message };
  }
  return { ok: true, data: null };
}
