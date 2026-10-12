/**
 * Opening a coach's public page in the app: the page's "Open in Rafiq Pro"
 * (app.rafiqie.coach://c/<code>, site/coach-page.mjs) lands here.
 *
 * - A member signed in goes straight to that coach's page in the app
 *   (CoachPreview), where they can book.
 * - Signed out, the code is kept on the phone and opened once they sign in
 *   as a member: the link was the reason they came.
 * - A coach signed in is left where they are: they can't book a coach.
 *
 * The code is turned into a coach through public_coach_page(), the same
 * lookup the web page uses, so a page turned off since the link was shared
 * opens nothing, exactly as the web page shows nothing.
 *
 * Native only: on the web there is no app link to open. The listener sits
 * behind `linkSource` so tests can stand in for the phone, as push.ts does.
 * nativeAuth.ts listens to the same event and ignores anything that isn't
 * its sign-in callback; this ignores anything that isn't a coach link.
 */
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from '../store/appStore';
import { coachIdForCode, coachLinkCode } from './publicPageData';

const PENDING_KEY = 'rafiq_pending_coach_link';

export const linkSource = {
  native: (): boolean => Capacitor.isNativePlatform(),
  listen(handler: (url: string) => void): () => void {
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => handler(url));
    return () => {
      void listener.then((l) => l.remove());
    };
  },
};

function readKey(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writeKey(code: string | null): void {
  try {
    if (code === null) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, code);
  } catch {
    // Private mode: the link simply isn't remembered.
  }
}

async function openCode(code: string): Promise<void> {
  const result = await coachIdForCode(code);
  if (result.ok && result.data) useAppStore.getState().nav({ screen: 'coachPreview', params: { coachId: result.data } });
}

/** Handles one opened URL. True if it was a coach link. */
export async function openCoachLink(url: string): Promise<boolean> {
  const code = coachLinkCode(url);
  if (!code) return false;
  const { authStatus, role } = useAppStore.getState();
  if (authStatus === 'signedIn') {
    if (role === 'client') await openCode(code);
    return true;
  }
  writeKey(code);
  return true;
}

/** A member just signed in: open the coach link that brought them, once. */
export function openPendingCoachLink(): void {
  const code = readKey();
  if (!code) return;
  writeKey(null);
  void openCode(code);
}

/** App.tsx: listen for coach links while the app runs. A no-op on the web. */
export function initCoachLinks(): () => void {
  if (!linkSource.native()) return () => {};
  return linkSource.listen((url) => void openCoachLink(url));
}
