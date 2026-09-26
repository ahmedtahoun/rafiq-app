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
import type { Enums, Tables } from './database.types';
import {
  isNativePlatform, openAuthUrl, initDeepLinkAuth,
  NATIVE_REDIRECT_URL, type AuthCallback,
} from './nativeAuth';
import { classifyOAuthReturn, takeAuthOrigin, type OAuthFailure } from './oauthReturn';
import { useAppStore } from '../store/appStore';

export type AppRole = Enums<'app_role'>;
export type Profile = Tables<'profiles'>;

/** The providers Auth.dc.html and ClientAuth.dc.html offer. Nothing else. */
export type OAuthProvider = 'google' | 'apple';

export type AuthErrorCode =
  | 'not_configured'
  | 'oauth_failed'
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

/**
 * Starts a provider sign-in.
 *
 * Both platforms end the same way — the session arrives later through
 * onAuthStateChange — so a caller must not navigate on success. How they
 * get there differs:
 *
 * On the web, supabase-js navigates this page to the provider's consent
 * screen and the session comes back on the next load.
 *
 * On iOS/Android there is no page to navigate: the webview *is* the app.
 * So we ask supabase-js for the authorize URL instead of letting it
 * navigate (`skipBrowserRedirect`), open that URL in the system in-app
 * browser, and point the redirect at a custom URL scheme that brings the
 * provider's answer back as a deep link. lib/nativeAuth.ts owns that half;
 * initDeepLinkAuth's listener finishes the exchange.
 *
 * An explicit `redirectTo` still wins on either platform, so a caller that
 * knows better than the default can say so.
 */
export async function signInWithOAuth(
  provider: OAuthProvider,
  redirectTo?: string,
): Promise<AuthResult<{ url: string | null }>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const native = isNativePlatform();

  const { data, error } = await getSupabase().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo ?? (native ? NATIVE_REDIRECT_URL : window.location.origin),
      skipBrowserRedirect: native,
    },
  });
  if (error) return fail(error);

  // Opening the browser belongs here rather than in the screens: from a
  // caller's side "start a sign-in" is one action on both platforms, and
  // Auth.tsx/ClientAuth.tsx should not have to know which shell they are
  // running in.
  if (native && data.url) {
    try {
      await openAuthUrl(data.url);
    } catch (cause) {
      return {
        ok: false,
        code: 'unknown',
        message: cause instanceof Error ? cause.message : 'Could not open the sign-in page.',
      };
    }
  }

  return { ok: true, data: { url: data.url } };
}

/**
 * Finish a PKCE sign-in from the code a deep link brought back.
 *
 * The verifier this needs was stored by signInWithOAuth above, in this
 * same webview's localStorage, so the code never leaves the device to be
 * redeemed.
 */
export async function exchangeCodeForSession(code: string): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().auth.exchangeCodeForSession(code);
  return error ? fail(error) : { ok: true, data: null };
}

/** Finish an implicit-flow sign-in, where the deep link carried tokens
    rather than a code. */
export async function setSessionFromTokens(
  accessToken: string,
  refreshToken: string,
): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return error ? fail(error) : { ok: true, data: null };
}

/**
 * Apply whatever a provider's deep link brought back.
 *
 * Exported for its own sake so the three outcomes can be exercised
 * without a device — the platforms this runs on cannot be driven from CI,
 * so the logic is kept where a test can reach it.
 */
export async function finishOAuthCallback(callback: AuthCallback): Promise<AuthResult<null>> {
  if (callback.kind === 'code') return exchangeCodeForSession(callback.code);
  if (callback.kind === 'tokens') {
    return setSessionFromTokens(callback.accessToken, callback.refreshToken);
  }
  return {
    ok: false,
    code: 'unknown',
    message: callback.description || callback.error,
  };
}

/**
 * Turn a failed native return into the same message the web flow shows.
 *
 * Deliberately routed through lib/oauthReturn.ts's classifier rather than
 * given its own slug table: the wording a user sees for "you cancelled"
 * or "this isn't set up yet" should not depend on which platform they are
 * holding. That classifier reads a web return's URL params, so the native
 * callback is expressed in the same shape — one table, two callers.
 */
function classifyNativeFailure(callback: AuthCallback): OAuthFailure {
  if (callback.kind === 'error') {
    return classifyOAuthReturn(
      { error: callback.error, errorCode: '', errorDescription: callback.description, hasCode: false },
      false,
    ) ?? { key: 'authErrorReturnGeneric', detail: callback.description };
  }
  if (callback.kind === 'code') {
    // A code that arrived but would not exchange — expired, replayed, or
    // issued to a different install. Same case, same words as on web.
    return classifyOAuthReturn(
      { error: '', errorCode: '', errorDescription: '', hasCode: true },
      false,
    ) ?? { key: 'authErrorReturnExchange', detail: '' };
  }
  // Tokens that would not become a session. The web flow has no
  // equivalent to borrow wording from, so this takes the generic line.
  return { key: 'authErrorReturnGeneric', detail: '' };
}

/**
 * Apply a provider's deep link: take the session if there is one, and put
 * the failure on screen if there is not.
 *
 * Split out from the listener below so it can be exercised without a
 * device. The listener is plumbing; this is the policy, and the policy is
 * what a test needs to reach.
 */
export async function applyOAuthCallback(callback: AuthCallback): Promise<AuthResult<null>> {
  const result = await finishOAuthCallback(callback);
  if (result.ok) {
    // Nothing to do: setting the session fires onAuthStateChange, and
    // session.ts decides where that lands.
    return result;
  }

  const { key, detail } = classifyNativeFailure(callback);
  const { setAuthError, nav } = useAppStore.getState();
  setAuthError(key, detail);
  // Back to whichever sign-in screen started this, read from the same
  // origin the screens stash before redirecting — so an invited member
  // retries on ClientAuth with their coach's name on it, on a phone
  // exactly as in a browser. The in-app browser has already been
  // dismissed by the listener, so this is usually the screen the user is
  // already looking at; it matters when they navigated away while the
  // browser was open.
  nav(takeAuthOrigin() === 'clientAuth' ? 'clientAuth' : 'auth');
  console.error('[auth] provider returned without a session:', result.message);
  return result;
}

/**
 * Start listening for provider redirects on native. Returns its own
 * unsubscribe, so App can hand it straight back from a useEffect; a no-op
 * on web, where the callback arrives as an ordinary page load.
 */
export function initOAuthDeepLinks(): () => void {
  return initDeepLinkAuth((callback) => {
    void applyOAuthCallback(callback);
  });
}

/**
 * Records which side of the app this account is.
 *
 * OAuth cannot carry the role the way signUp()'s metadata does — the provider
 * decides what is in the token — so handle_new_user() falls back to 'client'
 * for every OAuth signup and the real answer has to be written afterwards,
 * once RoleSelect has been answered. RLS allows exactly this and no more:
 * profiles_update_own lets a signed-in user update their own row only.
 */
export async function setProfileRole(role: AppRole): Promise<AuthResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, code: 'unknown', message: 'No signed-in user to set a role for.' };
  }
  const { error } = await supabase.from('profiles').update({ role }).eq('id', auth.user.id);
  return error ? { ok: false, code: 'unknown', message: error.message } : { ok: true, data: null };
}
