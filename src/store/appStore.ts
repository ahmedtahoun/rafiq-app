import { create } from 'zustand';
import { completeCoachSignup as storeCompleteCoachSignup, type CoachSignupFields, completeClientSignup as storeCompleteClientSignup, type ClientSignupFields } from '../lib/mockStore';

export type Lang = 'en' | 'ar';
export type Role = 'coach' | 'client' | null;

const STORAGE_PREFIX = 'rafiq_';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, quota, etc.) — no-op, same
    // fallback the design prototype's store.js used.
  }
}

// Screen names that exist so far — each track adds its own as it builds
// screens out (see the Rafiq Build Plan doc), rather than every screen
// being pre-declared up front. Same shape as the sibling SafeLog app's
// router (see app/src/store/appStore.ts there), chosen for consistency:
// one flat Screen union + a nav()/back() pair with a real history stack,
// instead of a routing library.
export type Screen =
  | 'welcome' | 'roleSelect'
  | 'auth' | 'clientAuth'
  | 'onboarding'
  | 'main' // coach home dashboard
  | 'profile' | 'editProfile' | 'accountDetails'
  | 'clients' | 'addClient' | 'clientDetail' | 'editClient'
  | 'offerings' | 'offeringDetail' | 'subscription' | 'earnings'
  | 'templates' | 'templateDetail'
  | 'addTask' | 'sessionRoom'
  | 'messages' | 'messagesInbox'
  | 'notifications' | 'shareProfile' | 'previewProfile'
  | 'helpCenter' | 'coachPrivacyPolicy' | 'coachTermsOfService'
  | 'clientOnboarding' | 'clientHome' | 'clientProfile' | 'editClientProfile' // Track B (client side)
  | 'discover' | 'coachPreview'
  | 'clientCoach' | 'clientBooking'
  | 'schedule' | 'addTimeBlock' | 'availability'
  | 'comingSoon'; // placeholder landing spot for whatever's not built yet

// Route params a screen was entered with — e.g.
// nav({ screen: 'clientDetail', params: { clientId: 'sara' } }), then that
// screen reads params.clientId. Kept as a loose string-keyed bag (not a
// per-screen typed map) to match this store's existing pragmatic style —
// add keys as screens that need them are built, not ahead of time. Every
// history entry carries its own params alongside its screen, so back()
// restores both together (a bare Screen[] history couldn't do that).
export type ScreenParams = Record<string, string>;
const NO_PARAMS: ScreenParams = {};

interface HistEntry {
  screen: Screen;
  params: ScreenParams;
}

// Screens with no back-history (entering one always clears the stack —
// bottom-nav destinations, or dead-end/landing screens).
const ROOTS: Screen[] = ['comingSoon', 'main', 'profile', 'clients', 'clientHome', 'messagesInbox', 'schedule', 'discover', 'clientCoach'];
// Screens that shouldn't be pushed onto the NEXT screen's back-stack when
// LEFT (e.g. splash/entry screens nobody should land back on). Empty for
// now — extend as screens like that are added.
const NOHIST: Screen[] = [];
const RET = '@return';

// Fallback destination for back() when there's no history AND no better
// answer (e.g. deep-linking straight into a screen). Extend this as
// screens are added — same purpose as SafeLog's PARENT map.
const PARENT: Partial<Record<Screen, Screen | typeof RET>> = {
  editProfile: 'profile',
  accountDetails: 'profile',
  auth: 'welcome',
  clientAuth: 'roleSelect',
  // ClientOnboarding is now only reachable through ClientAuth, so that is
  // where a back with no history belongs.
  clientOnboarding: 'clientAuth',
  addClient: 'clients',
  templates: 'profile',
  shareProfile: 'profile',
  previewProfile: 'profile',
  helpCenter: 'profile',
  coachPrivacyPolicy: 'profile',
  coachTermsOfService: 'profile',
  notifications: 'main',
  addTask: 'clients',
  messages: 'messagesInbox',
  // The inbox is a bottom-nav root, so it is usually entered with an empty
  // history — without this its back button would be a no-op. Profile is
  // where MessagesInbox.dc.html's own back link points.
  messagesInbox: 'profile',
  sessionRoom: 'clients',
  templateDetail: 'templates',
  clientDetail: 'clients',
  offerings: 'profile',
  offeringDetail: 'offerings',
  subscription: 'profile',
  earnings: 'main',
  clientProfile: 'clientHome',
  editClientProfile: 'clientProfile',
  // Discover is a bottom-nav root, so it is normally entered with an
  // empty history; ClientHome is where its own nav sits.
  discover: 'clientHome',
  coachPreview: 'discover',
  // ClientCoach is a bottom-nav root, so it is normally entered with an
  // empty history; ClientHome is where its own nav sits.
  clientCoach: 'clientHome',
  clientBooking: 'clientCoach',
  addTimeBlock: 'schedule',
  // Availability.dc.html's own back link points at Profile, not Schedule
  // (it's reached from Schedule's header icon, but is itself a settings-ish
  // screen, not a child of the calendar view).
  availability: 'profile',
};

