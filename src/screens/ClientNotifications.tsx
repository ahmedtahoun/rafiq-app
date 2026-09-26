import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import {
  ChevronIcon, MoonIcon, SunIcon, ScheduleIcon, TasksIcon, PaymentIcon, MessageIcon, BellIcon,
} from '../components/icons';
import {
  getClientNotifications, markNotificationRead, markAllNotificationsRead,
  type ClientNotification, type ClientNotificationKind,
} from '../lib/mockStore';
import './ClientNotifications.css';

const CLIENT_ID = 'sara';

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

function iconFor(family: IconFamily) {
  switch (family) {
    case 'session': return <ScheduleIcon size={17} color="var(--blue)" />;
    case 'task': return <TasksIcon size={17} color="var(--green)" />;
    case 'payment': return <PaymentIcon size={17} color="var(--red)" />;
    case 'message': return <MessageIcon size={17} color="var(--accent)" />;
  }
}

export default function ClientNotifications() {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const isAr = lang === 'ar';

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

  function openRow(n: ClientNotification) {
    markNotificationRead(n.id);
    nav({ screen: n.target.screen, params: n.target.params });
  }

  function markAll() {
    markAllNotificationsRead(items);
    refresh();
  }

  const hasUnread = items.some((n) => n.unread);

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
          <div className="client-notifications-actions">
            <button
              type="button"
              className="client-notifications-icon-btn"
              aria-label={t('switchLanguage')}
              onClick={() => setLang(isAr ? 'en' : 'ar')}
            >
              {isAr ? 'EN' : 'ع'}
            </button>
            <button
              type="button"
              className="client-notifications-icon-btn"
              aria-label={t('toggleDarkMode')}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon size={18} color="currentColor" /> : <MoonIcon size={18} color="currentColor" />}
            </button>
          </div>
        </div>
        {/* Only offered when it would do something. The design showed it
            unconditionally, including on an empty list. */}
        {hasUnread && (
          <div className="client-notifications-mark-row">
            <button type="button" className="client-notifications-mark-all" onClick={markAll}>
              {t('clientNotificationsMarkAll')}
            </button>
          </div>
        )}
      </div>

      <div className="client-notifications-list">
        {items.length > 0 ? (
          items.map((n) => {
            const sub = subOf(n);
            return (
              <button
                key={n.id}
                type="button"
                className={`client-notifications-row${n.unread ? '' : ' client-notifications-row-read'}`}
                onClick={() => openRow(n)}
              >
                <span className={`client-notifications-icon client-notifications-icon-${KIND_FAMILY[n.kind]}`}>
                  {iconFor(KIND_FAMILY[n.kind])}
                </span>
                <span className="client-notifications-body">
                  <span className={`client-notifications-row-title${n.unread ? ' client-notifications-row-title-unread' : ''}`}>
                    <bdi>{titleOf(n)}</bdi>
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
