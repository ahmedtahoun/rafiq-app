import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, greetingKey, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import {
  ArrowForwardIcon,
  BellIcon,
  CheckIcon,
  
  
  MessageIcon,
  
  PaymentIcon,
  
  ScheduleIcon,
  
} from '../components/icons';
import { Card } from '../components/Card';
import { BottomSheet } from '../components/BottomSheet';
import { CoachTabBar } from '../components/TabBars';
import { LoadState } from '../components/LoadState';
import { QuickActions } from '../components/QuickActions';
import {
  draftMessage,
  getClientDetailHref,
  getEarningsSummary,
  getMessagesHref,
  getNudged,
  getPackageStatus,
  getProNotifications,
  getSessionLogs,
  getSessionRoomHref,
  getWeeklyAvailability,
  isSessionToday,
  isTaskOverdue,
  markNudged,
  markSessionFollowedUp,
  type Client,
  type NavTarget,
} from '../lib/mockStore';
import { useRemoteSession } from '../lib/remoteSession';
import { fetchIncomingRequests, fetchOwnWeeklyAvailability } from '../lib/requestData';
import { fetchCoachWeek, type CalendarBlock } from '../lib/scheduleData';
import { wallNowMs } from '../lib/wallClock';
import { useOwnCoachProfile } from '../store/ownProfileStore';
import { useRemoteLoad, type RemoteLoad } from '../store/remoteLoad';
import { useRoster, type RosterView } from '../store/rosterStore';
import './Main.css';

/*
 * The coach's Home.
 *
 * Signed in, every number on it is the coach's own: their name, their
 * active members, today's booked sessions (Schedule's own time_blocks
 * read), the requests waiting in Notifications, and who needs them. It
 * used to be the design prototype's fixed demo for everyone (another
 * coach's name, a 12-day streak, "3/5 sessions", a week chart nothing
 * recorded), which is what a brand-new coach saw on their first screen.
 * The streak, the ring and the chart are gone rather than faked.
 *
 * Signed out it is the same screen over mockStore's demo roster.
 *
 * A coach still setting up gets a short checklist first. Each step reads
 * real data, so it ticks itself, and the card goes once all three are
 * done. Offerings aren't a step yet: the Offerings screen still writes to
 * the demo store signed in, so a real coach couldn't complete it.
 */

const DAY_MS = 86400000;

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

/** The message a reminder drafts, in the coach's language. The coach can
    edit it before sending; it used to be English whatever the language. */
const DRAFT_KEYS: Record<AttentionKind, MessageKey> = {
  paymentOverdue: 'mainDraftPaymentOverdue',
  paymentDue: 'mainDraftPaymentDue',
  taskOverdue: 'mainDraftTaskOverdue',
  packageBlocked: 'mainDraftPackageBlocked',
  packageSoon: 'mainDraftPackageSoon',
  noSession: 'mainDraftNoSession',
  noFollowUp: 'mainDraftNoFollowUp',
  checkin: 'mainDraftCheckin',
};

interface TodaySession {
  key: string;
  client: Client;
  atMs: number;
  endMs: number;
}

