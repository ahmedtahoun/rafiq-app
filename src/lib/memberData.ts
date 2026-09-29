/**
 * The signed-in member's side of their coaching relationships
 * (SUPABASE-MIGRATION-PLAN.md step 3, member half): every `clients` row
 * linked to them (`member_id` — set only when a coach accepts their session
 * request, 0008), the coach behind each (the public `coach_directory`
 * view), and for each relationship its tasks, session package, sessions
 * (for the count and the coach's latest recap) and the member's mood
 * check-ins.
 *
 * A member may read all of that (RLS: is_member_of / can_see_client) and
 * write only three things here: a task's done state (0004's
 * tasks_member_scope refuses anything else), a mood check-in, and their own
 * contact details on `profiles`. The roster row itself is the coach's.
 *
 * Rows come back in mockStore's shapes, with timestamps as wall-clock ms
 * (src/lib/wallClock.ts), like rosterData.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { toWallMs } from './wallClock';
import { getProfilePhotoUrl, type PhotoKind } from './storage';
import type { Client, MoodKey, RawPackage, Task } from './mockStore';
import type { Tables } from './database.types';

export type MemberErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type MemberResult<T> = { ok: true; data: T } | { ok: false; code: MemberErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;
const ok = <T,>(data: T) => ({ ok: true, data }) as const;

/** The coach of a relationship, as the public directory shows them. */
export interface MemberCoach {
  id: string;
  name: string;
  /** Specialties, joined with ' · ' (coach_profiles.title). */
  title: string;
  verified: boolean;
  ratingCount: number;
  ratingAvg: number | null;
  bio: string;
  /** The first of their certifications, as the coach's own card shows it. */
  cert: string;
  /** Signed URLs, ready for an <img>; '' when there's no photo. */
  avatarPhotoUrl: string;
  coverPhotoUrl: string;
}

/** One coaching relationship, from the member's side. */
export interface Relationship {
  /** The roster row, in mockStore's shape. `notes` is always empty: the
      coach's notes live in client_private, which a member can't read. */
  client: Client;
  /** null if the coach's account is no longer listed (suspended, or
      deleted and anonymised): the relationship's history still shows. */
  coach: MemberCoach | null;
  coachId: string;
  tasks: Task[];
  package: RawPackage | null;
  /** Sessions that have happened (scheduled before now), newest first. */
  pastSessions: { id: string; atMs: number; recap: string }[];
  /** The member's latest mood check-in for this relationship. */
  mood: MoodKey | null;
}

/** A photo that won't sign is shown as no photo, not a failed screen. */
async function signedUrl(kind: PhotoKind, path: string | null): Promise<string> {
  if (!path) return '';
  const result = await getProfilePhotoUrl(kind, path);
  return result.ok ? result.data : '';
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

const CLIENT_COLUMNS =
  'id, coach_id, full_name, age, phone, country_code, email, city, program, specialty, plan, initials, avatar_bg, active, progress, needs_checkin, next_session_at, next_session_type, program_completed, payment_status, goal, focus, signup_completed_at, created_at';
type ClientRow = Pick<
  Tables<'clients'>,
  | 'id' | 'coach_id' | 'full_name' | 'age' | 'phone' | 'country_code' | 'email' | 'city' | 'program' | 'specialty' | 'plan'
  | 'initials' | 'avatar_bg' | 'active' | 'progress' | 'needs_checkin' | 'next_session_at' | 'next_session_type'
  | 'program_completed' | 'payment_status' | 'goal' | 'focus' | 'signup_completed_at' | 'created_at'
>;

function toClient(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.full_name,
    age: r.age,
    phone: r.phone ?? '',
    countryCode: r.country_code ?? '',
    program: r.program,
    specialty: r.specialty,
    plan: r.plan,
    initials: r.initials,
    avatarBg: r.avatar_bg,
    active: r.active,
    progress: r.progress,
    needsCheckin: r.needs_checkin,
    nextSessionAtMs: r.next_session_at ? toWallMs(r.next_session_at) : null,
    programCompleted: r.program_completed,
    nextSessionType: r.next_session_type ?? undefined,
    paymentStatus: r.payment_status,
    goal: r.goal,
    notes: '',
    focus: r.focus,
    email: r.email ?? '',
    city: r.city ?? '',
    signupCompletedAtMs: r.signup_completed_at ? toWallMs(r.signup_completed_at) : null,
  };
}

