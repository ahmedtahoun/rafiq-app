import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { ChevronIcon, MessageIcon } from '../components/icons';
import {
  getCoachProfile, getMessages, getMessageDraft, draftMessage, clearMessageDraft,
  sendMessage, markMessagesRead, canInteract, getBlockStatus, getProAccountStatus,
} from '../lib/mockStore';
import './CoachMessages.css';

const CLIENT_ID = 'sara';
const ACCENT_HEX = '#B75C3D';

export default function CoachMessages() {
  const t = useT();
  const back = useAppStore((s) => s.back);

  const [draft, setDraft] = useState(() => getMessageDraft(CLIENT_ID));
  // mockStore is plain functions over localStorage, not reactive state —
  // a counter bump is what makes the thread re-read after a send.
  const [, setTick] = useState(0);

  const profile = getCoachProfile();
  const coachName = profile.name || 'Yasmin El-Sayed';
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  const messages = getMessages(CLIENT_ID);

  // Opening the thread marks it read for the member's side. In an effect,
  // not during render: the prototype called this inline in renderVals(),
  // which writes to storage on every re-render.
  useEffect(() => {
    markMessagesRead(CLIENT_ID, 'client');
  }, [messages.length]);

  // Same guard sendMessage itself enforces, checked here so the composer
  // explains itself rather than silently swallowing a message.
  const allowed = canInteract(CLIENT_ID);
  const blockStatus = getBlockStatus(CLIENT_ID);
  const blockedReason = blockStatus.blockedByMember || blockStatus.blockedByPro
    ? t('coachMessagesBlocked')
    : getProAccountStatus() !== 'active'
      ? t('coachMessagesInactive')
      : t('coachMessagesUnavailable');

  function send() {
    const text = draft.trim();
    if (!text || !allowed) return;
    sendMessage(CLIENT_ID, text, 'client');
    clearMessageDraft(CLIENT_ID);
    setDraft('');
    setTick((v) => v + 1);
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
      </div>

      <div className="coach-messages-thread">
        {messages.length > 0 ? (
          messages.map((m) => {
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
        {allowed ? (
          <div className="coach-messages-input-row">
            <input
              type="text"
              className="coach-messages-input"
              value={draft}
              aria-label={t('coachMessagesPlaceholder')}
              placeholder={t('coachMessagesPlaceholder')}
              onChange={(e) => { setDraft(e.target.value); draftMessage(CLIENT_ID, e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            />
            <button
              type="button"
              className="coach-messages-send"
              aria-label={t('coachMessagesSend')}
              disabled={!draft.trim()}
              onClick={send}
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
