/**
 * The signed-in coach's own offerings (`offerings`, 0001 + 0005): what they
 * sell, shown on their coach page for members to book. Offerings and
 * OfferingDetail read and write here signed in; signed out they stay on
 * mockStore's demo catalogue.
 *
 * - RLS lets a coach write only their own rows (offerings_write_own); any
 *   signed-in user may read them, which is how members see them.
 * - Deleting archives: `active = false`. Session requests, enrolments and
 *   ratings point at an offering (enrolments with `on delete restrict`), so
 *   a hard delete would fail once anyone had booked one, and history would
 *   lose its name. Members only ever read active rows (fetchCoachPreview,
 *   coach_directory's from_price).
 * - `session_count` must be > 0 when set (0001's check), so "no fixed
 *   number" is null, never 0.
 *
 * Same result shape as profileData.ts and payoutData.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Offering } from './mockStore';

export type OfferingErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type OfferingResult<T> = { ok: true; data: T } | { ok: false; code: OfferingErrorCode; message: string };

/** What the form edits: an Offering without its id. */
export type OfferingFields = Omit<Offering, 'id'>;

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

const COLUMNS = 'id, type, name, description, duration, price, format, session_count';

interface OfferingRow {
  id: string;
  type: Offering['type'];
  name: string;
  description: string;
  duration: string;
  price: number;
  format: Offering['format'];
  session_count: number | null;
}

function toOffering(r: OfferingRow): Offering {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    description: r.description,
    duration: r.duration,
    price: Number(r.price),
    format: r.format,
    sessionsTotal: r.session_count,
  };
}

function toRow(f: OfferingFields) {
  return {
    type: f.type,
    name: f.name,
    description: f.description,
    duration: f.duration,
    price: f.price,
    format: f.format,
    session_count: f.sessionsTotal && f.sessionsTotal > 0 ? f.sessionsTotal : null,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/** The coach's active offerings, oldest first: the order members see. */
export async function fetchOwnOfferings(): Promise<OfferingResult<Offering[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('offerings')
    .select(COLUMNS)
    .eq('coach_id', uid)
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) return unknown(error);
  return { ok: true, data: (data as OfferingRow[]).map(toOffering) };
}

export async function createOwnOffering(fields: OfferingFields): Promise<OfferingResult<Offering>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('offerings')
    .insert({ coach_id: uid, ...toRow(fields) })
    .select(COLUMNS)
    .single();
  if (error) return unknown(error);
  return { ok: true, data: toOffering(data as OfferingRow) };
}

export async function updateOwnOffering(id: string, fields: OfferingFields): Promise<OfferingResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase().from('offerings').update(toRow(fields)).eq('id', id).eq('coach_id', uid).select('id');
  if (error) return unknown(error);
  // RLS filters a row that isn't theirs (or is gone) out silently: no error,
  // no row. That is a failed save, not a successful one.
  if (!data || data.length === 0) return { ok: false, code: 'unknown', message: 'offering not found' };
  return { ok: true, data: null };
}

/** "Delete" as members and the coach see it; the row stays for history. */
export async function archiveOwnOffering(id: string): Promise<OfferingResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase().from('offerings').update({ active: false }).eq('id', id).eq('coach_id', uid).select('id');
  if (error) return unknown(error);
  if (!data || data.length === 0) return { ok: false, code: 'unknown', message: 'offering not found' };
  return { ok: true, data: null };
}
