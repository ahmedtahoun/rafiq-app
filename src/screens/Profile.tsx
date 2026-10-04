import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { ArrowForwardIcon, PencilIcon, EyeIcon, ShieldIcon, StarIcon, CloseIcon, WarningIcon, MessageIcon, PaymentIcon, ScheduleIcon, PersonIcon } from '../components/icons';
import { CoachTabBar } from '../components/TabBars';
import { signOut } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { fileVerificationRequest, fileAccountDeletionRequest } from '../lib/adminQueues';
import { useOwnCoachProfile, type OwnProfileView } from '../store/ownProfileStore';
import { LoadState } from '../components/LoadState';
import { openExternal, storeReviewUrl, supportMailto, SUPPORT_EMAIL } from '../lib/support';
import {
  getClients,
  getProActiveObligations,
  getProAggregateRating,
  getProNotificationPrefs,
  getUnreadMessageCount,
  setProNotificationPrefs,
  requestProAccountDeletion,
  requestVerification,
} from '../lib/mockStore';
import { usePlan } from '../lib/planData';
import { MIN_REVIEWS_FOR_RATING } from '../lib/mockStore';
import { fetchOwnCoachStats } from '../lib/coachStatsData';
import { fetchInbox } from '../lib/messageData';
import { useRemoteLoad } from '../store/remoteLoad';
import { useRoster } from '../store/rosterStore';
import './Profile.css';

// Matches tokens.css's --accent — darken() needs a literal hex, not the
// CSS custom property, for the hero's gradient fallback (no cover photo).
const ACCENT_HEX = '#B75C3D';

// No 'checkins': ProNotificationKind has no check-in notification, so the
// row the design gave it controlled nothing. See ProNotificationPrefs.
const NOTIF_TYPE_KEYS = ['sessions', 'payments'] as const;
type NotifTypeKey = (typeof NOTIF_TYPE_KEYS)[number];

// 1:1 port of Profile.dc.html — the coach's account hub. Notification
// toggles are local-only state here, exactly like the design (its own
// renderVals() never persists them through the store either), so they
// reset on every visit rather than sticking.
export default function Profile() {
  const own = useOwnCoachProfile();
  if (own.status === 'loading') return <LoadState status="loading" />;
  if (own.status === 'error') return <LoadState status="error" onRetry={own.retry} />;
  return <ProfileView own={own} />;
}

