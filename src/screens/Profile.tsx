import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { ArrowForwardIcon, PencilIcon, ShareIcon, EyeIcon, ShieldIcon, StarIcon, CloseIcon, WarningIcon, MessageIcon, PaymentIcon, ScheduleIcon, PersonIcon, HomeIcon, ClientsIcon } from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import { QuickActions } from '../components/QuickActions';
import {
  getClients,
  getCoachProfile,
  getProActiveObligations,
  getProAggregateRating,
  getUnreadMessageCount,
  getVerificationStatus,
  isCredentialVerified,
  isVerified,
  requestProAccountDeletion,
  requestVerification,
} from '../lib/mockStore';
import './Profile.css';

// Matches tokens.css's --accent — darken() needs a literal hex, not the
// CSS custom property, for the hero's gradient fallback (no cover photo).
const ACCENT_HEX = '#B75C3D';

const NOTIF_TYPE_KEYS = ['sessions', 'checkins', 'payments'] as const;
type NotifTypeKey = (typeof NOTIF_TYPE_KEYS)[number];

// 1:1 port of Profile.dc.html — the coach's account hub. Notification
// toggles are local-only state here, exactly like the design (its own
// renderVals() never persists them through the store either), so they
// reset on every visit rather than sticking.
export default function Profile() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  // Bumped after a mutation (verification request, account deletion) to
  // force the derived reads below to recompute from localStorage —
  // mockStore is plain functions over localStorage, not reactive state.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRateExpand, setShowRateExpand] = useState(false);
  const [rafiqRating, setRafiqRating] = useState(0);
  const [showSupportToast, setShowSupportToast] = useState(false);
  const [supportToastMsg, setSupportToastMsg] = useState('');
  const [notif, setNotif] = useState(true);
  const [notifSub, setNotifSub] = useState<Record<NotifTypeKey, boolean>>({ sessions: true, checkins: true, payments: true });

  const profile = getCoachProfile();
  const avatarInitials = profile.name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'YE';
  const hasAvatarPhoto = !!profile.avatarPhotoUrl;
  const heroBackground = profile.coverPhotoUrl
    ? `linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.68) 100%), url('${profile.coverPhotoUrl}') center/cover no-repeat`
    : `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 45)} 100%)`;
  const specialtyChips = (profile.title || 'Life coaching').split(' · ').filter(Boolean);
  const hasBio = !!(profile.bio && profile.bio.trim());

  const verificationStatus = getVerificationStatus();
  const credentialVerified = isCredentialVerified();
  const verificationSub =
    verificationStatus === 'verified' ? t('profileVerificationSubVerified') : verificationStatus === 'pending' ? t('profileVerificationSubPending') : t('profileVerificationSubUnverified');
  const verificationBadgeLabel =
    verificationStatus === 'verified' ? t('profileVerificationBadgeVerified') : verificationStatus === 'pending' ? t('profileVerificationBadgePending') : t('profileVerificationBadgeUnverified');
  const verificationBadgeColor = verificationStatus === 'verified' ? 'var(--green)' : verificationStatus === 'pending' ? 'var(--amber)' : 'var(--ink-soft)';
  const verificationBadgeBg = verificationStatus === 'verified' ? 'var(--green-bg)' : verificationStatus === 'pending' ? 'var(--amber-bg)' : 'var(--line)';

  const pro = isVerified();
  const subscriptionSub = pro ? t('profileSubscriptionSubPro') : t('profileSubscriptionSubFree');
  const subscriptionBadge = pro ? t('profileSubscriptionBadgePro') : t('profileSubscriptionBadgeFree');

  const aggRating = getProAggregateRating();
  const ratingLabel = aggRating.average.toFixed(1);
  const reviewsCountLabel = String(aggRating.count);

  const obligations = getProActiveObligations();
  const obligationParts: string[] = [];
  if (obligations.totalUnusedCredits > 0) obligationParts.push(t('profileObligationCredits', { n: obligations.totalUnusedCredits }));
  if (obligations.clientsWithUpcomingSessions > 0) obligationParts.push(t('profileObligationSessions', { n: obligations.clientsWithUpcomingSessions }));
  if (obligations.openDisputesCount > 0) obligationParts.push(t('profileObligationDisputes', { n: obligations.openDisputesCount }));
  const obligationsSummary = obligationParts.length ? `${t('profileDeleteBlockedIntro')} ${obligationParts.join(isAr ? '، ' : ', ')}.` : '';

  const clients = getClients();
  const activeRoster = clients.filter((c) => c.active);
  const activeCount = activeRoster.length;
  const completionPct = activeRoster.length ? Math.round(activeRoster.reduce((sum, c) => sum + c.progress, 0) / activeRoster.length) : 0;

  const totalUnread = clients.reduce((sum, c) => sum + getUnreadMessageCount(c.id, 'pro'), 0);
  const hasUnreadMessages = totalUnread > 0;
  const totalUnreadLabel = totalUnread > 9 ? '9+' : String(totalUnread);

  const completenessChecks = [!!(profile.title && profile.title.trim()), !!(profile.cert && profile.cert.trim()), hasBio, !!(profile.phone && profile.phone.trim())];
  const completenessDone = completenessChecks.filter(Boolean).length;
  const completenessTotal = completenessChecks.length;
  const profileCompletionPct = Math.round((completenessDone / completenessTotal) * 100);
  const showCompletenessBanner = profileCompletionPct < 100;
  const completenessCirc = 2 * Math.PI * 14;
  const completenessDash = `${((completenessCirc * profileCompletionPct) / 100).toFixed(1)} ${completenessCirc.toFixed(1)}`;
  const missingCount = completenessTotal - completenessDone;
  const completenessSub = missingCount === 1 ? t('profileCompletenessMissingOne') : t('profileCompletenessMissingMany', { n: missingCount });

  function tapVerification() {
    if (verificationStatus === 'unverified') {
      requestVerification();
      setSupportToastMsg(t('profileVerificationRequestedToast'));
      setShowSupportToast(true);
      refresh();
    }
  }

  function toggleNotifType(key: NotifTypeKey) {
    setNotifSub((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function confirmDelete() {
    requestProAccountDeletion();
    setShowDeleteConfirm(false);
    nav({ screen: 'comingSoon', params: { feature: 'auth' } }); // TODO: route to 'auth' once Auth.dc.html is ported
  }

  const notifTypeDefs: { key: NotifTypeKey; label: string }[] = [
    { key: 'sessions', label: t('profileNotifSessions') },
    { key: 'checkins', label: t('profileNotifCheckins') },
    { key: 'payments', label: t('profileNotifPayments') },
  ];

  const navItems: BottomNavItem[] = [
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'main' },
    // TODO: route to 'clients' once Clients.dc.html is ported
    { key: 'clients', label: t('mainClientsNav'), icon: ClientsIcon, screen: 'comingSoon', params: { feature: 'clients' } },
    // TODO: route to 'messagesInbox' once MessagesInbox.dc.html is ported
    { key: 'messages', label: t('mainMessagesNav'), icon: MessageIcon, screen: 'comingSoon', params: { feature: 'messagesInbox' } },
    { key: 'quickActions', label: t('quickActionsTitle'), render: () => <QuickActions context="profile" /> },
    // TODO: route to 'schedule' once Schedule.dc.html is ported
    { key: 'schedule', label: t('mainSchedule'), icon: ScheduleIcon, screen: 'comingSoon', params: { feature: 'schedule' } },
    { key: 'profile', label: t('mainProfileNav'), icon: PersonIcon, screen: 'profile' },
  ];

  return (
    <div className="phone-frame profile-screen">
      <div className="profile-hero" style={{ background: heroBackground }}>
        <div className="profile-hero-top">
          <div className="profile-avatar-wrap">
            {hasAvatarPhoto ? (
              <img src={profile.avatarPhotoUrl} alt="" className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar-fallback">{avatarInitials}</div>
            )}
            <button type="button" aria-label="Edit profile" className="profile-avatar-edit-btn" onClick={() => nav('editProfile')}>
              <PencilIcon size={11} color="var(--accent)" />
            </button>
          </div>
          <div className="profile-hero-info">
            <div className="profile-name-row">
              <div className="profile-name">{profile.name}</div>
              {credentialVerified && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" stroke="none" aria-label="Verified pro">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9 12.5l2 2 4-4.5" stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              )}
            </div>
            <div className="profile-specialty-chips">
              {specialtyChips.map((label) => (
                <div className="profile-specialty-chip" key={label}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 7h-3V5.5A2.5 2.5 0 0 0 14.5 3h-5A2.5 2.5 0 0 0 7 5.5V7H4a1 1 0 0 0-1 1v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1z" />
                  </svg>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="profile-badge-row">
              <div className="profile-cert-badge">{profile.cert}</div>
              {aggRating.hasEnoughReviews ? (
                <div className="profile-rating-badge">
                  <StarIcon size={9} color="var(--accent)" />
                  {ratingLabel}
                </div>
              ) : (
                <div className="profile-badge-soft">{t('profileNotEnoughReviews')}</div>
              )}
            </div>
          </div>
        </div>

        {hasBio && <div className="profile-bio">{profile.bio}</div>}

        <div className="profile-stats-row">
          <div className="profile-stat">
            <div className="profile-stat-num">{reviewsCountLabel}</div>
            <div className="profile-stat-label">{t('profileReviews')}</div>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat">
            <div className="profile-stat-num">{activeCount}</div>
            <div className="profile-stat-label">{t('profileActiveMembers')}</div>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat">
            <div className="profile-stat-num">{completionPct}%</div>
            <div className="profile-stat-label">{t('profileCompletion')}</div>
          </div>
        </div>
      </div>

      <div className="profile-quick-actions">
        <button type="button" className="profile-quick-btn" onClick={() => nav({ screen: 'comingSoon', params: { feature: 'previewProfile' } })}>
          <EyeIcon size={15} color="var(--accent)" />
          <span>{t('profilePreview')}</span>
        </button>
        <div className="profile-quick-divider" />
        <button type="button" className="profile-quick-btn" onClick={() => nav({ screen: 'comingSoon', params: { feature: 'shareProfile' } })}>
          <ShareIcon size={14} />
          <span>{t('profileShare')}</span>
        </button>
        <div className="profile-quick-divider" />
        <button type="button" className="profile-quick-btn" onClick={() => nav('editProfile')}>
          <PencilIcon size={13} />
          <span>{t('profileEdit')}</span>
        </button>
      </div>

      {showCompletenessBanner && (
        <button type="button" className="profile-completeness-banner" onClick={() => nav('editProfile')}>
          <div className="profile-completeness-ring">
            <svg width="34" height="34" viewBox="0 0 34 34" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="17" cy="17" r="14" fill="none" stroke="var(--line)" strokeWidth={4} />
              <circle cx="17" cy="17" r="14" fill="none" stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" strokeDasharray={completenessDash} />
            </svg>
            <div className="profile-completeness-pct">{profileCompletionPct}%</div>
          </div>
          <div className="profile-completeness-text">
            <div className="profile-completeness-title">{t('profileCompletenessTitle')}</div>
            <div className="profile-completeness-sub">{completenessSub}</div>
          </div>
          <ArrowForwardIcon size={14} color="var(--accent)" />
        </button>
      )}

      <div className="profile-body">
        <div className="profile-section">
          <div className="profile-section-label">{t('profileAccount')}</div>
          <button type="button" className="profile-row" onClick={() => nav('accountDetails')}>
            <PersonIcon size={17} color="var(--accent)" />
            <div className="profile-row-text">
              <div className="profile-row-title">{t('profileAccountDetails')}</div>
              <div className="profile-row-sub">{t('profileManageAccount')}</div>
            </div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
          <button type="button" className="profile-row" onClick={() => nav('subscription')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9 12.5l2 2 4-4.5" />
            </svg>
            <div className="profile-row-text">
              <div className="profile-row-title">{t('profileSubscription')}</div>
              <div className="profile-row-sub">{subscriptionSub}</div>
            </div>
            <div className="profile-row-badge">{subscriptionBadge}</div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
          <button type="button" className="profile-row" onClick={tapVerification}>
            <ShieldIcon size={17} color="var(--accent)" />
            <div className="profile-row-text">
              <div className="profile-row-title">{t('profileVerification')}</div>
              <div className="profile-row-sub">{verificationSub}</div>
            </div>
            <div className="profile-row-badge" style={{ color: verificationBadgeColor, background: verificationBadgeBg }}>
              {verificationBadgeLabel}
            </div>
          </button>
        </div>

        <div className="profile-section">
          <div className="profile-section-label">{t('profileCoaching')}</div>
          <button type="button" className="profile-row" onClick={() => nav('offerings')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.5 8L12 2 3.5 8v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2z" />
              <path d="M9 22V12h6v10" />
            </svg>
            <div className="profile-row-text">
              <div className="profile-row-title">{t('profileOfferings')}</div>
              <div className="profile-row-sub">{t('profileOfferingsSub')}</div>
            </div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
          <button type="button" className="profile-row" onClick={() => nav({ screen: 'comingSoon', params: { feature: 'templates' } })}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h16M4 12h16M4 19h9" />
            </svg>
            <div className="profile-row-text">
              <div className="profile-row-title">{t('profileSessionTemplates')}</div>
              <div className="profile-row-sub">{t('profileSessionTemplatesSub')}</div>
            </div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
          <button type="button" className="profile-row" onClick={() => nav('earnings')}>
            <PaymentIcon size={17} color="var(--accent)" />
            <div className="profile-row-text">
              <div className="profile-row-title">{t('profileEarnings')}</div>
              <div className="profile-row-sub">{t('profileEarningsSub')}</div>
            </div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
          <button type="button" className="profile-row" onClick={() => nav({ screen: 'comingSoon', params: { feature: 'availability' } })}>
            <ScheduleIcon size={17} color="var(--accent)" />
            <div className="profile-row-text">
              <div className="profile-row-title">{t('profileAvailability')}</div>
              <div className="profile-row-sub">{t('profileAvailabilitySub')}</div>
            </div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
          <button type="button" className="profile-row" onClick={() => nav({ screen: 'comingSoon', params: { feature: 'messagesInbox' } })}>
            <MessageIcon size={17} color="var(--accent)" />
            <div className="profile-row-text">
              <div className="profile-row-title">{t('profileMessages')}</div>
              <div className="profile-row-sub">{t('profileMessagesSub')}</div>
            </div>
            {hasUnreadMessages && <div className="profile-row-badge profile-row-badge-red">{totalUnreadLabel}</div>}
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
        </div>

        <div className="profile-section">
          <div className="profile-section-label">{t('profilePreferences')}</div>
          <div className="profile-row profile-row-static">
            <div className="profile-row-title">{t('profileLanguage')}</div>
            <div className="profile-lang-toggle">
              <button type="button" className={`profile-lang-pill${lang === 'ar' ? ' is-active' : ''}`} onClick={() => setLang('ar')}>
                العربية
              </button>
              <button type="button" className={`profile-lang-pill${lang === 'en' ? ' is-active' : ''}`} onClick={() => setLang('en')}>
                English
              </button>
            </div>
          </div>
          <div className="profile-row profile-row-static">
            <div className="profile-toggle-label">
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
              <div className="profile-row-title">{t('profileDarkMode')}</div>
            </div>
            <button type="button" className={`profile-switch${dark ? ' is-on' : ''}`} onClick={() => setDark(!dark)}>
              <span className="profile-switch-thumb" />
            </button>
          </div>
          <div className="profile-notif-card">
            <div className="profile-notif-main">
              <div className="profile-row-title">{t('profileNotifications')}</div>
              <button type="button" className={`profile-switch${notif ? ' is-on' : ''}`} onClick={() => setNotif((v) => !v)}>
                <span className="profile-switch-thumb" />
              </button>
            </div>
            {notif &&
              notifTypeDefs.map((nt) => (
                <div className="profile-notif-sub-row" key={nt.key}>
                  <div className="profile-notif-sub-label">{nt.label}</div>
                  <button type="button" className={`profile-switch${notifSub[nt.key] ? ' is-on' : ''}`} onClick={() => toggleNotifType(nt.key)}>
                    <span className="profile-switch-thumb" />
                  </button>
                </div>
              ))}
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-label">{t('profileSupportRafiq')}</div>
          <div className="profile-support-card">
            <button type="button" className="profile-support-row" onClick={() => setShowRateExpand((v) => !v)}>
              <StarIcon size={17} color="var(--accent)" />
              <div className="profile-support-title">{t('profileRateRafiq')}</div>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--ink-soft)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: `rotate(${showRateExpand ? '180deg' : '0deg'})`, transition: 'transform .15s' }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showRateExpand && (
              <div className="profile-rate-expand">
                <div className="profile-rate-stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" aria-label="Rate star" onClick={() => setRafiqRating(n)}>
                      <StarIcon size={24} color="var(--amber)" filled={n <= rafiqRating} />
                    </button>
                  ))}
                </div>
                {rafiqRating > 0 && <div className="profile-rate-thanks">{t('profileThanksRating')}</div>}
              </div>
            )}
            <div className="profile-support-divider" />
            <button
              type="button"
              className="profile-support-row"
              onClick={() => {
                setSupportToastMsg(t('profileCoffeeToast'));
                setShowSupportToast(true);
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z" />
                <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
                <path d="M8 3.5c-.5 1 .5 1.5 0 2.5M12 3.5c-.5 1 .5 1.5 0 2.5" />
              </svg>
              <div className="profile-support-title">{t('profileBuyCoffee')}</div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <path d="M15 3h6v6" />
                <path d="M10 14L21 3" />
              </svg>
            </button>
            <div className="profile-support-divider" />
            <button
              type="button"
              className="profile-support-row"
              onClick={() => {
                setSupportToastMsg(t('profileContactToast'));
                setShowSupportToast(true);
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.8 2.1z" />
              </svg>
              <div className="profile-support-title">{t('profileContactUs')}</div>
              <ArrowForwardIcon size={15} color="var(--ink-soft)" />
            </button>
            <div className="profile-support-divider" />
            <button type="button" className="profile-support-row" onClick={() => nav({ screen: 'comingSoon', params: { feature: 'helpCenter' } })}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.4" />
                <path d="M12 17h.01" />
              </svg>
              <div className="profile-support-title">{t('profileGetHelp')}</div>
              <ArrowForwardIcon size={15} color="var(--ink-soft)" />
            </button>
          </div>
        </div>

        <button type="button" className="profile-logout" onClick={() => nav({ screen: 'comingSoon', params: { feature: 'auth' } })}>
          {t('profileLogOut')}
        </button>

        <div className="profile-footer-links">
          <button type="button" onClick={() => nav({ screen: 'comingSoon', params: { feature: 'privacyPolicy' } })}>
            {t('profilePrivacyPolicy')}
          </button>
          <span className="profile-footer-dot">·</span>
          <button type="button" onClick={() => nav({ screen: 'comingSoon', params: { feature: 'termsOfService' } })}>
            {t('profileTermsOfService')}
          </button>
          <span className="profile-footer-dot">·</span>
          <button type="button" onClick={() => setShowDeleteConfirm(true)}>
            {t('profileDeleteAccount')}
          </button>
        </div>
      </div>

      <BottomNav items={navItems} />

      {showDeleteConfirm && (
        <div className="profile-modal-backdrop">
          <div className="profile-modal-card">
            <div className="profile-modal-icon">
              <WarningIcon size={20} color="var(--red)" />
            </div>
            {obligations.blocked ? (
              <>
                <div className="profile-modal-title">{t('profileDeleteBlockedTitle')}</div>
                <div className="profile-modal-body">{obligationsSummary}</div>
                <button type="button" className="profile-modal-btn profile-modal-btn-neutral" onClick={() => setShowDeleteConfirm(false)}>
                  {t('profileGotIt')}
                </button>
              </>
            ) : (
              <>
                <div className="profile-modal-title">{t('profileDeleteConfirmTitle')}</div>
                <div className="profile-modal-body">{t('profileDeleteConfirmBody')}</div>
                <div className="profile-modal-actions">
                  <button type="button" className="profile-modal-btn profile-modal-btn-neutral" onClick={() => setShowDeleteConfirm(false)}>
                    {t('profileCancel')}
                  </button>
                  <button type="button" className="profile-modal-btn profile-modal-btn-danger" onClick={confirmDelete}>
                    {t('profileDelete')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSupportToast && (
        <div className="profile-toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <div className="profile-toast-text">{supportToastMsg}</div>
          <button type="button" aria-label="Dismiss" className="profile-toast-close" onClick={() => setShowSupportToast(false)}>
            <CloseIcon size={12} color="#FFFFFF" />
          </button>
        </div>
      )}
    </div>
  );
}
