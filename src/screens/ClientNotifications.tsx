import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, isolate, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { LoadState } from '../components/LoadState';
import { useRemoteSession } from '../lib/remoteSession';
import {
  fetchMemberNotifications, markAllMemberNotificationsRead, markMemberNotificationRead,
  type MemberNotification, type MemberNotificationKind,
} from '../lib/notificationData';
import { useMemberSpace, type MemberSpaceView } from '../store/memberStore';
import { useRemoteLoad } from '../store/remoteLoad';
import {
  ChevronIcon, ScheduleIcon, TasksIcon, PaymentIcon, MessageIcon, BellIcon,
} from '../components/icons';
import {
  DEMO_MEMBER_CLIENT_ID,
  getClientNotifications, markNotificationRead, markAllNotificationsRead,
  type ClientNotification, type ClientNotificationKind,
} from '../lib/mockStore';
import './ClientNotifications.css';

// Signed out, the demo member's. Signed in, the member's own
// `notifications` (SUPABASE-MIGRATION-PLAN.md step 6).
const CLIENT_ID = DEMO_MEMBER_CLIENT_ID;

// Which glyph and colour family a kind belongs to. A Record, so a new kind
// in the store is a compile error here rather than a silently blank icon.
type IconFamily = 'session' | 'task' | 'payment' | 'message';

const KIND_FAMILY: Record<ClientNotificationKind, IconFamily> = {
  'session-pending': 'session',
  'session-confirmed': 'session',
  'task-overdue': 'task',
  feedback: 'message',
  'payment-overdue': 'payment',
  'payment-due': 'payment',
  'payment-received': 'payment',
  'package-expired': 'payment',
  'package-out': 'payment',
  'package-soon': 'payment',
};

const LIVE_FAMILY: Record<MemberNotificationKind, IconFamily> = {
  message: 'message',
  'payment-received': 'payment',
  'session-moved': 'session',
  'session-cancelled': 'session',
  'request-accepted': 'session',
  'request-declined': 'session',
};

function iconFor(family: IconFamily) {
  switch (family) {
    case 'session': return <ScheduleIcon size={17} color="var(--blue)" />;
    case 'task': return <TasksIcon size={17} color="var(--green)" />;
    case 'payment': return <PaymentIcon size={17} color="var(--red)" />;
    case 'message': return <MessageIcon size={17} color="var(--accent)" />;
  }
}

export default function ClientNotifications() {
  const remote = useRemoteSession();
  const space = useMemberSpace();
  if (!remote) return <DemoClientNotifications />;
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} showBack />;
  if (!space.remote) return <DemoClientNotifications />;
  return <LiveClientNotifications space={space} />;
}

/** One row, whichever source it came from. */
interface Row {
  id: string;
  family: IconFamily;
  title: string;
  sub: string;
  unread: boolean;
}

