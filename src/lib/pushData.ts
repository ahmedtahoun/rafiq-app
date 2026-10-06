/**
 * This phone's row in `device_tokens` (0023), through the two functions
 * that are the table's only door: register_device() and unregister_device(),
 * both acting as the signed-in person. push-send (server) reads the row to
 * write each banner in the phone's own language and time zone, and skips
 * the kinds switched off here.
 *
 * The token is the phone's address for Apple or Google. It never goes in a
 * log, a URL or an error message.
 *
 * Same result shape as the other *Data.ts files.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type PushErrorCode = 'not_configured' | 'unknown';
export type PushResult<T> = { ok: true; data: T } | { ok: false; code: PushErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
// The database's own message could quote the arguments; never pass it on.
const FAILED = { ok: false, code: 'unknown', message: 'The phone could not be registered.' } as const;

/** The switches push-send honours, as 0023 names them. */
export type PushCategory = 'sessions' | 'messages' | 'tasks';

export interface DeviceRegistration {
  token: string;
  platform: 'ios' | 'android';
  lang: 'en' | 'ar';
  timeZone: string;
  muted: PushCategory[];
}

export async function registerDevice(d: DeviceRegistration): Promise<PushResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().rpc('register_device', {
    p_token: d.token,
    p_platform: d.platform,
    p_lang: d.lang,
    p_time_zone: d.timeZone,
    p_muted: d.muted,
  });
  return error ? FAILED : { ok: true, data: null };
}

export async function unregisterDevice(token: string): Promise<PushResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().rpc('unregister_device', { p_token: token });
  return error ? FAILED : { ok: true, data: null };
}
