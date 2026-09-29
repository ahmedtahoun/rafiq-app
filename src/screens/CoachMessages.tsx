import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { ChevronIcon, MessageIcon } from '../components/icons';
import { LoadState } from '../components/LoadState';
import { NoCoachYet } from '../components/NoCoachYet';
import { BlockConfirm, BlockToggle } from '../components/ThreadBlock';
import {
  DEMO_MEMBER_CLIENT_ID,
  getCoachProfile, getMessageDraft, draftMessage, clearMessageDraft, getProAccountStatus,
} from '../lib/mockStore';
import { useRemoteSession } from '../lib/remoteSession';
import { useMemberSpace } from '../store/memberStore';
import { useThread } from '../store/threadLoad';
import './CoachMessages.css';

const ACCENT_HEX = '#B75C3D';

// The member's thread with their coach. Signed in it is the relationship
// the member is viewing (memberStore's current one) on Supabase, with new
// messages arriving live (src/store/threadLoad.ts); signed out it is the
// demo member's thread in mockStore.
export default function CoachMessages() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const remote = useRemoteSession();
  const space = useMemberSpace();
  const current = space.status === 'ready' && space.remote ? space.current : null;
  const clientId = remote ? (current?.clientId ?? '') : DEMO_MEMBER_CLIENT_ID;
  const thread = useThread(clientId, 'client', remote);
  const [draft, setDraft] = useState(() => getMessageDraft(clientId));
  const [draftFor, setDraftFor] = useState(clientId);
  const [confirming, setConfirming] = useState(false);

  // The relationship can arrive after the first render; pick up its draft then.
  if (draftFor !== clientId) {
    setDraftFor(clientId);
    setDraft(getMessageDraft(clientId));
  }

  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} showBack />;
  if (remote && !current) {
    return (
      <div className="phone-frame coach-messages-screen">
        <div className="coach-messages-top">
          <button type="button" className="coach-messages-back" aria-label={t('back')} onClick={back}>
            <ChevronIcon size={16} color="currentColor" />
          </button>
        </div>
        <NoCoachYet />
      </div>
    );
  }
  if (thread.status === 'loading') return <LoadState status="loading" />;
  if (thread.status === 'error') return <LoadState status="error" onRetry={thread.retry} showBack />;

  const coachName = remote ? (current?.coach.name ?? '') : (getCoachProfile().name || 'Yasmin El-Sayed');
  const coachFirst = coachName.split(' ')[0] || coachName;
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  const { block } = thread;
  const blockedReason = block.blockedByMember
    ? t('messagesBlockedByYou', { name: coachFirst })
    : block.blockedByPro
      ? t('coachMessagesBlocked')
      : !remote && getProAccountStatus() !== 'active'
        ? t('coachMessagesInactive')
        : t('coachMessagesUnavailable');

  async function send() {
    if (thread.status !== 'ready') return;
    if (await thread.send(draft)) {
      clearMessageDraft(clientId);
      setDraft('');
    }
  }

  async function toggleBlock() {
    if (thread.status !== 'ready') return;
    if (block.blockedByMember) {
      await thread.setBlocked(false);
    } else {
      setConfirming(true);
    }
  }

  return (
    <div className="phone-frame coach-messages-screen">
      <div className="coach-messages-top">
        <button type="button" className="coach-messages-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} color="currentColor" />
        </button>
        <span className="coach-messages-avatar" style={{ background: avatarGrad }}>{coachInitials}</span>
        <div className="coach-messages-who">
          <div className="coach-messages-name"><bdi>{coachName}</bdi></div>
          <div className="coach-messages-subtitle">{t('coachMessagesSubtitle')}</div>
        </div>
        <BlockToggle name={coachFirst} blockedByMe={block.blockedByMember} busy={thread.blockBusy} onClick={() => void toggleBlock()} />
      </div>
      {confirming && (
        <BlockConfirm
          name={coachFirst}
          busy={thread.blockBusy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void thread.setBlocked(true).then((done) => done && setConfirming(false))}
        />
      )}

      <div className="coach-messages-thread">
        {thread.messages.length > 0 ? (
          thread.messages.map((m) => {
            const mine = m.senderRole === 'client';
            return (
              <div key={m.id} className={`coach-messages-row${mine ? ' coach-messages-row-mine' : ''}`}>
                <div className={`coach-messages-bubble${mine ? ' coach-messages-bubble-mine' : ''}`}>
                  <bdi>{m.text}</bdi>
                </div>
              </div>
            );
          })
        ) : (
          <div className="coach-messages-empty">
            <span className="coach-messages-empty-icon">
              <MessageIcon size={22} color="var(--ink-soft)" />
            </span>
            <div className="coach-messages-empty-title">{t('coachMessagesEmptyTitle')}</div>
            <div className="coach-messages-empty-body">{t('coachMessagesEmptyBody', { coach: coachName })}</div>
          </div>
        )}
      </div>

      <div className="coach-messages-composer">
        {thread.blockFailed && <p className="thread-error" role="alert">{t('messagesBlockFailed')}</p>}
        {thread.sendFailed && (
          <p className="thread-error" role="alert">{t(thread.sendFailed === 'refused' ? 'messagesSendRefused' : 'messagesSendFailed')}</p>
        )}
        {thread.canSend ? (
          <div className="coach-messages-input-row">
            <input
              type="text"
              className="coach-messages-input"
              value={draft}
              aria-label={t('coachMessagesPlaceholder')}
              placeholder={t('coachMessagesPlaceholder')}
              onChange={(e) => { setDraft(e.target.value); draftMessage(clientId, e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
            />
            <button
              type="button"
              className="coach-messages-send"
              aria-label={t('coachMessagesSend')}
              disabled={!draft.trim() || thread.sending}
              onClick={() => void send()}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="coach-messages-blocked">{blockedReason}</div>
        )}
      </div>
    </div>
  );
}