export async function fetchMemberRelationships(): Promise<MemberResult<Relationship[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const supabase = getSupabase();

  const clients = await supabase.from('clients').select(CLIENT_COLUMNS).eq('member_id', uid).order('created_at', { ascending: true });
  if (clients.error) return unknown(clients.error);
  if (clients.data.length === 0) return ok([]);
  const ids = clients.data.map((c) => c.id);
  const coachIds = [...new Set(clients.data.map((c) => c.coach_id))];

  const [coaches, tasks, packages, sessions, moods] = await Promise.all([
    supabase
      .from('coach_directory')
      .select('coach_id, full_name, title, verified, rating_count, rating_avg, bio, certifications, avatar_photo_url, cover_photo_url')
      .in('coach_id', coachIds),
    supabase.from('tasks').select('id, client_id, title, description, due_at, due_has_time, recurring, done, created_at').in('client_id', ids).order('due_at', { ascending: true }),
    supabase.from('packages').select('client_id, total, used, expires_at').in('client_id', ids),
    supabase.from('sessions').select('id, client_id, scheduled_at, recap, attendance').in('client_id', ids).order('scheduled_at', { ascending: false }),
    supabase.from('mood_checkins').select('client_id, mood, created_at').in('client_id', ids).order('created_at', { ascending: false }),
  ]);
  for (const r of [coaches, tasks, packages, sessions, moods]) if (r.error) return unknown(r.error);

  const photos = new Map(
    await Promise.all(
      coaches.data!.map(async (c) => [c.coach_id, await Promise.all([signedUrl('avatar', c.avatar_photo_url), signedUrl('cover', c.cover_photo_url)])] as const),
    ),
  );

  const now = Date.now();
  return ok(
    clients.data.map((row) => {
      const coach = coaches.data!.find((c) => c.coach_id === row.coach_id);
      const pkg = packages.data!.find((p) => p.client_id === row.id);
      return {
        client: toClient(row),
        coachId: row.coach_id,
        coach: coach && coach.coach_id
          ? {
              id: coach.coach_id,
              name: coach.full_name ?? '',
              title: coach.title ?? '',
              verified: !!coach.verified,
              ratingCount: coach.rating_count ?? 0,
              ratingAvg: coach.rating_avg == null ? null : Number(coach.rating_avg),
              bio: coach.bio ?? '',
              cert: coach.certifications?.[0] ?? '',
              avatarPhotoUrl: photos.get(coach.coach_id)?.[0] ?? '',
              coverPhotoUrl: photos.get(coach.coach_id)?.[1] ?? '',
            }
          : null,
        tasks: tasks.data!
          .filter((t) => t.client_id === row.id)
          .map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            dueAtMs: toWallMs(t.due_at ?? t.created_at),
            dueHasTime: t.due_has_time,
            recurring: t.recurring,
            done: t.done,
          })),
        package: pkg ? { total: pkg.total, used: pkg.used, expiresAtMs: toWallMs(pkg.expires_at) } : null,
        pastSessions: sessions.data!
          // A cancelled session (0011 keeps it for history) never happened,
          // and one the member missed (0015's no-show) wasn't held together.
          .filter((s) => s.client_id === row.id && Date.parse(s.scheduled_at) <= now && s.attendance !== 'cancelled' && s.attendance !== 'no_show')
          .map((s) => ({ id: s.id, atMs: toWallMs(s.scheduled_at), recap: s.recap ?? '' })),
        mood: (moods.data!.find((m) => m.client_id === row.id)?.mood as MoodKey | undefined) ?? null,
      };
    }),
  );
}

/** The one change a member may make to a task: done, or not done. */
export async function setMemberTaskDone(taskId: string, done: boolean): Promise<MemberResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase()
    .from('tasks')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', taskId);
  return error ? unknown(error) : ok(null);
}

/** A mood check-in is a new row each time — mood_checkins keeps history. */
export async function addMoodCheckin(clientId: string, mood: MoodKey): Promise<MemberResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().from('mood_checkins').insert({ client_id: clientId, mood });
  return error ? unknown(error) : ok(null);
}

export interface MemberContact {
  fullName: string;
  phone: string;
  countryCode: string;
}

export interface MemberSpace {
  /** The member's own account (profiles), not any coach's label for them. */
  contact: MemberContact;
  relationships: Relationship[];
}

/** Everything the member screens show: their own contact details and
    every relationship, in one load. */
export async function fetchMemberSpace(): Promise<MemberResult<MemberSpace>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const [profile, relationships] = await Promise.all([
    getSupabase().from('profiles').select('full_name, phone, country_code').eq('id', uid).maybeSingle(),
    fetchMemberRelationships(),
  ]);
  if (profile.error) return unknown(profile.error);
  if (!relationships.ok) return relationships;
  const p = profile.data;
  return ok({
    contact: { fullName: p?.full_name ?? '', phone: p?.phone ?? '', countryCode: p?.country_code ?? '' },
    relationships: relationships.data,
  });
}

/** The member's own account, not a coach's roster row: `profiles` is theirs
    to write (0005's column grant), `clients` is only the coach's. */
export async function saveOwnMemberContact(contact: MemberContact): Promise<MemberResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { error } = await getSupabase()
    .from('profiles')
    .update({ full_name: contact.fullName, phone: contact.phone, country_code: contact.countryCode })
    .eq('id', uid);
  return error ? unknown(error) : ok(null);
}
