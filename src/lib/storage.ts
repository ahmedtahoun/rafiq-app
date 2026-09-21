/**
 * Profile photo upload/read, over the buckets in
 * supabase/migrations/0003_storage.sql. Standalone like auth.ts — nothing
 * imports it yet, and wiring it into EditProfile touches files another track
 * is mid-edit on.
 *
 * Both buckets are private, so a stored photo has no public URL. What goes in
 * profiles.avatar_photo_url / coach_profiles.cover_photo_url is the object
 * PATH, and the UI turns it into a time-limited signed URL at read time. The
 * columns are named *_url and hold a path, which is a wart worth renaming when
 * something else touches that schema — flagged in supabase/README.md rather
 * than fixed here, because renaming a column mid-flight is exactly the sort of
 * change that collides with another track.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Database } from './database.types';

export type PhotoKind = 'avatar' | 'cover';

/** Bucket per kind, matching 0003. */
const BUCKET: Record<PhotoKind, string> = {
  avatar: 'avatars',
  cover: 'covers',
};

export type StorageErrorCode = 'not_configured' | 'not_signed_in' | 'too_large' | 'wrong_type' | 'upload_failed';

export type StorageResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: StorageErrorCode; message: string };

/** Generous enough for a phone photo, small enough to keep the bucket sane. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function fail(code: StorageErrorCode, message: string): StorageResult<never> {
  return { ok: false, code, message };
}

/**
 * The object path for a user's photo. The first segment must be their uid —
 * that segment IS the storage policy's ownership check, so it is derived from
 * the session here and never passed in by a caller.
 *
 * No file extension on purpose: the name is fixed per kind so re-uploading
 * replaces the old object rather than leaving a stale `avatar.png` behind
 * every time someone switches to a JPEG. The content type travels as metadata.
 */
function photoPath(uid: string, kind: PhotoKind): string {
  return `${uid}/${kind}`;
}

async function currentUid(supabase: SupabaseClient<Database>): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Uploads (or replaces) the signed-in user's avatar or cover.
 * Returns the object path to store on their profile row.
 */
export async function uploadProfilePhoto(kind: PhotoKind, file: File): Promise<StorageResult<string>> {
  if (!isSupabaseConfigured()) return fail('not_configured', 'Supabase credentials are missing.');
  if (file.size > MAX_PHOTO_BYTES) return fail('too_large', `Photo is ${file.size} bytes; the limit is ${MAX_PHOTO_BYTES}.`);
  if (!ALLOWED_TYPES.includes(file.type)) return fail('wrong_type', `Unsupported type ${file.type || 'unknown'}.`);

  const supabase = getSupabase();
  const uid = await currentUid(supabase);
  if (!uid) return fail('not_signed_in', 'No signed-in user to upload for.');

  const path = photoPath(uid, kind);
  const { error } = await supabase.storage.from(BUCKET[kind]).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  return error ? fail('upload_failed', error.message) : { ok: true, data: path };
}

/**
 * A time-limited URL for a stored photo. Private buckets have no public URL,
 * so every render needs one of these; keep `expiresIn` comfortably longer than
 * the screen is likely to stay open.
 */
export async function getProfilePhotoUrl(
  kind: PhotoKind,
  path: string,
  expiresIn = 3600,
): Promise<StorageResult<string>> {
  if (!isSupabaseConfigured()) return fail('not_configured', 'Supabase credentials are missing.');
  const { data, error } = await getSupabase().storage.from(BUCKET[kind]).createSignedUrl(path, expiresIn);
  return error || !data ? fail('upload_failed', error?.message ?? 'Could not sign the photo URL.') : { ok: true, data: data.signedUrl };
}

/** Removes the signed-in user's photo of that kind. */
export async function removeProfilePhoto(kind: PhotoKind): Promise<StorageResult<null>> {
  if (!isSupabaseConfigured()) return fail('not_configured', 'Supabase credentials are missing.');
  const supabase = getSupabase();
  const uid = await currentUid(supabase);
  if (!uid) return fail('not_signed_in', 'No signed-in user.');

  const { error } = await supabase.storage.from(BUCKET[kind]).remove([photoPath(uid, kind)]);
  return error ? fail('upload_failed', error.message) : { ok: true, data: null };
}
