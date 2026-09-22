import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { BellIcon, MoonIcon, SunIcon, CheckIcon, TasksIcon, ScheduleIcon, ArrowForwardIcon, SearchIcon, ProgramsIcon, PersonIcon, HomeIcon } from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import {
  getClient,
  getCoachProfile,
  getPackageStatus,
  getTasks,
  toggleTask,
  getSessionLogs,
  isSessionToday,
  getActiveSession,
  getUnreviewedMilestones,
  markMilestoneReviewed,
  setSelectedOfferingId,
  getRecapForMember,
  getClientNotifications,
  formatDate,
} from '../lib/mockStore';
import './ClientHome.css';

const CLIENT_ID = 'sara';
const RING_R = 37;
const RING_CIRC = 2 * Math.PI * RING_R;
// Same two hardcoded fallback sessions store.js's own getNotifications/
// ClientHome.dc.html renderVals() concat onto any real logged sessions, so
// a fresh install still has something to look for a recap on.
const FALLBACK_SESSIONS: { id: string; date: string }[] = [
  { id: 'sess1', date: 'Oct 18, 2025' },
  { id: 'sess2', date: 'Oct 11, 2025' },
];

// Matches tokens.css's --accent — darken() needs a literal hex, not the CSS
// custom property, for the hero/coach-avatar gradient's darker stop.
const ACCENT_HEX = '#B75C3D';

