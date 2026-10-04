import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Whether this build was given a project to talk to.
 *
 * Deliberately a flag and not a module-level `throw`. Vite replaces
 * `import.meta.env.*` at build time, so with the variables unset the
 * condition folds to a constant, and the minifier then treats everything
 * after the throw as unreachable — it drops the whole app and emits a
 * bundle that is one `Error(...)` call. The build still exits 0, so
 * nothing catches it, and what gets deployed is a blank page. Measured on
 * this app: 228 KB without the variables, 443 KB with them, and no screen
 * in the smaller one.
 *
 * So the app always builds, and says what is missing at runtime instead.
 */
export const configured = Boolean(url && anonKey);

export const SUPABASE_URL = url ?? '';

let client: SupabaseClient | null = null;

/**
 * The anon client, and only ever the anon client. Signing in is ordinary
 * Supabase Auth; everything privileged happens in the `admin` Edge
 * Function, which holds the service_role key server-side.
 *
 * `storageKey` is explicit rather than derived from the project URL, for
 * two reasons: it does not change if the project moves, and if this tool
 * is ever served from the same origin as the member app the two sessions
 * cannot overwrite each other.
 *
 * Created on first use, so an unconfigured build renders its own message
 * rather than dying inside `createClient`.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { storageKey: 'rafiq-admin-auth', persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
