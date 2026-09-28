/**
 * The signed-in user's own profile, on Supabase (SUPABASE-MIGRATION-PLAN.md
 * step 2): `profiles` (both roles), `coach_profiles` (coach) and
 * `member_profiles` (member, 0006).
 *
 * What the app may write is fixed by column grants, and this module writes
 * nothing else — supabase/tests/07_profiles.sql issues each of these writes
 * as the authenticated role to prove it:
 *   profiles        full_name, email, phone, country_code, country,
 *                   country_flag, city, avatar_photo_url   (never account_status)
 *   coach_profiles  title, cert, bio, languages, session_mode, experience_years,
 *                   certifications, cover_photo_url, signup_completed_at
 *                   (never verification_status or featured)
 *   member_profiles goal, focus, signup_completed_at
 *
 * Same result shape as auth.ts and adminQueues.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getProfilePhotoUrl, removeProfilePhoto, uploadProfilePhoto, type PhotoKind } from './storage';
import { COUNTRIES } from './countries';
import type { CoachProfile, CoachSignupFields, ClientSignupFields, SessionMode, VerificationStatus } from './mockStore';
import type { TablesUpdate } from './database.types';

export type ProfileErrorCode =
  | 'not_configured'
  | 'not_signed_in'
  | 'photo_too_large'
  | 'photo_wrong_type'
  | 'photo_failed'
  | 'unknown';

export type ProfileResult<T> = { ok: true; data: T } | { ok: false; code: ProfileErrorCode; message: string };

export interface OwnCoachProfile {
  /** Photo fields hold short-lived signed URLs, ready for an <img src>. */
  profile: CoachProfile;
  verificationStatus: VerificationStatus;
}

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;

function unknown(error: { message: string }) {
  return { ok: false, code: 'unknown', message: error.message } as const;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/** The object path stored in a *_photo_url column → a URL an <img> can load.
    A photo that won't sign is shown as no photo, not a failed screen. */
async function signedUrl(kind: PhotoKind, path: string | null): Promise<string> {
  if (!path) return '';
  const result = await getProfilePhotoUrl(kind, path);
  return result.ok ? result.data : '';
}

/**
 * Writes the caller's own coach_profiles / member_profiles row, creating it
 * the first time. Not a PostgREST upsert: that names the primary key in its
 * ON CONFLICT ... SET list, and profile_id has no UPDATE grant, so every
 * upsert is refused (07_profiles.sql, "an upsert naming profile_id").
 */
async function writeOwnCoachRow(uid: string, values: TablesUpdate<'coach_profiles'>): Promise<{ message: string } | null> {
  const supabase = getSupabase();
  const updated = await supabase.from('coach_profiles').update(values).eq('profile_id', uid).select('profile_id');
  if (updated.error) return updated.error;
  if (updated.data.length > 0) return null;
  const inserted = await supabase.from('coach_profiles').insert({ ...values, profile_id: uid });
  return inserted.error;
}

async function writeOwnMemberRow(uid: string, values: TablesUpdate<'member_profiles'>): Promise<{ message: string } | null> {
  const supabase = getSupabase();
  const updated = await supabase.from('member_profiles').update(values).eq('profile_id', uid).select('profile_id');
  if (updated.error) return updated.error;
  if (updated.data.length > 0) return null;
  const inserted = await supabase.from('member_profiles').insert({ ...values, profile_id: uid });
  return inserted.error;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchOwnCoachProfile(): Promise<ProfileResult<OwnCoachProfile>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;

  const supabase = getSupabase();
  const [person, coach] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, email, phone, country_code, country, country_flag, city, avatar_photo_url, account_status')
      .eq('id', uid)
      .maybeSingle(),
    supabase
      .from('coach_profiles')
      .select('title, cert, bio, languages, session_mode, experience_years, certifications, cover_photo_url, verification_status, signup_completed_at')
      .eq('profile_id', uid)
      .maybeSingle(),
  ]);
  if (person.error) return unknown(person.error);
  if (coach.error) return unknown(coach.error);

  const p = person.data;
  // No coach_profiles row yet means a coach who hasn't finished
  // onboarding: every coach field is empty rather than the screen failing.
  const c = coach.data;
  const [avatarPhotoUrl, coverPhotoUrl] = await Promise.all([
    signedUrl('avatar', p?.avatar_photo_url ?? null),
    signedUrl('cover', c?.cover_photo_url ?? null),
  ]);

  return {
    ok: true,
    data: {
      profile: {
        id: uid,
        name: p?.full_name ?? '',
        countryCode: p?.country_code ?? '',
        phone: p?.phone ?? '',
        email: p?.email ?? '',
        city: p?.city ?? '',
        country: p?.country ?? '',
        countryFlag: p?.country_flag ?? '',
        title: c?.title ?? '',
        cert: c?.cert ?? '',
        bio: c?.bio ?? '',
        languages: c?.languages ?? [],
        sessionMode: (c?.session_mode ?? 'both') as SessionMode,
        experienceYears: c?.experience_years ?? '',
        certifications: c?.certifications ?? [],
        avatarPhotoUrl,
        coverPhotoUrl,
        accountStatus: p?.account_status,
        signupCompletedAtMs: c?.signup_completed_at ? Date.parse(c.signup_completed_at) : null,
      },
      verificationStatus: c?.verification_status ?? 'unverified',
    },
  };
}