export default function ClientHome() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const [isFirstTime, setIsFirstTime] = useState(false);
  // Bumped after a mutation (task toggle, milestone dismiss) to force the
  // derived reads below to recompute from localStorage — mockStore is
  // plain functions over localStorage, not reactive state.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const client = getClient(CLIENT_ID);
  const coachProfile = getCoachProfile();
  const initials = client?.initials || 'SA';
  const coachName = coachProfile.name || 'Yasmin El-Sayed';
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const coachGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;
  const heroGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 40)} 100%)`;

  const progress = client?.progress ?? 63;
  const ringOffset = RING_CIRC * (1 - progress / 100);
  const pkgStatus = getPackageStatus(CLIENT_ID);
  const sessionsFraction = `${pkgStatus.used}/${pkgStatus.total}`;
  const sessionProgressPct = pkgStatus.total > 0 ? Math.round((pkgStatus.used / pkgStatus.total) * 100) : 0;
  const sessionsCompletedText = t('clientHomeSessionsCompleted', { used: pkgStatus.used, total: pkgStatus.total });

  const baseTasks = getTasks(CLIENT_ID);
  const pendingTasks = baseTasks.filter((tk) => !tk.done);
  const completedTasks = baseTasks.filter((tk) => tk.done);
  const orderedTasks = [...pendingTasks, ...completedTasks];
  const taskPreview = orderedTasks.slice(0, 2);
  const hasTasksToday = pendingTasks.length > 0;
  const allCaughtUp = baseTasks.length > 0 && pendingTasks.length === 0;
  const noTasksReturning = baseTasks.length === 0;

  const nextSessionRaw = client?.nextSession || '';
  const hasNextSession = !!nextSessionRaw && nextSessionRaw !== 'No upcoming session' && nextSessionRaw !== 'Program completed';
  const nextSessionDisplay = hasNextSession ? nextSessionRaw.replace(/^Next:\s*/, '') : '';
  const noNextSession = !hasNextSession;
  const showJoinBadge = hasNextSession && isSessionToday(nextSessionRaw);
  const sessionIsLive = getActiveSession(CLIENT_ID).active;
  const joinBadgeLabel = sessionIsLive ? t('clientHomeRejoinSession') : t('clientHomeJoinSession');

  const loggedSessions = getSessionLogs(CLIENT_ID).map((s) => ({ id: s.id, date: formatDate(s.atMs) }));
  const allSessions: { id: string; date: string }[] = [...loggedSessions, ...FALLBACK_SESSIONS];
  const recentFeedback = allSessions.map((s) => ({ session: s, text: getRecapForMember(CLIENT_ID, s.id) })).find((r) => r.text.trim());
  const hasRecentFeedback = !!recentFeedback;
  const recentFeedbackText = recentFeedback?.text ?? '';
  const recentFeedbackDate = recentFeedback?.session.date ?? '';

  const hasUnreadNotifications = getClientNotifications(CLIENT_ID).some((n) => n.unread);

  const unreviewedMilestones = getUnreviewedMilestones(CLIENT_ID);
  const milestone = unreviewedMilestones[0] || null;
  const hasMilestone = !!milestone;
  const milestoneTitle = milestone ? t('clientHomeMilestoneTitleTemplate', { program: milestone.offering.name }) : '';

  function rateMilestone() {
    if (!milestone) return;
    setSelectedOfferingId(milestone.offeringId);
    nav({ screen: 'comingSoon', params: { feature: 'rateCoach' } }); // TODO: route to 'rateCoach' once RateCoach.dc.html is ported
  }
  function dismissMilestone() {
    if (!milestone) return;
    markMilestoneReviewed(CLIENT_ID, milestone.offeringId);
    refresh();
  }
  function toggleTaskDone(taskId: string) {
    toggleTask(CLIENT_ID, taskId);
    refresh();
  }

  const previewLabel = isFirstTime ? t('clientHomePreviewToNormal') : t('clientHomePreviewToFirst');

  const navItems: BottomNavItem[] = [
    { key: 'discover', label: t('clientHomeDiscoverNav'), icon: SearchIcon, screen: 'discover' },
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'clientHome' },
    // TODO: route to 'myPrograms' once MyPrograms.dc.html is ported
    { key: 'programs', label: t('clientHomeProgramsNav'), icon: ProgramsIcon, screen: 'comingSoon', params: { feature: 'myPrograms' } },
    // TODO: route to 'clientTasks' once ClientTasks.dc.html is ported
    { key: 'tasks', label: t('clientHomeTasksNav'), icon: TasksIcon, screen: 'comingSoon', params: { feature: 'clientTasks' } },
    // TODO: route to 'clientSchedule' once ClientSchedule.dc.html is ported
    { key: 'schedule', label: t('clientHomeScheduleNav'), icon: ScheduleIcon, screen: 'comingSoon', params: { feature: 'clientSchedule' } },
    // TODO: route to 'clientCoach' once ClientCoach.dc.html is ported
    { key: 'coach', label: t('clientHomeCoachNav'), icon: PersonIcon, screen: 'comingSoon', params: { feature: 'clientCoach' } },
  ];

  return (
    <div className="phone-frame client-home-screen">
      <div className="client-home-hero" style={{ background: heroGrad }}>
        <div className="client-home-hero-top">
          <div>
            <div className="client-home-greeting">{t('mainGreeting')}</div>
            <div className="client-home-name">{client?.name || t('clientHomeName')}</div>
            <div className="client-home-streak">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#FFFFFF" stroke="none">
                <path d="M12 2c1.5 3 5 5.5 5 10a5 5 0 0 1-10 0c0-1.5.5-2.5 1-3.5.2 1.5 1.3 2 2 1-1-2 .5-4 2-4.5-1 1.5-.5 3 .5 3.5C13 7 12 4.5 12 2z" />
              </svg>
              <span>{t('clientHomeStreak')}</span>
            </div>
          </div>
          <div className="client-home-hero-actions">
            <button type="button" className="client-home-icon-btn" aria-label="Switch language" onClick={() => setLang(isAr ? 'en' : 'ar')}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{isAr ? 'EN' : 'ع'}</span>
            </button>
            <button type="button" className="client-home-icon-btn" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
            <button
              type="button"
              className="client-home-icon-btn"
              aria-label="Notifications"
              onClick={() => nav({ screen: 'comingSoon', params: { feature: 'clientNotifications' } })} // TODO: route to 'clientNotifications' once ClientNotifications.dc.html is ported
            >
              <BellIcon size={16} color="#FFFFFF" />
              {hasUnreadNotifications && <span className="client-home-bell-dot" />}
            </button>
            <button
              type="button"
              className="client-home-avatar-btn"
              aria-label="Your profile"
              onClick={() => nav('clientProfile')}
            >
              {initials}
            </button>
          </div>
        </div>

        {isFirstTime ? (
          <div className="client-home-welcome">
            <div className="client-home-welcome-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2c1.5 3 5 5.5 5 10a5 5 0 0 1-10 0c0-1.5.5-2.5 1-3.5.2 1.5 1.3 2 2 1-1-2 .5-4 2-4.5-1 1.5-.5 3 .5 3.5C13 7 12 4.5 12 2z" />
              </svg>
            </div>
            <div className="client-home-welcome-title">{t('clientHomeWelcomeTitle', { name: (client?.name || t('clientHomeName')).split(' ')[0] })}</div>
            <div className="client-home-welcome-sub">{t('clientHomeWelcomeSub', { coach: coachName })}</div>
            <button
              type="button"
              className="client-home-welcome-cta"
              onClick={() => nav({ screen: 'comingSoon', params: { feature: 'clientBooking' } })} // TODO: route to 'clientBooking' once ClientBooking.dc.html is ported
            >
              {t('clientHomeBookFirst')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="client-home-progress-card"
            onClick={() => nav({ screen: 'comingSoon', params: { feature: 'clientSchedule' } })} // TODO: route to 'clientSchedule' once ClientSchedule.dc.html is ported
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
                <div className="client-home-progress-goal">{client?.goal || t('clientHomeGoalFallback')}</div>
                <div className="client-home-progress-note">{t('clientHomeProgressAssessedBy', { name: coachName })}</div>
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
        {isFirstTime ? (
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
                onClick={() => nav({ screen: 'comingSoon', params: { feature: 'clientCoach' } })} // TODO: route to 'clientCoach' once ClientCoach.dc.html is ported
              >
                <div className="client-home-coach-avatar" style={{ background: coachGrad }}>
                  {coachInitials}
                </div>
                <div className="client-home-card-text">
                  <div className="client-home-card-eyebrow">{t('clientHomeNextSession')}</div>
                  <div className="client-home-card-title">{nextSessionDisplay}</div>
                  <div className="client-home-card-sub">{t('clientHomeWithCoach', { name: coachName })}</div>
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
                  onClick={() => nav({ screen: 'comingSoon', params: { feature: 'clientBooking' } })} // TODO: route to 'clientBooking' once ClientBooking.dc.html is ported
                >
                  <div className="client-home-card-icon">
                    <ScheduleIcon size={20} color="var(--accent)" />
                  </div>
                  <div className="client-home-card-text">
                    <div className="client-home-card-title">{t('clientHomeNoSessionTitle')}</div>
                    <div className="client-home-card-sub">{t('clientHomeNoSessionSub', { coach: coachName })}</div>
                  </div>
                  <ArrowForwardIcon size={16} color="var(--accent)" />
                </button>
              )
            )}

            {hasRecentFeedback && (
              <button
                type="button"
                className="client-home-card client-home-feedback-card"
                onClick={() => nav({ screen: 'comingSoon', params: { feature: 'clientCoach' } })} // TODO: route to 'clientCoach' once ClientCoach.dc.html is ported
              >
                <div className="client-home-coach-avatar client-home-coach-avatar-sm" style={{ background: coachGrad }}>
                  {coachInitials}
                </div>
                <div className="client-home-card-text">
                  <div className="client-home-card-eyebrow">{t('clientHomeFeedbackLabel', { name: coachName })}</div>
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
                  onClick={() => nav({ screen: 'comingSoon', params: { feature: 'clientTasks' } })} // TODO: route to 'clientTasks' once ClientTasks.dc.html is ported
                >
                  {t('mainSeeAll')}
                </button>
              </div>
              {hasTasksToday &&
                taskPreview.map((tk) => (
                  <div className="client-home-task-row" key={tk.id}>
                    <button type="button" aria-label="Toggle task complete" className={`client-home-task-check${tk.done ? ' is-done' : ''}`} onClick={() => toggleTaskDone(tk.id)}>
                      {tk.done && <CheckIcon size={12} color="#FFFFFF" />}
                    </button>
                    <div className="client-home-task-text">
                      <div className={`client-home-task-title${tk.done ? ' is-done' : ''}`}>{tk.title}</div>
                      <div className="client-home-task-due">{tk.due}</div>
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

        <button type="button" className="client-home-preview-toggle" onClick={() => setIsFirstTime((v) => !v)}>
          {previewLabel}
        </button>
      </div>

      <BottomNav items={navItems} />
    </div>
  );
}
