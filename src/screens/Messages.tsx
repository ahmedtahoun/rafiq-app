import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, MessageIcon } from '../components/icons';
import { LoadState } from '../components/LoadState';
import { BlockConfirm, BlockToggle } from '../components/ThreadBlock';
import { clearMessageDraft, draftMessage, getMemberAccountStatus, getMessageDraft } from '../lib/mockStore';
import { useRemoteSession } from '../lib/remoteSession';
import { useRoster } from '../store/rosterStore';
import { useThread } from '../store/threadLoad';
import './Messages.css';

// 1:1 port of Messages.dc.html — the coach's thread with one member.
// Parametrized on clientId, like ClientDetail and AddTask. Signed in, the
// thread is Supabase's and new messages arrive live (src/store/threadLoad.ts);
// signed out it is mockStore's demo thread.
export default function Messages() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const clientId = useAppStore((s) => s.params).clientId ?? '';
  const remote = useRemoteSession();
  const roster = useRoster();
  const thread = useThread(clientId, 'pro', remote);
  // Drafts stay on the device in both modes: MessagesInbox shows an unsent
  // draft as the preview, and Remind/Nudge elsewhere prefill through it.
  const [draft, setDraft] = useState(() => getMessageDraft(clientId));
  const [confirming, setConfirming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const count = thread.status === 'ready' ? thread.messages.length : 0;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  if (roster.status === 'loading' || thread.status === 'loading') return <LoadState status="loading" />;
  if (roster.status === 'error') return <LoadState status="error" onRetry={roster.retry} showBack />;
  if (thread.status === 'error') return <LoadState status="error" onRetry={thread.retry} showBack />;

  const client = roster.client(clientId);
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
  const { block } = thread;
  const cannotSendReason = block.blockedByPro
    ? t('messagesBlockedByYou', { name: firstName })
    : block.blockedByMember
      ? t('messagesBlockedRelationship', { name: firstName })
      : !remote && getMemberAccountStatus(clientId) !== 'active'
        ? t('messagesBlockedInactive', { name: firstName })
        : t('messagesUnavailable');

  function onDraftChange(value: string) {
    setDraft(value);
    draftMessage(clientId, value);
  }

  async function send() {
    if (thread.status !== 'ready') return;
    if (await thread.send(draft)) {
      clearMessageDraft(clientId);
      setDraft('');
    }
  }

  async function toggleBlock() {
    if (thread.status !== 'ready') return;
    if (block.blockedByPro) {
      await thread.setBlocked(false);
    } else {
      setConfirming(true);
    }
  }

  return (
    <div className="phone-frame messages">
      <div className="messages-header">
        {/* history-aware rather than the design's hardcoded ClientDetail
            link: the thread is reachable from a member's profile and from
            MessagesInbox, and back() returns to whichever one you came from. */}
        <button className="messages-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="messages-avatar" style={{ background: client.avatarBg }}>{client.initials}</div>
        <div className="messages-header-text">
          <div className="messages-name"><bdi>{client.name}</bdi></div>
          <div className="messages-subtitle">{t('messagesSubtitle')}</div>
        </div>
        <BlockToggle name={firstName} blockedByMe={block.blockedByPro} busy={thread.blockBusy} onClick={() => void toggleBlock()} />
      </div>
      {confirming && (
        <BlockConfirm
          name={firstName}
          busy={thread.blockBusy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void thread.setBlocked(true).then((done) => done && setConfirming(false))}
        />
      )}

      <div className="messages-list" ref={listRef}>
        {thread.messages.length > 0 ? (
          thread.messages.map((m) => (
            <div key={m.id} className={`messages-row${m.senderRole === 'pro' ? ' is-mine' : ''}`}>
              <div className="messages-bubble"><bdi>{m.text}</bdi></div>
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
        {thread.blockFailed && <p className="thread-error" role="alert">{t('messagesBlockFailed')}</p>}
        {thread.sendFailed && (
          <p className="thread-error" role="alert">{t(thread.sendFailed === 'refused' ? 'messagesSendRefused' : 'messagesSendFailed')}</p>
        )}
        {thread.canSend ? (
          <div className="messages-composer-row">
            <input
              type="text"
              aria-label={t('messagesInputLabel')}
              placeholder={t('messagesPlaceholder')}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
            />
            <button type="button" aria-label={t('messagesSend')} disabled={thread.sending} onClick={() => void send()}>
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
