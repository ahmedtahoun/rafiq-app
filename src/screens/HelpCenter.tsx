import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon } from '../components/icons';
import './HelpCenter.css';

const FAQ_COUNT = 6;

// 1:1 port of HelpCenter.dc.html — an accordion of pro-facing FAQs, with
// the first one open by default as the design has it.
export default function HelpCenter() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const [openId, setOpenId] = useState<number | null>(1);

  return (
    <div className="phone-frame help-center">
      <div className="help-center-header">
        <button className="help-center-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="help-center-title">{t('helpCenterTitle')}</div>
      </div>

      <p className="help-center-intro">{t('helpCenterIntro')}</p>

      <div className="help-center-list">
        {Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map((n) => {
          const open = openId === n;
          return (
            <div key={n} className="help-center-item">
              <button
                type="button"
                className="help-center-question"
                aria-expanded={open}
                aria-controls={`faq-answer-${n}`}
                onClick={() => setOpenId(open ? null : n)}
              >
                <span className="help-center-question-text">{t(`helpCenterQ${n}`)}</span>
                <span className={`help-center-chevron${open ? ' is-open' : ''}`}>
                  <DownGlyph />
                </span>
              </button>
              {open && (
                <p className="help-center-answer" id={`faq-answer-${n}`}>{t(`helpCenterA${n}`)}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DownGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
