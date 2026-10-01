/**
 * The marketplace half of booking (SUPABASE-MIGRATION-PLAN.md step 4, the
 * accept flow): a member finding a coach, asking them for a first session,
 * and the coach answering.
 *
 *   member  coach_directory + weekly_availability → Discover, CoachPreview
 *           session_requests insert / withdraw     → CoachPreview, MyCoaches
 *   coach   weekly_availability read / write       → Availability
 *           session_requests read, decline         → Notifications
 *           accept_session_request() (0010)        → Notifications
 *
 * Accepting is one database function, not a series of writes from here, so
 * a dropped connection can't leave a member accepted with nothing booked.
 * It runs as the coach (SECURITY INVOKER), under the same policies as
 * everything else in this file.
 *
 * Timestamps cross this edge as wall-clock ms (src/lib/wallClock.ts).
 * Weekly hours are wall-clock hours; a member and coach in different time
 * zones read them each in their own (see the PR notes for step 4).
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { fromWallMs, toWallMs } from './wallClock';
import { getProfilePhotoUrl } from './storage';
import { SPECIALTIES } from './specialties';
import type { Availability, DirectoryCoach } from './directory';
import type { WeeklyAvailabilityDay } from './mockStore';
import type { Enums } from './database.types';

/**
 * `gone`: the request was withdrawn or already answered. `passed`: its time
 * has gone by. `slot_taken`: it overlaps a session already booked.
 */
/** `blocked`: either side has blocked the other, or an account isn't active
    (0017) — or, for a move, the session is no longer this member's to move. */
export type RequestErrorCode = 'not_configured' | 'not_signed_in' | 'gone' | 'passed' | 'slot_taken' | 'blocked' | 'member_cap' | 'unknown';
export type RequestResult<T> = { ok: true; data: T } | { ok: false; code: RequestErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;
const ok = <T,>(data: T) => ({ ok: true, data }) as const;
const GONE = { ok: false, code: 'gone', message: 'The request is no longer open.' } as const;

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Weekly hours
// ---------------------------------------------------------------------------

/** 0 = Monday, as the app and weekly_availability both count. */
export function weekdayOf(wallMs: number): number {
  return (new Date(wallMs).getUTCDay() + 6) % 7;
}

/** Seven days, Monday first, from a coach's rows; a day with no row is off. */
export function toWeek(rows: { day_of_week: number; enabled: boolean; start_hour: number; end_hour: number }[]): WeeklyAvailabilityDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const r = rows.find((x) => x.day_of_week === i);
    return r
      ? { enabled: r.enabled, startH: Number(r.start_hour), endH: Number(r.end_hour) }
      : { enabled: false, startH: 9, endH: 17 };
  });
}

export async function fetchOwnWeeklyAvailability(): Promise<RequestResult<WeeklyAvailabilityDay[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('weekly_availability')
    .select('day_of_week, enabled, start_hour, end_hour')
    .eq('coach_id', uid);
  return error ? unknown(error) : ok(toWeek(data));
}

/** One day's hours. Insert the first time, update after (the row is keyed
    by coach and weekday). */
export async function saveOwnWeeklyDay(dayOfWeek: number, day: WeeklyAvailabilityDay): Promise<RequestResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const supabase = getSupabase();
  const values = { enabled: day.enabled, start_hour: day.startH, end_hour: day.endH };
  const updated = await supabase
    .from('weekly_availability')
    .update(values)
    .eq('coach_id', uid)
    .eq('day_of_week', dayOfWeek)
    .select('day_of_week');
  if (updated.error) return unknown(updated.error);
  if (updated.data.length > 0) return ok(null);
  const { error } = await supabase.from('weekly_availability').insert({ coach_id: uid, day_of_week: dayOfWeek, ...values });
  return error ? unknown(error) : ok(null);
}

/**
 * How soon a coach has an opening, for Discover's pill and filter: a
 * window still ahead of now today, one later in the next six days, or any
 * enabled day at all (so the week after). null: no hours set.
 */
export function availabilityOf(week: WeeklyAvailabilityDay[], nowWallMs: number): Availability | null {
  if (!week.some((d) => d.enabled)) return null;
  const today = weekdayOf(nowWallMs);
  const hourNow = (nowWallMs % 86400000) / 3600000;
  if (week[today].enabled && week[today].endH > hourNow) return 'today';
  for (let i = 1; i < 7; i++) if (week[(today + i) % 7].enabled) return 'this-week';
  return 'next-week';
}

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

