import { useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useOwnCoachProfile, type OwnProfileView } from '../store/ownProfileStore';
import { LoadState } from '../components/LoadState';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { specialtyLabels } from '../lib/coachLabels';
import { darken } from '../lib/color';
import { CheckIcon, ChevronIcon, ClientsIcon, EyeIcon, ShareIcon, StarIcon } from '../components/icons';
import { getClients, getProAggregateRating, MIN_REVIEWS_FOR_RATING } from '../lib/mockStore';
import { fetchOwnCoachStats } from '../lib/coachStatsData';
import { fetchOwnPublicPage, publicPageAddress, publicPageUrl, setPublicPage, type PublicPage } from '../lib/publicPageData';
import { useRemoteSession } from '../lib/remoteSession';
import { useRemoteLoad } from '../store/remoteLoad';
import { useRoster } from '../store/rosterStore';
import './ShareProfile.css';

const ACCENT = '#B75C3D';

/**
 * What a coach hands a prospective member: their card, and their public
 * page (migration 0026, rafiqpro.com/c/<code>) if they turn it on here.
 *
 * Off by default. The switch says exactly what the page shows and to whom
 * before it is on; turning it on makes the link (kept after, so it never
 * changes), and only then are Copy, Share and View offered. The page
 * itself is site/coach-page.mjs.
 *
 * Signed in, the member count and rating are the coach's own (the roster
 * and coachStatsData.ts). Signed out, the demo's card shows with the switch
 * off and a note to sign in: there is no page to turn on.
 */
export default function ShareProfile() {
  const own = useOwnCoachProfile();
  const remote = useRemoteSession();
  const roster = useRoster();
  const stats = useRemoteLoad('coach_stats', remote, () => fetchOwnCoachStats());
  const page = useRemoteLoad('public_page', remote, () => fetchOwnPublicPage());
  if (own.status === 'loading' || (remote && (stats.status === 'loading' || roster.status === 'loading' || page.status === 'loading'))) {
    return <LoadState status="loading" />;
  }
  // One error screen, and its Try again retries every read that failed:
  // the profile and the page come from the same row, so they fail together.
  const retryAll = () => [own, stats, roster, page].forEach((l) => {
    if (l.status === 'error') l.retry();
  });
  if (own.status === 'error') return <LoadState status="error" onRetry={retryAll} showBack />;
  if (remote && (stats.status === 'error' || roster.status === 'error' || page.status === 'error')) {
    return <LoadState status="error" onRetry={retryAll} showBack />;
  }
  if (remote && stats.status === 'ready' && roster.status === 'ready' && page.status === 'ready') {
    return (
      <ShareProfileView
        own={own}
        activeCount={roster.clients.filter((c) => c.active).length}
        rating={{ average: stats.data.ratingAvg, hasEnoughReviews: stats.data.ratingCount >= MIN_REVIEWS_FOR_RATING }}
        page={page.data}
        onPageChange={page.set}
      />
    );
  }
  return <ShareProfileView own={own} activeCount={getClients().filter((c) => c.active).length} rating={getProAggregateRating()} page={null} />;
}

