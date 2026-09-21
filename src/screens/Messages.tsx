import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, MessageIcon } from '../components/icons';
import {
  canInteract,
  clearMessageDraft,
  draftMessage,
  getBlockStatus,
  getClient,
  getMemberAccountStatus,
  getMessageDraft,
  getMessages,
  markMessagesRead,
  sendMessage,
} from '../lib/mockStore';
import './Messages.css';

// 1:1 port of Messages.dc.html — the coach's thread with one member.
// Parametrized on clientId, like ClientDetail and AddTask.
export default function Messages() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const clientId = useAppStore((s) => s.params).clientId ?? '';

  const client = getClient(clientId);

  const [messages, setMessages] = useState(() => getMessages(clientId));
  const [draft, setDraft] = useState(() => getMessageDraft(clientId));
  const listRef = useRef<HTMLDivElement>(null);

  // Opening the thread is what marks it read. In an effect rather than during
  // render because it writes — the design calls it inline in renderVals(),
  // which React would run on every re-render and in StrictMode twice.
  useEffect(() => {
    if (clientId) markMessagesRead(clientId, 'pro');
  }, [clientId, messages.length]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (!client) {
    return (
      <div className="phone-frame messages">
        <div className="messages-header">
          <button className="messages-back" aria-label={t('back')} onClick={back}>
            <ChevronIcon size={16} />
          </button>
          <div className="messages-header-text"><div className="messages-name">{t('messagesTitle')}</div></div>
        </div>
        <p className="messages-missing">{t('messagesMissingClient')}</p>
      </div>
    );
  }

  const firstName = client.name.split(' ')[0] || client.name;
  const canSend = canInteract(clientId);
  const block = getBlockStatus(clientId);
  const cannotSendReason = block.blockedByMember || block.blockedByPro
    ? t('messagesBlockedRelationship', { name: firstName })
    : getMemberAccountStatus(clientId) !== 'active'
      ? t('messagesBlockedInactive', { name: firstName })
      : t('messagesUnavailable');

  function onDraftChange(value: string) {
    setDraft(value);
    // Persisted as you type: MessagesInbox shows an unsent draft as the
    // thread preview, and Remind/Nudge elsewhere prefills through the same
    // key, so it has to survive leaving the screen.
    draftMessage(clientId, value);
  }

  function send() {
    const sent = sendMessage(clientId, draft, 'pro');
    if (!sent) return;
    clearMessageDraft(clientId);
    setDraft('');
    setMessages(getMessages(clientId));
  }

  return (
    <div className="phone-frame messages">
      <div className="messages-header">
        {/* history-aware rather than the design's hardcoded ClientDetail
            link: there the thread is only reachable from a member's profile,
            here it is also a bottom-nav destination via MessagesInbox, and
            back() returns to whichever one you actually came from. PARENT
            falls back to the inbox when there is no history at all. */}
        <button className="messages-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="messages-avatar" style={{ background: client.avatarBg }}>{client.initials}</div>
        <div className="messages-header-text">
          <div className="messages-name">{client.name}</div>
          <div className="messages-subtitle">{t('messagesSubtitle')}</div>
        </div>
      </div>

      <div className="messages-list" ref={listRef}>
        {messages.length > 0 ? (
          messages.map((m) => (
            <div key={m.id} className={`messages-row${m.senderRole === 'pro' ? ' is-mine' : ''}`}>
              <div className="messages-bubble">{m.text}</div>
            </div>
          ))
        ) : (
          <div className="messages-empty">
            <div className="messages-empty-icon"><MessageIcon size={22} color="var(--ink-soft)" /></div>
            <div className="messages-empty-title">{t('messagesNoneTitle')}</div>
            <div className="messages-empty-sub">{t('messagesNoneSub', { name: firstName })}</div>
          </div>
        )}
      </div>

      <div className="messages-composer">
        {canSend ? (
          <div className="messages-composer-row">
            <input
              type="text"
              aria-label={t('messagesInputLabel')}
              placeholder={t('messagesPlaceholder')}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            />
            <button type="button" aria-label={t('messagesSend')} onClick={send}>
              <SendGlyph />
            </button>
          </div>
        ) : (
          <div className="messages-blocked" role="alert">{cannotSendReason}</div>
        )}
      </div>
    </div>
  );
}

function SendGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}
