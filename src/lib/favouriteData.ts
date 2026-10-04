/**
 * The signed-in member's saved coaches (`favourite_coaches`, 0005): the
 * hearts on Discover and a coach's page. RLS keeps every row to its member
 * (favourite_coaches_own), so they follow the member to any device and no
 * one else on this one sees them. They used to live in this phone's
 * localStorage (`fav_coaches`), shared by whoever signed in on it.
 *
 * Saving is idempotent both ways: hearting a coach already saved (23505,
 * the table's primary key) and un-hearting one already gone both succeed.
 *
 * Same result shape as offeringData.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type FavouriteErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type FavouriteResult<T> = { ok: true; data: T } | { ok: false; code: FavouriteErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/** The ids of the coaches the member has saved. */
export async function fetchOwnFavourites(): Promise<FavouriteResult<string[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase().from('favourite_coaches').select('coach_id').eq('member_id', uid);
  if (error) return unknown(error);
  return { ok: true, data: (data as { coach_id: string }[]).map((r) => r.coach_id) };
}

/** Saves (`on`) or un-saves a coach. */
export async function setFavourite(coachId: string, on: boolean): Promise<FavouriteResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const table = getSupabase().from('favourite_coaches');
  const { error } = on
    ? await table.insert({ member_id: uid, coach_id: coachId })
    : await table.delete().eq('member_id', uid).eq('coach_id', coachId);
  if (error && !(on && error.code === '23505')) return unknown(error);
  return { ok: true, data: null };
}
