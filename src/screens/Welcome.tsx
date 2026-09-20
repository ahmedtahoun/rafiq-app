import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { ChevronIcon, ArrowForwardIcon } from '../components/icons';
import './Welcome.css';

interface Slide {
  accent: string;
  eyebrowKey: string;
  preKey: string;
  boldKey: string;
  subKey: string;
  illustration: (accent: string) => React.ReactNode;
}

// Simplified stand-ins for the design prototype's hand-drawn hero
// illustrations (dashboard card / chat bubble / progress ring) — visual
// polish to match those pixel-for-pixel is a follow-up pass, not blocking
// real navigation, theming and copy landing first.
const SLIDES: Slide[] = [
  {
    accent: '#B75C3D',
    eyebrowKey: 'welcome1Eyebrow',
    preKey: 'welcome1HeadlinePre',
    boldKey: 'welcome1HeadlineBold',
    subKey: 'welcome1Subtext',
    illustration: () => (
      <svg width="200" height="200" viewBox="0 0 220 220" fill="none">
        <rect x="30" y="24" width="160" height="172" rx="24" fill="rgba(255,255,255,.16)" />
        <rect x="48" y="46" width="124" height="19" rx="6.5" fill="rgba(255,255,255,.92)" />
        <circle cx="59" cy="55.5" r="4.5" fill="#B75C3D" />
        <g stroke="rgba(255,255,255,.55)" strokeWidth={1.6}>
          <line x1="48" y1="83" x2="172" y2="83" />
          <line x1="48" y1="100" x2="172" y2="100" />
          <line x1="48" y1="117" x2="172" y2="117" />
        </g>
        <circle cx="69" cy="155" r="21" fill="#F4C98B" />
        <circle cx="105" cy="155" r="21" fill="#EFA98F" />
        <circle cx="141" cy="155" r="21" fill="#9BC1E0" />
        <circle cx="154" cy="132" r="18" fill="#FFFFFF" />
        <path d="M145.5 132l6 6 11-11" stroke="#3F7D58" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    accent: '#3F7D58',
    eyebrowKey: 'welcome2Eyebrow',
    preKey: 'welcome2HeadlinePre',
    boldKey: 'welcome2HeadlineBold',
    subKey: 'welcome2Subtext',
    illustration: () => (
      <svg width="200" height="200" viewBox="0 0 220 220" fill="none">
        <rect x="44" y="30" width="132" height="112" rx="22" fill="rgba(255,255,255,.92)" />
        <path d="M60 142l0 22 26-22z" fill="rgba(255,255,255,.92)" />
        <rect x="60" y="49" width="72" height="15" rx="7.5" fill="#E1F0E5" />
        <rect x="60" y="72" width="96" height="15" rx="7.5" fill="#25D366" opacity=".2" />
        <rect x="60" y="95" width="60" height="15" rx="7.5" fill="#E1F0E5" />
        <rect x="60" y="118" width="84" height="15" rx="7.5" fill="#25D366" opacity=".2" />
        <circle cx="160" cy="68" r="32" fill="#25D366" />
        <path d="M148 58c8-3 18 1 22 10s-1 18-9 21c-3 1-5 1-8 0l-9 3 2-8c-6-6-6-17 2-26z" fill="#FFFFFF" />
      </svg>
    ),
  },
  {
    accent: '#3E6FB0',
    eyebrowKey: 'welcome3Eyebrow',
    preKey: 'welcome3HeadlinePre',
    boldKey: 'welcome3HeadlineBold',
    subKey: 'welcome3Subtext',
    illustration: () => (
      <svg width="200" height="200" viewBox="0 0 220 220" fill="none">
        <circle cx="90" cy="102" r="60" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={15} />
        <circle
          cx="90"
          cy="102"
          r="60"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={15}
          strokeLinecap="round"
          strokeDasharray="283"
          strokeDashoffset="70"
          transform="rotate(-90 90 102)"
        />
        <text x="90" y="109" textAnchor="middle" fontFamily="Georgia, serif" fontSize="27" fontWeight={700} fill="#FFFFFF">75%</text>
        <rect x="152" y="46" width="60" height="17" rx="6.5" fill="rgba(255,255,255,.88)" />
        <path d="M158 54.5l4 4 6-7" stroke="#3E6FB0" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <rect x="152" y="71" width="60" height="17" rx="6.5" fill="rgba(255,255,255,.88)" />
        <path d="M158 79.5l4 4 6-7" stroke="#3E6FB0" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function Welcome() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const onDone = () => nav('roleSelect');
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="phone-frame">
      <div
        className="welcome-hero"
        style={{ background: `linear-gradient(135deg, ${slide.accent} 0%, ${darken(slide.accent, 40)} 100%)` }}
      >
        <div className="welcome-blob welcome-blob-a" />
        <div className="welcome-blob welcome-blob-b" />

        {step > 0 && (
          <button className="welcome-back" aria-label="Back" onClick={() => setStep((s) => s - 1)}>
            <ChevronIcon size={15} color="#FFFFFF" />
          </button>
        )}
        {!isLast && (
          <button className="welcome-skip" onClick={onDone}>{t('skip')}</button>
        )}

        <div className="welcome-illustration">{slide.illustration(slide.accent)}</div>
      </div>

      <div className="welcome-body">
        <div className="welcome-progress">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className="welcome-progress-seg"
              style={{ background: i <= step ? slide.accent : 'var(--line)' }}
            />
          ))}
        </div>

        <div className="welcome-eyebrow" style={{ color: slide.accent }}>{t(slide.eyebrowKey)}</div>
        <h1 className="welcome-headline">
          {t(slide.preKey)}
          <b>{t(slide.boldKey)}</b>
        </h1>
        <p className="welcome-subtext">{t(slide.subKey)}</p>
        <div className="welcome-spacer" />

        <button
          className="welcome-cta"
          style={{ background: slide.accent, boxShadow: `0 14px 26px -8px ${slide.accent}55` }}
          onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
        >
          {isLast ? t('getStarted') : t('next')}
          <span className="welcome-cta-arrow">
            <ArrowForwardIcon size={16} color="#FFFFFF" />
          </span>
        </button>
      </div>
    </div>
  );
}
