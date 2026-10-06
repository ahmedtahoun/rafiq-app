import { create } from 'zustand';
import { useAppStore } from './appStore';

/**
 * Whether the app's "get notifications on your phone?" sheet (PushAsk) is
 * open. One sheet for the whole app, mounted in App.tsx, so any moment
 * where a banner would obviously help can offer it: the first message sent
 * or received, the first session booked. Kept apart from push.ts so the
 * screens and stores that offer it don't load the push plugin: offerPush()
 * loads it only to ask whether there is anything to offer.
 */
export const usePushAsk = create<{ open: boolean }>(() => ({ open: false }));

/**
 * Opens the sheet if this phone can still be asked: once, on a phone, never
 * in a browser (push.ts answers 'unsupported' there without touching the
 * plugin), and only signed in: the signed-out demo has no account to
 * register the phone to.
 */
export function offerPush(): void {
  if (useAppStore.getState().authStatus !== 'signedIn') return;
  if (usePushAsk.getState().open) return;
  void import('../lib/push')
    .then((m) => m.shouldOfferPush())
    .then((should) => {
      if (should) usePushAsk.setState({ open: true });
    })
    .catch(() => undefined);
}

export function closePushAsk(): void {
  usePushAsk.setState({ open: false });
}
