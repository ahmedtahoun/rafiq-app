import { useEffect, useState } from 'react';

type Fetched<T> = { ok: true; data: T } | { ok: false };

export type RemoteLoad<T> =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | {
      status: 'ready';
      data: T;
      /** Re-read quietly, keeping what's on screen until the new rows arrive. */
      reload: () => Promise<boolean>;
      /** Put a successful write's result on screen without a re-read. */
      set: (data: T) => void;
    };

/**
 * One screen's worth of rows from Supabase, for screens whose data no other
 * screen shares (the roster and the member's space have their own stores).
 * `key` names what is loaded: when it changes (another coach's preview),
 * the screen shows loading again rather than the previous key's rows.
 * With `enabled` false nothing is fetched — the screen is showing mockStore.
 */
export function useRemoteLoad<T>(key: string, enabled: boolean, fetcher: () => Promise<Fetched<T>>): RemoteLoad<T> {
  const [state, setState] = useState<{ key: string; status: 'loading' } | { key: string; status: 'error' } | { key: string; status: 'ready'; data: T }>({
    key,
    status: 'loading',
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void fetcher().then((result) => {
      if (live) setState(result.ok ? { key, status: 'ready', data: result.data } : { key, status: 'error' });
    });
    return () => {
      live = false;
    };
    // The fetcher is a fresh closure every render; what it loads is `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt]);

  const reload = async () => {
    const result = await fetcher();
    if (result.ok) setState({ key, status: 'ready', data: result.data });
    return result.ok;
  };

  if (state.key !== key || state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') {
    return {
      status: 'error',
      retry: () => {
        setState({ key, status: 'loading' });
        setAttempt((n) => n + 1);
      },
    };
  }
  return { status: 'ready', data: state.data, reload, set: (data) => setState({ key, status: 'ready', data }) };
}
