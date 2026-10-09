/**
 * The coaching agreement between a coach and one member: `agreements`
 * (0005), one row per relationship, with 0028's record of the signature.
 *
 * - The coach sends it (an insert, as 'sent'), only to a member with an
 *   account. After that, the coach only reads it.
 * - The member signs through sign_agreement(), which records the agreement
 *   (category), the SHA-256 of the exact title and body they were shown,
 *   the language, their own account and the database's time, all at once.
 *
 * The hash is of `${title}\n\n${body}` as rendered, so the text a member
 * agreed to can be matched word for word later, in the language they read
 * it in.
 *
 * Same result shape as the other *Data.ts files.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { AgreementCategory } from './mockStore';

export type AgreementErrorCode = 'not_configured' | 'unknown';
export type AgreementResult<T> = { ok: true; data: T } | { ok: false; code: AgreementErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
// The database's own message can quote the arguments; never pass it on.
const FAILED = { ok: false, code: 'unknown', message: 'The agreement could not be saved.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

export type AgreementState =
  | { status: 'none' }
  | { status: 'sent'; sentAtMs: number }
  | { status: 'signed'; sentAtMs: number; signedAtMs: number; lang: 'en' | 'ar' | null };

type Row = { status: 'sent' | 'signed'; sent_at: string; signed_at: string | null; lang: string | null };

function toState(row: Row | null): AgreementState {
  if (!row) return { status: 'none' };
  const sentAtMs = Date.parse(row.sent_at);
  if (row.status === 'signed' && row.signed_at) {
    return { status: 'signed', sentAtMs, signedAtMs: Date.parse(row.signed_at), lang: row.lang === 'ar' || row.lang === 'en' ? row.lang : null };
  }
  return { status: 'sent', sentAtMs };
}

/** Either side of the relationship: RLS (agreements_select) shows both. */
export async function fetchAgreement(clientId: string): Promise<AgreementResult<AgreementState>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase()
    .from('agreements')
    .select('status, sent_at, signed_at, lang')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) return unknown(error);
  return { ok: true, data: toState(data as Row | null) };
}

/** The coach sends it. */
export async function sendAgreement(clientId: string): Promise<AgreementResult<AgreementState>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase()
    .from('agreements')
    .insert({ client_id: clientId })
    .select('status, sent_at, signed_at, lang')
    .single();
  if (error) return FAILED;
  return { ok: true, data: toState(data as Row) };
}

/** The SHA-256, in hex, of exactly what the member was shown. */
export async function agreementTextSha256(title: string, body: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${title}\n\n${body}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The member signs what they were shown. Returns the signed state. */
export async function signAgreement(input: {
  clientId: string;
  category: AgreementCategory;
  title: string;
  body: string;
  lang: 'en' | 'ar';
}): Promise<AgreementResult<AgreementState>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  let sha: string;
  try {
    sha = await agreementTextSha256(input.title, input.body);
  } catch {
    return FAILED;
  }
  const { error } = await getSupabase().rpc('sign_agreement', {
    p_client: input.clientId,
    p_category: input.category,
    p_text_sha256: sha,
    p_lang: input.lang,
  });
  if (error) return FAILED;
  return fetchAgreement(input.clientId);
}
