import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { BellIcon, ChevronIcon, MoonIcon, PaymentIcon, ScheduleIcon, SunIcon } from '../components/icons';
import {
  getProNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ProNotification,
} from '../lib/mockStore';
import './Notifications.css';

// 1:1 port of Notifications.dc.html — the coach's feed, backed by
// getProNotifications(). Both kinds read back empty until scheduling and
// payments write real records, which is the design's own behaviour on a
// fresh install rather than seeded demo rows.
export default function Notifications() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);

  // mockStore is plain functions over localStorage, so marking read has to
  // be followed by a re-read; the counter is what triggers it.
  const [, setTick] = useState(0);
  const items = getProNotifications();

  function open(n: ProNotification) {
    markNotificationRead(n.id);
    setTick((x) => x + 1);
    nav(n.href);
  }

  function markAll() {
    markAllNotificationsRead(items);
    setTick((x) => x + 1);
  }

  return (
    <div className="phone-frame notifications">
      <div className="notifications-header">
        <div className="notifications-header-row">
          <div className="notifications-header-left">
            <button className="notifications-back" aria-label={t('back')} onClick={back}>
              <ChevronIcon size={16} />
            </button>
            <div className="notifications-title">{t('notificationsTitle')}</div>
          </div>
          <div className="notifications-header-actions">
            <button
              className="notifications-icon-btn"
              aria-label={t('switchLanguage')}
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            >
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
            <button
              className="notifications-icon-btn"
              aria-label={t('notificationsToggleTheme')}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>
          </div>
        </div>
        {items.length > 0 && (
          <div className="notifications-mark-all-row">
            <button className="notifications-mark-all" onClick={markAll}>{t('notificationsMarkAllRead')}</button>
          </div>
        )}
      </div>

      <div className="notifications-list">
        {items.length > 0 ? (
          items.map((n) => {
            const isSession = n.kind === 'session-request';
            const title = t(isSession ? 'notificationsSessionRequest' : 'notificationsPaymentReceived', { name: n.data.clientName });
            const sub = isSession
              ? n.data.range ?? ''
              : t('notificationsPaymentSub', { amount: n.data.amount ?? 0, date: n.data.date ?? '' });

            return (
              <button
                key={n.id}
                type="button"
                className={`notifications-row${n.unread ? '' : ' is-read'}`}
                onClick={() => open(n)}
              >
                <span className={`notifications-kind-icon${isSession ? ' is-session' : ' is-payment'}`}>
                  {isSession
                    ? <ScheduleIcon size={17} color="var(--blue)" />
                    : <PaymentIcon size={17} color="var(--green)" />}
                </span>
                <span className="notifications-avatar" style={{ background: n.data.avatarBg }}>{n.data.initials}</span>
                <span className="notifications-text">
                  <span className={`notifications-row-title${n.unread ? ' is-unread' : ''}`}>{title}</span>
                  {sub && <span className="notifications-row-sub">{sub}</span>}
                </span>
                {n.unread && <span className="notifications-dot" aria-label={t('notificationsUnread')} />}
              </button>
            );
          })
        ) : (
          <div className="notifications-empty">
            <div className="notifications-empty-icon"><BellIcon size={22} color="var(--ink-soft)" /></div>
            <div className="notifications-empty-title">{t('notificationsAllCaughtUp')}</div>
            <div className="notifications-empty-sub">{t('notificationsNothingNew')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