const PALETTE = ['#B75C3D', '#3E6FB0', '#3F7D58', '#7A6BAE', '#A65D6E', '#1F7A8C', '#96472D', '#26547C'];

/** The same coach always gets the same colour. */
function colourOf(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** A coach from the real directory: the demo's card fields, plus what only
    a real coach has. */
export interface RealDirectoryCoach extends DirectoryCoach {
  /** Fewer than MIN_REVIEWS_FOR_RATING means `rating` isn't shown. */
  ratingCount: number;
  bio: string;
  /** Signed URL, or '' with no photo. */
  avatarPhotoUrl: string;
  sessionMode: Enums<'session_mode'>;
  /** Whether any active offering has a price: `price` is its lowest. */
  hasPaidOffering: boolean;
  week: WeeklyAvailabilityDay[];
}

type DirectoryRow = {
  coach_id: string | null; full_name: string | null; title: string | null; country: string | null;
  languages: string[] | null; experience_years: number | null; verified: boolean | null; featured: boolean | null;
  from_price: number | null; rating_count: number | null; rating_avg: number | null; bio: string | null;
  avatar_photo_url: string | null; session_mode: Enums<'session_mode'> | null;
};
const DIRECTORY_COLUMNS =
  'coach_id, full_name, title, country, languages, experience_years, verified, featured, from_price, rating_count, rating_avg, bio, avatar_photo_url, session_mode';

async function toDirectoryCoach(
  row: DirectoryRow,
  hours: { coach_id: string; day_of_week: number; enabled: boolean; start_hour: number; end_hour: number }[],
  nowWallMs: number,
): Promise<RealDirectoryCoach> {
  const id = row.coach_id ?? '';
  // title is the coach's specialties joined with ' · '; the card shows the first.
  const specialty = (row.title ?? '').split(' · ')[0] ?? '';
  const def = SPECIALTIES.find((s) => s.value === specialty);
  const week = toWeek(hours.filter((h) => h.coach_id === id));
  const photo = row.avatar_photo_url ? await getProfilePhotoUrl('avatar', row.avatar_photo_url) : null;
  return {
    id,
    name: row.full_name ?? '',
    specialty,
    icon: def?.icon ?? 'life',
    color: colourOf(id),
    rating: row.rating_avg == null ? 0 : Number(row.rating_avg),
    ratingCount: row.rating_count ?? 0,
    price: row.from_price == null ? 0 : Number(row.from_price),
    hasPaidOffering: row.from_price != null,
    years: row.experience_years ?? 0,
    country: row.country ?? '',
    languages: row.languages ?? [],
    availability: availabilityOf(week, nowWallMs),
    verified: !!row.verified,
    featured: !!row.featured,
    bio: row.bio ?? '',
    avatarPhotoUrl: photo?.ok ? photo.data : '',
    sessionMode: row.session_mode ?? 'both',
    week,
  };
}

/** Every listed coach but the caller, with their weekly hours. */
export async function fetchDirectory(nowWallMs: number): Promise<RequestResult<RealDirectoryCoach[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const supabase = getSupabase();
  const [coaches, hours] = await Promise.all([
    supabase.from('coach_directory').select(DIRECTORY_COLUMNS),
    supabase.from('weekly_availability').select('coach_id, day_of_week, enabled, start_hour, end_hour'),
  ]);
  if (coaches.error) return unknown(coaches.error);
  if (hours.error) return unknown(hours.error);
  const rows = (coaches.data as DirectoryRow[]).filter((r) => r.coach_id && r.coach_id !== uid);
  return ok(await Promise.all(rows.map((r) => toDirectoryCoach(r, hours.data, nowWallMs))));
}

export interface CoachOffering {
  id: string;
  name: string;
  description: string;
  type: Enums<'offering_type'>;
  /** The coach's own words ("50 min"), shown as written. */
  duration: string;
  format: Enums<'session_mode'>;
  price: number;
  currency: string;
}

/** A member's open request, as CoachPreview and MyCoaches show it. */
export interface OwnRequest {
  id: string;
  coachId: string;
  coachName: string;
  offeringName: string | null;
  startWallMs: number;
  price: number;
}

export interface CoachPreviewData {
  coach: RealDirectoryCoach;
  offerings: CoachOffering[];
  /** The member's open request to this coach, if any. */
  pending: OwnRequest | null;
}

export async function fetchCoachPreview(coachId: string, nowWallMs: number): Promise<RequestResult<CoachPreviewData | null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const supabase = getSupabase();
  const [coach, hours, offerings, pending] = await Promise.all([
    supabase.from('coach_directory').select(DIRECTORY_COLUMNS).eq('coach_id', coachId).maybeSingle(),
    supabase.from('weekly_availability').select('coach_id, day_of_week, enabled, start_hour, end_hour').eq('coach_id', coachId),
    supabase
      .from('offerings')
      .select('id, name, description, type, duration, format, price, currency')
      .eq('coach_id', coachId)
      .eq('active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('session_requests')
      .select('id, offering_id, requested_start, price')
      .eq('member_id', uid)
      .eq('coach_id', coachId)
      .eq('status', 'pending')
      // A request to move a booking is the member's Sessions screen's.
      .is('reschedule_of', null)
      .maybeSingle(),
  ]);
  for (const r of [coach, hours, offerings, pending]) if (r.error) return unknown(r.error);
  if (!coach.data) return ok(null);

  const real = await toDirectoryCoach(coach.data as DirectoryRow, hours.data!, nowWallMs);
  const list: CoachOffering[] = offerings.data!.map((o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    type: o.type,
    duration: o.duration,
    format: o.format,
    price: Number(o.price),
    currency: o.currency,
  }));
  const p = pending.data;
  return ok({
    coach: real,
    offerings: list,
    pending: p
      ? {
          id: p.id,
          coachId,
          coachName: real.name,
          offeringName: list.find((o) => o.id === p.offering_id)?.name ?? null,
          startWallMs: toWallMs(p.requested_start),
          price: Number(p.price),
        }
      : null,
  });
}