function ProfileView({ own }: { own: Extract<OwnProfileView, { status: 'ready' }> }) {
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
  // Disables the verification row / delete button while a real Supabase
  // request is in flight — there is nothing to wait on in the mockStore
  // fallback branch, which stays synchronous.
  const [busy, setBusy] = useState(false);
  const [showSupportToast, setShowSupportToast] = useState(false);
  const [supportToastMsg, setSupportToastMsg] = useState('');

  const reviewUrl = storeReviewUrl();

  const profile = own.profile;
  const avatarInitials = profile.name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'YE';
  const hasAvatarPhoto = !!profile.avatarPhotoUrl;
  const heroBackground = profile.coverPhotoUrl
    ? `linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.68) 100%), url('${profile.coverPhotoUrl}') center/cover no-repeat`
    : `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 45)} 100%)`;
  const specialtyChips = (profile.title || 'Life coaching').split(' · ').filter(Boolean);
  const hasBio = !!(profile.bio && profile.bio.trim());

  const verificationStatus = own.verificationStatus;
  const credentialVerified = verificationStatus === 'verified';
  const verificationSub =
    verificationStatus === 'verified' ? t('profileVerificationSubVerified') : verificationStatus === 'pending' ? t('profileVerificationSubPending') : t('profileVerificationSubUnverified');
  const verificationBadgeLabel =
    verificationStatus === 'verified' ? t('profileVerificationBadgeVerified') : verificationStatus === 'pending' ? t('profileVerificationBadgePending') : t('profileVerificationBadgeUnverified');
  const verificationBadgeColor = verificationStatus === 'verified' ? 'var(--green)' : verificationStatus === 'pending' ? 'var(--amber)' : 'var(--ink-soft)';
  const verificationBadgeBg = verificationStatus === 'verified' ? 'var(--green-bg)' : verificationStatus === 'pending' ? 'var(--amber-bg)' : 'var(--line)';

  const plan = usePlan();
  const pro = plan.status === 'ready' && plan.plan.tier === 'pro';
  const subscriptionSub = pro ? t('profileSubscriptionSubPro') : t('profileSubscriptionSubFree');
  // No badge until the plan is known, rather than "Upgrade" flashing at a Pro.
  const subscriptionBadge = plan.status !== 'ready' ? null : pro ? t('profileSubscriptionBadgePro') : t('profileSubscriptionBadgeFree');

  // Signed in, the numbers are the coach's own: their ratings and open
  // items (coachStatsData.ts), their roster, and their inbox. Until each
  // arrives its figure reads "–" rather than a zero it doesn't know yet;
  // a failed read says so under the figures, with a retry.
  const remote = own.remote;
  const roster = useRoster();
  const stats = useRemoteLoad('coach_stats', remote, () => fetchOwnCoachStats());
  const rosterIds = roster.status === 'ready' ? roster.clients.map((c) => c.id) : [];
  const inbox = useRemoteLoad(`inbox:${rosterIds.join(',')}`, remote && roster.status === 'ready', () => fetchInbox(rosterIds));
  const statsFailed = remote && (stats.status === 'error' || roster.status === 'error');
  const retryStats = () => {
    if (stats.status === 'error') stats.retry();
    if (roster.status === 'error') roster.retry();
  };

  const aggRating: { count: number; average: number; hasEnoughReviews: boolean } | null = !remote
    ? getProAggregateRating()
    : stats.status === 'ready'
      ? { count: stats.data.ratingCount, average: stats.data.ratingAvg, hasEnoughReviews: stats.data.ratingCount >= MIN_REVIEWS_FOR_RATING }
      : null;
  const ratingLabel = aggRating ? aggRating.average.toFixed(1) : '';
  const reviewsCountLabel = aggRating ? String(aggRating.count) : '–';

  // What blocks deleting the account. Signed in that is 0012's own list —
  // upcoming sessions, open disputes, unsettled payouts — and while it
  // isn't known the sheet offers the request: processing it refuses
  // anything still open, so filing it early can't delete too soon.
  const obligationParts: string[] = [];
  if (!remote) {
    const demo = getProActiveObligations();
    if (demo.totalUnusedCredits > 0) obligationParts.push(t('profileObligationCredits', { n: demo.totalUnusedCredits }));
    if (demo.clientsWithUpcomingSessions > 0) obligationParts.push(t('profileObligationSessions', { n: demo.clientsWithUpcomingSessions }));
    if (demo.openDisputesCount > 0) obligationParts.push(t('profileObligationDisputes', { n: demo.openDisputesCount }));
  } else if (stats.status === 'ready') {
    if (stats.data.upcomingClients > 0) obligationParts.push(t('profileObligationSessions', { n: stats.data.upcomingClients }));
    if (stats.data.openDisputes > 0) obligationParts.push(t('profileObligationDisputes', { n: stats.data.openDisputes }));
    if (stats.data.unsettledPayouts > 0) obligationParts.push(t('profileObligationPayouts', { n: stats.data.unsettledPayouts }));
  }
  const obligations = { blocked: obligationParts.length > 0 };
  const obligationsSummary = obligationParts.length ? `${t('profileDeleteBlockedIntro')} ${obligationParts.join(isAr ? '، ' : ', ')}.` : '';

  const clients = remote ? (roster.status === 'ready' ? roster.clients : null) : getClients();
  const activeRoster = clients?.filter((c) => c.active) ?? [];
  const activeCount = clients ? String(activeRoster.length) : '–';
  const completionPct = !clients ? '–' : `${activeRoster.length ? Math.round(activeRoster.reduce((sum, c) => sum + c.progress, 0) / activeRoster.length) : 0}%`;

  const totalUnread = !remote
    ? getClients().reduce((sum, c) => sum + getUnreadMessageCount(c.id, 'pro'), 0)
    : inbox.status === 'ready'
      ? Object.values(inbox.data).reduce((sum, e) => sum + e.unread, 0)
      : 0;
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
    if (verificationStatus !== 'unverified' || busy) return;

    if (!own.remote) {
      requestVerification();
      setSupportToastMsg(t('profileVerificationRequestedToast'));
      setShowSupportToast(true);
      refresh();
      return;
    }

    // Filing the request is all the app does: 0005's own trigger flips
    // coach_profiles.verification_status to 'pending', and the badge reads
    // that column back rather than a local copy of what we think it is.
    setBusy(true);
    void fileVerificationRequest().then(async (result) => {
      if (result.ok || result.code === 'already_pending') {
        await own.reload();
        setSupportToastMsg(t('profileVerificationRequestedToast'));
      } else {
        setSupportToastMsg(t('requestFailedRetry'));
      }
      setBusy(false);
      setShowSupportToast(true);
    });
  }

  function toggleNotifType(key: NotifTypeKey) {
    setProNotificationPrefs({ [key]: notifPrefs[key] === false });
    refresh();
  }

  // Mirrors Auth.tsx's own fallback: with no Supabase project wired up,
  // signOut() is a no-op (nothing to end a session on), so go straight to
  // 'auth' instead of waiting on an auth-state change that will never
  // fire. When configured, session.ts's own listener does the routing —
  // it owns "where signed-out goes" so a stray auth event elsewhere can't
  // fight this screen over it.
  function logOut() {
    if (!isSupabaseConfigured()) {
      nav('auth');
      return;
    }
    void signOut();
  }

  function confirmDelete() {
    if (busy) return;

    if (!own.remote) {
      requestProAccountDeletion();
      setShowDeleteConfirm(false);
      logOut();
      return;
    }

    // Real path: files account_deletion_requests and signs out. It
    // deliberately does not also run mockStore's requestProAccountDeletion
    // (which anonymizes immediately) — that local demo profile isn't this
    // real signed-in account, and processing a real request is the admin
    // queue's job (supabase/README.md), not something filing it does.
    setBusy(true);
    void fileAccountDeletionRequest().then((result) => {
      setBusy(false);
      if (result.ok || result.code === 'already_pending') {
        setShowDeleteConfirm(false);
        logOut();
      } else {
        // Sheet stays open — same "let them retry without re-opening it"
        // choice ClientProfile.tsx's inline error makes, just surfaced
        // through this screen's existing toast instead.
        setSupportToastMsg(t('requestFailedRetry'));
        setShowSupportToast(true);
      }
    });
  }

  // Persisted, and read by getProNotifications — turning one off really
  // does remove those rows from the Notifications feed.
  const notifPrefs = getProNotificationPrefs();
  const notif = notifPrefs.enabled;

  const notifTypeDefs: { key: NotifTypeKey; label: string }[] = [
    { key: 'sessions', label: t('profileNotifSessions') },
    { key: 'payments', label: t('profileNotifPayments') },
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
            <button type="button" aria-label={t('profileEditProfile')} className="profile-avatar-edit-btn" onClick={() => nav('editProfile')}>
              <PencilIcon size={11} color="var(--accent)" />
            </button>
          </div>
          <div className="profile-hero-info">
            <div className="profile-name-row">
              <div className="profile-name">{profile.name}</div>
              {credentialVerified && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" stroke="none" aria-label={t('profileVerifiedPro')}>
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
              {aggRating && (aggRating.hasEnoughReviews ? (
                <div className="profile-rating-badge">
                  <StarIcon size={9} color="var(--accent)" />
                  {ratingLabel}
                </div>
              ) : (
                <div className="profile-badge-soft">{t('profileNotEnoughReviews')}</div>
              ))}
            </div>
          </div>
        </div>

        {hasBio && <div className="profile-bio">{profile.bio}</div>}

        {statsFailed && (
          <div className="profile-stats-failed" role="alert">
            <span>{t('profileStatsFailed')}</span>
            <button type="button" className="profile-stats-retry" onClick={retryStats}>
              {t('retry')}
            </button>
          </div>
        )}
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
            <div className="profile-stat-num">{completionPct}</div>
            <div className="profile-stat-label">{t('profileCompletion')}</div>
          </div>
        </div>
      </div>

      <div className="profile-quick-actions">
        <button type="button" className="profile-quick-btn" onClick={() => nav('previewProfile')}>
          <EyeIcon size={15} color="var(--accent)" />
          <span>{t('profilePreview')}</span>
        </button>
        {/* No Share button until the public coach page exists. ShareProfile's
            link (rafiq.app/pro/…) is a domain Rafiq doesn't own, its QR code
            encodes the same dead link, and its share buttons only show a
            toast: a coach who posted it would send people nowhere. The
            screen stays for when the page ships (LAUNCH-CHECKLIST). */}
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
            {subscriptionBadge && <div className="profile-row-badge">{subscriptionBadge}</div>}
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
          <button type="button" className="profile-row" onClick={tapVerification} disabled={busy}>
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
          <button type="button" className="profile-row" onClick={() => nav('templates')}>
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
          <button type="button" className="profile-row" onClick={() => nav('payoutAccount')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10l9-6 9 6" />
              <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
              <path d="M3 21h18" />
            </svg>
            <div className="profile-row-text">
              <div className="profile-row-title">{t('payoutAccountTitle')}</div>
              <div className="profile-row-sub">{t('payoutAccountSub')}</div>
            </div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
          <button type="button" className="profile-row" onClick={() => nav('availability')}>
            <ScheduleIcon size={17} color="var(--accent)" />
            <div className="profile-row-text">
              <div className="profile-row-title">{t('profileAvailability')}</div>
              <div className="profile-row-sub">{t('profileAvailabilitySub')}</div>
            </div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
          <button type="button" className="profile-row" onClick={() => nav('messagesInbox')}>
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
              <button
                type="button"
                className={`profile-switch${notif ? ' is-on' : ''}`}
                onClick={() => { setProNotificationPrefs({ enabled: !notif }); refresh(); }}
              >
                <span className="profile-switch-thumb" />
              </button>
            </div>
            <div className="profile-notif-scope">{t('notifInAppOnly')}</div>
            {notif &&
              notifTypeDefs.map((nt) => (
                <div className="profile-notif-sub-row" key={nt.key}>
                  <div className="profile-notif-sub-label">{nt.label}</div>
                  <button type="button" className={`profile-switch${notifPrefs[nt.key] !== false ? ' is-on' : ''}`} onClick={() => toggleNotifType(nt.key)}>
                    <span className="profile-switch-thumb" />
                  </button>
                </div>
              ))}
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-label">{t('profileSupportRafiq')}</div>
          <div className="profile-support-card">
            {reviewUrl && (
              <>
                <button type="button" className="profile-support-row" onClick={() => openExternal(reviewUrl)}>
                  <StarIcon size={17} color="var(--accent)" />
                  <div className="profile-support-title">{t('profileRateRafiq')}</div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <path d="M15 3h6v6" />
                    <path d="M10 14L21 3" />
                  </svg>
                </button>
                <div className="profile-support-divider" />
              </>
            )}
            <button
              type="button"
              className="profile-support-row"
              onClick={() => openExternal(supportMailto(t('supportEmailSubject')))}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.8 2.1z" />
              </svg>
              <div className="profile-support-title">
                {t('profileContactUs')}
                {/* Shown as well as linked: with no mail app installed the tap does nothing. */}
                <div className="profile-support-sub"><bdi>{SUPPORT_EMAIL}</bdi></div>
              </div>
              <ArrowForwardIcon size={15} color="var(--ink-soft)" />
            </button>
            <div className="profile-support-divider" />
            <button type="button" className="profile-support-row" onClick={() => nav('helpCenter')}>
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

        <button type="button" className="profile-logout" onClick={logOut}>
          {t('profileLogOut')}
        </button>

        <div className="profile-footer-links">
          <button type="button" onClick={() => nav('coachPrivacyPolicy')}>
            {t('profilePrivacyPolicy')}
          </button>
          <span className="profile-footer-dot">·</span>
          <button type="button" onClick={() => nav('coachTermsOfService')}>
            {t('profileTermsOfService')}
          </button>
          <span className="profile-footer-dot">·</span>
          <button type="button" onClick={() => setShowDeleteConfirm(true)}>
            {t('profileDeleteAccount')}
          </button>
        </div>
      </div>

      <CoachTabBar />

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
                  <button type="button" className="profile-modal-btn profile-modal-btn-danger" onClick={confirmDelete} disabled={busy}>
                    {busy ? t('submittingEllipsis') : t('profileDelete')}
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
          <button type="button" aria-label={t('dismiss')} className="profile-toast-close" onClick={() => setShowSupportToast(false)}>
            <CloseIcon size={12} color="#FFFFFF" />
          </button>
        </div>
      )}
    </div>
  );
}
