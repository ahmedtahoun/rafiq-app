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
 * For the same reason every list is read a page at a time (readAll): the
 * API returns at most max_rows rows to one request (supabase/config.toml)
 * and doesn't say when it stopped, so one read of a long conversation would
 * quietly lose everything past the first thousand messages.
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

/**
 * One page: supabase/config.toml's max_rows. It must not be more than that,
 * or a full page would come back looking short and the read would stop.
 */
export const EXPORT_PAGE = 1000;

/**
 * Every row of one list, a page at a time until a page comes back short,
 * or null if any page fails. Each caller orders its pages by the table's
 * primary key, so no row is skipped or read twice between them.
 */
async function readAll(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[] | null> {
  const rows: Row[] = [];
  for (let from = 0; ; from += EXPORT_PAGE) {
    const { data, error } = await page(from, from + EXPORT_PAGE - 1);
    if (error) return null;
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < EXPORT_PAGE) return rows;
  }
}

/** Per relationship: each table, and its primary key. */
const PER_RELATIONSHIP = [
  ['tasks', ['id']],
  ['sessions', ['id']],
  ['mood_checkins', ['id']],
  ['messages', ['id']],
  ['ratings', ['id']],
  ['agreements', ['client_id']],
  ['packages', ['client_id']],
  ['payments', ['id']],
  ['enrollments', ['client_id', 'offering_id']],
] as const;

export async function fetchMemberExport(nowIso: string = new Date().toISOString()): Promise<ExportResult<MemberExport>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) return NOT_SIGNED_IN;

  const [profile, goals, rels, requests, favourites, notifications] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('member_profiles').select('*').eq('profile_id', uid).maybeSingle(),
    readAll((from, to) => supabase.from('clients').select('*').eq('member_id', uid).order('id').range(from, to)),
    readAll((from, to) => supabase.from('session_requests').select('*').eq('member_id', uid).order('id').range(from, to)),
    readAll((from, to) => supabase.from('favourite_coaches').select('*').eq('member_id', uid).order('coach_id').range(from, to)),
    readAll((from, to) => supabase.from('notifications').select('*').eq('recipient_id', uid).order('id').range(from, to)),
  ]);
  if (profile.error || goals.error || !rels || !requests || !favourites || !notifications) return FAILED;

  const ids = rels.map((r) => String(r.id));
  const byTable: Record<string, Row[]> = {};
  if (ids.length > 0) {
    const reads = await Promise.all(PER_RELATIONSHIP.map(([table, key]) => readAll((from, to) => {
      let q = supabase.from(table).select('*').in('client_id', ids);
      for (const col of key) q = q.order(col);
      return q.range(from, to);
    })));
    for (const [i, rows] of reads.entries()) {
      if (!rows) return FAILED;
      byTable[PER_RELATIONSHIP[i][0]] = rows;
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
      session_requests: requests,
      favourite_coaches: favourites,
      notifications,
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
