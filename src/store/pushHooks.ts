import { useCallback, useEffect, useState } from 'react';
import { pushPermission, syncPushDevice, type PushPermission } from '../lib/push';

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
