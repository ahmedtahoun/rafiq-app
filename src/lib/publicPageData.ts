/**
 * A coach's public page (migration 0026): rafiqpro.com/c/<code>, rendered
 * by site/functions/c/[code].js for coaches who turned it on.
 *
 * The coach reads their own flag and code from their coach_profiles row,
 * and turns the page on or off only through set_public_page(), which makes
 * the code the first time and keeps it after: the columns aren't in the
 * app's column grants. Opening a page's link in the app goes the other way,
 * through public_coach_page(code), the same lookup the web page uses, so a
 * page turned off can't be opened from an old link either.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type PublicPageErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type PublicPageResult<T> = { ok: true; data: T } | { ok: false; code: PublicPageErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

export const PUBLIC_SITE = 'rafiqpro.com';
/** 0026's codes: six characters with no 0/o or 1/l/i. */
const CODE = /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/;

export interface PublicPage {
  on: boolean;
  /** Made the first time the page is turned on, and kept after. */
  code: string | null;
}

/** The page's address, without the scheme for showing ("rafiqpro.com/c/k7m2qx"). */
export function publicPageAddress(code: string): string {
  return `${PUBLIC_SITE}/c/${code}`;
}

export function publicPageUrl(code: string): string {
  return `https://${publicPageAddress(code)}`;
}

/**
 * The code in a coach-page link, or null: the app's own scheme from the
 * page's "Open in Rafiq Pro" (app.rafiqie.coach://c/<code>), or the page's
 * web address itself (https://rafiqpro.com/c/<code>, /ar/c/<code>).
 */
export function coachLinkCode(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let path: string;
  if (u.protocol === 'app.rafiqie.coach:') {
    // app.rafiqie.coach://c/<code>: "c" is the host, the code the path.
    if (u.host !== 'c') return null;
    path = u.pathname;
  } else if (u.protocol === 'https:' && (u.host === PUBLIC_SITE || u.host === `www.${PUBLIC_SITE}`)) {
    const m = u.pathname.match(/^\/(?:ar\/)?c(\/[^/]+)\/?$/);
    if (!m) return null;
    path = m[1];
  } else {
    return null;
  }
  const code = path.replace(/^\/+|\/+$/g, '').toLowerCase();
  return CODE.test(code) ? code : null;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

export async function fetchOwnPublicPage(): Promise<PublicPageResult<PublicPage>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('coach_profiles')
    .select('public_page, public_code')
    .eq('profile_id', uid)
    .maybeSingle();
  if (error) return unknown(error);
  return { ok: true, data: { on: data?.public_page === true, code: typeof data?.public_code === 'string' ? data.public_code : null } };
}

/** Turns the page on or off; answers with where it stands now. */
export async function setPublicPage(on: boolean): Promise<PublicPageResult<PublicPage>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase().rpc('set_public_page', { p_on: on });
  if (error) return unknown(error);
  return { ok: true, data: { on, code: typeof data === 'string' ? data : null } };
}

/** Which coach a page's code is, if their page is on: null otherwise. */
export async function coachIdForCode(code: string): Promise<PublicPageResult<string | null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase().rpc('public_coach_page', { p_code: code });
  if (error) return unknown(error);
  const id = data && typeof data === 'object' && typeof (data as { coach_id?: unknown }).coach_id === 'string'
    ? (data as { coach_id: string }).coach_id
    : null;
  return { ok: true, data: id };
}
