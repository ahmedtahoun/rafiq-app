/**
 * Reading what an OAuth round-trip came back with.
 *
 * A provider return is a cold start: the app is reloaded at its root with
 * the outcome in the query string and nothing else to go on. A success
 * carries `?code=…`, which supabase-js exchanges for a session and strips
 * from the URL. A failure carries `?error=…&error_description=…`, which
 * nothing consumes — so without this the app boots to the intro carousel
 * with the failure sitting unread in the address bar, looking to the user
 * exactly like nothing happened.
 *
 * A return belongs to the page load, not to whoever asks about it, so it
 * is captured once when this module loads and handed out once. That
 * ordering is load-bearing twice over: the capture has to beat the
 * Supabase client's construction, which is what rewrites the URL on a
 * successful exchange, and handing it out once is what stops React's
 * development double-mount from processing the same return twice.
 */

/** What came back in the URL, before anything has been exchanged. */
export interface OAuthReturn {
  /** Present on a failed return: the provider's or Supabase's error slug. */
  error: string;
  /** Supabase's finer-grained code, when it sends one. */
  errorCode: string;
  /** Human-readable detail, in whatever language the provider sent it. */
  errorDescription: string;
  /** Present on a return that still needs exchanging for a session. */
  hasCode: boolean;
}

/** An i18n key for what went wrong, plus the provider's own words. */
export interface OAuthFailure {
  key: string;
  detail: string;
}

// Errors and codes arrive in the query string on the PKCE flow and in the
// fragment on the implicit one. We ask for PKCE, but a misconfigured
// provider can still send a fragment, and reading both costs nothing.
function paramsOf(url: URL): URLSearchParams {
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const [key, value] of hash) {
    if (!query.has(key)) query.append(key, value);
  }
  return query;
}

const RETURN_PARAMS = ['error', 'error_code', 'error_description', 'code', 'state'];

function captureFromUrl(): OAuthReturn | null {
  const params = paramsOf(new URL(window.location.href));
  const ret: OAuthReturn = {
    error: params.get('error') ?? '',
    errorCode: params.get('error_code') ?? '',
    errorDescription: params.get('error_description') ?? '',
    hasCode: params.has('code'),
  };
  // An ordinary page load carries neither, and is not a return at all.
  return ret.error || ret.hasCode ? ret : null;
}

let pending: OAuthReturn | null = captureFromUrl();

/**
 * The return this page load came back with, or null — including on every
 * call after the first, because a return is only ever handled once.
 */
export function takeOAuthReturn(): OAuthReturn | null {
  const ret = pending;
  pending = null;
  return ret;
}

/**
 * Classify a return into something worth showing, or null when it went
 * fine (or was never an auth return at all).
 *
 * `exchanged` says whether a session exists now. A return that carried a
 * code but produced no session is a failure even with no error param:
 * that is what an expired, replayed, or cross-browser code looks like,
 * and it is the case that used to land silently on the carousel.
 */
export function classifyOAuthReturn(ret: OAuthReturn, exchanged: boolean): OAuthFailure | null {
  if (ret.error) {
    return { key: errorKeyFor(ret), detail: ret.errorDescription };
  }
  if (ret.hasCode && !exchanged) {
    return { key: 'authErrorReturnExchange', detail: '' };
  }
  return null;
}

function errorKeyFor(ret: OAuthReturn): string {
  // Classify on the structured slugs only. error_description is free text
  // that changes between providers and Supabase releases, so matching on
  // its wording would quietly mis-label failures the first time someone
  // reworded it; it is shown verbatim instead.
  if (ret.error === 'access_denied' && !ret.errorCode) {
    // The standard OAuth meaning: the user said no at the consent screen.
    // Only when no finer code narrows it — Supabase reuses access_denied
    // for expired links, which is not something the user chose.
    return 'authErrorReturnDenied';
  }
  if (ret.error === 'server_error' || ret.error === 'unauthorized_client') {
    // Almost always the provider half of the setup: not enabled in
    // Supabase, or a callback URL the provider does not recognise.
    return 'authErrorReturnConfig';
  }
  return 'authErrorReturnGeneric';
}

/**
 * Drop the auth params from the address bar, keeping everything else.
 *
 * Without this the failure survives a refresh and re-fires on every
 * reload, and a stale `code` would be re-offered for exchange. replaceState
 * rather than pushState so Back still leaves the app rather than stepping
 * through the failed return.
 */
export function clearOAuthReturn(): void {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  let touched = false;

  for (const key of RETURN_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      touched = true;
    }
    if (hash.has(key)) {
      hash.delete(key);
      touched = true;
    }
  }
  if (!touched) return;

  const rest = hash.toString();
  url.hash = rest ? `#${rest}` : '';
  window.history.replaceState(window.history.state, '', url.toString());
}

// Which sign-in screen the round-trip started from. A provider return is
// a cold start, so the app has no history to tell it whether this was a
// coach signing in or a member arriving from their coach's invite — and
// dropping an invited member on the generic Auth screen throws away the
// invite context they started with. sessionStorage, not localStorage:
// this is true for one tab for the length of one round-trip, and should
// not outlive either.
const ORIGIN_KEY = 'rafiq_auth_origin';

/** Record where a sign-in is being started from, just before leaving. */
export function rememberAuthOrigin(screen: string): void {
  try {
    window.sessionStorage.setItem(ORIGIN_KEY, screen);
  } catch {
    // Private browsing and blocked storage both throw here. Losing the
    // origin costs a slightly wrong landing screen, never the error
    // message itself, so there is nothing to recover from.
  }
}

/** Read and forget the recorded origin. */
export function takeAuthOrigin(): string {
  try {
    const value = window.sessionStorage.getItem(ORIGIN_KEY) ?? '';
    window.sessionStorage.removeItem(ORIGIN_KEY);
    return value;
  } catch {
    return '';
  }
}
