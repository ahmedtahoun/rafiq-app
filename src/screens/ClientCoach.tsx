import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey, isolate, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import {
  MessageIcon, ScheduleIcon, TasksIcon, CheckIcon, StarIcon, WarningIcon,
  SunIcon, MoonIcon, ChevronIcon,
  SearchIcon, HomeIcon, ProgramsIcon, PersonIcon,
} from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import { LoadState } from '../components/LoadState';
import { NoCoachYet } from '../components/NoCoachYet';
import { useMemberSpace, type MemberRelationshipView, type MemberSpaceView } from '../store/memberStore';
import { fileProReport } from '../lib/adminQueues';
import {
  DEMO_MEMBER_CLIENT_ID, isSessionToday,
  canInteract, reportPro, getStandingSlot,
  PACKAGE_DEFAULT_TOTAL, type ProReportReason,
} from '../lib/mockStore';
import './ClientCoach.css';

// The standing slot, the Full Access upgrade and its card payment are still
// the demo's (they move with scheduling and payments), so they act on the
// demo member and only show signed out.
const CLIENT_ID = DEMO_MEMBER_CLIENT_ID;
const DAY_MS = 86400000;
const ACCENT_HEX = '#B75C3D';

/** "5:00 PM" / "5:45 PM" from a fractional hour. */
function hourLabel(h: number, am: string, pm: string): string {
  const period = h >= 12 ? pm : am;
  const hh = Math.floor(h) % 12 || 12;
  const mins = Math.round((h % 1) * 60);
  return `${hh}:${String(mins).padStart(2, '0')} ${period}`;
}

type TrustStep = 'reason' | 'reported';

const REPORT_REASONS: { key: ProReportReason; labelKey: MessageKey }[] = [
  { key: 'no_show', labelKey: 'clientCoachReasonNoShow' },
  { key: 'inappropriate', labelKey: 'clientCoachReasonInappropriate' },
  { key: 'payment', labelKey: 'clientCoachReasonPayment' },
  { key: 'other', labelKey: 'clientCoachReasonOther' },
];

export default function ClientCoach() {
  const space = useMemberSpace();
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} />;
  if (!space.current) return <ClientCoachEmpty />;
  return <ClientCoachView space={space} rel={space.current} />;
}

/** A signed-in member no coach has accepted yet. */
function ClientCoachEmpty() {
  const t = useT();
  const navItems = memberNavItems(t);
  return (
    <div className="phone-frame client-coach-screen">
      <div className="client-coach-scroll client-coach-empty">
        <NoCoachYet />
      </div>
      <BottomNav items={navItems} />
    </div>
  );
}

function memberNavItems(t: ReturnType<typeof useT>): BottomNavItem[] {
  return [
    { key: 'discover', label: t('discoverNav'), icon: SearchIcon, screen: 'discover' },
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'clientHome' },
    { key: 'programs', label: t('myProgramsNav'), icon: ProgramsIcon, screen: 'myPrograms' },
    { key: 'tasks', label: t('clientTasksNav'), icon: TasksIcon, screen: 'clientTasks' },
    { key: 'schedule', label: t('clientScheduleNav'), icon: ScheduleIcon, screen: 'clientSchedule' },
    { key: 'coach', label: t('clientCoachNav'), icon: PersonIcon, screen: 'clientCoach' },
  ];
}