/** Whether this account finished its role's onboarding — what sign-in
    routing reads to decide between onboarding and home on a new device. */
export async function fetchOwnSignupCompleted(role: 'coach' | 'client'): Promise<ProfileResult<boolean>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = role === 'coach'
    ? await getSupabase().from('coach_profiles').select('signup_completed_at').eq('profile_id', uid).maybeSingle()
    : await getSupabase().from('member_profiles').select('signup_completed_at').eq('profile_id', uid).maybeSingle();
  if (error) return unknown(error);
  return { ok: true, data: Boolean(data?.signup_completed_at) };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** What Edit Profile can change. Photos travel separately, as files. */
export type CoachProfileEdits = Pick<
  CoachProfile,
  'name' | 'phone' | 'countryCode' | 'country' | 'countryFlag' | 'title' | 'cert' | 'bio' | 'languages' | 'sessionMode' | 'experienceYears' | 'certifications'
>;

/** undefined = leave as is, a File = replace, null = remove. */
export interface PhotoEdits {
  avatar?: File | null;
  cover?: File | null;
}

/** Uploads/removes one photo and returns the column value to store, or
    undefined to leave the column alone. */
async function applyPhoto(kind: PhotoKind, edit: File | null | undefined): Promise<ProfileResult<string | null | undefined>> {
  if (edit === undefined) return { ok: true, data: undefined };
  if (edit === null) {
    // A missing object is not worth failing the save over: the column is
    // cleared either way, and that is what the UI reads.
    await removeProfilePhoto(kind);
    return { ok: true, data: null };
  }
  const uploaded = await uploadProfilePhoto(kind, edit);
  if (uploaded.ok) return uploaded;
  const code: ProfileErrorCode =
    uploaded.code === 'too_large' ? 'photo_too_large' : uploaded.code === 'wrong_type' ? 'photo_wrong_type' : 'photo_failed';
  return { ok: false, code, message: uploaded.message };
}

export async function saveOwnCoachProfile(edits: CoachProfileEdits, photos: PhotoEdits = {}): Promise<ProfileResult<OwnCoachProfile>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;

  const avatar = await applyPhoto('avatar', photos.avatar);
  if (!avatar.ok) return avatar;
  const cover = await applyPhoto('cover', photos.cover);
  if (!cover.ok) return cover;

  const person: TablesUpdate<'profiles'> = {
    full_name: edits.name,
    phone: edits.phone,
    country_code: edits.countryCode,
    country: edits.country,
    country_flag: edits.countryFlag,
  };
  if (avatar.data !== undefined) person.avatar_photo_url = avatar.data;
  const personResult = await getSupabase().from('profiles').update(person).eq('id', uid);
  if (personResult.error) return unknown(personResult.error);

  const coach: TablesUpdate<'coach_profiles'> = {
    title: edits.title,
    cert: edits.cert,
    bio: edits.bio,
    languages: edits.languages,
    session_mode: edits.sessionMode,
    experience_years: edits.experienceYears === '' ? null : edits.experienceYears,
    certifications: edits.certifications,
  };
  if (cover.data !== undefined) coach.cover_photo_url = cover.data;
  const coachError = await writeOwnCoachRow(uid, coach);
  if (coachError) return unknown(coachError);

  return fetchOwnCoachProfile();
}

/** Onboarding's single write, same fields as mockStore's completeCoachSignup. */
export async function completeCoachSignupRemote(fields: CoachSignupFields): Promise<ProfileResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;

  const country = COUNTRIES.find((c) => c.name === fields.country) ?? COUNTRIES[0];
  const person = await getSupabase().from('profiles').update({
    full_name: fields.name.trim(),
    phone: fields.phone.trim(),
    country_code: fields.countryDial,
    email: fields.email.trim(),
    city: fields.city.trim(),
    country: country.name,
    country_flag: country.flag,
  }).eq('id', uid);
  if (person.error) return unknown(person.error);

  const coachError = await writeOwnCoachRow(uid, {
    title: fields.specialties.join(' · '),
    signup_completed_at: new Date().toISOString(),
  });
  return coachError ? unknown(coachError) : { ok: true, data: null };
}

/**
 * ClientOnboarding's write. Contact details go on the member's own profiles
 * row; goal and focus go on member_profiles (0006), because the `clients`
 * roster row that carries the same-named columns is the coach's to write.
 */
export async function completeClientSignupRemote(fields: ClientSignupFields): Promise<ProfileResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;

  const person = await getSupabase().from('profiles').update({
    phone: fields.phone.trim(),
    country_code: fields.countryCode,
    email: fields.email.trim(),
    city: fields.city.trim(),
  }).eq('id', uid);
  if (person.error) return unknown(person.error);

  const memberError = await writeOwnMemberRow(uid, {
    goal: fields.goal.trim(),
    focus: fields.focus,
    signup_completed_at: new Date().toISOString(),
  });
  return memberError ? unknown(memberError) : { ok: true, data: null };
}
