/**
 * Auth seam for Track C. Standalone on purpose — nothing imports it yet.
 *
 * Wiring it up (an `auth` screen, a session in useAppStore, a guard in
 * App.tsx) touches the four shared files every track edits, so that step
 * waits for a quiet tree. This module is the part that can land early:
 * everything the Auth screen will need, already typed and testable.
 *
 * Errors come back as a `code`, not a raw Supabase message. Those messages
 * are English-only server strings; this app ships EN + AR, so the screen
 * needs a stable key to look copy up by. Map each code to an i18n key when
 * Auth is ported — never render `message` to a user, it is for logs.
 */
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Enums, Row } from './database.types';

export type AppRole = Enums<'app_role'>;
export type Profile = Row<'profiles'>;

export type AuthErrorCode =
  | 'not_configured'
  | 'invalid_credentials'
  | 'email_taken'
  | 'weak_password'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export interface AuthFailure {
  ok: false;
  code: AuthErrorCode;
  /** Raw upstream text, for logs — not for display. */
  message: string;
}

export type AuthResult<T> = { ok: true; data: T } | AuthFailure;

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpFields extends Credentials {
  role: AppRole;
  fullName: string;
}

/**
 * Supabase reports most of these as a 400 with an English message, so matching
 * on text is unavoidable; newer releases also carry a stable `code`, which is
 * preferred when present. Anything unrecognised stays 'unknown' rather than
 * being guessed at — a wrong code shows the user wrong advice.
 */
function classify(error: AuthError): AuthErrorCode {
  const code = (error as AuthError & { code?: string }).code;
  if (code === 'invalid_credentials') return 'invalid_credentials';
  if (code === 'user_already_exists' || code === 'email_exists') return 'email_taken';
  if (code === 'weak_password') return 'weak_password';
  if (code === 'email_not_confirmed') return 'email_not_confirmed';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'rate_limited';

  const text = error.message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'invalid_credentials';
  if (text.includes('already registered') || text.includes('already been registered')) return 'email_taken';
  if (text.includes('password should be')) return 'weak_password';
  if (text.includes('email not confirmed')) return 'email_not_confirmed';
  if (error.status === 429) return 'rate_limited';
  if (text.includes('fetch') || text.includes('network')) return 'network';
  return 'unknown';
}

function fail(error: AuthError): AuthFailure {
  return { ok: false, code: classify(error), message: error.message };
}

const NOT_CONFIGURED: AuthFailure = {
  ok: false,
  code: 'not_configured',
  message: 'Supabase credentials are missing — see .env.local.example.',
};

/**
 * Creates the account. The `role` rides along in user metadata because the
 * handle_new_user() trigger reads it from there to write the profiles row —
 * the client never inserts that row itself, and RLS gives it no way to.
 */
export async function signUp(fields: SignUpFields): Promise<AuthResult<{ user: User | null; session: Session | null }>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase().auth.signUp({
    email: fields.email.trim(),
    password: fields.password,
    options: { data: { role: fields.role, full_name: fields.fullName.trim() } },
  });
  // With email confirmation on, `session` is null here and stays null until
  // the user clicks through — the caller shows "check your inbox", it is not
  // a failure.
  return error ? fail(error) : { ok: true, data };
}

export async function signIn(credentials: Credentials): Promise<AuthResult<{ user: User; session: Session }>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: credentials.email.trim(),
    password: credentials.password,
  });
  return error ? fail(error) : { ok: true, data };
}

export async function signOut(): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().auth.signOut();
  return error ? fail(error) : { ok: true, data: null };
}

export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

/** The signed-in user's profiles row, or null when signed out. */
export async function getCurrentProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', auth.user.id).maybeSingle();
  return error ? null : data;
}

/** Which app the session should open into — RoleSelect's answer, once real. */
export async function getCurrentRole(): Promise<AppRole | null> {
  return (await getCurrentProfile())?.role ?? null;
}

export async function sendPasswordReset(email: string, redirectTo?: string): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
  return error ? fail(error) : { ok: true, data: null };
}

export async function updatePassword(password: string): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().auth.updateUser({ password });
  return error ? fail(error) : { ok: true, data: null };
}

/**
 * Fires on sign-in, sign-out and token refresh. Returns its own unsubscribe,
 * so a caller can hand it straight back from a useEffect.
 */
export function onAuthStateChange(handler: (session: Session | null) => void): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => handler(session));
  return () => data.subscription.unsubscribe();
}
