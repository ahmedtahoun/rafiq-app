import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { ChevronIcon, PencilIcon, ArrowForwardIcon, ScheduleIcon, TasksIcon, PaymentIcon, WarningIcon } from '../components/icons';
import { signOut } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  getClient,
  getCoachProfile,
  getTasks,
  getAgreementInfo,
  getAgreement,
  setAgreementStatus,
  getNotificationPrefs,
  setNotificationPrefs,
  getMemberActiveObligations,
  requestAccountDeletion,
} from '../lib/mockStore';
import './ClientProfile.css';

const CLIENT_ID = 'sara';
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
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);

  const [showAgreementExpand, setShowAgreementExpand] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Bumped after a mutation (sign agreement, toggle notif prefs, delete) to
  // force the derived reads below to recompute from localStorage —
  // mockStore is plain functions over localStorage, not reactive state.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const client = getClient(CLIENT_ID);
  const coachProfile = getCoachProfile();
  const coachName = coachProfile.name || 'Yasmin El-Sayed';
  const coachSpecialty = coachProfile.title || 'Life coaching';
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const clientColor = client?.avatarBg || ACCENT_HEX;
  const avatarGrad = `linear-gradient(135deg, ${clientColor} 0%, ${darken(clientColor, 35)} 100%)`;
  const coachGrad = `linear-gradient(135deg, ${ACCENT_HEX} 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  const progress = client?.progress ?? 63;
  const ringOffset = RING_CIRC * (1 - progress / 100);
  const goalDisplay = client?.goal || t('clientHomeGoalFallback');

  const nextSessionRaw = client?.nextSession || '';
  const hasNextSession = !!nextSessionRaw && nextSessionRaw !== 'No upcoming session' && nextSessionRaw !== 'Program completed';
  const nextSessionQuick = hasNextSession ? nextSessionRaw.replace(/^Next:\s*/, '') : t('clientProfileNoSessionLabel');

  const pendingTaskCount = getTasks(CLIENT_ID).filter((tk) => !tk.done).length;
  const tasksQuickText = pendingTaskCount > 0 ? t('clientProfileTasksPending', { n: pendingTaskCount }) : t('clientProfileTasksDone');

  const paymentStates = {
    paid: { label: t('clientProfilePaymentPaid'), color: 'var(--green)', bg: 'var(--green-bg)' },
    due: { label: t('clientProfilePaymentDue'), color: 'var(--amber)', bg: 'var(--amber-bg)' },
    overdue: { label: t('clientProfilePaymentOverdue'), color: 'var(--red)', bg: 'var(--red-bg)' },
  } as const;
  const paymentState = paymentStates[client?.paymentStatus ?? 'due'];

  const agreementInfo = getAgreementInfo(client?.specialty ?? '');
  const agreement = getAgreement(CLIENT_ID);
  const isAgreementSigned = agreement.status === 'signed';
  const agreementStatusLabel = isAgreementSigned ? t('clientProfileAgreementSigned') : t('clientProfileAgreementAwaiting');
  const agreementColor = isAgreementSigned ? 'var(--green)' : 'var(--ink-soft)';
  const agreementBg = isAgreementSigned ? 'var(--green-bg)' : 'var(--accent-soft)';

  const notifPrefs = getNotificationPrefs();
  const notif = notifPrefs.enabled;

  const obligations = getMemberActiveObligations(CLIENT_ID);
  const obligationParts: string[] = [];
  if (obligations.hasUnusedCredits) obligationParts.push(t('clientProfileObligationCredits', { n: obligations.remainingCredits }));
  if (obligations.hasUpcomingSession) obligationParts.push(t('clientProfileObligationSession'));
  if (obligations.openDisputesCount > 0) obligationParts.push(t('profileObligationDisputes', { n: obligations.openDisputesCount }));
  const obligationsSummary = obligationParts.length
    ? `${t('profileDeleteBlockedIntro')} ${obligationParts.join(lang === 'ar' ? '، ' : ', ')}.`
    : '';
  const deleteBody = t('clientProfileDeleteBody', { coach: coachName });
  const memberOf = t('clientProfileMemberOf', { coach: coachName });

  function signAgreement() {
    setAgreementStatus(CLIENT_ID, 'signed');
    refresh();
  }

  function toggleNotif() {
    setNotificationPrefs({ enabled: !notif });
    refresh();
  }
  function toggleNotifType(key: NotifTypeKey) {
    setNotificationPrefs({ [key]: notifPrefs[key] === false });
    refresh();
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
    requestAccountDeletion(CLIENT_ID);
    setShowDeleteConfirm(false);
    nav('clientAuth');
  }

  const notifTypeDefs: { key: NotifTypeKey; label: string }[] = [
    { key: 'session', label: t('clientProfileNotifSession') },
    { key: 'task', label: t('clientProfileNotifTask') },
    { key: 'messages', label: t('clientProfileNotifMessages') },
  ];

  return (
    <div className="phone-frame client-profile-screen">
      <div className="client-profile-header">
        <button type="button" className="client-profile-back" aria-label={t('backToHome')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="client-profile-title">{t('clientProfileTitle')}</div>
      </div>

      <div className="client-profile-body">
        <div className="client-profile-hero">
          <button type="button" className="client-profile-edit-btn" aria-label={t('clientProfileEditProfile')} onClick={() => nav('editClientProfile')}>
            <PencilIcon size={14} />
          </button>
          <div className="client-profile-avatar" style={{ background: avatarGrad }}>
            {client?.initials || 'SA'}
          </div>
          <div>
            <div className="client-profile-name">{client?.name || t('clientHomeName')}</div>
            <div className="client-profile-member-of">{memberOf}</div>
          </div>
          <div className="client-profile-phone" dir="ltr">
            {client?.countryCode} {client?.phone}
          </div>
        </div>

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
            <div className="client-profile-card-title">{goalDisplay}</div>
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
            <div className="client-profile-coach-name">{coachName}</div>
            <div className="client-profile-coach-specialty">{coachSpecialty}</div>
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

        <div className="client-profile-agreement-card">
          <button type="button" className="client-profile-agreement-row" onClick={() => setShowAgreementExpand((v) => !v)}>
            <div className="client-profile-agreement-icon" style={{ background: agreementBg }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={agreementColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M9 15l2 2 4-4" />
              </svg>
            </div>
            <div className="client-profile-card-text">
              <div className="client-profile-card-title">{agreementInfo.title}</div>
              <div className="client-profile-agreement-status" style={{ color: agreementColor }}>
                {agreementStatusLabel}
              </div>
            </div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--ink-soft)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: `rotate(${showAgreementExpand ? '180deg' : '0deg'})`, transition: 'transform .15s', flexShrink: 0 }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showAgreementExpand && (
            <div className="client-profile-agreement-expand">
              <div className="client-profile-agreement-body">{agreementInfo.body}</div>
              {!isAgreementSigned && (
                <button type="button" className="client-profile-agreement-sign" onClick={signAgreement}>
                  {t('clientProfileIAgree')}
                </button>
              )}
            </div>
          )}
        </div>

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
          </div>
        </div>

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
                <div className="client-profile-modal-actions">
                  <button type="button" className="client-profile-modal-btn client-profile-modal-btn-neutral" onClick={() => setShowDeleteConfirm(false)}>
                    {t('profileCancel')}
                  </button>
                  <button type="button" className="client-profile-modal-btn client-profile-modal-btn-danger" onClick={confirmDelete}>
                    {t('profileDelete')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
