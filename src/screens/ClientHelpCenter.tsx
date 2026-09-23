import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, MessageIcon } from '../components/icons';
import { getCoachProfile } from '../lib/mockStore';
import './ClientHelpCenter.css';

// Six FAQs, keyed so the copy lives in i18n like everything else.
const FAQ_IDS = [1, 2, 3, 4, 5, 6] as const;

export default function ClientHelpCenter() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const isAr = lang === 'ar';

  // The design opens the first question by default, so the screen never
  // reads as a wall of unanswered headings.
  const [openId, setOpenId] = useState<number | null>(1);

  const coachName = getCoachProfile().name || 'Yasmin El-Sayed';

  return (
    <div className="phone-frame client-help-screen">
      <div className="client-help-top">
        <button type="button" className="client-help-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} color="currentColor" />
        </button>
        <h1 className="client-help-title">{t('clientHelpTitle')}</h1>
        <button
          type="button"
          className="client-help-lang"
          aria-label={t('switchLanguage')}
          onClick={() => setLang(isAr ? 'en' : 'ar')}
        >
          {isAr ? 'EN' : 'ع'}
        </button>
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

        <button type="button" className="client-help-contact" onClick={() => nav('coachMessages')}>
          <MessageIcon size={16} color="#FFFFFF" />
          {t('clientHelpContact', { coach: coachName })}
        </button>
      </div>
    </div>
  );
}
