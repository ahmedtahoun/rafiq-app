/**
 * Messaging on Supabase (SUPABASE-MIGRATION-PLAN.md step 5): one thread per
 * roster row (`messages.client_id`), read state per side (`message_reads`),
 * blocks per side (`clients.blocked_by_*`, 0014), and live delivery through
 * Realtime.
 *
 * Messages come back in mockStore's `Message` shape, so the screens keep one
 * rendering path. The app's 'pro' is the database's 'coach'.
 *
 * Who may send is the database's call (0014's messages_insert: no block
 * from either side, both accounts active); a refused send comes back as an
 * error for the screen to explain, never a silent drop.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Message, MessageRole } from './mockStore';

export type MessageErrorCode = 'not_configured' | 'not_signed_in' | 'refused' | 'unknown';
export type MessageResult<T> = { ok: true; data: T } | { ok: false; code: MessageErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const fail = (error: { message: string; code?: string }) =>
  ({ ok: false, code: error.code === '42501' ? 'refused' : 'unknown', message: error.message }) as const;
const ok = <T,>(data: T) => ({ ok: true, data }) as const;

const dbRole = (role: MessageRole) => (role === 'pro' ? 'coach' : 'client');

type MessageRow = { id: string; sender_role: 'coach' | 'client'; body: string; created_at: string };

function toMessage(r: MessageRow): Message {
  return { id: r.id, senderRole: r.sender_role === 'coach' ? 'pro' : 'client', text: r.body, atMs: Date.parse(r.created_at) };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

export interface BlockState {
  blockedByMember: boolean;
  blockedByPro: boolean;
}

export interface Thread extends BlockState {
  messages: Message[];
}

export async function fetchThread(clientId: string): Promise<MessageResult<Thread>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const [messages, client] = await Promise.all([
    supabase.from('messages').select('id, sender_role, body, created_at').eq('client_id', clientId).order('created_at', { ascending: true }),
    supabase.from('clients').select('blocked_by_member_at, blocked_by_coach_at').eq('id', clientId).maybeSingle(),
  ]);
  if (messages.error) return fail(messages.error);
  if (client.error) return fail(client.error);
  return ok({
    messages: messages.data.map(toMessage),
    blockedByMember: !!client.data?.blocked_by_member_at,
    blockedByPro: !!client.data?.blocked_by_coach_at,
  });
}

export async function sendThreadMessage(clientId: string, role: MessageRole, text: string): Promise<MessageResult<Message>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const { data, error } = await getSupabase()
    .from('messages')
    .insert({ client_id: clientId, sender_role: dbRole(role), sender_id: uid, body: text.trim() })
    .select('id, sender_role, body, created_at')
    .single();
  return error ? fail(error) : ok(toMessage(data));
}

/** Opening a thread marks it read for this side: update, then insert the
    first time (the same pattern as client_private in rosterData.ts). */
export async function markThreadRead(clientId: string, role: MessageRole): Promise<MessageResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const reader_role = dbRole(role);
  const last_read_at = new Date().toISOString();
  const updated = await supabase.from('message_reads').update({ last_read_at }).eq('client_id', clientId).eq('reader_role', reader_role).select('client_id');
  if (updated.error) return fail(updated.error);
  if (updated.data.length > 0) return ok(null);
  const inserted = await supabase.from('message_reads').insert({ client_id: clientId, reader_role, last_read_at });
  return inserted.error ? fail(inserted.error) : ok(null);
}

export async function setThreadBlock(clientId: string, blocked: boolean): Promise<MessageResult<BlockState>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase().rpc('set_relationship_block', { p_client: clientId, p_blocked: blocked });
  if (error) return fail(error);
  const result = data as { error?: string; blocked_by_member?: boolean; blocked_by_coach?: boolean };
  if (result.error) return { ok: false, code: 'refused', message: result.error };
  return ok({ blockedByMember: !!result.blocked_by_member, blockedByPro: !!result.blocked_by_coach });
}

/**
 * New messages in one thread as they're sent, from either side. Returns the
 * unsubscribe. Realtime applies messages_select to the subscriber, so this
 * only ever hears threads the user can read.
 */
export function subscribeToThread(clientId: string, onMessage: (m: Message) => void): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const supabase = getSupabase();
  const channel = supabase
    .channel(`messages:${clientId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` }, (payload) =>
      onMessage(toMessage(payload.new as MessageRow)),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** The coach's inbox: each roster row's latest message and unread count. */
export interface InboxEntry {
  last: Message | null;
  unread: number;
}

export async function fetchInbox(clientIds: string[]): Promise<MessageResult<Record<string, InboxEntry>>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const entries: Record<string, InboxEntry> = Object.fromEntries(clientIds.map((id) => [id, { last: null, unread: 0 }]));
  if (clientIds.length === 0) return ok(entries);
  const supabase = getSupabase();
  const [messages, reads] = await Promise.all([
    supabase.from('messages').select('id, client_id, sender_role, body, created_at').in('client_id', clientIds).order('created_at', { ascending: true }),
    supabase.from('message_reads').select('client_id, last_read_at').in('client_id', clientIds).eq('reader_role', 'coach'),
  ]);
  if (messages.error) return fail(messages.error);
  if (reads.error) return fail(reads.error);
  const lastRead = new Map(reads.data.map((r) => [r.client_id, Date.parse(r.last_read_at)]));
  for (const row of messages.data) {
    const entry = entries[row.client_id];
    if (!entry) continue;
    const message = toMessage(row as MessageRow);
    entry.last = message;
    if (message.senderRole === 'client' && message.atMs > (lastRead.get(row.client_id) ?? 0)) entry.unread += 1;
  }
  return ok(entries);
}
