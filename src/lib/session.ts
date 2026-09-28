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
import type { MessageKey } from './i18n';
import { useAppStore } from '../store/appStore';
import { getSession, onAuthStateChange } from './auth';
import { isSupabaseConfigured } from './supabase';
import { fetchOwnSignupCompleted } from './profileData';
import { classifyOAuthReturn, clearOAuthReturn, takeAuthOrigin, takeOAuthReturn } from './oauthReturn';

// undefined = we have not yet heard anything, which is different from
// "heard, and there is no session". Without that distinction a cold start
// while signed out reads as a sign-out and bounces the user to Auth.
let lastUserId: string | null | undefined = undefined;

function routeAfterSignIn() {
  const { role, nav, clearAuthError } = useAppStore.getState();

  // A sign-in that worked retires whatever the last failed one left
  // behind, so a later sign-out does not land on Auth showing an error
  // about an attempt the user already recovered from.
  clearAuthError();

  // No role chosen yet: the design sends a fresh sign-in to RoleSelect, and
  // it has to be the local choice that decides. profiles.role cannot: OAuth
  // carries no role, so handle_new_user() defaults every provider signup to
  // 'client' and reading it back would silently skip the question.
  if (!role) {
    nav('roleSelect');
    return;
  }

  // Whether this account finished onboarding is a fact about the account,
  // not the device: it comes from coach_profiles / member_profiles, so a
  // new phone doesn't send an onboarded coach through onboarding again.
  // (routeAfterSignIn only ever runs with a real session.)
  if (role === 'coach') {
    void routeBySignup('coach', 'main', 'onboarding');
    return;
  }
  void routeBySignup('client', 'clientHome', 'clientOnboarding');
}

async function routeBySignup(role: 'coach' | 'client', done: 'main' | 'clientHome', notDone: 'onboarding' | 'clientOnboarding') {
  const signedInAs = lastUserId;
  const result = await fetchOwnSignupCompleted(role);
  // Signed out, or someone else signed in, while this was in flight.
  if (lastUserId !== signedInAs) return;
  const { nav } = useAppStore.getState();
  if (!result.ok) {
    // Home rather than onboarding: re-running onboarding would overwrite a
    // finished profile, and home's own profile screens show a retry.
    console.error('[session] could not read signup state:', result.message);
    nav(done);
    return;
  }
  nav(result.data ? done : notDone);
}

function routeAfterSignOut() {
  useAppStore.getState().nav('auth');
}

/**
 * Put a failed return on screen instead of dropping the user on the intro
 * carousel with the failure unread in the address bar.
 *
 * Back to whichever sign-in screen this started from, so an invited
 * member retries on ClientAuth with their coach's name still on it
 * rather than being handed the generic entry screen. Welcome, where a
 * cold start otherwise lands, has nowhere to show a message at all.
 */
function routeAfterFailedReturn(key: MessageKey, detail: string) {
  const { setAuthError, nav } = useAppStore.getState();
  setAuthError(key, detail);
  nav(takeAuthOrigin() === 'clientAuth' ? 'clientAuth' : 'auth');
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

  // Claim this page load's provider return, if there was one. Claiming it
  // here rather than after the await matters: in development React mounts
  // effects twice, and only one of the two inits should act on it.
  const returned = takeOAuthReturn();

  void getSession().then((session) => {
    // Only now is the URL safe to tidy: getSession() is what gives
    // supabase-js the chance to exchange the ?code= it needs to still be
    // there for.
    if (returned) clearOAuthReturn();

    // Order matters. apply() routes a live session to its home screen, so
    // the failure has to land after it to win — which is what should
    // happen when someone already signed in fails to add a second
    // provider: the message is the news, not the screen they were headed
    // to anyway.
    apply(session?.user.id ?? null);

    const failure = returned && classifyOAuthReturn(returned, session !== null);
    if (failure) routeAfterFailedReturn(failure.key, failure.detail);
  });

  return onAuthStateChange((session) => apply(session?.user.id ?? null));
}

/** Test seam: forget what we have heard, so a fresh init routes again. */
export function resetSessionTracking(): void {
  lastUserId = undefined;
}
