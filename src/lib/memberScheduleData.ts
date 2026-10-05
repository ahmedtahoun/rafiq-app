/**
 * The member's own Schedule (SUPABASE-MIGRATION-PLAN.md step 4, the
 * calendar, part 4): for one relationship, the next booked session, the
 * open request to that coach, and the sessions that have happened — and
 * cancelling a booked session (0016's member_cancel_session). Each past
 * session carries the member's rating of it (step 6), for the Rate button.
 *
 * A member reads their own sessions and blocks (sessions_select,
 * time_blocks_select) and their own requests (session_requests_select).
 * Times cross this edge as wall-clock ms (src/lib/wallClock.ts).
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { toWallMs } from './wallClock';
import type { Database } from './database.types';
import type { SessionType, WeeklyAvailabilityDay } from './mockStore';
import { toWeek } from './requestData';

type Attendance = Database['public']['Enums']['attendance'];

export type MemberScheduleErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type MemberScheduleResult<T> = { ok: true; data: T } | { ok: false; code: MemberScheduleErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

export interface MemberUpcoming {
  sessionId: string;
  /** Its block on the coach's calendar: what a move request names (0017). */
  blockId: string | null;
  startWallMs: number;
  endWallMs: number;
  sessionType: SessionType;
}

export interface MemberOpenRequest {
  id: string;
  startWallMs: number;
  /** As 0010 will book it: a free intro with no offering, else standard. */
  sessionType: SessionType;
}

export interface MemberPastSession {
  id: string;
  atWallMs: number;
  recap: string;
  attendance: Attendance | null;
  /** The member's rating of it (step 6), if they've given one. */
  rating: number | null;
}

export interface MemberSchedule {
  upcoming: MemberUpcoming | null;
  /**
   * The latest session that has begun and nobody has recorded yet: its
   * video call stays open until 30 minutes after it ends (videoData.ts),
   * after `upcoming`, which is strictly in the future, has moved on.
   */
  started: MemberUpcoming | null;
  /** The member's pending request to move `upcoming`, if any. */
  move: { id: string; startWallMs: number } | null;
  request: MemberOpenRequest | null;
  /** The coach's weekly hours, Monday first: where a move can go. */
  hours: WeeklyAvailabilityDay[];
  /** Newest first. A cancelled session never happened, so it isn't here. */
  history: MemberPastSession[];
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

export async function fetchMemberSchedule(clientId: string, coachId: string): Promise<MemberScheduleResult<MemberSchedule>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const supabase = getSupabase();
  const [sessions, requests, hours, ratings] = await Promise.all([
    supabase.from('sessions').select('id, scheduled_at, time_block_id, attendance, recap').eq('client_id', clientId).order('scheduled_at', { ascending: false }),
    supabase.from('session_requests').select('id, requested_start, offering_id, price, reschedule_of').eq('member_id', uid).eq('coach_id', coachId).eq('status', 'pending'),
    supabase.from('weekly_availability').select('day_of_week, enabled, start_hour, end_hour').eq('coach_id', coachId),
    supabase.from('ratings').select('session_id, rating').eq('client_id', clientId),
  ]);
  if (sessions.error) return unknown(sessions.error);
  if (requests.error) return unknown(requests.error);
  if (hours.error) return unknown(hours.error);
  if (ratings.error) return unknown(ratings.error);
  const ratingOf = new Map(ratings.data.filter((r) => r.session_id).map((r) => [r.session_id!, r.rating]));

  const now = Date.now();
  const open = sessions.data.filter((s) => s.attendance === null);
  const next = open
    .filter((s) => Date.parse(s.scheduled_at) > now)
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
  const begun = open
    .filter((s) => Date.parse(s.scheduled_at) <= now)
    .sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at))[0];

  // The block holds a session's length and type; a session with none (a
  // walk-in's, logged by the coach) reads as a standard 50 minutes.
  async function withBlock(row: NonNullable<typeof sessions.data>[number]): Promise<MemberUpcoming | { error: { message: string } }> {
    let endsAt: string | null = null;
    let sessionType: SessionType = 'standard';
    if (row.time_block_id) {
      const block = await supabase.from('time_blocks').select('ends_at, session_type').eq('id', row.time_block_id).maybeSingle();
      if (block.error) return { error: block.error };
      endsAt = block.data?.ends_at ?? null;
      sessionType = block.data?.session_type ?? 'standard';
    }
    const startWallMs = toWallMs(row.scheduled_at);
    return {
      sessionId: row.id,
      blockId: row.time_block_id,
      startWallMs,
      endWallMs: endsAt ? toWallMs(endsAt) : startWallMs + 50 * 60000,
      sessionType,
    };
  }
  const upcoming = next ? await withBlock(next) : null;
  if (upcoming && 'error' in upcoming) return unknown(upcoming.error);
  const started = begun ? await withBlock(begun) : null;
  if (started && 'error' in started) return unknown(started.error);

  // A new-session request, and a move of the upcoming booking (0017).
  const r = requests.data.find((x) => !x.reschedule_of);
  const m = upcoming?.blockId ? requests.data.find((x) => x.reschedule_of === upcoming.blockId) : undefined;
  return {
    ok: true,
    data: {
      upcoming,
      started,
      move: m ? { id: m.id, startWallMs: toWallMs(m.requested_start) } : null,
      hours: toWeek(hours.data),
      request: r
        ? { id: r.id, startWallMs: toWallMs(r.requested_start), sessionType: !r.offering_id && Number(r.price) === 0 ? 'intro' : 'standard' }
        : null,
      history: sessions.data
        .filter((s) => Date.parse(s.scheduled_at) <= now && s.attendance !== 'cancelled')
        .map((s) => ({ id: s.id, atWallMs: toWallMs(s.scheduled_at), recap: s.recap ?? '', attendance: s.attendance, rating: ratingOf.get(s.id) ?? null })),
    },
  };
}

/**
 * `gone`: not this member's, or already cancelled or recorded. `passed`:
 * the session has started.
 */
export type MemberCancelError = 'gone' | 'passed' | 'unknown';

/**
 * Cancel one of the member's booked sessions (0016). With less than 12
 * hours' notice it uses one package credit when one is left (never for a
 * free intro); `charged` says whether it did.
 */
export async function memberCancelSession(
  sessionId: string,
): Promise<{ ok: true; charged: boolean } | { ok: false; code: MemberCancelError | 'not_configured'; message: string }> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase().rpc('member_cancel_session', { p_session: sessionId });
  if (error) {
    const code: MemberCancelError =
      error.code === 'P0002' || error.code === '55000' ? 'gone'
        : error.code === '22023' ? 'passed'
          : 'unknown';
    return { ok: false, code, message: error.message };
  }
  return { ok: true, charged: data === true };
}
