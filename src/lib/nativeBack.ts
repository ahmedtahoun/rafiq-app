/**
 * The Android hardware back button.
 *
 * Without a listener, Capacitor's default wins: it exits the app from
 * whatever screen is open — a form mid-edit, anywhere. This routes it
 * through the app's own back() instead, so it behaves like the on-screen
 * back arrow, and only exits where back() has nowhere to go (see
 * shouldExitOnBack).
 *
 * iOS has no hardware back button and never fires this event. Guarding on
 * isNativePlatform() is only to skip registering it in a plain browser tab,
 * where it would also never fire but there's no reason to ask.
 */
import { App as CapacitorApp } from '@capacitor/app';
import { isNativePlatform } from './nativeAuth';
import { useAppStore, ROOTS, hasBackParent, type Screen } from '../store/appStore';

/**
 * Pure, so the routing decision is testable without a device: exported the
 * same way nativeAuth.ts's parseAuthCallback is, since nothing about
 * *which* screens exit vs. navigate depends on the real hardware event.
 *
 * Exits whenever back() has nowhere to go: no history, and either a tab
 * root or a screen with no PARENT at all. Welcome is the second kind — the
 * app's first screen, where Android users expect back to leave the app,
 * and where back() alone would silently do nothing.
 */
export function shouldExitOnBack(screen: Screen, histLength: number): boolean {
  return histLength === 0 && (ROOTS.includes(screen) || !hasBackParent(screen));
}

/**
 * Returns its own unsubscribe so a caller can hand it straight back from a
 * useEffect, matching initSession()/initDeepLinkAuth(). A no-op on web.
 */
export function initBackButton(): () => void {
  if (!isNativePlatform()) return () => {};

  const listener = CapacitorApp.addListener('backButton', () => {
    // Read live state at fire time, not whatever was current when the
    // effect ran — the listener is registered once for the app's whole
    // lifetime and outlives every screen it fires on.
    const { screen, hist, back } = useAppStore.getState();
    if (shouldExitOnBack(screen, hist.length)) {
      // Real Android never returns from this, so the rejection this
      // throws under Capacitor's web fallback (there is no web "exit")
      // has nothing to reach — swallowed rather than left unhandled.
      CapacitorApp.exitApp().catch(() => {});
      return;
    }
    back();
  });

  return () => {
    void listener.then((l) => l.remove());
  };
}
