import { useAppStore } from '../store/appStore';
import { isSupabaseConfigured } from './supabase';

/**
 * Whether reads and writes should go to Supabase rather than mockStore.
 *
 * Configured is not enough: real rows only exist for a signed-in account.
 * Signed out, every screen keeps rendering mockStore's data exactly as it
 * always has — which is also what keeps CI (placeholder credentials, never
 * signed in) exercising the same screens it always has.
 */
export function isRemoteSession(): boolean {
  return isSupabaseConfigured() && useAppStore.getState().authStatus === 'signedIn';
}

export function useRemoteSession(): boolean {
  const signedIn = useAppStore((s) => s.authStatus === 'signedIn');
  return isSupabaseConfigured() && signedIn;
}
