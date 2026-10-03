import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import {
  ChevronIcon, ArrowForwardIcon, CheckIcon, ScheduleIcon, PlusIcon, ProgramsIcon,
} from '../components/icons';
import { LoadState } from '../components/LoadState';
import { useRemoteSession } from '../lib/remoteSession';
import { fetchMemberPrograms, fetchOwnGoal, type MemberProgram } from '../lib/programData';
import { bookSessionTarget, useMemberSpace, type MemberRelationshipView } from '../store/memberStore';
import { useRemoteLoad } from '../store/remoteLoad';
import {
  DEMO_MEMBER_CLIENT_ID, TODAY_MS,
  getClient, getSelectedOfferingId, getClientProgramProgress, getOfferingTypeInfo,
  getMilestoneReviewStatus,
  type ProgramProgress,
} from '../lib/mockStore';
import './ProgramDetail.css';

// Signed out, the demo member's. Signed in, the member's own enrollment
// with the coach they're viewing (SUPABASE-MIGRATION-PLAN.md step 6),
// opened from My Programs with params.offeringId.
const CLIENT_ID = DEMO_MEMBER_CLIENT_ID;
const ACCENT_HEX = '#B75C3D';
const RING_R = 30;
const RING_CIRC = 2 * Math.PI * RING_R;

export default function ProgramDetail() {
  const remote = useRemoteSession();
  const space = useMemberSpace();
  if (!remote) return <DemoProgramDetail />;
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} showBack />;
  if (!space.remote) return <DemoProgramDetail />;
  return <LiveProgramDetail key={space.current?.clientId ?? 'none'} rel={space.current} todayMs={space.todayMs} />;
}

function DemoProgramDetail() {
  const t = useT();
  const fmt = useFormat();
  const nav = useAppStore((s) => s.nav);

  // Which program — the same selected-offering handoff MyPrograms,
  // Offerings/OfferingDetail and ClientBooking already use.
  const offeringId = getSelectedOfferingId();
  const progress = offeringId ? getClientProgramProgress(CLIENT_ID, offeringId) : null;
  if (!progress) return <ProgramMissing />;

  const client = getClient(CLIENT_ID);
  return (
    <ProgramView
      progress={progress}
      goal={client?.goal || t('programDetailGoalFallback')}
      enrolledDisplay={fmt.date(progress.enrolledAtMs)}
      milestoneReviewed={!!offeringId && getMilestoneReviewStatus(CLIENT_ID, offeringId)}
      nextSessionAtMs={client?.nextSessionAtMs ?? null}
      todayMs={TODAY_MS}
      onBook={() => nav('clientBooking')}
    />
  );
}

function LiveProgramDetail({ rel, todayMs }: { rel: MemberRelationshipView | null; todayMs: number }) {
  const fmt = useFormat();
  const nav = useAppStore((s) => s.nav);
  const offeringId = useAppStore((s) => s.params).offeringId ?? '';
  const enabled = !!rel && !!offeringId;
  const load = useRemoteLoad<{ program: MemberProgram | null; ownGoal: string | null }>(
    `member-program:${rel?.clientId ?? ''}:${offeringId}`,
    enabled,
    async () => {
      const [programs, goal] = await Promise.all([fetchMemberPrograms(rel!.clientId), fetchOwnGoal()]);
      return programs.ok && goal.ok
        ? { ok: true as const, data: { program: programs.data.find((p) => p.offeringId === offeringId) ?? null, ownGoal: goal.data } }
        : { ok: false as const };
    },
  );

  if (!enabled) return <ProgramMissing />;
  if (load.status === 'loading') return <LoadState status="loading" />;
  if (load.status === 'error') return <LoadState status="error" onRetry={load.retry} showBack />;
  const { program, ownGoal } = load.data;
  if (!program) return <ProgramMissing />;

  return (
    <ProgramView
      progress={program}
      // The goal the coach set for this relationship, else the member's own
      // from onboarding. Never an invented one: with neither, no goal card.
      goal={rel!.client.goal.trim() || ownGoal}
      // A real instant, not a wall-clock value.
      enrolledDisplay={fmt.instantDate(program.enrolledAtMs)}
      milestoneReviewed={program.milestoneReviewed}
      nextSessionAtMs={rel!.client.nextSessionAtMs ?? null}
      todayMs={todayMs}
      // The coach's own page, never the demo's booking screen.
      onBook={rel!.coach.id ? () => nav(bookSessionTarget(true, rel)) : undefined}
    />
  );
}

/** No selection, or an enrollment that isn't there (any more). Either way
    there is nothing to show, and saying so beats a screen of blanks. */
function ProgramMissing() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  return (
    <div className="phone-frame program-detail-screen">
      <div className="program-detail-top">
        <div className="program-detail-top-start">
          <button type="button" className="program-detail-circle" aria-label={t('programDetailBack')} onClick={back}>
            <ChevronIcon size={16} color="currentColor" />
          </button>
          <div className="program-detail-header-title">{t('programDetailTitle')}</div>
        </div>
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

interface ViewProps {
  progress: ProgramProgress;
  /** null: no goal card. */
  goal: string | null;
  enrolledDisplay: string;
  milestoneReviewed: boolean;
  nextSessionAtMs: number | null;
  todayMs: number;
  /** Omitted when there is nowhere to book. */
  onBook?: () => void;
}

function ProgramView({ progress, goal, enrolledDisplay, milestoneReviewed, nextSessionAtMs, todayMs, onBook }: ViewProps) {
  const t = useT();
  const fmt = useFormat();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);

  const heroGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 40)} 100%)`;

  const { offering } = progress;
  const info = getOfferingTypeInfo(offering.type);
  const hasFixedLength = progress.pct !== null;
  const ringOffset = RING_CIRC * (1 - (progress.pct ?? 0) / 100);

  const hasNextSession = nextSessionAtMs != null;
  const nextSessionDisplay = hasNextSession ? fmt.nextSession(nextSessionAtMs, todayMs) : '';

  // History is enrollment-level on purpose: no session log in this data
  // model is attributed to a particular offering, so a per-session list
  // would be fabricated. What is genuinely known is when they enrolled and
  // whether they have reached this program's milestone.
  const history: { key: string; label: string; detail: string }[] = [
    { key: 'enrolled', label: t('programDetailHistoryEnrolled'), detail: enrolledDisplay },
  ];
  if (progress.isComplete) {
    history.push({
      key: 'milestone',
      label: t('programDetailHistoryMilestone'),
      detail: `${progress.sessionsCompleted}/${progress.sessionsTotal}`,
    });
    if (milestoneReviewed) {
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

        {goal && (
          <div className="program-detail-card program-detail-goal">
            <div className="program-detail-label">{t('programDetailYourGoal')}</div>
            <div className="program-detail-goal-text"><bdi>{goal}</bdi></div>
          </div>
        )}

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
        ) : onBook && (
          <button type="button" className="program-detail-card program-detail-link" onClick={onBook}>
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
