/**
 * The signed-in coach's own session templates (`templates`, 0005): a
 * reusable cadence and starter-task set per specialty and plan. Templates
 * and TemplateDetail read and write here signed in; signed out they stay on
 * mockStore's demo templates.
 *
 * - RLS keeps every row to its coach, for reading as well as writing
 *   (templates_own): no one else ever sees a coach's templates.
 * - Nothing points at a template, so deleting one is a real delete.
 * - `icon` is the two-letter monogram the list draws on a `bg` swatch. The
 *   demo's seeds carry hand-picked ones; here it follows the name, so a
 *   rename can't leave a stale monogram behind.
 *
 * Same result shape as offeringData.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Template, TemplateCadence } from './mockStore';

export type TemplateErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type TemplateResult<T> = { ok: true; data: T } | { ok: false; code: TemplateErrorCode; message: string };

/** What the form edits. `icon` and `bg` are derived, not edited. */
export type TemplateFields = Pick<Template, 'name' | 'specialty' | 'plan' | 'cadence' | 'tasks'>;

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

const TEMPLATE_COLUMNS = 'id, name, specialty, plan, cadence, icon, bg, tasks';
/** The swatch a new template gets: the demo's "New Template" colour. */
const NEW_TEMPLATE_BG = '#B75C3D';

interface TemplateRow {
  id: string;
  name: string;
  specialty: string;
  plan: string;
  cadence: TemplateCadence;
  icon: string;
  bg: string;
  tasks: string[] | null;
}

function toTemplate(r: TemplateRow): Template {
  return { id: r.id, name: r.name, specialty: r.specialty, plan: r.plan, cadence: r.cadence, icon: r.icon, bg: r.bg, tasks: r.tasks ?? [] };
}

/**
 * Up to two letters, one from each of the name's first two words:
 * "Life Coaching · Basic" -> "LC", the demo's own convention. Words without
 * a letter ("·", "2x") are skipped.
 */
export function templateMonogram(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((word) => word.match(/\p{L}/u)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  return initials.toLocaleUpperCase();
}

function toRow(f: TemplateFields) {
  return { name: f.name, specialty: f.specialty, plan: f.plan, cadence: f.cadence, tasks: f.tasks, icon: templateMonogram(f.name) };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/** The coach's templates, oldest first. */
export async function fetchOwnTemplates(): Promise<TemplateResult<Template[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .eq('coach_id', uid)
    .order('created_at', { ascending: true });
  if (error) return unknown(error);
  return { ok: true, data: (data as TemplateRow[]).map(toTemplate) };
}

export async function createOwnTemplate(fields: TemplateFields): Promise<TemplateResult<Template>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('templates')
    .insert({ coach_id: uid, bg: NEW_TEMPLATE_BG, ...toRow(fields) })
    .select(TEMPLATE_COLUMNS)
    .single();
  if (error) return unknown(error);
  return { ok: true, data: toTemplate(data as TemplateRow) };
}

export async function updateOwnTemplate(id: string, fields: TemplateFields): Promise<TemplateResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase().from('templates').update(toRow(fields)).eq('id', id).eq('coach_id', uid).select('id');
  if (error) return unknown(error);
  // RLS filters out a row that isn't theirs (or is gone) silently: no
  // error, no row. That is a failed save, not a successful one.
  if (!data || data.length === 0) return { ok: false, code: 'unknown', message: 'template not found' };
  return { ok: true, data: null };
}

export async function deleteOwnTemplate(id: string): Promise<TemplateResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase().from('templates').delete().eq('id', id).eq('coach_id', uid).select('id');
  if (error) return unknown(error);
  if (!data || data.length === 0) return { ok: false, code: 'unknown', message: 'template not found' };
  return { ok: true, data: null };
}