function DemoClientNotifications() {
  const t = useT();
  const fmt = useFormat();
  const nav = useAppStore((s) => s.nav);

  // mockStore is plain functions over localStorage, not reactive state.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const items = getClientNotifications(CLIENT_ID);

  // The row's one-line subtitle, built from the specifics the store
  // attached when it decided the notification existed.
  function titleOf(n: ClientNotification): string {
    const d = n.data;
    switch (n.kind) {
      case 'session-pending': return t('clientNotifSessionPending');
      case 'session-confirmed': return t('clientNotifSessionConfirmed', { coach: d.coachName ?? '' });
      case 'task-overdue':
        return d.count === 1
          ? t('clientNotifTaskOverdueOne')
          : t('clientNotifTaskOverdueMany', { n: d.count ?? 0 });
      case 'feedback': return t('clientNotifFeedback', { coach: d.coachName ?? '' });
      case 'payment-overdue': return t('clientNotifPaymentOverdue');
      case 'payment-due': return t('clientNotifPaymentDue');
      case 'payment-received': return t('clientNotifPaymentReceived');
      case 'package-expired': return t('clientNotifPackageExpired');
      case 'package-out': return t('clientNotifPackageOut');
      case 'package-soon': return t('clientNotifPackageSoon', { n: d.daysToExpiry ?? 0 });
    }
  }

  function subOf(n: ClientNotification): string {
    const d = n.data;
    switch (n.kind) {
      case 'session-pending': return d.range ?? '';
      case 'session-confirmed': return d.sessionAtMs != null ? fmt.nextSession(d.sessionAtMs) : '';
      case 'task-overdue': return d.firstTitle ?? '';
      case 'feedback': return d.recapText ?? '';
      case 'payment-overdue':
      case 'payment-due':
        return d.plan ? t('clientNotifPlanLabel', { plan: d.plan }) : '';
      case 'payment-received':
        return d.amount !== undefined && d.date
          ? t('clientNotifPaymentSub', { amount: fmt.amount(d.amount), date: d.date })
          : '';
      default: return '';
    }
  }

  return (
    <NotificationsView
      rows={items.map((n) => ({ id: n.id, family: KIND_FAMILY[n.kind], title: titleOf(n), sub: subOf(n), unread: n.unread }))}
      onOpen={(id) => {
        const n = items.find((x) => x.id === id);
        if (!n) return;
        markNotificationRead(n.id);
        nav({ screen: n.target.screen, params: n.target.params });
      }}
      onMarkAll={() => {
        markAllNotificationsRead(items);
        refresh();
        return Promise.resolve(true);
      }}
    />
  );
}

function LiveClientNotifications({ space }: { space: Extract<MemberSpaceView, { status: 'ready' }> }) {
  const t = useT();
  const fmt = useFormat();
  const nav = useAppStore((s) => s.nav);
  const load = useRemoteLoad<MemberNotification[]>('member-notifications', true, fetchMemberNotifications);

  if (load.status === 'loading') return <LoadState status="loading" />;
  if (load.status === 'error') return <LoadState status="error" onRetry={load.retry} showBack />;
  const items = load.data;

  // Who it's about: the coach of that relationship, isolated in the
  // sentence. A relationship no longer listed reads as "your coach".
  const coachOf = (n: MemberNotification) =>
    isolate(space.relationships.find((r) => r.clientId === n.clientId)?.coach.name || t('clientNotifYourCoach'));
  // An answer to a request names the coach as they were then (0021): a
  // declined stranger has no relationship. A deleted coach has no name.
  const answeredBy = (n: MemberNotification) =>
    isolate(n.coachName || space.relationships.find((r) => r.clientId === n.clientId)?.coach.name || t('clientNotifTheCoach'));

  function titleOf(n: MemberNotification): string {
    switch (n.kind) {
      case 'message': return t('clientNotifMessage', { coach: coachOf(n) });
      case 'payment-received': return t('clientNotifPaymentReceived');
      case 'session-moved': return t('clientNotifSessionMoved', { coach: coachOf(n) });
      case 'session-cancelled': return t('clientNotifSessionCancelled', { coach: coachOf(n) });
      case 'request-accepted': return t('clientNotifRequestAccepted', { coach: answeredBy(n) });
      case 'request-declined':
        return t(n.move ? 'clientNotifMoveDeclined' : 'clientNotifRequestDeclined', { coach: answeredBy(n) });
    }
  }

  function subOf(n: MemberNotification): string {
    switch (n.kind) {
      case 'message': return n.preview;
      case 'payment-received':
        return n.amount !== null ? t('clientNotifPaymentSub', { amount: fmt.amount(n.amount), date: fmt.instantDate(n.createdAt) }) : '';
      case 'session-moved':
        return n.sessionWallMs !== null ? t('clientNotifMovedTo', { when: fmt.nextSession(n.sessionWallMs, space.todayMs) }) : '';
      case 'session-cancelled':
      case 'request-accepted':
        return n.sessionWallMs !== null ? fmt.nextSession(n.sessionWallMs, space.todayMs) : '';
      case 'request-declined':
        return n.sessionWallMs !== null ? t('clientNotifRequestedFor', { when: fmt.nextSession(n.sessionWallMs, space.todayMs) }) : '';
    }
  }

  const TARGET: Record<MemberNotificationKind, 'coachMessages' | 'clientCoach' | 'clientSchedule'> = {
    message: 'coachMessages',
    'payment-received': 'clientCoach',
    'session-moved': 'clientSchedule',
    'session-cancelled': 'clientSchedule',
    'request-accepted': 'clientSchedule',
    'request-declined': 'clientSchedule',
  };

  return (
    <NotificationsView
      rows={items.map((n) => ({ id: n.id, family: LIVE_FAMILY[n.kind], title: titleOf(n), sub: subOf(n), unread: n.unread }))}
      onOpen={(id) => {
        const n = items.find((x) => x.id === id);
        if (!n) return;
        // Read as soon as it's opened. If marking fails it simply stays
        // unread for next time; it never blocks opening it.
        if (n.unread) void markMemberNotificationRead(n.id);
        // The screen it's about, for the coach it's about.
        if (n.clientId && space.relationships.some((r) => r.clientId === n.clientId)) space.select(n.clientId);
        // A declined first session: back to that coach's page to pick
        // another time. A declined move leaves the booking where it was,
        // so it opens Sessions like the rest.
        if (n.kind === 'request-declined' && !n.move && n.coachId) nav({ screen: 'coachPreview', params: { coachId: n.coachId } });
        else nav(TARGET[n.kind]);
      }}
      onMarkAll={async () => {
        const result = await markAllMemberNotificationsRead();
        if (result.ok) load.set(items.map((n) => ({ ...n, unread: false })));
        return result.ok;
      }}
    />
  );
}

