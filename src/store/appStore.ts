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
  | 'onboarding'
  | 'main' // coach home dashboard
  | 'profile' | 'editProfile' | 'accountDetails'
  | 'clients' | 'addClient' | 'clientDetail' | 'editClient'
  | 'clientOnboarding' | 'clientHome' // Track B (client side)
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
const ROOTS: Screen[] = ['comingSoon', 'main', 'profile', 'clients', 'clientHome'];
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
  addClient: 'clients',
  clientDetail: 'clients',
};

interface NavPatch {
  screen?: Screen;
  params?: ScreenParams;
}

interface AppState {
  lang: Lang;
  dark: boolean;
  role: Role;
  screen: Screen;
  params: ScreenParams;
  hist: HistEntry[];
  setLang: (lang: Lang) => void;
  setDark: (dark: boolean) => void;
  setRole: (role: Role) => void;
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
