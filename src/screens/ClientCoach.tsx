import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey, isolate, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import { specialtyLabels } from '../lib/coachLabels';
import { MessageIcon, ScheduleIcon, CheckIcon, StarIcon, WarningIcon } from '../components/icons';
import { MemberTabBar } from '../components/TabBars';
import { BottomSheet } from '../components/BottomSheet';
import { LoadState } from '../components/LoadState';
import { NoCoachYet } from '../components/NoCoachYet';
import { bookSessionTarget, useMemberSpace, type MemberRelationshipView, type MemberSpaceView } from '../store/memberStore';
import { fileProReport } from '../lib/adminQueues';
import { fetchMemberSchedule, type MemberSchedule } from '../lib/memberScheduleData';
import { canOfferJoin } from '../lib/videoData';
import { wallNowMs } from '../lib/wallClock';
import { useRemoteLoad } from '../store/remoteLoad';
import { useUnread } from '../store/unread';
import {
  DEMO_MEMBER_CLIENT_ID,
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

/** A coach's title in the app's language (coachLabels.ts); empty reads as
    Life coaching, as it always has here. */
function specialtyTitle(title: string, t: ReturnType<typeof useT>): string {
  const labels = specialtyLabels(title, t);
  return labels.length > 0 ? labels.join(' · ') : t('specLife');
}

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
  return (
    <div className="phone-frame client-coach-screen">
      <div className="client-coach-scroll client-coach-empty">
        <NoCoachYet />
      </div>
      <MemberTabBar />
    </div>
  );
}

function ClientCoachView({ space, rel }: { space: Extract<MemberSpaceView, { status: 'ready' }>; rel: MemberRelationshipView }) {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
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

  // Signed in, the booked session itself (the read Sessions makes), for its
  // video call. While it loads, or if it can't be read, the Sessions card
  // still has the date from the member's own row; there is just no Join.
  const schedule = useRemoteLoad<MemberSchedule>(
    `memberSchedule:${rel.clientId}`,
    remote && !!rel.coach.id,
    () => fetchMemberSchedule(rel.clientId, rel.coach.id ?? ''),
  );
  // The join window opens and closes while the screen is open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(h);
  }, []);
  // The one whose call is open now: about to start, or under way.
  const nowWall = wallNowMs();
  const joinable = remote && schedule.status === 'ready'
    ? [schedule.data.started, schedule.data.upcoming].find((x) => x && canOfferJoin(x.startWallMs, x.endWallMs, nowWall)) ?? null
    : null;

  // The same count as the tab bar's badge (store/unread.ts); signed in only.
  const unread = useUnread((s) => s.count);

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
  const verified = profile.verified;
  // Blocking and suspension are the demo's until messaging moves (step 5).
  const interactive = remote ? true : canInteract(CLIENT_ID);
  const standing = remote ? null : getStandingSlot(CLIENT_ID);

  const plan = client.plan || 'Basic';
  const showUpgrade = !remote && plan !== 'Full Access';
  const fullAccessTotal = PACKAGE_DEFAULT_TOTAL['Full Access'] ?? 12;

  // No payment status here: a member can't pay in the app yet, so "Payment
  // due" would be a reminder with nothing to do about it. The coach still
  // sees it on their side (ClientDetail, Home).

  // Only the numbers that are real: no row of dashes for a new member.
  const stats = [
    ...(rating.hasEnoughReviews ? [{ key: 'reviews', value: String(rating.count), label: t('clientCoachStatReviews') }] : []),
    ...(sessionsTogether > 0 ? [{ key: 'sessions', value: String(sessionsTogether), label: t('clientCoachStatSessions') }] : []),
    ...(monthsTogether !== null ? [{ key: 'months', value: String(monthsTogether), label: t('clientCoachStatMonths') }] : []),
  ];

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


  const heroBackground = profile.coverPhotoUrl
    ? `linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.68) 100%), url('${profile.coverPhotoUrl}') center/cover no-repeat`
    : `linear-gradient(135deg, ${ACCENT_HEX} 0%, ${darken(ACCENT_HEX, 40)} 100%)`;

  return (
    <div className="phone-frame client-coach-screen">
      {/* A tab root: no back arrow. My pros is on Profile. */}
      <div className="client-coach-hero" style={{ background: heroBackground }}>

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
          <div className="client-coach-title">{specialtyTitle(profile.title, t)}</div>
          {profile.cert && <div className="client-coach-cert">{profile.cert}</div>}

          {rating.hasEnoughReviews && (
            <div className="client-coach-rating">
              <StarIcon size={12} color="#FFD166" />
              <span>{rating.average.toFixed(1)}</span>
              <span className="client-coach-rating-count">({rating.count})</span>
            </div>
          )}
        </div>
      </div>

      <div className="client-coach-scroll">
        {joinable && (
          <button
            type="button"
            className="client-coach-join"
            onClick={() => nav({ screen: 'sessionRoom', params: { sessionId: joinable.sessionId, name: coachName } })}
          >
            {t('clientCoachJoinSession')}
          </button>
        )}

        <div className="client-coach-actions">
          <button
            type="button"
            className="client-coach-primary"
            disabled={!interactive}
            aria-label={unread > 0 ? t('tabUnreadLabel', { label: t('clientCoachMessage'), count: unread }) : undefined}
            onClick={() => nav('coachMessages')}
          >
            <MessageIcon size={15} color="currentColor" />
            {t('clientCoachMessage')}
            {unread > 0 && (
              <span className="bottom-nav-badge client-coach-message-badge" aria-hidden="true">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          <button
            type="button"
            className="client-coach-secondary"
            disabled={!interactive}
            onClick={() => nav(bookSessionTarget(remote, rel))}
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
            <div className="client-coach-quick-value">{nextSessionText}</div>
            {hasNextSession && <div className="client-coach-quick-hint">{t('clientCoachNextLabel')}</div>}
          </button>
          <button
            type="button"
            className="client-coach-quick-card"
            onClick={() => nav('clientTasks')}
          >
            <div className="client-coach-quick-label">{t('clientCoachTasksQuick')}</div>
            <div className="client-coach-quick-value">{tasksText}</div>
          </button>
          {/* Programs left the tab bar (five tabs a side). They are still the
              demo member's (CLIENT_ID), so signed in there is nothing real to
              link to yet. */}
          {!remote && (
            <button
              type="button"
              className="client-coach-quick-card client-coach-quick-wide"
              onClick={() => nav('myPrograms')}
            >
              <div className="client-coach-quick-label">{t('myProgramsNav')}</div>
              <div className="client-coach-quick-value">{t('myProgramsSubtitle')}</div>
            </button>
          )}
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

        {stats.length > 0 && (
          <div className="client-coach-stats">
            {stats.map((s) => <Stat key={s.key} value={s.value} label={s.label} />)}
          </div>
        )}

        <button
          type="button"
          className="client-coach-report"
          onClick={() => { setTrustStep('reason'); setTrustOpen(true); }}
        >
          <WarningIcon size={14} color="currentColor" />
          {t('clientCoachReportAction')}
        </button>
      </div>

      <MemberTabBar />

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
