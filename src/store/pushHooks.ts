import { useCallback, useEffect, useState } from 'react';
import { pushPermission, shouldOfferPush, syncPushDevice, type PushPermission } from '../lib/push';

/** Opens PushAsk (components/PushAsk.tsx) once per phone, when it may still ask. */
export function usePushOffer() {
  const [open, setOpen] = useState(false);
  const offer = useCallback(() => {
    void shouldOfferPush().then((should) => {
      if (should) setOpen(true);
    });
  }, []);
  return { open, offer, close: () => setOpen(false) };
}

/**
 * Where this phone's permission stands, for Profile's row. 'unsupported' in
 * a browser, where there is no row and the switches are the in-app feed's
 * only. `turnOn` asks (from a tap, so it may show the phone's prompt).
 */
export function usePushPermission() {
  const [state, setState] = useState<PushPermission | null>(null);
  useEffect(() => {
    let live = true;
    void pushPermission().then((p) => {
      if (live) setState(p);
    });
    return () => {
      live = false;
    };
  }, []);
  const turnOn = useCallback(() => {
    void syncPushDevice({ ask: true }).then(setState);
  }, []);
  return { state, turnOn };
}
