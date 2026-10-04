/**
 * The signed-in member's own notifications (SUPABASE-MIGRATION-PLAN.md
 * step 6): `notifications` rows addressed to them (notifications_select_own),
 * and marking them read (notifications_update_own).
 *
 * The database writes six kinds to a member (0002, 0011, 0021): a message
 * from their coach, a payment recorded, a session their coach moved or
 * cancelled, and a coach accepting or declining their session request.
 * Anything else is left out rather than shown blank. Payloads
 * are read defensively: a missing field drops that detail, not the row.
 * Session times cross this edge as wall-clock ms (src/lib/wallClock.ts).
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { toWallMs } from './wallClock';

export type NotificationErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type NotificationResult<T> = { ok: true; data: T } | { ok: false; code: NotificationErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

/** How many of the newest the screen shows. */
export const NOTIFICATIONS_SHOWN = 50;

export const MEMBER_NOTIFICATION_KINDS = [
  'message', 'payment-received', 'session-moved', 'session-cancelled', 'request-accepted', 'request-declined',
] as const;
export type MemberNotificationKind = (typeof MEMBER_NOTIFICATION_KINDS)[number];

export interface MemberNotification {
  id: string;
  kind: MemberNotificationKind;
  /** The relationship it is about. */
  clientId: string | null;
  unread: boolean;
  /** A real instant (ISO). */
  createdAt: string;
  /** message: the first 140 characters. */
  preview: string;
  /** payment-received. */
  amount: number | null;
  currency: string;
  /** session-moved: the new time; session-cancelled: the time it was;
      request-*: the time asked for. */
  sessionWallMs: number | null;
  /** request-*: the coach who answered, and their name then ('' if their
      account is gone). A declined stranger has no relationship to name them. */
  coachId: string | null;
  coachName: string;
  /** request-declined: it asked to move a booked session, not for a new one. */
  move: boolean;
}

interface NotificationRow {
  id: string;
  kind: string;
  client_id: string | null;
  payload: unknown;
  read_at: string | null;
  created_at: string;
}

const isKind = (k: string): k is MemberNotificationKind => (MEMBER_NOTIFICATION_KINDS as readonly string[]).includes(k);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const time = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? toWallMs(v) : null);

function toNotification(r: NotificationRow): MemberNotification | null {
  if (!isKind(r.kind)) return null;
  const p = (r.payload && typeof r.payload === 'object' ? r.payload : {}) as Record<string, unknown>;
  const amount = Number(p.amount);
  return {
    id: r.id,
    kind: r.kind,
    clientId: r.client_id,
    unread: r.read_at === null,
    createdAt: r.created_at,
    preview: str(p.preview).trim(),
    amount: r.kind === 'payment-received' && p.amount != null && Number.isFinite(amount) ? amount : null,
    currency: str(p.currency) || 'EGP',
    sessionWallMs: r.kind === 'session-moved' ? time(p.to)
      : r.kind === 'session-cancelled' ? time(p.scheduled_at)
        : r.kind === 'request-accepted' || r.kind === 'request-declined' ? time(p.requested_start)
          : null,
    coachId: str(p.coach_id) || null,
    coachName: str(p.coach_name).trim(),
    move: p.move === true,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/** The member's newest notifications of the kinds above. */
export async function fetchMemberNotifications(): Promise<NotificationResult<MemberNotification[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('id, kind, client_id, payload, read_at, created_at')
    .eq('recipient_id', uid)
    .in('kind', [...MEMBER_NOTIFICATION_KINDS])
    .order('created_at', { ascending: false })
    .limit(NOTIFICATIONS_SHOWN);
  if (error) return unknown(error);
  return { ok: true, data: (data as NotificationRow[]).flatMap((r) => toNotification(r) ?? []) };
}

/** Whether any of them is unread: Home's bell dot. */
export async function fetchHasUnreadNotifications(): Promise<NotificationResult<boolean>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('id')
    .eq('recipient_id', uid)
    .in('kind', [...MEMBER_NOTIFICATION_KINDS])
    .is('read_at', null)
    .limit(1);
  if (error) return unknown(error);
  return { ok: true, data: data.length > 0 };
}

/** Marks one read. Already read is not an error. */
export async function markMemberNotificationRead(id: string): Promise<NotificationResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) return unknown(error);
  return { ok: true, data: null };
}

/** Marks every unread one read. */
export async function markAllMemberNotificationsRead(): Promise<NotificationResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', uid)
    .is('read_at', null);
  if (error) return unknown(error);
  return { ok: true, data: null };
}
