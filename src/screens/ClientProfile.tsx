import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { isolate, useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import { PencilIcon, ArrowForwardIcon, ScheduleIcon, TasksIcon, PaymentIcon, WarningIcon } from '../components/icons';
import { signOut } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { fileAccountDeletionRequest } from '../lib/adminQueues';
import { useRemoteSession } from '../lib/remoteSession';
import { openExternal, supportMailto, SUPPORT_EMAIL } from '../lib/support';
import { LoadState } from '../components/LoadState';
import { NoCoachYet } from '../components/NoCoachYet';
import { useMemberSpace, type MemberSpaceView } from '../store/memberStore';
import {
  DEMO_MEMBER_CLIENT_ID,
  getAgreementInfo,
  getAgreementInfoForTitle,
  getAgreement,
  setAgreementStatus,
  getNotificationPrefs,
  setNotificationPrefs,
  getMemberActiveObligations,
  requestAccountDeletion,
  type ActiveObligations,
} from '../lib/mockStore';
import { MemberTabBar } from '../components/TabBars';
import { PushPhoneRow } from '../components/PushAsk';
import { usePushPermission } from '../store/pushHooks';
import { syncPushDevice } from '../lib/push';
import { AgreementCard } from '../components/AgreementCard';
import { fetchAgreement, signAgreement } from '../lib/agreementData';
import { useRemoteLoad } from '../store/remoteLoad';
import './ClientProfile.css';

// Demo account deletion is the demo member's, signed out only: signed in,
// deletion files a real request. The coaching agreement is the demo's
// (mockStore) signed out, and the real one (agreements, 0028) signed in.
const CLIENT_ID = DEMO_MEMBER_CLIENT_ID;
const RING_R = 22;
const RING_CIRC = 2 * Math.PI * RING_R;

// Matches tokens.css's --accent — darken() needs a literal hex, not the CSS
// custom property, for the avatar/coach-avatar gradient's darker stop.
const ACCENT_HEX = '#B75C3D';

type NotifTypeKey = 'session' | 'task' | 'messages';

// 1:1 port of ClientProfile.dc.html — the member's own account hub, off
// ClientHome's avatar button. Notification prefs are real and persisted
// here (unlike the coach-side Profile.dc.html's local-only toggles), same
// as the design source itself.
export default function ClientProfile() {
  const space = useMemberSpace();
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} showBack />;
  return <ClientProfileView space={space} />;
}