function NotificationsView({ rows, onOpen, onMarkAll }: {
  rows: Row[];
  onOpen: (id: string) => void;
  /** Resolves false if it couldn't. */
  onMarkAll: () => Promise<boolean>;
}) {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function markAll() {
    setMarking(true);
    setError(null);
    const ok = await onMarkAll();
    setMarking(false);
    if (!ok) setError('clientNotificationsMarkFailed');
  }

  const hasUnread = rows.some((n) => n.unread);
  return (
    <div className="phone-frame client-notifications-screen">
      <div className="client-notifications-top">
        <div className="client-notifications-top-row">
          <div className="client-notifications-top-start">
            <button type="button" className="client-notifications-back" aria-label={t('back')} onClick={back}>
              <ChevronIcon size={16} color="currentColor" />
            </button>
            <div className="client-notifications-title">{t('clientNotificationsTitle')}</div>
          </div>
        </div>
        {/* Only offered when it would do something. The design showed it
            unconditionally, including on an empty list. */}
        {hasUnread && (
          <div className="client-notifications-mark-row">
            <button type="button" className="client-notifications-mark-all" disabled={marking} onClick={() => void markAll()}>
              {t('clientNotificationsMarkAll')}
            </button>
          </div>
        )}
        {error && <div className="client-notifications-error" role="alert">{t(error)}</div>}
      </div>

      <div className="client-notifications-list">
        {rows.length > 0 ? (
          rows.map((n) => {
            const sub = n.sub;
            return (
              <button
                key={n.id}
                type="button"
                className={`client-notifications-row${n.unread ? '' : ' client-notifications-row-read'}`}
                onClick={() => onOpen(n.id)}
              >
                <span className={`client-notifications-icon client-notifications-icon-${n.family}`}>
                  {iconFor(n.family)}
                </span>
                <span className="client-notifications-body">
                  <span className={`client-notifications-row-title${n.unread ? ' client-notifications-row-title-unread' : ''}`}>
                    <bdi>{n.title}</bdi>
                  </span>
                  {sub && <span className="client-notifications-sub"><bdi>{sub}</bdi></span>}
                </span>
                {n.unread && <span className="client-notifications-dot" />}
              </button>
            );
          })
        ) : (
          <div className="client-notifications-empty">
            <span className="client-notifications-empty-icon">
              <BellIcon size={22} color="var(--ink-soft)" />
            </span>
            <div className="client-notifications-empty-title">{t('clientNotificationsEmptyTitle')}</div>
            <div className="client-notifications-empty-body">{t('clientNotificationsEmptyBody')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
