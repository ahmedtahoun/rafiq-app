import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set — see .env.example');
}

export const SUPABASE_URL = url;

/**
 * The anon client, and only ever the anon client. Signing in is ordinary
 * Supabase Auth; everything privileged happens in the `admin` Edge
 * Function, which holds the service_role key server-side.
 *
 * `storageKey` is explicit rather than derived from the project URL, for
 * two reasons: it does not change if the project moves, and if this tool
 * is ever served from the same origin as the member app the two sessions
 * cannot overwrite each other.
 */
export const supabase = createClient(url, anonKey, {
  auth: { storageKey: 'rafiq-admin-auth', persistSession: true, autoRefreshToken: true },
});