function ClientCoachView({ space, rel }: { space: Extract<MemberSpaceView, { status: 'ready' }>; rel: MemberRelationshipView }) {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const [trustOpen, setTrustOpen] = useState(false);
  const [trustStep, setTrustStep] = useState<TrustStep>('reason');
  const { remote, todayMs } = space;
  const [reportBusy, setReportBusy] = useState(false);
  const [reportFailed, setReportFailed] = useState(false);

  const profile = rel.coach;
  const client = rel.client;
  const coachName = profile.name;
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const nextSessionAtMs = client.nextSessionAtMs;
  const hasNextSession = nextSessionAtMs != null;
  const nextSessionText = hasNextSession
    ? fmt.nextSession(nextSessionAtMs, todayMs)
    : t('clientCoachNoSession');
  const sessionToday = hasNextSession && isSessionToday(nextSessionAtMs, todayMs);

  const pendingTasks = rel.tasks.filter((task) => !task.done).length;
  const tasksText = pendingTasks > 0
    ? t('clientCoachTasksPending', { n: pendingTasks })
    : t('clientCoachTasksDone');

  // Sessions that have happened (memberStore; the demo keeps the design's
  // baseline of two).
  const sessionsTogether = rel.sessionsTogether;
  // How long they have been working together, from when the member
  // actually completed signup. The design hardcodes 6 here; a made-up
  // relationship length is the same kind of claim as ShareProfile's
  // invented rating, so this shows a dash until there is a real date to
  // count from — which is also how the Reviews stat beside it behaves.
  const joinedAtMs = client.signupCompletedAtMs;
  const monthsTogether = joinedAtMs === null ? null : Math.max(1, Math.round((todayMs - joinedAtMs) / (30 * DAY_MS)));

  const rating = profile.rating;
  const pkg = rel.pkg;
  const verified = profile.verified;
  // Blocking and suspension are the demo's until messaging moves (step 5).
  const interactive = remote ? true : canInteract(CLIENT_ID);
  const standing = remote ? null : getStandingSlot(CLIENT_ID);

  const plan = client.plan || 'Basic';
  const showUpgrade = !remote && plan !== 'Full Access';
  const fullAccessTotal = PACKAGE_DEFAULT_TOTAL['Full Access'] ?? 12;

  const paymentStatus = client.paymentStatus;
  const paymentLabel = paymentStatus === 'paid'
    ? t('clientCoachPaymentPaid')
    : paymentStatus === 'overdue' ? t('clientCoachPaymentOverdue') : t('clientCoachPaymentDue');
  const paymentDetail = paymentStatus === 'paid' || !pkg
    ? t('clientCoachPlanLine', { plan })
    : t('clientCoachPlanRenews', { plan, date: fmt.date(pkg.expiresAtMs) });

  const AM = isAr ? 'صباحًا' : 'AM';
  const PM = isAr ? 'مساءً' : 'PM';
  const dayNamesFull = [0, 1, 2, 3, 4, 5, 6].map((i) => t(dayKey('dowFull', i)));

  // Signed in, a real report on this relationship (step 1's queue): the
  // member's roster row and its coach, which 0005's policy checks match.
  function submitReport(reason: ProReportReason) {
    if (!remote) {
      reportPro(CLIENT_ID, reason);
      setTrustStep('reported');
      return;
    }
    if (reportBusy || !profile.id) return;
    setReportBusy(true);
    setReportFailed(false);
    void fileProReport({ clientId: rel.clientId, coachId: profile.id, reason }).then((result) => {
      setReportBusy(false);
      if (result.ok) setTrustStep('reported');
      else setReportFailed(true);
    });
  }

  const navItems = memberNavItems(t);

  const heroBackground = profile.coverPhotoUrl
    ? `linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.68) 100%), url('${profile.coverPhotoUrl}') center/cover no-repeat`
    : `linear-gradient(135deg, ${ACCENT_HEX} 0%, ${darken(ACCENT_HEX, 40)} 100%)`;

  return (
    <div className="phone-frame client-coach-screen">
      <div className="client-coach-hero" style={{ background: heroBackground }}>
        <div className="client-coach-hero-top">
          <button
            type="button"
            className="client-coach-hero-btn"
            aria-label={t('clientCoachMyPros')}
            onClick={() => nav('myCoaches')}
          >
            <ChevronIcon size={16} color="#FFFFFF" />
          </button>
          <div className="client-coach-hero-actions">
            <button
              type="button"
              className="client-coach-hero-btn"
              aria-label={t('switchLanguage')}
              onClick={() => setLang(isAr ? 'en' : 'ar')}
            >
              {isAr ? 'EN' : 'ع'}
            </button>
            <button
              type="button"
              className="client-coach-hero-btn"
              aria-label={t('toggleDarkMode')}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
          </div>
        </div>

        <div className="client-coach-identity">
          {profile.avatarPhotoUrl ? (
            <img className="client-coach-avatar-photo" src={profile.avatarPhotoUrl} alt="" />
          ) : (
            <div className="client-coach-avatar">{coachInitials}</div>
          )}

          <div className="client-coach-name-row">
            <h1 className="client-coach-name">{coachName}</h1>
            {verified && (
              <span className="client-coach-verified" aria-label={t('clientCoachVerified')}>
                <CheckIcon size={11} color={ACCENT_HEX} />
              </span>
            )}
          </div>
          <div className="client-coach-title">{profile.title || t('specLife')}</div>
          {profile.cert && <div className="client-coach-cert">{profile.cert}</div>}

          <div className="client-coach-rating">
            {rating.hasEnoughReviews ? (
              <>
                <StarIcon size={12} color="#FFD166" />
                <span>{rating.average.toFixed(1)}</span>
                <span className="client-coach-rating-count">({rating.count})</span>
              </>
            ) : (
              <span className="client-coach-rating-none">{t('clientCoachNotEnoughReviews')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="client-coach-scroll">
        <div className="client-coach-actions">
          <button
            type="button"
            className="client-coach-primary"
            disabled={!interactive}
            onClick={() => nav('coachMessages')}
          >
            <MessageIcon size={15} color="currentColor" />
            {t('clientCoachMessage')}
          </button>
          <button
            type="button"
            className="client-coach-secondary"
            disabled={!interactive}
            onClick={() => nav('clientBooking')}
          >
            <ScheduleIcon size={15} color="currentColor" />
            {t('clientCoachBookSession')}
          </button>
        </div>

        <div className="client-coach-quick">
          <button
            type="button"
            className="client-coach-quick-card"
            onClick={() => nav('clientSchedule')}
          >
            <div className="client-coach-quick-label">{t('clientCoachSessionsQuick')}</div>
            <div className="client-coach-quick-value">
              {sessionToday ? t('clientCoachLiveToday') : nextSessionText}
            </div>
            {!sessionToday && hasNextSession && (
              <div className="client-coach-quick-hint">{t('clientCoachNextLabel')}</div>
            )}
          </button>
          <button
            type="button"
            className="client-coach-quick-card"
            onClick={() => nav('clientTasks')}
          >
            <div className="client-coach-quick-label">{t('clientCoachTasksQuick')}</div>
            <div className="client-coach-quick-value">{tasksText}</div>
          </button>
        </div>

        <div className={`client-coach-payment client-coach-payment-${paymentStatus}`}>
          <div className="client-coach-payment-label">{paymentLabel}</div>
          <div className="client-coach-payment-detail">{paymentDetail}</div>
        </div>

        {standing && (
          <div className="client-coach-standing">
            {t('clientCoachStandingHeld', {
              day: dayNamesFull[standing.dayIndex],
              time: `${hourLabel(standing.startH, AM, PM)} – ${hourLabel(standing.endH, AM, PM)}`,
            })}
          </div>
        )}

{/* Not a button. Buying Full Access needs a payment Rafiq cannot take
            yet (LAUNCH-CHECKLIST.md §3), and the flow this replaced granted the
            plan for free behind a "Pay with card" button that charged nothing.
            The card still says what Full Access is, so the member knows it is
            coming, and the Message button above is how they arrange it today. */}
        {showUpgrade && (
          <div className="client-coach-upgrade">
            <div>
              <div className="client-coach-upgrade-title">{t('clientCoachUpgradeTitle')}</div>
              <div className="client-coach-upgrade-sub">
                {t('clientCoachUpgradeSubtitle', { n: fullAccessTotal })}
              </div>
              <div className="client-coach-upgrade-note">
                {t('clientCoachUpgradeSoonNote', { coach: isolate(coachName) })}
              </div>
            </div>
            <span className="client-coach-soon-badge">{t('comingSoonBadge')}</span>
          </div>
        )}

        <section className="client-coach-section">
          <h2 className="client-coach-h2">{t('clientCoachAbout')}</h2>
          <p className="client-coach-bio">{profile.bio ? <bdi>{profile.bio}</bdi> : t('clientCoachBioFallback')}</p>
        </section>

        <div className="client-coach-stats">
          <Stat
            value={rating.hasEnoughReviews ? String(rating.count) : '—'}
            label={t('clientCoachStatReviews')}
          />
          <Stat value={String(sessionsTogether)} label={t('clientCoachStatSessions')} />
          <Stat value={monthsTogether === null ? '—' : String(monthsTogether)} label={t('clientCoachStatMonths')} />
        </div>

        <button
          type="button"
          className="client-coach-report"
          onClick={() => { setTrustStep('reason'); setTrustOpen(true); }}
        >
          <WarningIcon size={14} color="currentColor" />
          {t('clientCoachReportAction')}
        </button>
      </div>

      <BottomNav items={navItems} />

      <BottomSheet
        open={trustOpen}
        onClose={() => setTrustOpen(false)}
        title={trustStep === 'reason' ? t('clientCoachReportTitle') : t('clientCoachReportedTitle')}
      >
        {trustStep === 'reason' ? (
          <div className="client-coach-reasons">
            {reportFailed && (
              <div className="client-coach-report-error" role="alert">
                {t('requestFailedRetry')}
              </div>
            )}
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason.key}
                type="button"
                className="client-coach-reason"
                disabled={reportBusy}
                onClick={() => submitReport(reason.key)}
              >
                {t(reason.labelKey)}
              </button>
            ))}
          </div>
        ) : (
          <div className="client-coach-reported">
            <span className="client-coach-reported-tick">
              <CheckIcon size={22} color="#FFFFFF" />
            </span>
            <p className="client-coach-reported-body">{t('clientCoachReportedBody')}</p>
            <button type="button" className="client-coach-sheet-done" onClick={() => setTrustOpen(false)}>
              {t('clientBookingDone')}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="client-coach-stat">
      <div className="client-coach-stat-value">{value}</div>
      <div className="client-coach-stat-label">{label}</div>
    </div>
  );
}