export default function Main() {
  const remote = useRemoteSession();
  const roster = useRoster();
  const own = useOwnCoachProfile();
  // Loaded here, before any early return, so the hooks run in the same order
  // on every render. Each is skipped signed out.
  const incomingRequests = useRemoteLoad('incoming_requests', remote, fetchIncomingRequests);
  const todayStartMs = roster.status === 'ready' ? roster.todayMs : 0;
  const week = useRemoteLoad(`home_today_${todayStartMs}`, remote && todayStartMs > 0, () => fetchCoachWeek(todayStartMs));
  const hours = useRemoteLoad('weekly_availability', remote, fetchOwnWeeklyAvailability);

  if (roster.status === 'loading' || own.status === 'loading') return <LoadState status="loading" />;
  if (roster.status === 'error') return <LoadState status="error" onRetry={roster.retry} />;
  if (own.status === 'error') return <LoadState status="error" onRetry={own.retry} />;

  // Signed-in hours still loading (or failed) are "unknown": the setup card
  // waits rather than flash a step that may already be done.
  const hoursSet = remote
    ? (hours.status === 'ready' ? hours.data.some((d) => d.enabled) : null)
    : getWeeklyAvailability().some((d) => d.enabled);
  const requestCount = remote
    ? (incomingRequests.status === 'ready' ? incomingRequests.data.length : 0)
    : getProNotifications().filter((n) => n.unread).length;

  return (
    <MainView
      roster={roster}
      coachName={own.profile.name}
      hasPhotoAndBio={!!own.profile.avatarPhotoUrl && !!own.profile.bio.trim()}
      week={week}
      hoursSet={hoursSet}
      requestCount={requestCount}
    />
  );
}

