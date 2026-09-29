/**
 * The coach's own calendar (SUPABASE-MIGRATION-PLAN.md step 4, the
 * calendar): one week of `time_blocks` — sessions booked (0010 books them
 * when a request is accepted), requests pending, and the coach's own busy
 * and open blocks — for Schedule, and adding a block for AddTimeBlock.
 *
 * A coach reads and writes only their own blocks (time_blocks_select /
 * time_blocks_write_coach). Times cross this edge as wall-clock ms
 * (src/lib/wallClock.ts).
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { fromWallMs, toWallMs } from './wallClock';
import type { Database } from './database.types';
import type { SessionType, TimeBlockKind } from './mockStore';

export type Attendance = Database['public']['Enums']['attendance'];

export type ScheduleErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type ScheduleResult<T> = { ok: true; data: T } | { ok: false; code: ScheduleErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

const DAY = 86400000;

export interface CalendarBlock {
  id: string;
  /** null for the coach's own busy or open time. */
  clientId: string | null;
  kind: TimeBlockKind;
  label: string;
  startWallMs: number;
  endWallMs: number;
  sessionType?: SessionType;
  /** A booking's session on the relationship (0010's sessions.time_block_id). */
  sessionId?: string;
  /** What happened at it, once recorded, and by whom. */
  attendance?: Attendance | null;
  attendanceSetBy?: 'coach' | 'client' | null;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/** The coach's blocks starting in the seven days from `weekStartWallMs`. */
export async function fetchCoachWeek(weekStartWallMs: number): Promise<ScheduleResult<CalendarBlock[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('time_blocks')
    .select('id, client_id, kind, label, starts_at, ends_at, session_type')
    .eq('coach_id', uid)
    .gte('starts_at', fromWallMs(weekStartWallMs))
    .lt('starts_at', fromWallMs(weekStartWallMs + 7 * DAY))
    .order('starts_at', { ascending: true });
  if (error) return unknown(error);
  // Each booking's session, for its attendance once it has happened.
  const bookedIds = data.filter((b) => b.kind === 'booked').map((b) => b.id);
  let sessions: { id: string; time_block_id: string | null; attendance: Attendance | null; attendance_set_by: 'coach' | 'client' | null }[] = [];
  if (bookedIds.length) {
    const read = await getSupabase()
      .from('sessions')
      .select('id, time_block_id, attendance, attendance_set_by')
      .in('time_block_id', bookedIds);
    if (read.error) return unknown(read.error);
    sessions = read.data;
  }
  return {
    ok: true,
    data: data.map((b) => {
      const session = sessions.find((s) => s.time_block_id === b.id);
      return {
        id: b.id,
        clientId: b.client_id,
        kind: b.kind,
        label: b.label ?? '',
        startWallMs: toWallMs(b.starts_at),
        endWallMs: toWallMs(b.ends_at),
        sessionType: b.session_type ?? undefined,
        ...(session ? { sessionId: session.id, attendance: session.attendance, attendanceSetBy: session.attendance_set_by } : {}),
      };
    }),
  };
}

/** One of the coach's own busy blocks — never a member's. (Open time is
    their weekly hours, which members book from.) */
export async function addOwnTimeBlock(block: {
  kind: 'busy';
  label: string;
  startWallMs: number;
  endWallMs: number;
}): Promise<ScheduleResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { error } = await getSupabase().from('time_blocks').insert({
    coach_id: uid,
    client_id: null,
    kind: block.kind,
    label: block.label,
    starts_at: fromWallMs(block.startWallMs),
    ends_at: fromWallMs(block.endWallMs),
  });
  return error ? unknown(error) : { ok: true, data: null };
}

/**
 * `gone`: already moved away, cancelled, or not a booking. `passed`: the
 * session has started, or the new time has. `slot_taken`: the new time
 * overlaps another booked session.
 */
export type BookingChangeError = 'gone' | 'passed' | 'slot_taken' | 'unknown';

function changeError(error: { code?: string; message: string }): { ok: false; code: BookingChangeError; message: string } {
  const code: BookingChangeError =
    error.code === 'P0002' || error.code === '55000' ? 'gone'
      : error.code === '22023' ? 'passed'
        : error.code === '23P01' ? 'slot_taken'
          : 'unknown';
  return { ok: false, code, message: error.message };
}

/** Move a booked session to a new start, keeping its length (0011). */
export async function rescheduleBooking(
  blockId: string,
  startWallMs: number,
): Promise<{ ok: true } | { ok: false; code: BookingChangeError | 'not_configured'; message: string }> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().rpc('reschedule_booking', { p_block: blockId, p_start: fromWallMs(startWallMs) });
  return error ? changeError(error) : { ok: true };
}

/** Cancel a booked session: recorded, the session kept as cancelled, the time freed (0011). */
export async function cancelBooking(
  blockId: string,
): Promise<{ ok: true } | { ok: false; code: BookingChangeError | 'not_configured'; message: string }> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().rpc('cancel_booking', { p_block: blockId });
  return error ? changeError(error) : { ok: true };
}

/** Remove one of the coach's own busy blocks. Only busy time: a booking is
    cancelled through cancel_booking, never deleted. */
export async function removeOwnBusyBlock(blockId: string): Promise<ScheduleResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase()
    .from('time_blocks')
    .delete()
    .eq('id', blockId)
    .eq('kind', 'busy')
    .select('id');
  if (error) return unknown(error);
  return data.length ? { ok: true, data: null } : unknown({ message: 'No such busy block.' });
}

/**
 * `recorded`: attendance is already set (by the coach, a member's dispute,
 * or a cancellation). `not_yet`: the session hasn't started. `gone`: not
 * this coach's session.
 */
export type AttendanceError = 'recorded' | 'not_yet' | 'gone' | 'unknown';

/**
 * Record what happened at a session that has started (0012). Held or
 * missed uses one package credit when one is left (never for a free intro);
 * disputed holds it. `charged` says whether a credit was used.
 */
export async function markAttendance(
  sessionId: string,
  outcome: 'attended' | 'no_show' | 'disputed',
): Promise<{ ok: true; charged: boolean } | { ok: false; code: AttendanceError | 'not_configured'; message: string }> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase().rpc('mark_attendance', { p_session: sessionId, p_outcome: outcome });
  if (error) {
    const code: AttendanceError =
      error.code === '55000' ? 'recorded'
        : error.code === '22023' ? 'not_yet'
          : error.code === 'P0002' ? 'gone'
            : 'unknown';
    return { ok: false, code, message: error.message };
  }
  return { ok: true, charged: data === true };
}
