/**
 * Phone notifications, the app's half. The server half is 0023
 * (device_tokens) and the push-send Edge Function, which turns each new
 * notifications row into a banner on the recipient's phones.
 *
 * What this does:
 * - Never asks at launch. The OS prompt only follows the app's own
 *   explanation (PushAsk, store/pushAsk.ts: the first message sent or
 *   received, the first session booked) or a tap on "Turn on" in Profile's
 *   notification card. Once someone has
 *   answered, the app doesn't ask again; "Not now" is remembered too.
 * - Signed in with permission already given, it registers this phone for
 *   them, and again whenever the language or a switch changes, so the
 *   banners follow the app's language and the Profile switches.
 * - The master switch off unregisters the phone: no banners at all.
 * - Signing out unregisters it first, while the session can still say who
 *   is asking (auth.ts), so a shared phone stops getting their banners.
 * - A tapped banner opens the screen it is about.
 *
 * In a browser there is no plugin: every function here is a no-op and
 * Profile shows no phone row. The plugin sits behind `pushPlugin` so tests
 * can stand in for the phone (tests/push-app.spec.js), the way
 * nativeSystemBars.ts does.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useAppStore } from '../store/appStore';
import { getNotificationPrefs, getProNotificationPrefs, type NavTarget } from './mockStore';
import { registerDevice, unregisterDevice, type PushCategory } from './pushData';

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

/** What a tapped banner carries (push-send's Banner.data). */
export type PushData = Record<string, string | undefined>;

export const pushPlugin = {
  available: (): boolean => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications'),
  platform: (): string => Capacitor.getPlatform(),
  /**
   * Android only: whether this build has Firebase, i.e. whether
   * android/app/google-services.json was there when the web assets were
   * built (vite.config.ts). Without it the plugin's register() crashes the
   * app, so supported() keeps Android off push entirely.
   */
  firebase: (): boolean => import.meta.env.VITE_ANDROID_PUSH === true,
  async checkPermission(): Promise<string> {
    return (await PushNotifications.checkPermissions()).receive;
  },
  async requestPermission(): Promise<string> {
    return (await PushNotifications.requestPermissions()).receive;
  },
  /** Resolves with the phone's token, or null if Apple or Google refused or never answered. */
  async register(): Promise<string | null> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (token: string | null) => {
        if (settled) return;
        settled = true;
        void ok.then((h) => h.remove());
        void bad.then((h) => h.remove());
        resolve(token);
      };
      const ok = PushNotifications.addListener('registration', (t) => done(t.value));
      const bad = PushNotifications.addListener('registrationError', () => done(null));
      setTimeout(() => done(null), 15_000);
      PushNotifications.register().catch(() => done(null));
    });
  },
  /** The phone's time zone, for "Tue 10:00 AM" in the banner. */
  timeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
    } catch {
      return 'Africa/Cairo';
    }
  },
  onTap(handler: (data: PushData) => void): () => void {
    const h = PushNotifications.addListener('pushNotificationActionPerformed', (a) => handler((a.notification.data ?? {}) as PushData));
    return () => void h.then((x) => x.remove());
  },
};

// Device keys: this phone's token, so sign-out can unregister it after a
// restart, and whether the app has already asked.
const TOKEN_KEY = 'rafiq_push_token';
const ASKED_KEY = 'rafiq_push_asked';

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: the phone is simply re-registered next time.
  }
}

function normalise(p: string): PushPermission {
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt';
}

/** A phone that can get banners: native, with the plugin, and on Android with Firebase. */
function supported(): boolean {
  return pushPlugin.available() && (pushPlugin.platform() !== 'android' || pushPlugin.firebase());
}

export async function pushPermission(): Promise<PushPermission> {
  if (!supported()) return 'unsupported';
  try {
    return normalise(await pushPlugin.checkPermission());
  } catch {
    return 'unsupported';
  }
}

/** Whether the app may still offer its own "get notified?" sheet. */
export async function shouldOfferPush(): Promise<boolean> {
  // Permission first: in a browser that answers, and no device key is read.
  return (await pushPermission()) === 'prompt' && readKey(ASKED_KEY) === null;
}

/** "Not now" on PushAsk: don't offer the sheet again on this phone. */
export function declinePushOffer(): void {
  writeKey(ASKED_KEY, 'declined');
}

