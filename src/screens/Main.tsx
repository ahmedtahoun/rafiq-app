import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import {
  ArrowForwardIcon,
  BellIcon,
  CheckIcon,
  ClientsIcon,
  HomeIcon,
  MessageIcon,
  MoonIcon,
  PaymentIcon,
  PersonIcon,
  ScheduleIcon,
  SunIcon,
} from '../components/icons';
import { Card } from '../components/Card';
import { BottomSheet } from '../components/BottomSheet';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import { QuickActions } from '../components/QuickActions';
import {
  draftMessage,
  getClientDetailHref,
  getClients,
  getEarningsSummary,
  getMessagesHref,
  getNudged,
  getPackageStatus,
  getProNotifications,
  getSessionLogs,
  getSessionRoomHref,
  getTasks,
  isTaskOverdue,
  markNudged,
  markSessionFollowedUp,
  updateClient,
  type Client,
  type NavTarget,
} from '../lib/mockStore';
import './Main.css';

// Fixed demo week — Main.dc.html hardcodes this same data directly inside
// renderVals() (it is never derived from the store), so it's ported the
// same way here instead of invented.
const WEEK_DATA: { day: string; count: number; isToday?: boolean }[] = [
  { day: 'M', count: 4 },
  { day: 'T', count: 6 },
  { day: 'W', count: 5, isToday: true },
  { day: 'T', count: 7 },
  { day: 'F', count: 5 },
  { day: 'S', count: 2 },
  { day: 'S', count: 1 },
];
const LAST_WEEK_TOTAL = 27;

// The session ring shows a fixed "3/5" — Main.dc.html hardcodes this
// literal fraction too (not derived from any real per-session data yet),
// ported as-is rather than invented.
const RING_PROGRESS = 3 / 5;
const RING_R = 27;
const RING_CIRC = 2 * Math.PI * RING_R;

// Today's Schedule reads the same real per-client `nextSession` field
// every other screen would write to (a member whose real next session
// isn't today can't drift out of sync with a separate hardcoded list) —
// same comment/intent as Main.dc.html's own renderVals().
function parseTodayMinutes(nextSession: string): number | null {
  const m = /Today,\s*(\d+):(\d+)\s*(AM|PM)/i.exec(nextSession || '');
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + parseInt(m[2], 10);
}

function firstName(c: Client): string {
  return c.name.split(' ')[0];
}

type AttentionKind =
  | 'paymentOverdue'
  | 'paymentDue'
  | 'taskOverdue'
  | 'packageBlocked'
  | 'packageSoon'
  | 'noSession'
  | 'noFollowUp'
  | 'checkin';

interface AttentionItem {
  clientId: string;
  name: string;
  initials: string;
  avatarBg: string;
  note: string;
  dotColor: string;
  detailHref: NavTarget;
  messagesHref: NavTarget;
  scheduleHref: NavTarget;
  showRemind: boolean;
  isPayment: boolean;
  isNoSession: boolean;
  isPackageAlert: boolean;
  isNudged: boolean;
  onRemind: () => void;
  markPaid: () => void;
}

// Draft message text per kind — not localized in the design prototype
// either (its own `messages` map is plain English regardless of `lang`),
// ported as-is rather than newly translated.
const MESSAGE_TEMPLATES: Record<AttentionKind, (c: Client, overdueTaskTitle: string, daysToExpiry: number) => string> = {
  paymentOverdue: (c) => `Hi ${firstName(c)}, just a friendly reminder that your payment is overdue — let me know if you have any questions!`,
  paymentDue: (c) => `Hi ${firstName(c)}, just a friendly reminder that your payment is due — let me know if you have any questions!`,
  taskOverdue: (c, title) => `Hi ${firstName(c)}, just checking in on "${title}" — let me know if you need any help with it!`,
  packageBlocked: (c) => `Hi ${firstName(c)}, just a heads up — your session package needs renewing. Want me to send you renewal options?`,
  packageSoon: (c, _title, days) => `Hi ${firstName(c)}, just a heads up — your session package expires in ${days}d. Want to renew early?`,
  noSession: (c) => `Hi ${firstName(c)}, want to grab your next session on the calendar? Let me know what works for you!`,
  noFollowUp: (c) => `Hi ${firstName(c)}, hope you're doing well after our last session! Let me know if anything comes up before we meet again.`,
  checkin: (c) => `Hi ${firstName(c)}, haven't heard from you in a bit — how are you doing? 😊`,
};