function MainView({
  roster,
  coachName,
  hasPhotoAndBio,
  week,
  hoursSet,
  requestCount,
}: {
  roster: Extract<RosterView, { status: 'ready' }>;
  coachName: string;
  hasPhotoAndBio: boolean;
  week: RemoteLoad<CalendarBlock[]>;
  hoursSet: boolean | null;
  requestCount: number;
}) {
  const t = useT();
  const fmt = useFormat();
  const nav = useAppStore((s) => s.nav);
  const { remote, todayMs } = roster;

  const [showNudgeSheet, setShowNudgeSheet] = useState(false);
  // Bumped after a nudge or follow-up: those live in localStorage, not in
  // the roster, so nothing else re-renders the screen.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const activeRoster = roster.clients.filter((c) => c.active);
  const activeCount = activeRoster.length;

  // --- Today's sessions ------------------------------------------------------
  // Signed in: the coach's booked blocks that start today, from the same
  // read Schedule makes. Signed out: the demo roster's next sessions.
  let sessions: TodaySession[] = [];
  if (remote) {
    if (week.status === 'ready') {
      sessions = week.data
        .filter((b) => b.kind === 'booked' && !!b.clientId && b.startWallMs < todayMs + DAY_MS)
        .flatMap((b) => {
          const client = roster.client(b.clientId!);
          return client ? [{ key: b.id, client, atMs: b.startWallMs, endMs: b.endWallMs }] : [];
        });
    }
  } else {
    sessions = activeRoster
      .filter((c) => c.nextSessionAtMs != null && isSessionToday(c.nextSessionAtMs, todayMs))
      .map((c) => ({ key: c.id, client: c, atMs: c.nextSessionAtMs!, endMs: c.nextSessionAtMs! + 45 * 60000 }));
  }
  sessions.sort((a, b) => a.atMs - b.atMs);
  // "Up next" is the first that hasn't ended. Signed out the demo clock has
  // no "now" inside its fixed day, so it is simply the first.
  const nowMs = remote ? wallNowMs() : todayMs;
  const nextKey = sessions.find((s) => s.endMs > nowMs)?.key ?? null;

  // --- Payments ----------------------------------------------------------------
  // Signed out, the demo's recorded payments give a total. Signed in there
  // is no total to show yet (Earnings still reads the demo store), so the
  // card counts who is paid up from each member's own payment status.
  const paidCount = activeRoster.filter((c) => c.paymentStatus === 'paid').length;
  const earnings = remote ? null : getEarningsSummary();
  const paidPct = earnings
    ? (earnings.totalClients > 0 ? Math.round((earnings.paidCount / earnings.totalClients) * 100) : 0)
    : (activeCount > 0 ? Math.round((paidCount / activeCount) * 100) : 0);
  const shownDue = earnings ? earnings.dueCount : activeCount - paidCount;
  const dueLabel = shownDue === 0 ? t('mainEarningsAllPaid') : shownDue === 1 ? t('mainEarningsDueOne') : t('mainEarningsDueMany', { n: shownDue });

  // --- Setup -------------------------------------------------------------------
  const setupSteps: { key: string; label: string; done: boolean; href: NavTarget }[] = [
    { key: 'profile', label: t('mainSetupProfile'), done: hasPhotoAndBio, href: { screen: 'editProfile', params: {} } },
    { key: 'hours', label: t('mainSetupHours'), done: !!hoursSet, href: { screen: 'availability', params: {} } },
    { key: 'member', label: t('mainSetupMember'), done: roster.clients.length > 0, href: { screen: 'addClient', params: {} } },
  ];
  const setupDone = setupSteps.filter((s) => s.done).length;
  const showSetup = hoursSet !== null && setupDone < setupSteps.length;

  // --- Needs Your Attention ----------------------------------------------
  // Priority order ported 1:1 from Main.dc.html's if/else chain: payment
  // overdue > package blocked (expired/out of sessions) > task overdue >
  // payment due > package expiring soon > no upcoming session > no
  // post-session follow-up > no recent check-in. Packages and session
  // follow-ups are still demo-store records, so signed in the cascade skips
  // them rather than read the demo's.
  const nudged = getNudged();

  const attention: AttentionItem[] = activeRoster
    .map((c): AttentionItem | null => {
      const overdueTask = roster.tasksOf(c.id).find((task) => isTaskOverdue(task, todayMs)) || null;
      const hasUpcoming = c.nextSessionAtMs != null && c.nextSessionAtMs >= todayMs;
      const noSession = !hasUpcoming && !c.programCompleted;
      const pkgStatus = remote ? null : getPackageStatus(c.id);
      const latestSession = remote ? null : getSessionLogs(c.id)[0] || null;
      const hasUnfollowedSession = !!(latestSession && latestSession.followedUp === false);

      let kind: AttentionKind | null = null;
      if (c.paymentStatus === 'overdue') kind = 'paymentOverdue';
      else if (pkgStatus && (pkgStatus.isExpired || pkgStatus.isOutOfSessions)) kind = 'packageBlocked';
      else if (overdueTask) kind = 'taskOverdue';
      else if (c.paymentStatus === 'due') kind = 'paymentDue';
      else if (pkgStatus?.isExpiringSoon) kind = 'packageSoon';
      else if (noSession) kind = 'noSession';
      else if (hasUnfollowedSession) kind = 'noFollowUp';
      else if (c.needsCheckin) kind = 'checkin';
      if (!kind) return null;

      const daysToExpiry = pkgStatus?.daysToExpiry ?? 0;
      const notes: Record<AttentionKind, string> = {
        paymentOverdue: t('mainPaymentOverdueNote'),
        paymentDue: t('mainPaymentDueNote'),
        taskOverdue: t('mainTaskOverdueNote'),
        packageBlocked: pkgStatus?.isExpired ? t('mainPackageExpiredNote') : t('mainPackageNoSessionsNote'),
        packageSoon: t('mainPackageSoonNote', { n: daysToExpiry }),
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
      // A plain name, not isolate(): this text is sent to the member.
      const messageText = t(DRAFT_KEYS[kind], { name: firstName(c), task: overdueTask?.title ?? '', n: daysToExpiry });
      // A walk-in member with no account yet has no thread to message.
      const canMessage = !remote || !!c.memberId;

      return {
        clientId: c.id,
        name: c.name,
        initials: c.initials,
        avatarBg: c.avatarBg,
        note: notes[kind],
        dotColor: dotColors[kind],
        detailHref: getClientDetailHref(c.id),
        messagesHref: getMessagesHref(c.id),
        scheduleHref: { screen: 'addTimeBlock', params: {} },
        showRemind: !isNoSession && canMessage,
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
          void roster.actions.updateClient(c.id, { paymentStatus: 'paid' });
        },
      };
    })
    .filter((a): a is AttentionItem => a !== null);
  const remindable = attention.filter((a) => a.showRemind);

  function remindAndGo(item: AttentionItem) {
    item.onRemind();
    nav(item.messagesHref);
  }


  const stats: { key: string; value: number; label: string; href: NavTarget }[] = [
    { key: 'members', value: activeCount, label: t('mainStatMembers'), href: { screen: 'clients', params: {} } },
    { key: 'today', value: sessions.length, label: t('mainStatToday'), href: { screen: 'schedule', params: {} } },
    { key: 'requests', value: requestCount, label: t('mainStatRequests'), href: { screen: 'notifications', params: {} } },
  ];

  return (
    <div className="phone-frame main-screen">
      <div className="main-hero">
        <div className="main-hero-top">
          <div>
            <div className="main-eyebrow">{t(greetingKey(new Date().getHours()))}</div>
            {coachName.trim() && <div className="main-name"><bdi>{coachName}</bdi></div>}
          </div>
          <div className="main-hero-actions">
            {/* Add a member, book a session, assign a task: what the "+" in
                the middle of the tab bar used to open. */}
            <span className="main-hero-qa">
              <QuickActions context="home" variant="compact" />
            </span>
            <button
              type="button"
              className="main-hero-icon-btn main-hero-bell"
              aria-label={t('notifications')}
              onClick={() => nav('notifications')}
            >
              <BellIcon size={16} color="#FFFFFF" />
              {requestCount > 0 && <span className="main-bell-dot" />}
            </button>
          </div>
        </div>

        <div className="main-stats">
          {stats.map((s) => (
            <button key={s.key} type="button" className={`main-stat main-stat-${s.key}`} onClick={() => nav(s.href)}>
              <span className="main-stat-num">{s.value}</span>
              <span className="main-stat-label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="main-body">
        {showSetup && (
          <Card className="main-setup">
            <div className="main-setup-head">
              <span className="main-setup-title">{t('mainSetupTitle')}</span>
              <span className="main-setup-count">{t('mainSetupCount', { n: setupDone, total: setupSteps.length })}</span>
            </div>
            <div className="main-setup-track">
              <div className="main-setup-fill" style={{ width: `${Math.round((setupDone / setupSteps.length) * 100)}%` }} />
            </div>
            {setupSteps.map((step) => (
              <button
                key={step.key}
                type="button"
                className={`main-setup-step${step.done ? ' is-done' : ''}`}
                disabled={step.done}
                onClick={() => nav(step.href)}
              >
                <span className="main-setup-check">{step.done && <CheckIcon size={11} color="#FFFFFF" />}</span>
                <span className="main-setup-label">{step.label}</span>
                {!step.done && <ArrowForwardIcon size={15} color="var(--accent)" />}
              </button>
            ))}
          </Card>
        )}

        {activeCount > 0 && (
          <button type="button" className="main-earnings-card" onClick={() => nav({ screen: 'earnings', params: {} })}>
            <div className="main-earnings-row">
              <div className="main-earnings-icon">
                <PaymentIcon size={17} color="var(--green)" />
              </div>
              <div className="main-earnings-text">
                <div className="main-earnings-amount">
                  {earnings
                    ? <>{fmt.money(earnings.totalReceived)} <span>{t('mainEarningsReceived')}</span></>
                    : t('mainPaidUp', { n: paidCount, total: activeCount })}
                </div>
                <div className="main-earnings-due">{dueLabel}</div>
              </div>
              <ArrowForwardIcon size={15} color="var(--ink-soft)" />
            </div>
            <div className="main-earnings-track">
              <div className="main-earnings-fill" style={{ width: `${paidPct}%` }} />
            </div>
          </button>
        )}

        <div className="main-section">
          <div className="main-section-header">
            <div className="main-section-title">{t('mainTodaysSchedule')}</div>
            <button type="button" className="main-see-all" onClick={() => nav('schedule')}>
              {t('mainSeeAll')}
            </button>
          </div>
          {remote && week.status === 'error' ? (
            <Card className="main-empty">
              <div className="main-empty-text">{t('mainTodayFailed')}</div>
              <button type="button" className="main-see-all" onClick={week.retry}>{t('retry')}</button>
            </Card>
          ) : remote && week.status === 'loading' ? null : sessions.length > 0 ? (
            sessions.map((s) => {
              const { num: timeNum, period: timePeriod } = fmt.timeParts(s.atMs);
              const isNext = s.key === nextKey;
              // The session room is still the demo's: signed in, a session opens its member.
              const showJoin = isNext && !remote;
              return (
                <Card key={s.key} className="main-session-row">
                  <button type="button" className="main-session-main" onClick={() => nav(getClientDetailHref(s.client.id))}>
                    <div className="main-session-time">
                      <div className="main-session-time-num">{timeNum}</div>
                      <div className="main-session-time-period">{timePeriod}</div>
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
                      {isNext && <div className="main-up-next">{t('mainUpNext')}</div>}
                      <div className="main-session-name"><bdi>{s.client.name}</bdi></div>
                      <div className="main-session-program"><bdi>{s.client.program}</bdi></div>
                    </div>
                  </button>
                  {showJoin ? (
                    <button type="button" className="main-join-chip" onClick={() => nav(getSessionRoomHref(s.client.id))}>
                      {t('mainJoinChip')}
                    </button>
                  ) : (
                    <button type="button" className="main-session-chevron" aria-label={t('mainOpenMember', { name: s.client.name })} onClick={() => nav(getClientDetailHref(s.client.id))}>
                      <ArrowForwardIcon size={16} color="var(--ink-soft)" />
                    </button>
                  )}
                </Card>
              );
            })
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
            {remindable.length > 0 && (
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
                <button type="button" className="main-attention-main" onClick={() => nav(a.detailHref)}>
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
                    <span className="main-attention-name"><bdi>{a.name}</bdi></span>
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
                      <button type="button" className="main-remind-btn" aria-label={t('remindMemberViaMessage', { name: a.name })} onClick={() => remindAndGo(a)}>
                        <MessageIcon size={16} color="#FFFFFF" />
                      </button>
                    ))}
                  {a.isPayment && (
                    <button type="button" className="main-action-btn" onClick={a.markPaid}>
                      {t('mainMarkPaid')}
                    </button>
                  )}
                  {a.isNoSession && (
                    <button type="button" className="main-action-btn" onClick={() => nav(a.scheduleHref)}>
                      {t('mainSchedule')}
                    </button>
                  )}
                  {a.isPackageAlert && (
                    <button type="button" className="main-action-btn" onClick={() => nav(a.detailHref)}>
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

      <CoachTabBar />

      <BottomSheet open={showNudgeSheet} onClose={() => setShowNudgeSheet(false)} title={t('mainNudgeSheetTitle')}>
        <div className="main-nudge-sub">{t('mainNudgeSheetSub')}</div>
        <div className="main-nudge-list">
          {remindable.map((a) => (
            <div key={a.clientId} className="main-nudge-row">
              <span className="main-nudge-avatar" style={{ background: `linear-gradient(135deg, ${a.avatarBg} 0%, ${darken(a.avatarBg, 35)} 100%)` }}>
                {a.initials}
              </span>
              <span className="main-nudge-text">
                <span className="main-nudge-name"><bdi>{a.name}</bdi></span>
                <span className="main-nudge-note">{a.note}</span>
              </span>
              {a.isNudged ? (
                <span className="main-nudge-done">
                  <CheckIcon size={13} color="var(--green)" />
                  {t('mainNudged')}
                </span>
              ) : (
                <button type="button" className="main-nudge-btn" aria-label={t('nudgeMemberViaMessage', { name: a.name })} onClick={() => remindAndGo(a)}>
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