/** The switches as push-send's categories, for whoever is signed in. */
export function mutedCategories(role: 'coach' | 'client' | null): { enabled: boolean; muted: PushCategory[] } {
  if (role === 'coach') {
    const p = getProNotificationPrefs();
    const muted: PushCategory[] = [];
    if (p.sessions === false) muted.push('sessions');
    if (p.messages === false) muted.push('messages');
    if (p.tasks === false) muted.push('tasks');
    return { enabled: p.enabled, muted };
  }
  const p = getNotificationPrefs();
  const muted: PushCategory[] = [];
  if (p.session === false) muted.push('sessions');
  if (p.messages === false) muted.push('messages');
  if (p.task === false) muted.push('tasks');
  return { enabled: p.enabled, muted };
}

/**
 * Bring this phone's registration in line with the app: registered with
 * today's language, zone and switches if permission is given and the
 * master switch is on, unregistered if it is off. With `ask`, a phone that
 * hasn't been asked yet is asked first — only ever from a tap.
 * Returns where permission stands afterwards.
 */
export function syncPushDevice(opts: { ask?: boolean } = {}): Promise<PushPermission> {
  // One at a time: two switches flipped quickly must reach the server in
  // the order they were flipped, or the older set could land last. Each
  // run reads the switches when it starts, so the last one is current.
  const run = syncQueue.then(() => syncOnce(opts));
  syncQueue = run.catch(() => undefined);
  return run;
}
let syncQueue: Promise<unknown> = Promise.resolve();
/** The zone this phone was last registered with, to notice a new one. */
let registeredZone: string | null = null;

/**
 * App.tsx: travelling, the phone's zone changes while the app sleeps. When
 * it comes back to the foreground in another zone, the registration is
 * brought up to date, so "Tue 10:00 AM" in a banner is the phone's own time.
 */
export function initPushZoneWatch(): () => void {
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || registeredZone === null) return;
    if (pushPlugin.timeZone() !== registeredZone) void syncPushDevice();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}

async function syncOnce({ ask = false }: { ask?: boolean }): Promise<PushPermission> {
  const { userId, lang, role } = useAppStore.getState();
  if (!userId) return pushPermission();
  let permission = await pushPermission();
  if (permission === 'unsupported') return permission;
  if (permission === 'prompt' && ask) {
    writeKey(ASKED_KEY, 'asked');
    try {
      permission = normalise(await pushPlugin.requestPermission());
    } catch {
      return 'prompt';
    }
  }
  if (permission !== 'granted') return permission;

  const { enabled, muted } = mutedCategories(role);
  const known = readKey(TOKEN_KEY);
  if (!enabled) {
    if (known) await unregisterDevice(known);
    return permission;
  }
  const token = await pushPlugin.register();
  if (!token) return permission;
  writeKey(TOKEN_KEY, token);
  const platform = pushPlugin.platform() === 'ios' ? 'ios' : 'android';
  const timeZone = pushPlugin.timeZone();
  const result = await registerDevice({ token, platform, lang: lang === 'ar' ? 'ar' : 'en', timeZone, muted });
  if (result.ok) registeredZone = timeZone;
  return permission;
}

/** Before signing out: this phone stops getting that person's banners. */
export async function stopPushDevice(): Promise<void> {
  if (!supported()) return;
  const token = readKey(TOKEN_KEY);
  if (!token) return;
  await unregisterDevice(token);
  writeKey(TOKEN_KEY, null);
}

const SESSION_KINDS = new Set(['session-moved', 'session-cancelled', 'request-accepted', 'request-declined']);

/**
 * Where a tapped banner goes, for the signed-in role: the thread for a
 * message, the session for a session change or an answer, the request for
 * a new one.
 */
export function pushTarget(data: PushData, role: 'coach' | 'client' | null): NavTarget {
  const kind = data.kind ?? '';
  const clientId = data.client_id;
  if (role === 'coach') {
    if (kind === 'message' && clientId) return { screen: 'messages', params: { clientId } };
    if (kind === 'task-completed' && clientId) return { screen: 'clientDetail', params: { clientId } };
    // A member moving or cancelling: the coach's week.
    if (SESSION_KINDS.has(kind)) return { screen: 'schedule', params: {} };
    // A new request, and anything else: where requests are answered.
    return { screen: 'notifications', params: {} };
  }
  // The member's thread is their current coach's (CoachMessages picks it).
  if (kind === 'message') return { screen: 'coachMessages', params: {} };
  if (SESSION_KINDS.has(kind)) return { screen: 'clientSchedule', params: {} };
  return { screen: 'clientNotifications', params: {} };
}

/** App.tsx: open what a tapped banner is about. Returns the unsubscribe. */
export function initPushTaps(): () => void {
  if (!supported()) return () => {};
  return pushPlugin.onTap((data) => {
    const { userId, role, nav } = useAppStore.getState();
    if (!userId) return;
    nav(pushTarget(data, role));
  });
}
