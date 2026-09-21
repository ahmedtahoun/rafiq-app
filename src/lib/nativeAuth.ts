/**
 * OAuth on the iOS and Android shells.
 *
 * On the web, signInWithOAuth hands the browser to the provider and the
 * session comes back on the next page load. A Capacitor shell has no
 * browser to hand off to: the webview is the app, and navigating it away
 * would mean navigating the app away. So native does three extra things.
 *
 *   1. `skipBrowserRedirect` — ask supabase-js for the authorize URL
 *      instead of letting it navigate.
 *   2. Open that URL in the system in-app browser (SFSafariViewController
 *      on iOS, Custom Tabs on Android), which is also what both providers
 *      require: neither Google nor Apple will authenticate inside an
 *      embedded webview.
 *   3. Catch the provider's redirect back into the app as a deep link on
 *      a custom URL scheme, and hand the code to supabase-js.
 *
 * The PKCE verifier that step 3 needs was written to localStorage by
 * step 1, in this same webview, so the exchange has everything it needs
 * without the code ever leaving the device.
 */
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

/**
 * The custom URL schemes this app answers to.
 *
 * Two, deliberately. The bundle id is mid-rename: `capacitor.config.ts`
 * still says `app.rafiq.coach`, while Apple Developer already has
 * `app.rafiqie.coach` registered (see WORK-SPLIT.md, "App rename
 * pending"). A URL scheme does not have to equal the bundle id, so
 * answering to both means the rename — whenever it lands — is a no-op for
 * sign-in rather than a day where nobody can log in on a phone.
 *
 * PRIMARY is what new sign-in requests ask to be sent to, and is the one
 * that must exist in Supabase's redirect allowlist. The second is
 * accepted on the way back so an installed build from either side of the
 * rename keeps working. Both are registered natively (Info.plist's
 * CFBundleURLTypes, AndroidManifest's intent-filter).
 */
export const AUTH_SCHEME_PRIMARY = 'app.rafiq.coach';
export const AUTH_SCHEME_ALTERNATE = 'app.rafiqie.coach';
export const AUTH_SCHEMES = [AUTH_SCHEME_PRIMARY, AUTH_SCHEME_ALTERNATE];

/** The host part of the callback, so other deep links stay unclaimed. */
export const AUTH_CALLBACK_HOST = 'auth-callback';

/** Exactly what has to be in Supabase's Auth → URL Configuration list. */
export const NATIVE_REDIRECT_URL = `${AUTH_SCHEME_PRIMARY}://${AUTH_CALLBACK_HOST}`;

/** True inside the iOS/Android shell, false in any browser. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** What a provider sent back, once a callback URL has been read. */
export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; error: string; description: string };

/**
 * Read an incoming deep link, or null when it is not an auth callback.
 *
 * Pure and exported so the parsing can be tested without a device, which
 * matters more here than usual: this runs on platforms that cannot be
 * exercised from CI.
 *
 * Both shapes are handled. PKCE (the default, and what this app uses)
 * returns `?code=`; the implicit flow returns tokens in the fragment.
 * Reading both costs nothing and means a provider or Supabase setting
 * that quietly falls back to implicit does not strand the user.
 */
export function parseAuthCallback(rawUrl: string): AuthCallback | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const scheme = url.protocol.replace(/:$/, '');
  if (!AUTH_SCHEMES.includes(scheme)) return null;
  // Custom-scheme URLs put what looks like a path into the host, so the
  // callback is identified by host rather than pathname.
  if (url.host !== AUTH_CALLBACK_HOST) return null;

  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const get = (key: string) => query.get(key) ?? fragment.get(key) ?? '';

  const error = get('error');
  if (error) {
    return { kind: 'error', error, description: get('error_description') };
  }

  const code = get('code');
  if (code) return { kind: 'code', code };

  const accessToken = get('access_token');
  const refreshToken = get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken };
  }

  // Our scheme and our host, but nothing usable on it. Returning an error
  // rather than null keeps it from being silently ignored: something sent
  // the app here and the sign-in it belonged to is not going to complete.
  return { kind: 'error', error: 'invalid_callback', description: '' };
}

/**
 * Open the provider's consent page in the system in-app browser.
 *
 * Not `window.open`: on a Capacitor shell that either does nothing or
 * replaces the app's own webview, and providers reject embedded webviews
 * anyway. Browser.open gives the real SFSafariViewController/Custom Tab,
 * which is what Google and Apple require and what lets an existing signed-in
 * session on the device be reused.
 */
export async function openAuthUrl(url: string): Promise<void> {
  await Browser.open({ url });
}

/** Dismiss the in-app browser. Never throws — on some platforms closing an
    already-closed browser rejects, and by then the sign-in is done. */
export async function closeAuthBrowser(): Promise<void> {
  try {
    await Browser.close();
  } catch {
    // already gone
  }
}

/**
 * Listen for the provider's redirect back into the app.
 *
 * Returns its own unsubscribe so a caller can hand it straight back from
 * a useEffect, matching initSession(). A no-op on web, where there are no
 * deep links and the callback arrives as an ordinary page load instead.
 */
export function initDeepLinkAuth(handle: (callback: AuthCallback) => void): () => void {
  if (!isNativePlatform()) return () => {};

  const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    const callback = parseAuthCallback(url);
    if (!callback) return;

    // Close first, whatever the outcome: the in-app browser is sitting on
    // top of the app, and leaving it there over a finished sign-in looks
    // like nothing happened.
    void closeAuthBrowser().then(() => handle(callback));
  });

  return () => {
    void listener.then((l) => l.remove());
  };
}
