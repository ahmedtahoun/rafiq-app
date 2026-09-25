import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import {
  MoonIcon, SunIcon, ChevronIcon, ArrowForwardIcon, CheckIcon, ScheduleIcon, PlusIcon, ProgramsIcon,
} from '../components/icons';
import {
  getClient, getSelectedOfferingId, getClientProgramProgress, getOfferingTypeInfo,
  getMilestoneReviewStatus,
} from '../lib/mockStore';
import './ProgramDetail.css';

const CLIENT_ID = 'sara';
const ACCENT_HEX = '#B75C3D';
const RING_R = 30;
const RING_CIRC = 2 * Math.PI * RING_R;

export default function ProgramDetail() {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const isAr = lang === 'ar';

  // Which program — the same selected-offering handoff MyPrograms,
  // Offerings/OfferingDetail and ClientBooking already use.
  const offeringId = getSelectedOfferingId();
  const progress = offeringId ? getClientProgramProgress(CLIENT_ID, offeringId) : null;

  const heroGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 40)} 100%)`;

  function themeControls() {
    return (
      <div className="program-detail-actions">
        <button
          type="button"
          className="program-detail-circle"
          aria-label={t('switchLanguage')}
          onClick={() => setLang(isAr ? 'en' : 'ar')}
        >
          {isAr ? 'EN' : 'ع'}
        </button>
        <button
          type="button"
          className="program-detail-theme"
          aria-label={t('toggleDarkMode')}
          onClick={() => setDark(!dark)}
        >
          {dark ? <SunIcon size={16} color="currentColor" /> : <MoonIcon size={16} color="currentColor" />}
        </button>
      </div>
    );
  }

  // No selection, or an enrollment whose offering the Pro has since
  // deleted. Either way there is nothing to show, and saying so beats a
  // screen of blanks.
  if (!progress) {
    return (
      <div className="phone-frame program-detail-screen">
        <div className="program-detail-top">
          <div className="program-detail-top-start">
            <button type="button" className="program-detail-circle" aria-label={t('programDetailBack')} onClick={back}>
              <ChevronIcon size={16} color="currentColor" />
            </button>
            <div className="program-detail-header-title">{t('programDetailTitle')}</div>
          </div>
          {themeControls()}
        </div>
        <div className="program-detail-missing">
          <ProgramsIcon size={26} color="var(--ink-soft)" />
          <div className="program-detail-missing-title">{t('programDetailNotFoundTitle')}</div>
          <div className="program-detail-missing-body">{t('programDetailNotFoundBody')}</div>
          <button type="button" className="program-detail-missing-cta" onClick={() => nav('myPrograms')}>
            {t('programDetailBack')}
          </button>
        </div>
      </div>
    );
  }

  const { offering } = progress;
  const info = getOfferingTypeInfo(offering.type);
  const hasFixedLength = progress.pct !== null;
  const ringOffset = RING_CIRC * (1 - (progress.pct ?? 0) / 100);

  const client = getClient(CLIENT_ID);
  const goalDisplay = client?.goal || t('programDetailGoalFallback');

  const nextSessionRaw = client?.nextSession || '';
  const hasNextSession = !!nextSessionRaw
    && nextSessionRaw !== 'No upcoming session'
    && nextSessionRaw !== 'Program completed';
  const nextSessionDisplay = hasNextSession ? nextSessionRaw.replace(/^Next:\s*/, '') : '';

  // History is enrollment-level on purpose: no session log in this data
  // model is attributed to a particular offering, so a per-session list
  // would be fabricated. What is genuinely known is when they enrolled and
  // whether they have reached this program's milestone.
  const history: { key: string; label: string; detail: string }[] = [
    { key: 'enrolled', label: t('programDetailHistoryEnrolled'), detail: fmt.date(progress.enrolledAtMs) },
  ];
  if (progress.isComplete) {
    history.push({
      key: 'milestone',
      label: t('programDetailHistoryMilestone'),
      detail: `${progress.sessionsCompleted}/${progress.sessionsTotal}`,
    });
    if (offeringId && getMilestoneReviewStatus(CLIENT_ID, offeringId)) {
      history.push({ key: 'reviewed', label: t('programDetailHistoryReviewed'), detail: '' });
    }
  }

  return (
    <div className="phone-frame program-detail-screen">
      <div className="program-detail-top">
        <div className="program-detail-top-start">
          <button type="button" className="program-detail-circle" aria-label={t('programDetailBack')} onClick={back}>
            <ChevronIcon size={16} color="currentColor" />
          </button>
          {/* The static screen name, not the program's. The hero card
              repeats the full name at full size immediately below, and a
              long one truncated to "8-Week Transformati…" here said
              nothing — worse in Arabic, where the ellipsis lands at the
              start and it reads as "…nsformation Program". */}
          <div className="program-detail-header-title">{t('programDetailTitle')}</div>
        </div>
        {themeControls()}
      </div>

      <div className="program-detail-scroll">
        <div className="program-detail-hero" style={{ background: heroGrad }}>
          <div className="program-detail-hero-top">
            <span className="program-detail-hero-icon">{info.icon}</span>
            <div className="program-detail-hero-body">
              <h1 className="program-detail-name"><bdi>{offering.name}</bdi></h1>
              <div className="program-detail-type">{t(info.labelKey)}</div>
            </div>
          </div>
          {offering.description && (
            <p className="program-detail-description"><bdi>{offering.description}</bdi></p>
          )}
        </div>

        {hasFixedLength ? (
          <div className="program-detail-card program-detail-progress">
            <span className="program-detail-ring">
              <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="36" cy="36" r={RING_R} fill="none" stroke="var(--line)" strokeWidth={7} />
                <circle
                  cx="36" cy="36" r={RING_R} fill="none"
                  stroke="var(--accent)" strokeWidth={7} strokeLinecap="round"
                  strokeDasharray={RING_CIRC} strokeDashoffset={ringOffset}
                />
              </svg>
              <span className="program-detail-ring-value">{progress.pct}%</span>
            </span>
            <div className="program-detail-progress-body">
              <div className="program-detail-label">{t('programDetailProgressLabel')}</div>
              <div className="program-detail-fraction" dir="ltr">
                {progress.sessionsCompleted}/{progress.sessionsTotal}
              </div>
              {progress.isComplete && (
                <div className="program-detail-complete">
                  <CheckIcon size={12} color="var(--green)" />
                  {t('programDetailCompleted')}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="program-detail-card program-detail-progress">
            <span className="program-detail-ongoing-icon">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 2.1l4 4-4 4" /><path d="M3 12.7V12a9 9 0 0 1 15-6.7l3 3" />
                <path d="M7 21.9l-4-4 4-4" /><path d="M21 11.3V12a9 9 0 0 1-15 6.7l-3-3" />
              </svg>
            </span>
            <div className="program-detail-progress-body">
              <div className="program-detail-label">{t('programDetailProgressLabel')}</div>
              <div className="program-detail-fraction">{t('programDetailOngoing')}</div>
              <div className="program-detail-ongoing-body">{t('programDetailOngoingBody')}</div>
            </div>
          </div>
        )}

        <div className="program-detail-card program-detail-goal">
          <div className="program-detail-label">{t('programDetailYourGoal')}</div>
          <div className="program-detail-goal-text"><bdi>{goalDisplay}</bdi></div>
        </div>

        {hasNextSession ? (
          <button type="button" className="program-detail-card program-detail-link" onClick={() => nav('clientSchedule')}>
            <span className="program-detail-link-icon">
              <ScheduleIcon size={19} color="var(--accent)" />
            </span>
            <span className="program-detail-link-body">
              <span className="program-detail-link-eyebrow">{t('programDetailNextSession')}</span>
              <span className="program-detail-link-title"><bdi>{nextSessionDisplay}</bdi></span>
            </span>
            <span className="program-detail-link-chevron">
              <ArrowForwardIcon size={16} color="var(--ink-soft)" />
            </span>
          </button>
        ) : (
          <button type="button" className="program-detail-card program-detail-link" onClick={() => nav('clientBooking')}>
            <span className="program-detail-link-icon">
              <PlusIcon size={19} color="var(--accent)" />
            </span>
            <span className="program-detail-link-body">
              <span className="program-detail-link-title">{t('programDetailNoSessionTitle')}</span>
              <span className="program-detail-link-sub">{t('programDetailNoSessionBody')}</span>
            </span>
            <span className="program-detail-link-chevron">
              <ArrowForwardIcon size={16} color="var(--accent)" />
            </span>
          </button>
        )}

        <div className="program-detail-section">
          <h2 className="program-detail-h2">{t('programDetailHistoryTitle')}</h2>
          <div className="program-detail-history">
            {history.map((h) => (
              <div key={h.key} className="program-detail-history-row">
                <span className="program-detail-history-dot" />
                <div className="program-detail-history-body">
                  <div className="program-detail-history-label">{h.label}</div>
                  {h.detail && <div className="program-detail-history-detail"><bdi>{h.detail}</bdi></div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
