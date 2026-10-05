import { useEffect, useRef, useState } from 'react';
import {
  canInteract,
  getBlockStatus,
  getMessages,
  markMessagesRead,
  sendMessage,
  setBlockStatus,
  type Message,
  type MessageRole,
} from '../lib/mockStore';
import { offerPush } from './pushAsk';
import { fetchThread, markThreadRead, sendThreadMessage, setThreadBlock, subscribeToThread, type BlockState } from '../lib/messageData';
import { useRemoteLoad } from './remoteLoad';

export type ThreadView =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | {
      status: 'ready';
      messages: Message[];
      block: BlockState;
      /** False while either side blocks (the database refuses a send then,
          0014); a suspended account shows up as a refused send instead. */
      canSend: boolean;
      /** Resolves true once the message is stored. */
      send: (text: string) => Promise<boolean>;
      sending: boolean;
      sendFailed: 'refused' | 'unknown' | null;
      /** This side's own block, on or off. */
      setBlocked: (blocked: boolean) => Promise<boolean>;
      blockBusy: boolean;
      blockFailed: boolean;
    };

const byId = (list: Message[], m: Message) => (list.some((x) => x.id === m.id) ? list : [...list, m]);

/**
 * One thread, from `role`'s side: the coach's Messages ('pro') or the
 * member's CoachMessages ('client'). Signed in it reads Supabase and hears
 * new messages live; signed out it is mockStore's demo thread, as before.
 */
export function useThread(clientId: string, role: MessageRole, remote: boolean): ThreadView {
  const load = useRemoteLoad(`thread:${clientId}`, remote && !!clientId, () => fetchThread(clientId));
  // Signed out, mockStore's demo thread. Signed in it is never read: the
  // thread is Supabase's, and `local` is only used when !remote.
  const [local, setLocal] = useState(() => (remote
    ? { messages: [] as Message[], block: { blockedByMember: false, blockedByPro: false, reason: null, blockedAtMs: null } }
    : { messages: getMessages(clientId), block: getBlockStatus(clientId) }));
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState<'refused' | 'unknown' | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockFailed, setBlockFailed] = useState(false);

  const ready = load.status === 'ready' ? load : null;
  // The latest rows, for callbacks that outlive a render: a live message or
  // a finished send must add to what's on screen *now*, not to what was
  // there when the subscription or the send began.
  const latest = useRef(ready);
  latest.current = ready;
  const append = (m: Message) => {
    const r = latest.current;
    if (r) r.set({ ...r.data, messages: byId(r.data.messages, m) });
  };
  const count = remote ? (ready?.data.messages.length ?? 0) : local.messages.length;

  // New messages from the other side, as they're sent.
  useEffect(() => {
    if (!remote || !clientId || !ready) return;
    return subscribeToThread(clientId, append);
    // Resubscribe per thread, not per render; `ready` changes with every message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote, clientId, !!ready]);

  // Opening the thread, and each new message while it's open, marks it read.
  useEffect(() => {
    if (!clientId) return;
    if (remote) {
      if (ready) void markThreadRead(clientId, role);
    } else {
      markMessagesRead(clientId, role);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, role, remote, count, !!ready]);

  if (remote && load.status === 'loading') return { status: 'loading' };
  if (remote && load.status === 'error') return { status: 'error', retry: load.retry };

  const messages = remote ? ready!.data.messages : local.messages;
  const block: BlockState = remote
    ? { blockedByMember: ready!.data.blockedByMember, blockedByPro: ready!.data.blockedByPro }
    : { blockedByMember: local.block.blockedByMember, blockedByPro: local.block.blockedByPro };
  const canSend = remote ? !block.blockedByMember && !block.blockedByPro : canInteract(clientId);

  async function send(text: string): Promise<boolean> {
    if (!text.trim() || sending) return false;
    setSendFailed(null);
    if (!remote) {
      const sent = sendMessage(clientId, text, role);
      if (sent) setLocal((s) => ({ ...s, messages: getMessages(clientId) }));
      return !!sent;
    }
    setSending(true);
    const result = await sendThreadMessage(clientId, role, text);
    setSending(false);
    if (!result.ok) {
      setSendFailed(result.code === 'refused' ? 'refused' : 'unknown');
      return false;
    }
    // Realtime may have delivered it already; byId keeps one copy.
    append(result.data);
    // A conversation under way: would they like replies on their phone?
    offerPush();
    return true;
  }

  async function setBlocked(blocked: boolean): Promise<boolean> {
    if (blockBusy) return false;
    setBlockFailed(false);
    if (!remote) {
      setBlockStatus(clientId, role, blocked);
      setLocal((s) => ({ ...s, block: getBlockStatus(clientId) }));
      return true;
    }
    setBlockBusy(true);
    const result = await setThreadBlock(clientId, blocked);
    setBlockBusy(false);
    if (!result.ok) {
      setBlockFailed(true);
      return false;
    }
    const r = latest.current;
    if (r) r.set({ ...r.data, ...result.data });
    return true;
  }

  return { status: 'ready', messages, block, canSend, send, sending, sendFailed, setBlocked, blockBusy, blockFailed };
}
