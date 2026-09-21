import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** The app's client, typed against supabase/migrations/0001_init.sql. */
export type RafiqClient = SupabaseClient<Database>;

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until .env.local is filled in. Everything still runs off mockStore's
    localStorage layer, so screens can check this and keep working unconnected
    rather than white-screening on a missing key. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

let client: RafiqClient | null = null;

/**
 * The single shared client, created on first use.
 *
 * Deliberately lazy: this module used to build the client at import time and
 * throw when the env vars were missing, which was harmless only because
 * nothing imported it yet. The moment a screen does, that throw takes the
 * whole app down at startup on any machine without a .env.local — including
 * a teammate's first `npm run dev`. Creating it on demand means the failure
 * lands on the one call that needs credentials, where it can be caught.
 *
 * Two clients would mean two auth listeners racing over the same stored
 * session, so there is exactly one and callers go through here.
 */
export function getSupabase(): RafiqClient {
  if (!client) {
    if (!url || !anonKey) {
      throw new Error(
        'Supabase is not configured — copy .env.local.example to .env.local and fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.',
      );
    }
    client = createClient<Database>(url, anonKey);
  }
  return client;
}