// ---------------------------------------------------------------------------
// A member's requests
// ---------------------------------------------------------------------------

export interface NewRequest {
  coachId: string;
  /** null: the free intro call. */
  offeringId: string | null;
  startWallMs: number;
  price: number;
  currency: string;
}

/**
 * Ask a coach for a session. One open request per coach (0005's unique
 * index), so an earlier one to the same coach is withdrawn first — a
 * member who picks a new time replaces their request, as the demo does.
 */
export async function sendSessionRequest(request: NewRequest): Promise<RequestResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const supabase = getSupabase();
  const withdrawn = await supabase
    .from('session_requests')
    .update({ status: 'withdrawn' })
    .eq('member_id', uid)
    .eq('coach_id', request.coachId)
    .eq('status', 'pending')
    // Never a pending move: that's a different booking's request (0017).
    .is('reschedule_of', null);
  if (withdrawn.error) return unknown(withdrawn.error);
  const { error } = await supabase.from('session_requests').insert({
    member_id: uid,
    coach_id: request.coachId,
    offering_id: request.offeringId,
    requested_start: fromWallMs(request.startWallMs),
    price: request.price,
    currency: request.currency,
    // The column's default, stated: session_requests_insert_member allows no other.
    status: 'pending',
  });
  if (error?.code === '42501') return { ok: false, code: 'blocked', message: error.message };
  return error ? unknown(error) : ok(null);
}

/**
 * Ask the coach to move one of the member's booked sessions (0017): a
 * request naming the booking, at least 12 hours before it starts. The
 * coach accepts it in Notifications; until then the booking stays put.
 */
export async function sendMoveRequest(move: { coachId: string; blockId: string; startWallMs: number }): Promise<RequestResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { error } = await getSupabase().from('session_requests').insert({
    member_id: uid,
    coach_id: move.coachId,
    offering_id: null,
    requested_start: fromWallMs(move.startWallMs),
    price: 0,
    status: 'pending',
    reschedule_of: move.blockId,
  });
  if (!error) return ok(null);
  // 42501: blocked, too close to the session, or no longer theirs.
  // 23505: a move for this booking is already waiting.
  if (error.code === '42501') return { ok: false, code: 'blocked', message: error.message };
  if (error.code === '23505') return GONE;
  return unknown(error);
}

/** Only a still-open request: one the coach has already answered stays answered. */
export async function withdrawSessionRequest(requestId: string): Promise<RequestResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase()
    .from('session_requests')
    .update({ status: 'withdrawn' })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (error) return unknown(error);
  return data.length ? ok(null) : GONE;
}

