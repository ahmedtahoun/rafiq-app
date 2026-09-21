import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { CheckIcon, ChevronIcon, ClientsIcon, EyeIcon, ShareIcon, StarIcon } from '../components/icons';
import { getClients, getCoachProfile, getProAggregateRating } from '../lib/mockStore';
import './ShareProfile.css';

const ACCENT = '#B75C3D';
const QR_GRID = 21;

/**
 * A stylized, deterministic pattern seeded from the Pro's own profile, so
 * two Pros render differently and it shifts when their details change.
 *
 * It is a design mock, not a scannable code — rafiq.app/pro/… is not a live
 * page. Kept exactly as the design has it rather than pulling in a real QR
 * library, which would imply the link works.
 */
function qrCells(seedSource: string): { x: number; y: number }[] {
  let seed = 2166136261;
  for (let i = 0; i < seedSource.length; i++) {
    seed ^= seedSource.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  seed >>>= 0;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const finders: [number, number][] = [[0, 0], [QR_GRID - 7, 0], [0, QR_GRID - 7]];
  const inFinder = (x: number, y: number) => finders.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const logoStart = Math.floor(QR_GRID / 2) - 2;
  const inLogo = (x: number, y: number) => x >= logoStart && x < logoStart + 5 && y >= logoStart && y < logoStart + 5;

  const cells: { x: number; y: number }[] = [];
  finders.forEach(([fx, fy]) => {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const onRing = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const onCore = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        if (onRing || onCore) cells.push({ x: fx + dx, y: fy + dy });
      }
    }
  });
  for (let y = 0; y < QR_GRID; y++) {
    for (let x = 0; x < QR_GRID; x++) {
      if (inFinder(x, y) || inLogo(x, y)) continue;
      if (random() < 0.5) cells.push({ x, y });
    }
  }
  return cells;
}

type ShareChannel = 'whatsapp' | 'messages' | 'email' | 'sms';
const CHANNELS: ShareChannel[] = ['whatsapp', 'messages', 'email', 'sms'];

// 1:1 port of ShareProfile.dc.html — the shareable card, link and QR mock a
// coach hands to a prospective member.
export default function ShareProfile() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState('');

  const profile = getCoachProfile();
  const initials = profile.name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const primarySpecialty = (profile.title || 'Life coaching').split(' · ')[0];
  const slug = profile.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const profileUrl = `rafiq.app/pro/${slug}`;
  const activeCount = getClients().filter((c) => c.active).length;

  // The design hardcodes 4.9 stars and 142 views as demo values. The rating
  // has a real seam, so it is read from it and shows a dash until there are
  // enough reviews — the same treatment Profile gives it. Views have no
  // source anywhere in the app, so they stay a dash rather than becoming a
  // number a coach might show a prospective member.
  const rating = getProAggregateRating();
  const ratingLabel = rating.hasEnoughReviews ? rating.average.toFixed(1) : '—';
  const viewsLabel = '—';

  const cells = qrCells([profile.name, profile.title, profile.cert, profile.bio, profileUrl].join('|'));

  function share(channel: ShareChannel) {
    setSheetOpen(false);
    setToast(t('shareProfileOpening', { channel: t(`shareProfileChannel_${channel}`) }));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`https://${profileUrl}`);
      setToast(t('shareProfileLinkCopied'));
    } catch {
      // Clipboard access is denied in some browsers and every insecure
      // origin; say so rather than claiming a copy that did not happen.
      setToast(t('shareProfileCopyFailed'));
    }
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
          <div className="share-profile-qr-wrap">
            <svg className="share-profile-qr" width="136" height="136" viewBox="0 0 21 21" role="img" aria-label={t('shareProfileQrAlt')}>
              {cells.map((c) => (
                <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" rx="0.18" fill="var(--ink)" />
              ))}
              <rect x="8" y="8" width="5" height="5" rx="1" fill={ACCENT} />
            </svg>
          </div>

          <div className="share-profile-card-text">
            <div className="share-profile-name">{profile.name}</div>
            <div className="share-profile-meta">
              <span className="share-profile-chip">{primarySpecialty}</span>
              <span className="share-profile-chip">
                <StarIcon size={10} color="var(--green)" filled />
                <span>{ratingLabel}</span>
              </span>
            </div>
            {profile.bio?.trim() && <p className="share-profile-bio">{profile.bio}</p>}
            <div className="share-profile-scan-hint">{t('shareProfileScanHint')}</div>
          </div>

          <div className="share-profile-avatar-wrap">
            {profile.avatarPhotoUrl
              ? <img className="share-profile-avatar-img" src={profile.avatarPhotoUrl} alt="" />
              : <div className="share-profile-avatar" style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, ${darken(ACCENT, 35)} 100%)` }}>{initials}</div>}
            <span className="share-profile-avatar-badge"><CheckIcon size={10} color="#FFFFFF" /></span>
          </div>
        </div>

        <div className="share-profile-link-row">
          <span className="share-profile-link-icon"><ShareIcon size={14} color="var(--accent)" /></span>
          <span className="share-profile-link">{profileUrl}</span>
          <button type="button" className="share-profile-copy" aria-label={t('shareProfileCopyLink')} onClick={copyLink}>
            <CopyGlyph />
          </button>
        </div>

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
          <div className="share-profile-stat">
            <EyeIcon size={15} color="var(--green)" />
            <div className="share-profile-stat-value">{viewsLabel}</div>
            <div className="share-profile-stat-label">{t('shareProfileViews')}</div>
          </div>
        </div>

        <div className="share-profile-actions">
          <button type="button" className="share-profile-primary" onClick={() => setSheetOpen(true)}>
            <ShareIcon size={16} color="#FFFFFF" />
            {t('shareProfileMoreOptions')}
          </button>
          <button type="button" className="share-profile-secondary" onClick={() => setToast(t('shareProfileContactSaved'))}>
            <ClientsIcon size={15} />
            {t('shareProfileSaveContact')}
          </button>
        </div>
      </div>

      {sheetOpen && (
        <div className="share-profile-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="share-profile-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="share-profile-sheet-grip" />
            <div className="share-profile-sheet-title">{t('shareProfileShareVia')}</div>
            {CHANNELS.map((channel) => (
              <button key={channel} type="button" className="share-profile-sheet-row" onClick={() => share(channel)}>
                <span className="share-profile-sheet-icon"><ShareIcon size={17} color="var(--accent)" /></span>
                <span>{t(`shareProfileChannel_${channel}`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
