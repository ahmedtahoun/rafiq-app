import { Capacitor } from '@capacitor/core';

/** Also written out in the privacy policies (privacySection6Body and
    clientPrivacySection6Body in i18n.ts) — change all three together. */
export const SUPPORT_EMAIL = 'support@rafiqpro.com';

const ANDROID_PACKAGE = 'app.rafiqie.coach';

// App Store Connect → App Information → Apple ID, once the listing exists.
// Until then there is no page to send an iOS user to, so the row is hidden.
const APP_STORE_ID: string | null = null;

export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/**
 * Where "Rate Rafiq" sends someone: the store's own review page.
 *
 * Not the native in-app review prompt. Apple and Google both say not to
 * fire that from a button — it is rate-limited and may show nothing, which
 * reads as a broken button. It belongs on a good moment the app picks, and
 * a settings row is the user asking, so it gets the listing.
 */
export function storeReviewUrl(): string | null {
  switch (Capacitor.getPlatform()) {
    case 'android':
      return `market://details?id=${ANDROID_PACKAGE}`;
    case 'ios':
      return APP_STORE_ID ? `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review` : null;
    default:
      return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  }
}

/** Follows a link the way a real <a> would: the native shells hand non-app
    URLs (mailto:, market:, itms-apps:) to the OS when the WebView navigates
    to them, and a browser gets a new tab for https. */
export function openExternal(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  if (!Capacitor.isNativePlatform() && url.startsWith('http')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  a.click();
}