function ClientProfileView({ space }: { space: Extract<MemberSpaceView, { status: 'ready' }> }) {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Disables the Delete button while a real Supabase request is in
  // flight, and keeps the confirm sheet open with an inline error on
  // failure rather than closing as if it had gone through.
  const [deleteBusy, setDeleteBusy] = useState(false);
  const remote = useRemoteSession();
  const [deleteError, setDeleteError] = useState(false);
  // Bumped after a mutation (sign agreement, toggle notif prefs, delete) to
  // force the derived reads below to recompute from localStorage —
  // mockStore is plain functions over localStorage, not reactive state.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const rel = space.current;
  const client = rel?.client;
  const { contact, todayMs } = space;
  const memberInitials = contact.fullName.trim().split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
  const coachName = rel?.coach.name ?? '';
  const coachSpecialty = rel?.coach.title ?? '';
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
  const clientColor = client?.avatarBg || ACCENT_HEX;
  const avatarGrad = `linear-gradient(135deg, ${clientColor} 0%, ${darken(clientColor, 35)} 100%)`;
  const coachGrad = `linear-gradient(135deg, ${ACCENT_HEX} 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  const progress = client?.progress ?? 0;
  const ringOffset = RING_CIRC * (1 - progress / 100);
  // Signed in, the goal the coach set, or none: never the demo's sample.
  const goalDisplay = client?.goal || (remote ? '' : t('clientHomeGoalFallback'));

  const nextSessionAtMs = client?.nextSessionAtMs ?? null;
  const nextSessionQuick = nextSessionAtMs != null ? fmt.nextSession(nextSessionAtMs, todayMs) : t('clientProfileNoSessionLabel');

  const pendingTaskCount = (rel?.tasks ?? []).filter((tk) => !tk.done).length;
  const tasksQuickText = pendingTaskCount > 0 ? t('clientProfileTasksPending', { n: pendingTaskCount }) : t('clientProfileTasksDone');

  const paymentStates = {
    paid: { label: t('clientProfilePaymentPaid'), color: 'var(--green)', bg: 'var(--green-bg)' },
    due: { label: t('clientProfilePaymentDue'), color: 'var(--amber)', bg: 'var(--amber-bg)' },
    overdue: { label: t('clientProfilePaymentOverdue'), color: 'var(--red)', bg: 'var(--red-bg)' },
  } as const;
  const paymentState = paymentStates[client?.paymentStatus ?? 'due'];

  const demoAgreementInfo = getAgreementInfo(client?.specialty ?? '');
  const demoAgreement = remote ? null : getAgreement(CLIENT_ID);

  const notifPrefs = getNotificationPrefs();
  const notif = notifPrefs.enabled;
  const push = usePushPermission();
  const phone = push.state !== null && push.state !== 'unsupported';

  // Signed in, what a coach would still owe this member: unused, unexpired
  // sessions and a booked one. (Disputes join when SessionRoom moves.)
  const obligations: ActiveObligations = remote ? remoteObligations() : getMemberActiveObligations(CLIENT_ID);
  function remoteObligations(): ActiveObligations {
    const hasUnusedCredits = !!rel?.pkg && rel.pkg.remaining > 0 && !rel.pkg.isExpired;
    const hasUpcomingSession = client?.nextSessionAtMs != null;
    return {
      hasUnusedCredits,
      remainingCredits: rel?.pkg?.remaining ?? 0,
      hasUpcomingSession,
      openDisputesCount: 0,
      blocked: hasUnusedCredits || hasUpcomingSession,
    };
  }
  const obligationParts: string[] = [];
  if (obligations.hasUnusedCredits) obligationParts.push(t('clientProfileObligationCredits', { n: obligations.remainingCredits }));
  if (obligations.hasUpcomingSession) obligationParts.push(t('clientProfileObligationSession'));
  if (obligations.openDisputesCount > 0) obligationParts.push(t('profileObligationDisputes', { n: obligations.openDisputesCount }));
  const obligationsSummary = obligationParts.length
    ? `${t('profileDeleteBlockedIntro')} ${obligationParts.join(lang === 'ar' ? '، ' : ', ')}.`
    : '';
  const deleteBody = t('clientProfileDeleteBody', { coach: isolate(coachName) });
  const memberOf = rel ? t('clientProfileMemberOf', { coach: isolate(coachName) }) : '';

  async function signDemoAgreement(): Promise<boolean> {
    setAgreementStatus(CLIENT_ID, 'signed');
    refresh();
    return true;
  }

  // The phone's banners follow the switches too (push.ts); a no-op in a
  // browser.
  function toggleNotif() {
    setNotificationPrefs({ enabled: !notif });
    refresh();
    void syncPushDevice();
  }
  function toggleNotifType(key: NotifTypeKey) {
    setNotificationPrefs({ [key]: notifPrefs[key] === false });
    refresh();
    void syncPushDevice();
  }

  async function logOut() {
    if (isSupabaseConfigured()) {
      // Navigation happens through lib/session.ts's own auth-state
      // listener once this resolves, same as every other real sign-out in
      // this app — nothing to navigate to here.
      await signOut();
      return;
    }
    nav('clientAuth');
  }

  function confirmDelete() {
    if (deleteBusy) return;

    if (!remote) {
      requestAccountDeletion(CLIENT_ID);
      setShowDeleteConfirm(false);
      nav('clientAuth');
      return;
    }

    // Real path: files account_deletion_requests and signs out, through
    // the same logOut() the rest of this screen uses. Deliberately does
    // not also run mockStore's requestAccountDeletion (which anonymizes
    // the mock 'sara' record immediately) — that local demo record isn't
    // this real signed-in account, and processing a real request is the
    // admin queue's job (supabase/README.md), not something filing it does.
    setDeleteBusy(true);
    setDeleteError(false);
    void fileAccountDeletionRequest().then((result) => {
      setDeleteBusy(false);
      if (result.ok || result.code === 'already_pending') {
        setShowDeleteConfirm(false);
        void logOut();
      } else {
        setDeleteError(true);
      }
    });
  }

  const notifTypeDefs: { key: NotifTypeKey; label: string }[] = [
    { key: 'session', label: t('clientProfileNotifSession') },
    { key: 'task', label: t('clientProfileNotifTask') },
    { key: 'messages', label: t('clientProfileNotifMessages') },
  ];

  return (
    <div className="phone-frame client-profile-screen">
      <div className="client-profile-header">
        <div className="client-profile-title">{t('clientProfileTitle')}</div>
      </div>

      <div className="client-profile-body">
        <div className="client-profile-hero">
          <button type="button" className="client-profile-edit-btn" aria-label={t('clientProfileEditProfile')} onClick={() => nav('editClientProfile')}>
            <PencilIcon size={14} />
          </button>
          <div className="client-profile-avatar" style={{ background: avatarGrad }}>
            {memberInitials || '?'}
          </div>
          <div>
            <div className="client-profile-name"><bdi>{contact.fullName}</bdi></div>
            {memberOf && <div className="client-profile-member-of">{memberOf}</div>}
          </div>
          {contact.phone && (
            <div className="client-profile-phone" dir="ltr">
              {contact.countryCode} {contact.phone}
            </div>
          )}
        </div>

        {!rel && <NoCoachYet />}
        {rel && (
        <>

        <button type="button" className="client-profile-card" onClick={() => nav('clientHome')}>
          <div className="client-profile-ring">
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="26" cy="26" r={RING_R} fill="none" stroke="var(--line)" strokeWidth="5" />
              <circle cx="26" cy="26" r={RING_R} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={RING_CIRC} strokeDashoffset={ringOffset} />
            </svg>
            <div className="client-profile-ring-pct">{progress}%</div>
          </div>
          <div className="client-profile-card-text">
            <div className="client-profile-card-eyebrow">{t('clientProfileGoalProgress')}</div>
            {goalDisplay && <div className="client-profile-card-title"><bdi>{goalDisplay}</bdi></div>}
          </div>
          <ArrowForwardIcon size={14} color="var(--ink-soft)" />
        </button>

        <button
          type="button"
          className="client-profile-card"
          onClick={() => nav('myCoaches')}
        >
          <div className="client-profile-coach-avatar" style={{ background: coachGrad }}>
            {coachInitials}
          </div>
          <div className="client-profile-card-text">
            <div className="client-profile-card-eyebrow">{t('clientProfileYourPro')}</div>
            <div className="client-profile-coach-name"><bdi>{coachName}</bdi></div>
            <div className="client-profile-coach-specialty"><bdi>{coachSpecialty}</bdi></div>
          </div>
          <ArrowForwardIcon size={14} color="var(--ink-soft)" />
        </button>

        <div className="client-profile-quick-row">
          <button
            type="button"
            className="client-profile-quick-card"
            onClick={() => nav('clientSchedule')}
          >
            <ScheduleIcon size={17} color="var(--accent)" />
            <div className="client-profile-quick-label">{t('clientProfileSessionsQuick')}</div>
            <div className="client-profile-quick-value">{nextSessionQuick}</div>
          </button>
          <button
            type="button"
            className="client-profile-quick-card"
            onClick={() => nav('clientTasks')}
          >
            <TasksIcon size={17} color="var(--accent)" />
            <div className="client-profile-quick-label">{t('clientProfileTasksQuick')}</div>
            <div className="client-profile-quick-value">{tasksQuickText}</div>
          </button>
        </div>

        <button
          type="button"
          className="client-profile-card"
          onClick={() => nav('clientCoach')}
        >
          <div className="client-profile-payment-icon" style={{ background: paymentState.bg }}>
            <PaymentIcon size={16} color={paymentState.color} />
          </div>
          <div className="client-profile-card-text">
            <div className="client-profile-payment-title" style={{ color: paymentState.color }}>
              {paymentState.label}
            </div>
            <div className="client-profile-card-sub">{t('clientProfilePlanLabel', { plan: client?.plan || 'Basic' })}</div>
          </div>
          <ArrowForwardIcon size={14} color="var(--ink-soft)" />
        </button>
        </>
        )}

        {demoAgreement && (
          <AgreementCard
            titleKey={demoAgreementInfo.titleKey}
            bodyKey={demoAgreementInfo.bodyKey}
            signedAtMs={demoAgreement.status === 'signed' ? demoAgreement.at ?? 0 : null}
            onSign={signDemoAgreement}
          />
        )}
        {remote && client && <MemberAgreement clientId={client.id} coachTitle={coachSpecialty} />}

        <div className="client-profile-section">
          <div className="client-profile-section-label">{t('profilePreferences')}</div>
          <div className="client-profile-row client-profile-row-static">
            <div className="client-profile-row-title">{t('profileLanguage')}</div>
            <div className="client-profile-lang-toggle">
              <button type="button" className={`client-profile-lang-pill${lang === 'ar' ? ' is-active' : ''}`} onClick={() => setLang('ar')}>
                العربية
              </button>
              <button type="button" className={`client-profile-lang-pill${lang === 'en' ? ' is-active' : ''}`} onClick={() => setLang('en')}>
                English
              </button>
            </div>
          </div>
          <div className="client-profile-row client-profile-row-static">
            <div className="client-profile-toggle-label">
              {dark ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z" />
                </svg>
              )}
              <div className="client-profile-row-title">{t('profileDarkMode')}</div>
            </div>
            <button type="button" className={`client-profile-switch${dark ? ' is-on' : ''}`} onClick={() => setDark(!dark)}>
              <span className="client-profile-switch-thumb" />
            </button>
          </div>
          <div className="client-profile-notif-card">
            <div className="client-profile-notif-main">
              <div className="client-profile-row-title">{t('profileNotifications')}</div>
              <button type="button" className={`client-profile-switch${notif ? ' is-on' : ''}`} onClick={toggleNotif}>
                <span className="client-profile-switch-thumb" />
              </button>
            </div>
            <div className="client-profile-notif-scope">{t(phone ? 'notifScopePhone' : 'notifInAppOnly')}</div>
            {notif &&
              notifTypeDefs.map((nt) => (
                <div className="client-profile-notif-sub-row" key={nt.key}>
                  <div className="client-profile-notif-sub-label">{nt.label}</div>
                  <button
                    type="button"
                    className={`client-profile-switch${notifPrefs[nt.key] !== false ? ' is-on' : ''}`}
                    onClick={() => toggleNotifType(nt.key)}
                  >
                    <span className="client-profile-switch-thumb" />
                  </button>
                </div>
              ))}
            {notif && <PushPhoneRow state={push.state} onTurnOn={push.turnOn} className="client-profile-push-row" />}
          </div>
        </div>

        <div className="client-profile-support">
          <button
            type="button"
            className="client-profile-help"
            onClick={() => nav('clientHelpCenter')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 0 1 4.7 1.2c0 1.5-2 1.8-2.2 3.3" />
              <path d="M12 17h.01" />
            </svg>
            <div className="client-profile-help-label">{t('profileGetHelp')}</div>
            <ArrowForwardIcon size={14} color="var(--ink-soft)" />
          </button>
          <button
            type="button"
            className="client-profile-help"
            onClick={() => openExternal(supportMailto(t('supportEmailSubject')))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            <div className="client-profile-help-label">
              {t('profileContactUs')}
              {/* Shown as well as linked: with no mail app installed the tap does nothing. */}
              <div className="client-profile-help-sub"><bdi>{SUPPORT_EMAIL}</bdi></div>
            </div>
            <ArrowForwardIcon size={14} color="var(--ink-soft)" />
          </button>
        </div>

        <button type="button" className="client-profile-logout" onClick={logOut}>
          {t('profileLogOut')}
        </button>

        <div className="client-profile-footer-links">
          <button type="button" onClick={() => nav('clientPrivacyPolicy')}>
            {t('profilePrivacyPolicy')}
          </button>
          <span className="client-profile-footer-dot">·</span>
          <button type="button" onClick={() => nav('clientTermsOfService')}>
            {t('profileTermsOfService')}
          </button>
          <span className="client-profile-footer-dot">·</span>
          <button type="button" onClick={() => setShowDeleteConfirm(true)}>
            {t('profileDeleteAccount')}
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="client-profile-modal-backdrop">
          <div className="client-profile-modal-card">
            <div className="client-profile-modal-icon">
              <WarningIcon size={20} color="var(--red)" />
            </div>
            {obligations.blocked ? (
              <>
                <div className="client-profile-modal-title">{t('profileDeleteBlockedTitle')}</div>
                <div className="client-profile-modal-body">{obligationsSummary}</div>
                <button type="button" className="client-profile-modal-btn client-profile-modal-btn-neutral" onClick={() => setShowDeleteConfirm(false)}>
                  {t('profileGotIt')}
                </button>
              </>
            ) : (
              <>
                <div className="client-profile-modal-title">{t('profileDeleteConfirmTitle')}</div>
                <div className="client-profile-modal-body">{deleteBody}</div>
                {deleteError && <div className="client-profile-modal-error">{t('requestFailedRetry')}</div>}
                <div className="client-profile-modal-actions">
                  <button type="button" className="client-profile-modal-btn client-profile-modal-btn-neutral" onClick={() => setShowDeleteConfirm(false)} disabled={deleteBusy}>
                    {t('profileCancel')}
                  </button>
                  <button type="button" className="client-profile-modal-btn client-profile-modal-btn-danger" onClick={confirmDelete} disabled={deleteBusy}>
                    {deleteBusy ? t('submittingEllipsis') : t('profileDelete')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <MemberTabBar />
    </div>
  );
}

/**
 * The signed-in member's agreement with their current coach (0028): shown
 * once the coach has sent it, in the app's language, for the coach's
 * specialty. The signature records the exact text and language shown.
 */
function MemberAgreement({ clientId, coachTitle }: { clientId: string; coachTitle: string }) {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const load = useRemoteLoad(`agreement:${clientId}`, true, () => fetchAgreement(clientId));
  if (load.status === 'loading') return null;
  if (load.status === 'error') {
    return (
      <div className="client-profile-agreement-card client-profile-agreement-failed" role="alert">
        <span>{t('agreementLoadFailed')}</span>
        <button type="button" onClick={load.retry}>{t('retry')}</button>
      </div>
    );
  }
  const agreement = load.data;
  if (agreement.status === 'none') return null;
  const info = getAgreementInfoForTitle(coachTitle);
  const ready = load;
  async function sign(): Promise<boolean> {
    const result = await signAgreement({
      clientId,
      category: info.category,
      title: t(info.titleKey),
      body: t(info.bodyKey),
      lang: lang === 'ar' ? 'ar' : 'en',
    });
    if (!result.ok) return false;
    ready.set(result.data);
    return true;
  }
  return (
    <AgreementCard
      titleKey={info.titleKey}
      bodyKey={info.bodyKey}
      signedAtMs={agreement.status === 'signed' ? agreement.signedAtMs : null}
      onSign={sign}
    />
  );
}
