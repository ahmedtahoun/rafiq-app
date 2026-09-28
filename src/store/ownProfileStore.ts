import { useEffect } from 'react';
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { useRemoteSession } from '../lib/remoteSession';
import { fetchOwnCoachProfile, type OwnCoachProfile, type ProfileErrorCode } from '../lib/profileData';
import { getCoachProfile, getVerificationStatus, type CoachProfile, type VerificationStatus } from '../lib/mockStore';

/**
 * The signed-in coach's own profile, fetched once and shared by every
 * screen that shows it (Profile, EditProfile, AccountDetails,
 * PreviewProfile, ShareProfile), so a save on one is already on the next.
 * Keyed by user id: a different account signing in starts from nothing.
 */
interface OwnProfileState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  userId: string | null;
  data: OwnCoachProfile | null;
  errorCode: ProfileErrorCode | null;
  /** `background` keeps the current data on screen while refetching, for
      refreshes a screen triggers itself (after filing a verification
      request) — a loading screen there would throw away its own state. */
  load: (userId: string, background?: boolean) => Promise<void>;
  setData: (userId: string, data: OwnCoachProfile) => void;
  /** Forget what was fetched, so the next screen that reads it refetches —
      after a write made somewhere this store didn't see (onboarding). */
  invalidate: () => void;
}

export const useOwnProfileStore = create<OwnProfileState>((set, get) => ({
  status: 'idle',
  userId: null,
  data: null,
  errorCode: null,

  async load(userId, background = false) {
    if (!background || get().userId !== userId) set({ status: 'loading', userId, errorCode: null });
    const result = await fetchOwnCoachProfile();
    // Signed out, or signed in as someone else, while this was in flight.
    if (get().userId !== userId) return;
    if (result.ok) set({ status: 'ready', data: result.data, errorCode: null });
    else if (!background) set({ status: 'error', errorCode: result.code });
  },

  setData(userId, data) {
    set({ status: 'ready', userId, data, errorCode: null });
  },

  invalidate() {
    set({ status: 'idle' });
  },
}));

export type OwnProfileView =
  | { status: 'loading' }
  | { status: 'error'; code: ProfileErrorCode; retry: () => void }
  | {
      status: 'ready';
      profile: CoachProfile;
      verificationStatus: VerificationStatus;
      /** True when this came from Supabase, false for mockStore's copy. */
      remote: boolean;
      reload: () => Promise<void>;
    };

/**
 * Signed out (or unconfigured) this is mockStore, read fresh on every render
 * exactly as the screens did before — so a screen's own refresh tick and a
 * test seeding mockStore both still show up. Signed in, it is the shared
 * Supabase copy, with loading and error states the screen has to render.
 */
export function useOwnCoachProfile(): OwnProfileView {
  const remote = useRemoteSession();
  const userId = useAppStore((s) => s.userId);
  const status = useOwnProfileStore((s) => s.status);
  const storedFor = useOwnProfileStore((s) => s.userId);
  const data = useOwnProfileStore((s) => s.data);
  const errorCode = useOwnProfileStore((s) => s.errorCode);
  const load = useOwnProfileStore((s) => s.load);

  const stale = remote && userId !== null && (storedFor !== userId || status === 'idle');
  useEffect(() => {
    if (stale && userId) void load(userId);
  }, [stale, userId, load]);

  if (!remote || !userId) {
    return { status: 'ready', profile: getCoachProfile(), verificationStatus: getVerificationStatus(), remote: false, reload: async () => {} };
  }
  if (stale || status === 'idle' || status === 'loading') return { status: 'loading' };
  if (status === 'error' || !data) return { status: 'error', code: errorCode ?? 'unknown', retry: () => void load(userId) };
  return {
    status: 'ready',
    profile: data.profile,
    verificationStatus: data.verificationStatus,
    remote: true,
    reload: () => load(userId, true),
  };
}
