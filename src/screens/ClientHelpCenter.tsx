import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, isolate } from '../lib/i18n';
import { ChevronIcon, MessageIcon } from '../components/icons';
import { getCoachProfile } from '../lib/mockStore';
import { useRemoteSession } from '../lib/remoteSession';
import { useMemberSpace } from '../store/memberStore';
import './ClientHelpCenter.css';

// Six FAQs, keyed so the copy lives in i18n like everything else.
const FAQ_IDS = [1, 2, 3, 4, 5, 6] as const;

export default function ClientHelpCenter() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const remote = useRemoteSession();
  const space = useMemberSpace();

  // The design opens the first question by default, so the screen never
  // reads as a wall of unanswered headings.
  const [openId, setOpenId] = useState<number | null>(1);

  // Signed in, the pro's name is the member's own relationship, the same
  // read CoachMessages makes. It used to be `getCoachProfile()` with no
  // remote branch, so a real member was offered "Message Yasmin El-Sayed"
  // — mockStore's demo coach, whoever their pro actually was.
  //
  // Deliberately never blocking and never guessing. Someone opening Help
  // Centre may be here *because* something is broken, so a name that has
  // not arrived yet, or failed to, hides the contact row and leaves every
  // answer readable — rather than a LoadState over the whole screen, or a
  // placeholder name that claims a pro they do not have.
  const coachName = remote
    ? (space.status === 'ready' && space.remote ? (space.current?.coach.name ?? '') : '')
    : (getCoachProfile().name || 'Yasmin El-Sayed');

  return (
    <div className="phone-frame client-help-screen">
      <div className="client-help-top">
        <button type="button" className="client-help-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} color="currentColor" />
        </button>
        <h1 className="client-help-title">{t('clientHelpTitle')}</h1>
      </div>

      <p className="client-help-subtitle">{t('clientHelpSubtitle')}</p>

      <div className="client-help-list">
        {FAQ_IDS.map((id) => {
          const open = openId === id;
          const panelId = `client-help-panel-${id}`;
          return (
            <div key={id} className="client-help-item">
              <button
                type="button"
                className="client-help-question"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : id)}
              >
                <span className="client-help-question-text">{t(`clientHelpQ${id}`)}</span>
                <span className={`client-help-chevron${open ? ' client-help-chevron-open' : ''}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              {open && (
                <div className="client-help-answer" id={panelId}>{t(`clientHelpA${id}`)}</div>
              )}
            </div>
          );
        })}

        {coachName && (
          <button type="button" className="client-help-contact" onClick={() => nav('coachMessages')}>
            <MessageIcon size={16} color="#FFFFFF" />
            {/* A name inside a translated sentence: isolated, or bidi
                reordering moves it in Arabic (CLAUDE.md). */}
            {t('clientHelpContact', { coach: isolate(coachName) })}
          </button>
        )}
      </div>
    </div>
  );
}
