/**
 * "Download my data" on the member's Profile: one JSON file of everything
 * about them that they can read in Rafiq. Law 151/2020's right of access,
 * which store/LEGAL-DRAFTS.md clause 8 promises.
 *
 * Read as the member, through the same RLS as every screen, so the file
 * holds exactly what the member may see and nothing more: no other member,
 * and never the coach's private notes (client_private, which members can't
 * read). Rows are whole (`select *`): a right of access is to the data, not
 * to what a screen happens to show of it.
 *
 * Its own module, like earningsExport.ts: nothing aggregates here, it
 * gathers. A table that fails to read fails the export, rather than
 * handing over a file that silently leaves part of it out.
 *
 * Same result shape as the other *Data.ts files.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type ExportErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type ExportResult<T> = { ok: true; data: T } | { ok: false; code: ExportErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in member.' } as const;
// Never pass the database's message on: it can quote what was asked for.
const FAILED = { ok: false, code: 'unknown', message: 'The export could not be read.' } as const;

type Row = Record<string, unknown>;

/** What one relationship with a coach holds, as the member can read it. */
export interface RelationshipExport {
  relationship: Row;
  tasks: Row[];
  sessions: Row[];
  check_ins: Row[];
  messages: Row[];
  reviews: Row[];
  agreement: Row[];
  packages: Row[];
  payments: Row[];
  programs: Row[];
}

export interface MemberExport {
  format: 'rafiq-member-export';
  version: 1;
  exported_at: string;
  profile: Row | null;
  goals: Row | null;
  relationships: RelationshipExport[];
  session_requests: Row[];
  favourite_coaches: Row[];
  notifications: Row[];
}

/** Per relationship, the table and the key it hangs on. */
const PER_RELATIONSHIP = {
  tasks: 'tasks',
  sessions: 'sessions',
  check_ins: 'mood_checkins',
  messages: 'messages',
  reviews: 'ratings',
  agreement: 'agreements',
  packages: 'packages',
  payments: 'payments',
  programs: 'enrollments',
} as const;

export async function fetchMemberExport(nowIso: string = new Date().toISOString()): Promise<ExportResult<MemberExport>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) return NOT_SIGNED_IN;

  const [profile, goals, clients, requests, favourites, notifications] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('member_profiles').select('*').eq('profile_id', uid).maybeSingle(),
    supabase.from('clients').select('*').eq('member_id', uid),
    supabase.from('session_requests').select('*').eq('member_id', uid),
    supabase.from('favourite_coaches').select('*').eq('member_id', uid),
    supabase.from('notifications').select('*').eq('recipient_id', uid),
  ]);
  if (profile.error || goals.error || clients.error || requests.error || favourites.error || notifications.error) return FAILED;

  const rels = (clients.data ?? []) as Row[];
  const ids = rels.map((r) => String(r.id));
  const byTable: Record<string, Row[]> = {};
  if (ids.length > 0) {
    const tables = Object.values(PER_RELATIONSHIP);
    const reads = await Promise.all(tables.map((t) => supabase.from(t).select('*').in('client_id', ids)));
    for (const [i, r] of reads.entries()) {
      if (r.error) return FAILED;
      byTable[tables[i]] = (r.data ?? []) as Row[];
    }
  }
  const of = (table: string, clientId: string) => (byTable[table] ?? []).filter((r) => r.client_id === clientId);

  return {
    ok: true,
    data: {
      format: 'rafiq-member-export',
      version: 1,
      exported_at: nowIso,
      profile: (profile.data as Row | null) ?? null,
      goals: (goals.data as Row | null) ?? null,
      relationships: rels.map((relationship) => {
        const id = String(relationship.id);
        return {
          relationship,
          tasks: of('tasks', id),
          sessions: of('sessions', id),
          check_ins: of('mood_checkins', id),
          messages: of('messages', id),
          reviews: of('ratings', id),
          agreement: of('agreements', id),
          packages: of('packages', id),
          payments: of('payments', id),
          programs: of('enrollments', id),
        };
      }),
      session_requests: (requests.data ?? []) as Row[],
      favourite_coaches: (favourites.data ?? []) as Row[],
      notifications: (notifications.data ?? []) as Row[],
    },
  };
}

/** The file, as a link a download can point at. */
export function exportBlobUrl(data: MemberExport): string {
  return URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

/** `rafiq-my-data-2026-10-06.json`: the day it was exported, device zone. */
export function exportFilename(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `rafiq-my-data-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
