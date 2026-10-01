import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, isolate, greetingKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import { BellIcon, MoonIcon, SunIcon, CheckIcon, TasksIcon, ScheduleIcon, ArrowForwardIcon, SearchIcon, ProgramsIcon, PersonIcon, HomeIcon } from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import { LoadState } from '../components/LoadState';
import { NoCoachYet } from '../components/NoCoachYet';
import { bookSessionTarget, useMemberSpace, type MemberSpaceView } from '../store/memberStore';
import {
  DEMO_MEMBER_CLIENT_ID,
  isSessionToday,
  getActiveSession,
  getUnreviewedMilestones,
  markMilestoneReviewed,
  setSelectedOfferingId,
  getClientNotifications,
} from '../lib/mockStore';
import './ClientHome.css';

const RING_R = 37;
const RING_CIRC = 2 * Math.PI * RING_R;
// Matches tokens.css's --accent — darken() needs a literal hex, not the CSS
// custom property, for the hero/coach-avatar gradient's darker stop.
const ACCENT_HEX = '#B75C3D';

export default function ClientHome() {
  const space = useMemberSpace();
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} />;
  return <ClientHomeView space={space} />;
}

function ClientHomeView({ space }: { space: Extract<MemberSpaceView, { status: 'ready' }> }) {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const [isFirstTime, setIsFirstTime] = useState(false);
  // Bumped after a demo-only mutation (milestone dismiss) to force the
  // derived reads below to recompute from localStorage.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);
  const [busyTask, setBusyTask] = useState<string | null>(null);

  const { remote, todayMs } = space;
  const rel = space.current;
  const client = rel?.client;
  // Signed out this is the design's demo member; signed in, what the
  // coach's roster row says — never the demo name.
  const initials = client?.initials || (remote ? '' : 'SA');
  const coachName = rel?.coach.name ?? '';
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const coachGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;
  const heroGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 40)} 100%)`;

  const progress = client?.progress ?? 0;
  const ringOffset = RING_CIRC * (1 - progress / 100);
  const pkgStatus = rel?.pkg ?? null;
  const sessionsFraction = pkgStatus ? `${pkgStatus.used}/${pkgStatus.total}` : '—';
  const sessionProgressPct = pkgStatus && pkgStatus.total > 0 ? Math.round((pkgStatus.used / pkgStatus.total) * 100) : 0;
  const sessionsCompletedText = pkgStatus ? t('clientHomeSessionsCompleted', { used: pkgStatus.used, total: pkgStatus.total }) : t('clientHomeNoPackage');

  const baseTasks = rel?.tasks ?? [];
  const pendingTasks = baseTasks.filter((tk) => !tk.done);
  const completedTasks = baseTasks.filter((tk) => tk.done);
  const orderedTasks = [...pendingTasks, ...completedTasks];
  const taskPreview = orderedTasks.slice(0, 2);
  const hasTasksToday = pendingTasks.length > 0;
  const allCaughtUp = baseTasks.length > 0 && pendingTasks.length === 0;
  const noTasksReturning = baseTasks.length === 0;

  const nextSessionAtMs = client?.nextSessionAtMs ?? null;
  const hasNextSession = nextSessionAtMs != null;
  const nextSessionDisplay = hasNextSession ? fmt.nextSession(nextSessionAtMs, todayMs) : '';
  const noNextSession = !hasNextSession;
  const showJoinBadge = hasNextSession && isSessionToday(nextSessionAtMs, todayMs);
  // The live session room is still the demo's (SessionRoom moves with scheduling).
  const sessionIsLive = !remote && getActiveSession(DEMO_MEMBER_CLIENT_ID).active;
  const joinBadgeLabel = sessionIsLive ? t('clientHomeRejoinSession') : t('clientHomeJoinSession');

  // The coach's most recent recap (memberStore reads it from the same seam
  // ClientTasks uses).
  const recentFeedback = rel?.latestRecap ?? null;
  const hasRecentFeedback = !!recentFeedback;
  const recentFeedbackText = recentFeedback?.text ?? '';
  const recentFeedbackDate = recentFeedback ? fmt.date(recentFeedback.atMs) : '';

  // Notifications and program milestones are still the demo's (step 6), so a
  // signed-in member sees neither rather than the demo member's.
  const hasUnreadNotifications = !remote && getClientNotifications(DEMO_MEMBER_CLIENT_ID).some((n) => n.unread);

  const unreviewedMilestones = remote ? [] : getUnreviewedMilestones(DEMO_MEMBER_CLIENT_ID);
  const milestone = unreviewedMilestones[0] || null;
  const hasMilestone = !!milestone;
  const milestoneTitle = milestone ? t('clientHomeMilestoneTitleTemplate', { program: isolate(milestone.offering.name) }) : '';

  function rateMilestone() {
    if (!milestone) return;
    setSelectedOfferingId(milestone.offeringId);
    nav('rateCoach');
  }
  function dismissMilestone() {
    if (!milestone) return;
    markMilestoneReviewed(DEMO_MEMBER_CLIENT_ID, milestone.offeringId);
    refresh();
  }
  function toggleTaskDone(taskId: string) {
    if (busyTask) return;
    setBusyTask(taskId);
    void space.actions.toggleTask(taskId).finally(() => setBusyTask(null));
  }

  const previewLabel = isFirstTime ? t('clientHomePreviewToNormal') : t('clientHomePreviewToFirst');

  const navItems: BottomNavItem[] = [
    { key: 'discover', label: t('clientHomeDiscoverNav'), icon: SearchIcon, screen: 'discover' },
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'clientHome' },
    { key: 'programs', label: t('myProgramsNav'), icon: ProgramsIcon, screen: 'myPrograms' },
    { key: 'tasks', label: t('clientTasksNav'), icon: TasksIcon, screen: 'clientTasks' },
    { key: 'schedule', label: t('clientScheduleNav'), icon: ScheduleIcon, screen: 'clientSchedule' },
    { key: 'coach', label: t('clientHomeCoachNav'), icon: PersonIcon, screen: 'clientCoach' },
  ];

  return (
    <div className="phone-frame client-home-screen">
      <div className="client-home-hero" style={{ background: heroGrad }}>
        <div className="client-home-hero-top">
          <div>
            <div className="client-home-greeting">{t(greetingKey(new Date().getHours()))}</div>
            {(client?.name || !remote) && <div className="client-home-name">{client?.name || t('clientHomeName')}</div>}
            {!remote && <div className="client-home-streak">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#FFFFFF" stroke="none">
                <path d="M12 2c1.5 3 5 5.5 5 10a5 5 0 0 1-10 0c0-1.5.5-2.5 1-3.5.2 1.5 1.3 2 2 1-1-2 .5-4 2-4.5-1 1.5-.5 3 .5 3.5C13 7 12 4.5 12 2z" />
              </svg>
              <span>{t('clientHomeStreak')}</span>
            </div>}
          </div>
          <div className="client-home-hero-actions">
            <button type="button" className="client-home-icon-btn" aria-label={t('switchLanguage')} onClick={() => setLang(isAr ? 'en' : 'ar')}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{isAr ? 'EN' : 'ع'}</span>
            </button>
            <button type="button" className="client-home-icon-btn" aria-label={t('toggleDarkMode')} onClick={() => setDark(!dark)}>
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
            <button
              type="button"
              className="client-home-icon-btn"
              aria-label={t('notifications')}
              onClick={() => nav('clientNotifications')}
            >
              <BellIcon size={16} color="#FFFFFF" />
              {hasUnreadNotifications && <span className="client-home-bell-dot" />}
            </button>
            <button
              type="button"
              className="client-home-avatar-btn"
              aria-label={t('clientHomeYourProfile')}
              onClick={() => nav('clientProfile')}
            >
              {initials || <PersonIcon size={16} color="#FFFFFF" />}
            </button>
          </div>
        </div>

        {!rel ? null : isFirstTime ? (
          <div className="client-home-welcome">
            <div className="client-home-welcome-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2c1.5 3 5 5.5 5 10a5 5 0 0 1-10 0c0-1.5.5-2.5 1-3.5.2 1.5 1.3 2 2 1-1-2 .5-4 2-4.5-1 1.5-.5 3 .5 3.5C13 7 12 4.5 12 2z" />
              </svg>
            </div>
            <div className="client-home-welcome-title">{t('clientHomeWelcomeTitle', { name: (client?.name || t('clientHomeName')).split(' ')[0] })}</div>
            <div className="client-home-welcome-sub">{t('clientHomeWelcomeSub', { coach: isolate(coachName) })}</div>
            <button
              type="button"
              className="client-home-welcome-cta"
              onClick={() => nav(bookSessionTarget(remote, rel))}
            >
              {t('clientHomeBookFirst')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="client-home-progress-card"
            onClick={() => nav('clientSchedule')}
          >
            <div className="client-home-progress-row">
              <div className="client-home-ring">
                <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="40" cy="40" r={RING_R} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="6" />
                  <circle cx="40" cy="40" r={RING_R} fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeDasharray={RING_CIRC} strokeDashoffset={ringOffset} />
                </svg>
                <div className="client-home-ring-pct">{progress}%</div>
              </div>
              <div className="client-home-progress-text">
                <div className="client-home-progress-label">{t('clientHomeProgressLabel')}</div>
                <div className="client-home-progress-goal"><bdi>{client?.goal || t('clientHomeGoalFallback')}</bdi></div>
                <div className="client-home-progress-note">{t('clientHomeProgressAssessedBy', { name: isolate(coachName) })}</div>
              </div>
            </div>
            <div className="client-home-session-progress">
              <div className="client-home-session-progress-row">
                <div className="client-home-session-progress-label">{t('clientHomeSessionProgressLabel')}</div>
                <div className="client-home-session-progress-fraction">{sessionsFraction}</div>
              </div>
              <div className="client-home-session-progress-track">
                <div className="client-home-session-progress-fill" style={{ width: `${sessionProgressPct}%` }} />
              </div>
              <div className="client-home-session-progress-caption">{sessionsCompletedText}</div>
            </div>
          </button>
        )}
      </div>

      <div className="client-home-body">
        {!rel ? (
          <NoCoachYet />
        ) : isFirstTime ? (
          <div className="client-home-empty-card">
            <TasksIcon size={26} color="var(--ink-soft)" />
            <div className="client-home-empty-title">{t('clientHomeNoTasksTitle')}</div>
            <div className="client-home-empty-sub">{t('clientHomeNoTasksSub')}</div>
          </div>
        ) : (
          <>
            {hasMilestone && (
              <div className="client-home-milestone-card">
                <div className="client-home-milestone-row">
                  <div className="client-home-milestone-icon">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="6" />
                      <path d="M8.5 13.5L6 22l6-3 6 3-2.5-8.5" />
                    </svg>
                  </div>
                  <div className="client-home-milestone-text">
                    <div className="client-home-milestone-label">{t('clientHomeMilestoneLabel')}</div>
                    <div className="client-home-milestone-title">{milestoneTitle}</div>
                  </div>
                </div>
                <div className="client-home-milestone-actions">
                  <button type="button" className="client-home-milestone-rate" onClick={rateMilestone}>
                    {t('clientHomeRateIt')}
                  </button>
                  <button type="button" className="client-home-milestone-later" onClick={dismissMilestone}>
                    {t('clientHomeMaybeLater')}
                  </button>
                </div>
              </div>
            )}

            {hasNextSession ? (
              <button
                type="button"
                className="client-home-card"
                onClick={() => nav('clientCoach')}
              >
                <div className="client-home-coach-avatar" style={{ background: coachGrad }}>
                  {coachInitials}
                </div>
                <div className="client-home-card-text">
                  <div className="client-home-card-eyebrow">{t('clientHomeNextSession')}</div>
                  <div className="client-home-card-title">{nextSessionDisplay}</div>
                  <div className="client-home-card-sub">{t('clientHomeWithCoach', { name: isolate(coachName) })}</div>
                </div>
                {showJoinBadge ? (
                  <span className="client-home-join-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="6" width="15" height="12" rx="2.5" />
                      <path d="M22 8.5l-5 3.5 5 3.5v-7z" />
                    </svg>
                    {joinBadgeLabel}
                  </span>
                ) : (
                  <ArrowForwardIcon size={16} color="var(--ink-soft)" />
                )}
              </button>
            ) : (
              noNextSession && (
                <button
                  type="button"
                  className="client-home-card"
                  onClick={() => nav(bookSessionTarget(remote, rel))}
                >
                  <div className="client-home-card-icon">
                    <ScheduleIcon size={20} color="var(--accent)" />
                  </div>
                  <div className="client-home-card-text">
                    <div className="client-home-card-title">{t('clientHomeNoSessionTitle')}</div>
                    <div className="client-home-card-sub">{t('clientHomeNoSessionSub', { coach: isolate(coachName) })}</div>
                  </div>
                  <ArrowForwardIcon size={16} color="var(--accent)" />
                </button>
              )
            )}

            {hasRecentFeedback && (
              <button
                type="button"
                className="client-home-card client-home-feedback-card"
                onClick={() => nav('clientCoach')}
              >
                <div className="client-home-coach-avatar client-home-coach-avatar-sm" style={{ background: coachGrad }}>
                  {coachInitials}
                </div>
                <div className="client-home-card-text">
                  <div className="client-home-card-eyebrow">{t('clientHomeFeedbackLabel', { name: isolate(coachName) })}</div>
                  <div className="client-home-feedback-text">{recentFeedbackText}</div>
                  <div className="client-home-feedback-date">{recentFeedbackDate}</div>
                </div>
              </button>
            )}

            <div className="client-home-tasks-section">
              <div className="client-home-section-header">
                <div className="client-home-section-title">{t('clientHomeTodaysTasks')}</div>
                <button
                  type="button"
                  className="client-home-see-all"
                  onClick={() => nav('clientTasks')}
                >
                  {t('mainSeeAll')}
                </button>
              </div>
              {hasTasksToday &&
                taskPreview.map((tk) => (
                  <div className="client-home-task-row" key={tk.id}>
                    <button type="button" aria-label={t('toggleTaskComplete', { task: tk.title })} className={`client-home-task-check${tk.done ? ' is-done' : ''}`} disabled={busyTask !== null} onClick={() => toggleTaskDone(tk.id)}>
                      {tk.done && <CheckIcon size={12} color="#FFFFFF" />}
                    </button>
                    <div className="client-home-task-text">
                      <div className={`client-home-task-title${tk.done ? ' is-done' : ''}`}><bdi>{tk.title}</bdi></div>
                      <div className="client-home-task-due"><bdi>{fmt.taskDue(tk.dueAtMs, tk.dueHasTime, todayMs)}</bdi></div>
                    </div>
                  </div>
                ))}
              {allCaughtUp && (
                <div className="client-home-caught-up">
                  <div className="client-home-caught-up-icon">
                    <CheckIcon size={17} color="var(--accent)" />
                  </div>
                  <div className="client-home-caught-up-text">{t('clientHomeAllCaughtUp')}</div>
                </div>
              )}
              {noTasksReturning && (
                <div className="client-home-empty-card">
                  <TasksIcon size={24} color="var(--ink-soft)" />
                  <div className="client-home-empty-title">{t('clientHomeNoTasksTitle')}</div>
                  <div className="client-home-empty-sub">{t('clientHomeNoTasksReturningSub')}</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* The design's own first-time/returning preview switch: demo only. */}
        {!remote && (
          <button type="button" className="client-home-preview-toggle" onClick={() => setIsFirstTime((v) => !v)}>
            {previewLabel}
          </button>
        )}
      </div>

      <BottomNav items={navItems} />
    </div>
  );
}
