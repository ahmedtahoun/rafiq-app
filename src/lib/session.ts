/**
 * Session bootstrap — the piece that makes an OAuth round-trip land
 * somewhere.
 *
 * Signing in with a provider is a full page navigation: the app leaves for
 * Google or Apple and comes back as a cold start, with screen back at
 * 'welcome' and a session that was not there before. Without this, a user
 * who signed in successfully would be dropped on the intro carousel with no
 * sign that anything happened.
 *
 * Routing decisions live here rather than in the store on purpose. The store
 * records what is true; deciding where that should send someone is policy,
 * and keeping it in one place stops a late-arriving auth event from yanking
 * a user off whatever screen they are on for reasons the store cannot see.
 */
import { useAppStore } from '../store/appStore';
import { getSession, onAuthStateChange } from './auth';
import { isSupabaseConfigured } from './supabase';
import { getCoachProfile } from './mockStore';

// undefined = we have not yet heard anything, which is different from
// "heard, and there is no session". Without that distinction a cold start
// while signed out reads as a sign-out and bounces the user to Auth.
let lastUserId: string | null | undefined = undefined;

function routeAfterSignIn() {
  const { role, nav } = useAppStore.getState();

  // No role chosen yet: the design sends a fresh sign-in to RoleSelect, and
  // it has to be the local choice that decides. profiles.role cannot: OAuth
  // carries no role, so handle_new_user() defaults every provider signup to
  // 'client' and reading it back would silently skip the question.
  if (!role) {
    nav('roleSelect');
    return;
  }

  if (role === 'coach') {
    nav(getCoachProfile().signupCompletedAtMs ? 'main' : 'onboarding');
    return;
  }

  nav('clientHome');
}

function routeAfterSignOut() {
  useAppStore.getState().nav('auth');
}

function apply(userId: string | null) {
  const previous = lastUserId;
  lastUserId = userId;
  useAppStore.getState().setSession(userId);

  if (previous === userId) return;
  if (userId) {
    routeAfterSignIn();
  } else if (previous !== undefined) {
    routeAfterSignOut();
  }
}

/**
 * Reads any existing session, then keeps the store in step with it.
 * Returns its own unsubscribe, so App can hand it straight back from a
 * useEffect.
 */
export function initSession(): () => void {
  if (!isSupabaseConfigured()) {
    // Not a failure: the app runs on mockStore's localStorage, which is how
    // every screen built before auth still works and how the other tracks
    // develop without credentials.
    useAppStore.getState().setAuthDisabled();
    return () => {};
  }

  void getSession().then((session) => apply(session?.user.id ?? null));
  return onAuthStateChange((session) => apply(session?.user.id ?? null));
}

/** Test seam: forget what we have heard, so a fresh init routes again. */
export function resetSessionTracking(): void {
  lastUserId = undefined;
}