function ShareProfileView({ own, activeCount, rating, page, onPageChange }: {
  own: Extract<OwnProfileView, { status: 'ready' }>;
  activeCount: number;
  rating: { average: number; hasEnoughReviews: boolean };
  /** null signed out: nothing to turn on. */
  page: PublicPage | null;
  onPageChange?: (page: PublicPage) => void;
}) {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState('');

  const profile = own.profile;
  const initials = profile.name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  // In the app's language (#95), as everywhere else a specialty shows.
  const primarySpecialty = specialtyLabels(profile.title || 'Life coaching', t)[0];
  const ratingLabel = rating.hasEnoughReviews ? rating.average.toFixed(1) : '—';
  const on = page?.on === true;
  const code = on ? page?.code ?? null : null;

  async function toggle() {
    if (!page || busy) return;
    setBusy(true);
    setFailed(false);
    const result = await setPublicPage(!page.on);
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    // The code is kept when the page goes off, so keep showing the one we have.
    onPageChange?.({ on: result.data.on, code: result.data.code ?? page.code });
  }

  async function copyLink() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(publicPageUrl(code));
      setToast(t('shareProfileLinkCopied'));
    } catch {
      // Clipboard access is denied in some browsers and every insecure
      // origin; say so rather than claiming a copy that did not happen.
      setToast(t('shareProfileCopyFailed'));
    }
  }

  async function shareLink() {
    if (!code) return;
    const url = publicPageUrl(code);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: profile.name, url });
      } catch {
        // Dismissed: nothing to say.
      }
      return;
    }
    await copyLink();
  }

  function viewPage() {
    if (!code) return;
    const url = publicPageUrl(code);
    if (Capacitor.isNativePlatform()) void Browser.open({ url });
    else window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="phone-frame share-profile">
      <div className="share-profile-cover" style={profile.coverPhotoUrl ? { backgroundImage: `url(${profile.coverPhotoUrl})` } : undefined} />

      <div className="share-profile-header">
        <button className="share-profile-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="share-profile-title">{t('shareProfileTitle')}</div>
      </div>

      <div className="share-profile-body">
        <div className="share-profile-card">
          <div className="share-profile-card-text">
            <div className="share-profile-name"><bdi>{profile.name}</bdi></div>
            <div className="share-profile-meta">
              <span className="share-profile-chip">{primarySpecialty}</span>
              <span className="share-profile-chip">
                <StarIcon size={10} color="var(--green)" filled />
                <span>{ratingLabel}</span>
              </span>
            </div>
            {profile.bio?.trim() && <p className="share-profile-bio" dir="auto">{profile.bio}</p>}
          </div>

          <div className="share-profile-avatar-wrap">
            {profile.avatarPhotoUrl
              ? <img className="share-profile-avatar-img" src={profile.avatarPhotoUrl} alt="" />
              : <div className="share-profile-avatar" style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, ${darken(ACCENT, 35)} 100%)` }}>{initials}</div>}
            <span className="share-profile-avatar-badge"><CheckIcon size={10} color="#FFFFFF" /></span>
          </div>
        </div>

        <section className="share-profile-public" aria-labelledby="share-public-title">
          <div className="share-profile-public-head">
            <h2 id="share-public-title" className="share-profile-public-title">{t('sharePublicTitle')}</h2>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby="share-public-title"
              className={`share-profile-switch${on ? ' is-on' : ''}`}
              disabled={!page || busy}
              onClick={toggle}
            >
              <span className="share-profile-switch-thumb" />
            </button>
          </div>
          <p className="share-profile-public-body">{t('sharePublicBody')}</p>
          {failed && <p className="share-profile-public-error" role="alert">{t('sharePublicError')}</p>}
          {!page && <p className="share-profile-public-note">{t('sharePublicSignedOut')}</p>}
          {page && !code && <p className="share-profile-public-note">{t('sharePublicOff')}</p>}
          {code && (
            <>
              <div className="share-profile-link-row">
                <span className="share-profile-link-icon"><ShareIcon size={14} color="var(--accent)" /></span>
                <span className="share-profile-link" dir="ltr">{publicPageAddress(code)}</span>
                <button type="button" className="share-profile-copy" aria-label={t('shareProfileCopyLink')} onClick={copyLink}>
                  <CopyGlyph />
                </button>
              </div>
              <div className="share-profile-actions">
                <button type="button" className="share-profile-primary" onClick={shareLink}>
                  <ShareIcon size={16} color="#FFFFFF" />
                  {t('sharePublicShare')}
                </button>
                <button type="button" className="share-profile-secondary" onClick={viewPage}>
                  <EyeIcon size={15} />
                  {t('sharePublicView')}
                </button>
              </div>
            </>
          )}
        </section>

        <div className="share-profile-stats">
          <div className="share-profile-stat">
            <StarIcon size={15} color="var(--amber)" filled />
            <div className="share-profile-stat-value">{ratingLabel}</div>
            <div className="share-profile-stat-label">{t('shareProfileRating')}</div>
          </div>
          <div className="share-profile-stat">
            <ClientsIcon size={15} color="var(--blue)" />
            <div className="share-profile-stat-value">{activeCount}</div>
            <div className="share-profile-stat-label">{t('shareProfileMembers')}</div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="share-profile-toast" role="status" onClick={() => setToast('')}>
          <CheckIcon size={16} color="#FFFFFF" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function CopyGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