/** The member's open requests, newest first, with who they're waiting on. */
export async function fetchOwnRequests(): Promise<RequestResult<OwnRequest[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const supabase = getSupabase();
  const requests = await supabase
    .from('session_requests')
    .select('id, coach_id, offering_id, requested_start, price')
    .eq('member_id', uid)
    .eq('status', 'pending')
    .is('reschedule_of', null)
    .order('created_at', { ascending: false });
  if (requests.error) return unknown(requests.error);
  if (requests.data.length === 0) return ok([]);

  const coachIds = [...new Set(requests.data.map((r) => r.coach_id))];
  const offeringIds = requests.data.map((r) => r.offering_id).filter((id): id is string => !!id);
  const [coaches, offerings] = await Promise.all([
    supabase.from('coach_directory').select('coach_id, full_name').in('coach_id', coachIds),
    offeringIds.length ? supabase.from('offerings').select('id, name').in('id', offeringIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (coaches.error) return unknown(coaches.error);
  if (offerings.error) return unknown(offerings.error);
  return ok(
    requests.data.map((r) => ({
      id: r.id,
      coachId: r.coach_id,
      coachName: coaches.data.find((c) => c.coach_id === r.coach_id)?.full_name ?? '',
      offeringName: (offerings.data as { id: string; name: string }[]).find((o) => o.id === r.offering_id)?.name ?? null,
      startWallMs: toWallMs(r.requested_start),
      price: Number(r.price),
    })),
  );
}

// ---------------------------------------------------------------------------
// A coach's incoming requests
// ---------------------------------------------------------------------------

export interface IncomingRequest {
  id: string;
  memberName: string;
  offeringName: string | null;
  startWallMs: number;
  price: number;
  currency: string;
  /** When it was sent, for the list's order. */
  sentAt: string;
  /** A request to move a booked session (0017): the booking's time now. */
  movesFromWallMs: number | null;
}

export async function fetchIncomingRequests(): Promise<RequestResult<IncomingRequest[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const supabase = getSupabase();
  const requests = await supabase
    .from('session_requests')
    .select('id, member_id, offering_id, requested_start, price, currency, created_at, reschedule_of')
    .eq('coach_id', uid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (requests.error) return unknown(requests.error);
  if (requests.data.length === 0) return ok([]);

  const memberIds = [...new Set(requests.data.map((r) => r.member_id))];
  const offeringIds = requests.data.map((r) => r.offering_id).filter((id): id is string => !!id);
  const blockIds = requests.data.map((r) => r.reschedule_of).filter((id): id is string => !!id);
  const [members, offerings, blocks] = await Promise.all([
    // profiles_select_own lets a coach read whoever has asked them.
    supabase.from('profiles').select('id, full_name').in('id', memberIds),
    offeringIds.length ? supabase.from('offerings').select('id, name').in('id', offeringIds) : Promise.resolve({ data: [], error: null }),
    blockIds.length ? supabase.from('time_blocks').select('id, starts_at').in('id', blockIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (members.error) return unknown(members.error);
  if (offerings.error) return unknown(offerings.error);
  if (blocks.error) return unknown(blocks.error);
  return ok(
    requests.data.map((r) => ({
      id: r.id,
      memberName: members.data.find((m) => m.id === r.member_id)?.full_name ?? '',
      offeringName: (offerings.data as { id: string; name: string }[]).find((o) => o.id === r.offering_id)?.name ?? null,
      startWallMs: toWallMs(r.requested_start),
      price: Number(r.price),
      currency: r.currency,
      sentAt: r.created_at,
      movesFromWallMs: (() => {
        const from = (blocks.data as { id: string; starts_at: string }[]).find((b) => b.id === r.reschedule_of);
        return from ? toWallMs(from.starts_at) : null;
      })(),
    })),
  );
}

/** Accept: 0010's function books it and puts the member on the roster —
    or, for a move (0017), moves the booking. Returns the roster row's id. */
export async function acceptSessionRequest(requestId: string): Promise<RequestResult<string>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase().rpc('accept_session_request', { p_request: requestId });
  if (!error) return ok(data as string);
  const code: RequestErrorCode =
    error.code === 'P0002' || error.code === '55000' ? 'gone'
      : error.code === '22023' ? 'passed'
        : error.code === '23P01' ? 'slot_taken'
          : error.code === '42501' ? 'blocked'
            // 0021: the free plan already has its 3 active members.
            : error.code === '53400' ? 'member_cap'
              : 'unknown';
  return { ok: false, code, message: error.message };
}

/** Only a still-open request: a withdrawn one stays withdrawn. */
export async function declineSessionRequest(requestId: string): Promise<RequestResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase()
    .from('session_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (error) return unknown(error);
  return data.length ? ok(null) : GONE;
}
