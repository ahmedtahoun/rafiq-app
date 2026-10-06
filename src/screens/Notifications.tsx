import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useRosterStore } from '../store/rosterStore';
import { useRemoteLoad } from '../store/remoteLoad';
import { isolate, useT, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { initialsOf } from '../lib/directory';
import { useRemoteSession } from '../lib/remoteSession';
import {
  acceptSessionRequest,
  declineSessionRequest,
  fetchIncomingRequests,
  type IncomingRequest,
} from '../lib/requestData';
import { BellIcon, ChevronIcon, PaymentIcon, ScheduleIcon } from '../components/icons';
import { BottomSheet } from '../components/BottomSheet';
import { LoadState } from '../components/LoadState';
import {
  getProNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ProNotification,
} from '../lib/mockStore';
import { FREE_MEMBER_CAP, MEMBER_CAP, usePlan } from '../lib/planData';
import './Notifications.css';

const REQUEST_AVATAR = '#B75C3D';

// 1:1 port of Notifications.dc.html — the coach's feed. Signed out it is
// backed by getProNotifications(), which reads back empty until the demo's
// scheduling and payments write real records. Signed in (step 4) it lists
// the session requests waiting on this coach, each opening a sheet to
// accept or decline it: accepting books the session and puts the member on
// the roster (0010's accept_session_request).
export default function Notifications() {
  const t = useT();
  const fmt = useFormat();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const lang = useAppStore((s) => s.lang);
  const remote = useRemoteSession();
  const incoming = useRemoteLoad('incoming_requests', remote, fetchIncomingRequests);
  // Only for the number in "Your plan holds N": the database decides.
  const plan = usePlan();
  const memberCap = (plan.status === 'ready' ? MEMBER_CAP[plan.plan.tier] : null) ?? FREE_MEMBER_CAP;

  // mockStore is plain functions over localStorage, so marking read has to
  // be followed by a re-read; the counter is what triggers it.
  const [, setTick] = useState(0);
  const [openRequest, setOpenRequest] = useState<IncomingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<MessageKey | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  if (remote && incoming.status === 'loading') return <LoadState status="loading" />;
  if (remote && incoming.status === 'error') return <LoadState status="error" onRetry={incoming.retry} showBack />;
  const requests = remote && incoming.status === 'ready' ? incoming.data : [];
  const items = remote ? [] : getProNotifications();

  function open(n: ProNotification) {
    markNotificationRead(n.id);
    setTick((x) => x + 1);
    nav(n.href);
  }

  function markAll() {
    markAllNotificationsRead(items);
    setTick((x) => x + 1);
  }

  function openSheet(r: IncomingRequest) {
    setSheetError(null);
    setOpenRequest(r);
  }

  function closeSheet() {
    if (busy) return;
    setOpenRequest(null);
    setSheetError(null);
  }

  /** The request is settled (or gone): off the list, sheet closed. */
  function settle(r: IncomingRequest, message: string) {
    if (incoming.status === 'ready') incoming.set(incoming.data.filter((x) => x.id !== r.id));
    setOpenRequest(null);
    setBanner(message);
  }

  async function accept(r: IncomingRequest) {
    setBusy(true);
    setSheetError(null);
    const result = await acceptSessionRequest(r.id);
    setBusy(false);
    if (result.ok) {
      settle(r, t(r.movesFromWallMs != null ? 'notificationsMoveAccepted' : 'notificationsAccepted', { name: isolate(r.memberName) }));
      // The new roster row (or the archived one brought back) is the roster
      // store's to show, so it re-reads.
      const roster = useRosterStore.getState();
      if (roster.userId) void roster.refresh(roster.userId);
      return;
    }
    if (result.code === 'gone') settle(r, t('notificationsRequestGone'));
    else if (result.code === 'passed') setSheetError('notificationsRequestPassed');
    else if (result.code === 'slot_taken') setSheetError('notificationsSlotTaken');
    else if (result.code === 'blocked') setSheetError('notificationsRequestBlocked');
    else if (result.code === 'member_cap') setSheetError('notificationsMemberCap');
    else setSheetError('requestFailedRetry');
  }

  async function decline(r: IncomingRequest) {
    setBusy(true);
    setSheetError(null);
    const result = await declineSessionRequest(r.id);
    setBusy(false);
    if (result.ok) settle(r, '');
    else if (result.code === 'gone') settle(r, t('notificationsRequestGone'));
    else setSheetError('requestFailedRetry');
  }

  const whenOf = (r: IncomingRequest) => fmt.slot(r.startWallMs);
  // A move (0017): from the booking's time now to the one asked for.
  const moveOf = (r: IncomingRequest) =>
    r.movesFromWallMs != null ? `${fmt.slot(r.movesFromWallMs)} ${lang === 'ar' ? '←' : '→'} ${fmt.slot(r.startWallMs)}` : null;
  const titleOf = (r: IncomingRequest) =>
    t(r.movesFromWallMs != null ? 'notificationsMoveRequest' : 'notificationsSessionRequest', { name: isolate(r.memberName) });
  const whatOf = (r: IncomingRequest) => r.offeringName ?? t('coachPreviewIntroCallName');
  const priceOf = (r: IncomingRequest) => (r.price > 0 ? fmt.money(r.price, r.currency) : t('offeringsFree'));
  const empty = remote ? requests.length === 0 : items.length === 0;

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
        </div>
        {items.length > 0 && (
          <div className="notifications-mark-all-row">
            <button className="notifications-mark-all" onClick={markAll}>{t('notificationsMarkAllRead')}</button>
          </div>
        )}
      </div>

      <div className="notifications-list">
        {banner && <div className="notifications-banner" role="status">{banner}</div>}
        {!empty ? (
          <>
            {requests.map((r) => (
              <button
                key={r.id}
                type="button"
                className="notifications-row"
                onClick={() => openSheet(r)}
              >
                <span className="notifications-kind-icon is-session">
                  <ScheduleIcon size={17} color="var(--blue)" />
                </span>
                <span className="notifications-avatar" style={{ background: REQUEST_AVATAR }}>{initialsOf(r.memberName || '?')}</span>
                <span className="notifications-text">
                  <span className="notifications-row-title is-unread">{titleOf(r)}</span>
                  <span className="notifications-row-sub">{moveOf(r) ?? <>{whenOf(r)} · <bdi>{whatOf(r)}</bdi></>}</span>
                </span>
                <span className="notifications-dot" aria-label={t('notificationsUnread')} />
              </button>
            ))}
            {items.map((n) => {
              const isSession = n.kind === 'session-request';
              const title = t(isSession ? 'notificationsSessionRequest' : 'notificationsPaymentReceived', { name: n.data.clientName });
              const sub = isSession
                ? n.data.range ?? ''
                : t('notificationsPaymentSub', { amount: fmt.amount(n.data.amount ?? 0), date: n.data.date ?? '' });

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
            })}
          </>
        ) : (
          <div className="notifications-empty">
            <div className="notifications-empty-icon"><BellIcon size={22} color="var(--ink-soft)" /></div>
            <div className="notifications-empty-title">{t('notificationsAllCaughtUp')}</div>
            <div className="notifications-empty-sub">{t('notificationsNothingNew')}</div>
          </div>
        )}
      </div>

      <BottomSheet open={!!openRequest} onClose={closeSheet} title={openRequest ? titleOf(openRequest) : ''}>
        {openRequest && (
          <div className="notifications-sheet">
            {openRequest.movesFromWallMs != null ? (
              <>
                <div className="notifications-sheet-row">
                  <span className="notifications-sheet-label">{t('notificationsMoveBookedFor')}</span>
                  <strong>{fmt.slot(openRequest.movesFromWallMs)}</strong>
                </div>
                <div className="notifications-sheet-row">
                  <span className="notifications-sheet-label">{t('notificationsMoveAskedFor')}</span>
                  <strong>{whenOf(openRequest)}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="notifications-sheet-row">
                  <span className="notifications-sheet-label">{t('coachPreviewDateLabel')}</span>
                  <strong>{whenOf(openRequest)}</strong>
                </div>
                <div className="notifications-sheet-row">
                  <span className="notifications-sheet-label"><bdi>{whatOf(openRequest)}</bdi></span>
                  <strong>{priceOf(openRequest)}</strong>
                </div>
              </>
            )}
            {sheetError && (
              <div className="notifications-sheet-error" role="alert">
                {t(sheetError, { name: isolate(openRequest.memberName), cap: memberCap })}
              </div>
            )}
            <div className="notifications-sheet-actions">
              <button
                type="button"
                className="notifications-sheet-btn is-neutral"
                disabled={busy}
                onClick={() => void decline(openRequest)}
              >
                {t('notificationsDecline')}
              </button>
              <button
                type="button"
                className="notifications-sheet-btn is-accent"
                disabled={busy}
                onClick={() => void accept(openRequest)}
              >
                {t('notificationsAccept')}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