interface NavPatch {
  screen?: Screen;
  params?: ScreenParams;
}

// Whether this build has an authenticated session behind it.
// 'disabled' is not an error: with no Supabase credentials the app runs
// entirely on mockStore's localStorage, which is how every screen built
// before auth still works and how the other tracks develop.
export type AuthStatus = 'unknown' | 'disabled' | 'signedOut' | 'signedIn';

interface AppState {
  lang: Lang;
  dark: boolean;
  role: Role;
  authStatus: AuthStatus;
  /** auth.users.id of the signed-in account, or null. */
  userId: string | null;
  /**
   * i18n key for a sign-in failure that has to outlive the screen that
   * caused it. A failed provider return arrives as a cold start, so there
   * is no Auth component left holding the error when it lands — it has to
   * be here for Auth to find once it mounts.
   */
  authErrorKey: string | null;
  /** The provider's own words for that failure, untranslated. */
  authErrorDetail: string | null;
  screen: Screen;
  params: ScreenParams;
  hist: HistEntry[];
  setLang: (lang: Lang) => void;
  setDark: (dark: boolean) => void;
  setRole: (role: Role) => void;
  setSession: (userId: string | null) => void;
  setAuthDisabled: () => void;
  setAuthError: (key: string, detail?: string) => void;
  clearAuthError: () => void;
  nav: (patch: Screen | NavPatch) => void;
  back: () => void;
  completeCoachSignup: (fields: CoachSignupFields) => void;
  completeClientSignup: (fields: ClientSignupFields) => void;
}

// Same persisted preferences the design prototype's store.js tracked
// (getLang/setLang, getDark/setDark, setRole) — same localStorage-backed
// persistence model, now as a real, typed app-wide store, plus the
// screen router described above.
export const useAppStore = create<AppState>((set, get) => ({
  lang: readLocal<Lang>('lang', 'en'),
  dark: readLocal<boolean>('dark', window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false),
  role: readLocal<Role>('role', null),
  authStatus: 'unknown',
  userId: null,
  authErrorKey: null,
  authErrorDetail: null,
  screen: 'welcome',
  params: NO_PARAMS,
  hist: [],

  setLang: (lang) => {
    writeLocal('lang', lang);
    set({ lang });
  },
  setDark: (dark) => {
    writeLocal('dark', dark);
    set({ dark });
  },
  setRole: (role) => {
    writeLocal('role', role);
    set({ role });
  },

  // Called by lib/session.ts on load and on every auth state change.
  // Routing is not decided here — the store only records what is true, so
  // that a sign-in arriving mid-screen cannot yank the user somewhere
  // unexpected; session.ts decides where to go and calls nav() itself.
  setSession: (userId) => set({ userId, authStatus: userId ? 'signedIn' : 'signedOut' }),

  setAuthDisabled: () => set({ authStatus: 'disabled', userId: null }),

  setAuthError: (key, detail = '') => set({ authErrorKey: key, authErrorDetail: detail || null }),
  clearAuthError: () => set({ authErrorKey: null, authErrorDetail: null }),

  nav(patch) {
    const p: NavPatch = typeof patch === 'string' ? { screen: patch } : patch;
    const { screen: current, params: currentParams, hist } = get();
    const next = p.screen ?? current;
    const nextParams = p.params ?? NO_PARAMS;

    let h = hist.slice();
    if (next !== current) {
      if (ROOTS.includes(next)) {
        h = [];
      } else if (!NOHIST.includes(current)) {
        const at = h.findIndex((e) => e.screen === next);
        if (at >= 0) h = h.slice(0, at);
        else h.push({ screen: current, params: currentParams });
      }
    }
    set({ screen: next, params: nextParams, hist: h });
  },

  back() {
    const { screen, hist } = get();
    if (hist.length > 0) {
      const h = hist.slice();
      const prev = h.pop()!;
      set({ screen: prev.screen, params: prev.params, hist: h });
      return;
    }
    const parent = PARENT[screen];
    if (parent && parent !== RET) {
      set({ screen: parent as Screen, params: NO_PARAMS, hist: [] });
    }
    // RET or no PARENT entry: nothing sensible to go back to from here
    // (e.g. 'welcome' itself) — no-op rather than guessing a destination.
  },

  completeCoachSignup(fields) {
    storeCompleteCoachSignup(fields);
    writeLocal('role', 'coach');
    set({ role: 'coach' });
    get().nav('main');
  },

  completeClientSignup(fields) {
    // This prototype's one demo Member/Pro pair — same hardcoded 'sara' id
    // ClientOnboarding.dc.html's own finishOnboarding() uses.
    storeCompleteClientSignup('sara', fields);
    writeLocal('role', 'client');
    set({ role: 'client' });
    get().nav('clientHome');
  },
}));
