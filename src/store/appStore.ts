import { create } from 'zustand';

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

interface AppState {
  lang: Lang;
  dark: boolean;
  role: Role;
  setLang: (lang: Lang) => void;
  setDark: (dark: boolean) => void;
  setRole: (role: Role) => void;
}

// Same three persisted preferences the design prototype's store.js tracked
// (getLang/setLang, getDark/setDark, setRole) — same localStorage-backed
// persistence model, now as a real, typed app-wide store.
export const useAppStore = create<AppState>((set) => ({
  lang: readLocal<Lang>('lang', 'en'),
  dark: readLocal<boolean>('dark', window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false),
  role: readLocal<Role>('role', null),
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
}));
