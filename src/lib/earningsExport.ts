/**
 * The CSV behind Earnings' "Export CSV", a Rafiq Elite Pro feature.
 *
 * Its own module rather than part of `earningsData.ts`, which aggregates:
 * `fetchOwnLedgerTotals` selects `client_id, kind, amount, state` and
 * returns two numbers per member, so an export needs the rows themselves.
 * Same table, same RLS, no new endpoint and no migration — a wider select
 * on `payments`, which has carried every column below since 0001.
 *
 * Nothing here formats a date. `paid_at` is a real instant the server
 * stamped, so the caller passes `fmt.instantDate` and it renders in the
 * device's zone (src/lib/format.ts). Through the UTC calendar formatters a
 * payment taken at 1 AM in Cairo would export on the previous day.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { EarningsResult } from './earningsData';

/** One `payments` row, as the export needs it. */
export interface PaymentRow {
  id: string;
  clientId: string;
  kind: 'charge' | 'refund';
  amount: number;
  currency: string;
  state: string;
  method: string | null;
  /** The instant the server stamped, ISO. */
  paidAt: string;
}

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase is not configured.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in coach.' } as const;

/** Every payment row across this coach's roster, newest first. */
export async function fetchOwnPaymentRows(): Promise<EarningsResult<PaymentRow[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id;
  if (!uid) return NOT_SIGNED_IN;

  const clients = await supabase.from('clients').select('id').eq('coach_id', uid);
  if (clients.error) return { ok: false, code: 'unknown', message: clients.error.message };
  const ids = clients.data.map((c) => c.id);
  if (ids.length === 0) return { ok: true, data: [] };

  const payments = await supabase
    .from('payments')
    .select('id, client_id, kind, amount, currency, state, method, paid_at')
    .in('client_id', ids)
    .order('paid_at', { ascending: false });
  if (payments.error) return { ok: false, code: 'unknown', message: payments.error.message };

  return {
    ok: true,
    data: payments.data.map((p) => ({
      id: p.id,
      clientId: p.client_id,
      kind: p.kind as PaymentRow['kind'],
      amount: Number(p.amount),
      currency: p.currency,
      state: p.state,
      method: p.method,
      paidAt: p.paid_at,
    })),
  };
}

/** RFC 4180: a field containing a comma, a quote or a newline is quoted,
    and its own quotes are doubled. A member named "Ali, Jr." would
    otherwise shift every column after it by one.

    And no field may start a formula. A member chooses their own name, and
    one that starts with =, +, -, @ (or a tab or carriage return) is run
    as a formula when the coach opens the file in Excel or Sheets: a
    "name" like =HYPERLINK(...) becomes a link in the coach's spreadsheet
    (OWASP, "CSV Injection"). A leading ' makes it text. Amounts never
    start with a sign here (a refund is named by `kind`), so no number is
    touched. */
function field(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_HEADER = ['date', 'member', 'kind', 'amount', 'currency', 'state', 'method'];

/**
 * The ledger as a CSV.
 *
 * Starts with a UTF-8 BOM: without it Excel on Windows reads the file in
 * the system codepage and an Arabic member's name arrives as mojibake,
 * which is most of what this export is for.
 */
export function toCsv(
  rows: PaymentRow[],
  nameOf: (clientId: string) => string,
  date: (iso: string) => string,
): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    lines.push([
      field(date(r.paidAt)),
      field(nameOf(r.clientId)),
      field(r.kind),
      // Two decimals, like the numeric(12,2) it came from, and never a
      // thousands separator or a localised digit: this is a data file, not
      // a screen. Intl would give Arabic-Indic digits under `ar`.
      field(r.amount.toFixed(2)),
      field(r.currency),
      field(r.state),
      field(r.method ?? ''),
    ].join(','));
  }
  // A trailing newline: POSIX text, and the last row imports cleanly.
  return `\uFEFF${lines.join('\n')}\n`;
}

/** A `data:` URL for an `<a download>`, the way the two .ics links already
    do it (CoachPreview, ClientBooking) — no Capacitor Filesystem or Share
    dependency, and the href is readable by a test. */
export function csvHref(csv: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

/** `rafiq-earnings-2026-10-06.csv` — the day it was exported, device zone. */
export function csvFilename(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `rafiq-earnings-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
}