export default function Main() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const [showNudgeSheet, setShowNudgeSheet] = useState(false);
  // Bumped after any mutation (mark paid, remind/nudge, follow-up) to
  // force the derived data below to recompute from localStorage —
  // mockStore is plain functions over localStorage, not reactive state.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  function goTo(href: NavTarget) {
    nav(href);
  }

  const clients = getClients();
  const activeRoster = clients.filter((c) => c.active);
  const activeCount = activeRoster.length;
  const completionPct = activeRoster.length
    ? Math.round(activeRoster.reduce((sum, c) => sum + c.progress, 0) / activeRoster.length)
    : 0;

  const hasUnreadNotifications = getProNotifications().some((n) => n.unread);

  // --- This Week bar chart -------------------------------------------------
  const maxCount = Math.max(...WEEK_DATA.map((d) => d.count));
  const weekTotal = WEEK_DATA.reduce((sum, d) => sum + d.count, 0);
  const trendPct = Math.round(((weekTotal - LAST_WEEK_TOTAL) / LAST_WEEK_TOTAL) * 100);
  const trendUp = trendPct >= 0;
  const trendColor = trendUp ? 'var(--green)' : 'var(--red)';
  const trendArrowPath = trendUp ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6';
  const trendLabel = `${trendUp ? '+' : ''}${trendPct}%`;

  // --- Earnings summary card ------------------------------------------------
  const earnings = getEarningsSummary();
  const earningsPaid = earnings.totalReceived.toLocaleString();
  const earningsPct = earnings.totalClients > 0 ? Math.round((earnings.paidCount / earnings.totalClients) * 100) : 0;
  const earningsDueLabel =
    earnings.dueCount === 0
      ? t('mainEarningsAllPaid')
      : earnings.dueCount === 1
        ? t('mainEarningsDueOne')
        : t('mainEarningsDueMany', { n: earnings.dueCount });

  // --- Today's Schedule ------------------------------------------------------
  const sessions = activeRoster
    .filter((c) => /^Next:\s*Today,/.test(c.nextSession || ''))
    .map((c) => {
      const timeStr = (c.nextSession || '').replace(/^Next:\s*Today,\s*/, '');
      const [timeNum, timePeriod] = timeStr.split(' ');
      return { client: c, timeNum, timePeriod, sortKey: parseTodayMinutes(c.nextSession) ?? 0 };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((s, idx) => ({ ...s, isNext: idx === 0, showJoinChip: idx === 0 }));

  // --- Needs Your Attention ----------------------------------------------
  // Priority order ported 1:1 from Main.dc.html's if/else chain: payment
  // overdue > package blocked (expired/out of sessions) > task overdue >
  // payment due > package expiring soon > no upcoming session > no
  // post-session follow-up > no recent check-in.
  const nudged = getNudged();

  const attention: AttentionItem[] = activeRoster
    .map((c): AttentionItem | null => {
      const overdueTask = getTasks(c.id).find((task) => isTaskOverdue(task)) || null;
      const noSession = c.nextSession === 'No upcoming session';
      const pkgStatus = getPackageStatus(c.id);
      const latestSession = getSessionLogs(c.id)[0] || null;
      const hasUnfollowedSession = !!(latestSession && latestSession.followedUp === false);

      let kind: AttentionKind | null = null;
      if (c.paymentStatus === 'overdue') kind = 'paymentOverdue';
      else if (pkgStatus.isExpired || pkgStatus.isOutOfSessions) kind = 'packageBlocked';
      else if (overdueTask) kind = 'taskOverdue';
      else if (c.paymentStatus === 'due') kind = 'paymentDue';
      else if (pkgStatus.isExpiringSoon) kind = 'packageSoon';
      else if (noSession) kind = 'noSession';
      else if (hasUnfollowedSession) kind = 'noFollowUp';
      else if (c.needsCheckin) kind = 'checkin';
      if (!kind) return null;

      const notes: Record<AttentionKind, string> = {
        paymentOverdue: t('mainPaymentOverdueNote'),
        paymentDue: t('mainPaymentDueNote'),
        taskOverdue: t('mainTaskOverdueNote'),
        packageBlocked: pkgStatus.isExpired ? t('mainPackageExpiredNote') : t('mainPackageNoSessionsNote'),
        packageSoon: t('mainPackageSoonNote', { n: pkgStatus.daysToExpiry }),
        noSession: t('mainNoSessionNote'),
        noFollowUp: t('mainNoFollowUpNote'),
        checkin: t('mainCheckinNote'),
      };
      const dotColors: Record<AttentionKind, string> = {
        paymentOverdue: 'var(--red)',
        paymentDue: 'var(--amber)',
        taskOverdue: 'var(--amber)',
        packageBlocked: 'var(--red)',
        packageSoon: 'var(--amber)',
        noSession: 'var(--blue)',
        noFollowUp: 'var(--blue)',
        checkin: 'var(--ink-soft)',
      };

      const nudgeKey = `${c.id}_${kind}`;
      const isNudged = !!nudged[nudgeKey];
      const isPayment = kind === 'paymentOverdue' || kind === 'paymentDue';
      const isNoSession = kind === 'noSession';
      const isPackageAlert = kind === 'packageBlocked' || kind === 'packageSoon';
      const messageText = MESSAGE_TEMPLATES[kind](c, overdueTask?.title ?? '', pkgStatus.daysToExpiry);

      return {
        clientId: c.id,
        name: c.name,
        initials: c.initials,
        avatarBg: c.avatarBg,
        note: notes[kind],
        dotColor: dotColors[kind],
        detailHref: getClientDetailHref(c.id),
        messagesHref: getMessagesHref(c.id),
        // TODO: route to 'addTimeBlock' once AddTimeBlock.dc.html is ported
        scheduleHref: { screen: 'comingSoon', params: { feature: 'addTimeBlock', clientId: c.id } },
        showRemind: !isNoSession,
        isPayment,
        isNoSession,
        isPackageAlert,
        isNudged,
        onRemind: () => {
          if (kind === 'noFollowUp' && latestSession) {
            markSessionFollowedUp(c.id, latestSession.id);
          } else {
            markNudged(nudgeKey);
          }
          draftMessage(c.id, messageText);
          refresh();
        },
        markPaid: () => {
          updateClient(c.id, { paymentStatus: 'paid' });
          refresh();
        },
      };
    })
    .filter((a): a is AttentionItem => a !== null);

  function remindAndGo(item: AttentionItem) {
    item.onRemind();
    nav(item.messagesHref);
  }

  const navItems: BottomNavItem[] = [
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'main' },
    // TODO: route to 'clients' once Clients.dc.html is ported
    { key: 'clients', label: t('mainClientsNav'), icon: ClientsIcon, screen: 'comingSoon', params: { feature: 'clients' } },
    // TODO: route to 'messagesInbox' once MessagesInbox.dc.html is ported
    { key: 'messages', label: t('mainMessagesNav'), icon: MessageIcon, screen: 'comingSoon', params: { feature: 'messagesInbox' } },
    { key: 'quickActions', label: t('quickActionsTitle'), render: () => <QuickActions context="home" /> },
    // TODO: route to 'schedule' once Schedule.dc.html is ported
    { key: 'schedule', label: t('mainSchedule'), icon: ScheduleIcon, screen: 'comingSoon', params: { feature: 'schedule' } },
    // TODO: route to 'profile' once Profile.dc.html is ported
    { key: 'profile', label: t('mainProfileNav'), icon: PersonIcon, screen: 'comingSoon', params: { feature: 'profile' } },
  ];

  return (
    <div className="phone-frame main-screen">
      <div className="main-hero">
        <div className="main-hero-top">
          <div>
            <div className="main-eyebrow">{t('mainGreeting')}</div>
            <div className="main-name-row">
              <div className="main-name">{t('mainCoachName')}</div>
              <div className="main-streak">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#FFFFFF" stroke="none">
                  <path d="M12 2c1 3-2 4.5-2 7.5a3 3 0 1 0 6 0c0-1-.3-2-.3-2 2 1.5 3.3 4 3.3 6.5a7 7 0 1 1-14 0C4.5 9.5 8 7 12 2z" />
                </svg>
                <span>{t('mainStreak')}</span>
              </div>
            </div>
          </div>
          <div className="main-hero-actions">
            <button type="button" className="main-hero-icon-btn" aria-label="Switch language" onClick={() => setLang(isAr ? 'en' : 'ar')}>
              <span className="main-lang-label">{isAr ? 'EN' : 'ع'}</span>
            </button>
            <button type="button" className="main-hero-icon-btn" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
            <button
              type="button"
              className="main-hero-icon-btn main-hero-bell"
              aria-label="Notifications"
              // TODO: route to 'notifications' once Notifications.dc.html is ported
              onClick={() => goTo({ screen: 'comingSoon', params: { feature: 'notifications' } })}
            >
              <BellIcon size={16} color="#FFFFFF" />
              {hasUnreadNotifications && <span className="main-bell-dot" />}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="main-ring-link"
          // TODO: route to 'schedule' once Schedule.dc.html is ported
          onClick={() => goTo({ screen: 'comingSoon', params: { feature: 'schedule' } })}
        >
          <span className="main-ring">
            <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="32" cy="32" r={RING_R} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="6" />
              <circle
                cx="32"
                cy="32"
                r={RING_R}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={RING_CIRC * (1 - RING_PROGRESS)}
              />
            </svg>
            <span className="main-ring-text">
              <span className="main-ring-num">3/5</span>
              <span className="main-ring-label">{t('mainSessions')}</span>
            </span>
          </span>
          <span className="main-stats">
            <span className="main-stat-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3" />
                <path d="M2.5 19c.8-3.5 3.1-5.3 6.5-5.3s5.7 1.8 6.5 5.3" />
              </svg>
              <b>{activeCount}</b> {t('mainActiveClients')}
            </span>
            <span className="main-stat-chip">
              <CheckIcon size={12} color="#FFFFFF" />
              <b>{completionPct}%</b> {t('mainCompletionRate')}
            </span>
          </span>
        </button>
      </div>

      <div className="main-body">
        <Card className="main-week-card">
          <div className="main-week-header">
            <div className="main-week-title">{t('mainThisWeek')}</div>
            <div className="main-week-meta">
              <span className="main-week-total">
                <b>{weekTotal}</b> {t('mainSessionsWord')}
              </span>
              <span className="main-week-trend" style={{ color: trendColor }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={trendColor} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={trendArrowPath} />
                </svg>
                {trendLabel}
              </span>
            </div>
          </div>
          <div className="main-week-bars">
            {WEEK_DATA.map((d, i) => {
              const heightPx = Math.max(6, Math.round((d.count / maxCount) * 40));
              return (
                <div key={i} className="main-week-bar-col">
                  <div className="main-week-bar" style={{ height: `${heightPx}px`, background: d.isToday ? 'var(--accent)' : 'var(--line)' }} />
                  <div className="main-week-bar-label" style={{ color: d.isToday ? 'var(--accent)' : 'var(--ink-soft)', fontWeight: d.isToday ? 700 : 600 }}>
                    {d.day}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <button
          type="button"
          className="main-earnings-card"
          // TODO: route to 'earnings' once Earnings.dc.html is ported
          onClick={() => goTo({ screen: 'comingSoon', params: { feature: 'earnings' } })}
        >
          <div className="main-earnings-row">
            <div className="main-earnings-icon">
              <PaymentIcon size={17} color="var(--green)" />
            </div>
            <div className="main-earnings-text">
              <div className="main-earnings-amount">
                {earningsPaid} EGP <span>{t('mainEarningsReceived')}</span>
              </div>
              <div className="main-earnings-due">{earningsDueLabel}</div>
            </div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </div>
          <div className="main-earnings-track">
            <div className="main-earnings-fill" style={{ width: `${earningsPct}%` }} />
          </div>
        </button>

        <div className="main-section">
          <div className="main-section-header">
            <div className="main-section-title">{t('mainTodaysSchedule')}</div>
            <button
              type="button"
              className="main-see-all"
              // TODO: route to 'schedule' once Schedule.dc.html is ported
              onClick={() => goTo({ screen: 'comingSoon', params: { feature: 'schedule' } })}
            >
              {t('mainSeeAll')}
            </button>
          </div>
          {sessions.length > 0 ? (
            sessions.map((s) => (
              <Card key={s.client.id} className="main-session-row">
                <button type="button" className="main-session-main" onClick={() => goTo(getClientDetailHref(s.client.id))}>
                  <div className="main-session-time">
                    <div className="main-session-time-num">{s.timeNum}</div>
                    <div className="main-session-time-period">{s.timePeriod}</div>
                  </div>
                  <div
                    className="main-avatar"
                    style={{
                      background: `linear-gradient(135deg, ${s.client.avatarBg} 0%, ${darken(s.client.avatarBg, 35)} 100%)`,
                      boxShadow: `0 8px 16px -6px ${s.client.avatarBg}66`,
                    }}
                  >
                    {s.client.initials}
                  </div>
                  <div className="main-session-text">
                    {s.isNext && <div className="main-up-next">{t('mainUpNext')}</div>}
                    <div className="main-session-name">{s.client.name}</div>
                    <div className="main-session-program">{s.client.program}</div>
                  </div>
                </button>
                {s.showJoinChip ? (
                  <button type="button" className="main-join-chip" onClick={() => goTo(getSessionRoomHref(s.client.id))}>
                    {t('mainJoinChip')}
                  </button>
                ) : (
                  <button type="button" className="main-session-chevron" aria-label={s.client.name} onClick={() => goTo(getClientDetailHref(s.client.id))}>
                    <ArrowForwardIcon size={16} color="var(--ink-soft)" />
                  </button>
                )}
              </Card>
            ))
          ) : (
            <Card className="main-empty">
              <ScheduleIcon size={26} color="var(--ink-soft)" />
              <div className="main-empty-text">{t('mainNoSessions')}</div>
            </Card>
          )}
        </div>

        <div className="main-section">
          <div className="main-section-header">
            <div className="main-section-title">{t('mainNeedsAttention')}</div>
            {attention.length > 0 && (
              <button type="button" className="main-nudge-all" onClick={() => setShowNudgeSheet(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2z" />
                </svg>
                {t('mainNudgeAll')}
              </button>
            )}
          </div>
          {attention.length > 0 ? (
            attention.map((a) => (
              <Card key={a.clientId} className="main-attention-row">
                <button type="button" className="main-attention-main" onClick={() => goTo(a.detailHref)}>
                  <span className="main-attention-dot" style={{ background: a.dotColor }} />
                  <span
                    className="main-avatar"
                    style={{
                      background: `linear-gradient(135deg, ${a.avatarBg} 0%, ${darken(a.avatarBg, 35)} 100%)`,
                      boxShadow: `0 8px 16px -6px ${a.avatarBg}66`,
                    }}
                  >
                    {a.initials}
                  </span>
                  <span className="main-attention-text">
                    <span className="main-attention-name">{a.name}</span>
                    <span className="main-attention-note">{a.note}</span>
                  </span>
                </button>
                <span className="main-attention-actions">
                  {a.showRemind &&
                    (a.isNudged ? (
                      <span className="main-remind-done">
                        <CheckIcon size={15} color="var(--green)" />
                      </span>
                    ) : (
                      <button type="button" className="main-remind-btn" aria-label="Remind via message" onClick={() => remindAndGo(a)}>
                        <MessageIcon size={16} color="#FFFFFF" />
                      </button>
                    ))}
                  {a.isPayment && (
                    <button type="button" className="main-action-btn" onClick={a.markPaid}>
                      {t('mainMarkPaid')}
                    </button>
                  )}
                  {a.isNoSession && (
                    <button type="button" className="main-action-btn" onClick={() => goTo(a.scheduleHref)}>
                      {t('mainSchedule')}
                    </button>
                  )}
                  {a.isPackageAlert && (
                    <button type="button" className="main-action-btn" onClick={() => goTo(a.detailHref)}>
                      {t('mainRenew')}
                    </button>
                  )}
                </span>
              </Card>
            ))
          ) : (
            <Card className="main-caught-up">
              <span className="main-caught-up-icon">
                <CheckIcon size={17} color="var(--green)" />
              </span>
              <span className="main-caught-up-text">{t('mainAllCaughtUp')}</span>
            </Card>
          )}
        </div>
      </div>

      <BottomNav items={navItems} />

      <BottomSheet open={showNudgeSheet} onClose={() => setShowNudgeSheet(false)} title={t('mainNudgeSheetTitle')}>
        <div className="main-nudge-sub">{t('mainNudgeSheetSub')}</div>
        <div className="main-nudge-list">
          {attention.map((a) => (
            <div key={a.clientId} className="main-nudge-row">
              <span className="main-nudge-avatar" style={{ background: `linear-gradient(135deg, ${a.avatarBg} 0%, ${darken(a.avatarBg, 35)} 100%)` }}>
                {a.initials}
              </span>
              <span className="main-nudge-text">
                <span className="main-nudge-name">{a.name}</span>
                <span className="main-nudge-note">{a.note}</span>
              </span>
              {a.isNudged ? (
                <span className="main-nudge-done">
                  <CheckIcon size={13} color="var(--green)" />
                  {t('mainNudged')}
                </span>
              ) : (
                <button type="button" className="main-nudge-btn" aria-label="Nudge via message" onClick={() => remindAndGo(a)}>
                  <MessageIcon size={16} color="#FFFFFF" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="main-nudge-done-btn" onClick={() => setShowNudgeSheet(false)}>
          {t('mainDone')}
        </button>
      </BottomSheet>
    </div>
  );
}
