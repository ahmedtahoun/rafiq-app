import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { darken } from '../lib/color';
import { CheckIcon, ChevronIcon, ShieldIcon, StarIcon } from '../components/icons';
import {
  getClients,
  getCoachProfile,
  getOfferings,
  getProAggregateRating,
  getRatings,
  isCredentialVerified,
  setSelectedOfferingId,
  type OfferingType,
} from '../lib/mockStore';
import './PreviewProfile.css';

const ACCENT = '#B75C3D';
const REVIEW_TRUNCATE_LEN = 90;

const TYPE_BADGE_COLOR: Record<OfferingType, string> = {
  session: ACCENT, consultation: '#2A8F8F', group: '#3E6FB0', workshop: '#7A6BAE', program: '#3F7D58', event: '#B98900',
};
const TYPE_LABEL_KEY: Record<OfferingType, MessageKey> = {
  session: 'offeringTypeSession', consultation: 'offeringTypeConsultation', group: 'offeringTypeGroup',
  workshop: 'offeringTypeWorkshop', program: 'offeringTypeProgram', event: 'offeringTypeEvent',
};

// 1:1 port of PreviewProfile.dc.html — what a member sees when they open
// this coach's profile.
//
// Every field comes from the same sources the rest of the Pro side reads
// (getCoachProfile, getOfferings, getProAggregateRating, getRatings), so the
// preview can never drift from the real profile. Nothing on this screen is
// illustrative: no sample reviews, no stand-in rating.
export default function PreviewProfile() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const nav = useAppStore((s) => s.nav);
  const lang = useAppStore((s) => s.lang);
  const isAr = lang === 'ar';

  const profile = getCoachProfile();
  const offerings = getOfferings();
  const [selectedId, setSelectedId] = useState<string | null>(offerings[0]?.id ?? null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const initials = profile.name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const specialties = (profile.title || 'Life coaching').split(' · ').filter(Boolean);
  const verified = isCredentialVerified();
  const currency = isAr ? 'جنيه' : 'EGP';

  const experienceYears = profile.experienceYears === '' ? 0 : profile.experienceYears ?? 0;
  const experienceLabel = experienceYears === 1
    ? t('previewProfileOneYearExp')
    : t('previewProfileYearsExp', { n: experienceYears });
  const sessionModeLabel = t(
    profile.sessionMode === 'online' ? 'previewProfileModeOnline'
      : profile.sessionMode === 'in_person' ? 'previewProfileModeInPerson'
        : 'previewProfileModeBoth',
  );
  const languages = profile.languages ?? [];
  const certifications = profile.certifications?.length
    ? profile.certifications
    : profile.cert?.trim() ? [profile.cert] : [];

  const agg = getProAggregateRating();
  const activeCount = getClients().filter((c) => c.active).length;

  // Real written feedback only. A star-only rating still counts toward the
  // aggregate above but has no quote to show, so it is not listed here.
  const reviews = getClients().flatMap((c) => {
    const ratings = getRatings(c.id);
    return Object.entries(ratings)
      .filter(([, r]) => r.comment?.trim())
      .map(([sessionId, r]) => ({
        key: `${c.id}_${sessionId}`,
        name: c.name,
        initials: c.initials,
        avatarBg: c.avatarBg,
        rating: r.rating.toFixed(1),
        quote: r.comment!.trim(),
      }));
  });

  const selected = offerings.find((o) => o.id === selectedId) ?? null;
  const heroStyle = profile.coverPhotoUrl
    ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.68) 100%), url(${profile.coverPhotoUrl})` }
    : { background: `linear-gradient(135deg, ${ACCENT} 0%, ${darken(ACCENT, 45)} 100%)` };

  function book() {
    if (!selectedId) return;
    setSelectedOfferingId(selectedId);
    // ClientBooking reads this back as the offering being booked — the
    // handoff the design describes.
    nav('clientBooking');
  }

  return (
    <div className="phone-frame preview-profile">
      <div className="preview-profile-banner">{t('previewProfileBanner')}</div>

      <div className="preview-profile-scroll">
        <div className="preview-profile-hero" style={heroStyle}>
          <button className="preview-profile-back" aria-label={t('back')} onClick={back}>
            <ChevronIcon size={16} color="#FFFFFF" />
          </button>
          <div className="preview-profile-hero-body">
            {profile.avatarPhotoUrl
              ? <img className="preview-profile-avatar-img" src={profile.avatarPhotoUrl} alt="" />
              : <div className="preview-profile-avatar">{initials}</div>}
            <div className="preview-profile-hero-name">
              {profile.name}
              {verified && <span className="preview-profile-verified"><CheckIcon size={10} color="#FFFFFF" /></span>}
            </div>
            <div className="preview-profile-chips">
              {specialties.map((s) => <span key={s} className="preview-profile-chip">{s}</span>)}
            </div>
          </div>
        </div>

        <div className="preview-profile-stats">
          <div className="preview-profile-stat">
            <div className="preview-profile-stat-value">
              {agg.hasEnoughReviews ? agg.average.toFixed(1) : t('previewProfileNew')}
            </div>
            <div className="preview-profile-stat-label">{t('previewProfileRating')}</div>
          </div>
          <div className="preview-profile-stat">
            <div className="preview-profile-stat-value">{agg.count}</div>
            <div className="preview-profile-stat-label">{t('previewProfileReviews')}</div>
          </div>
          <div className="preview-profile-stat">
            <div className="preview-profile-stat-value">{activeCount}</div>
            <div className="preview-profile-stat-label">{t('previewProfileMembers')}</div>
          </div>
        </div>

        <section className="preview-profile-section">
          <h2>{t('previewProfileCredibility')}</h2>
          <div className="preview-profile-cred">
            <div className="preview-profile-cred-row"><ShieldIcon size={15} color="var(--accent)" /><span>{experienceLabel}</span></div>
            <div className="preview-profile-cred-row"><ShieldIcon size={15} color="var(--accent)" /><span>{sessionModeLabel}</span></div>
            {languages.length > 0 && (
              <div className="preview-profile-cred-chips">
                {languages.map((l) => <span key={l} className="preview-profile-soft-chip">{l}</span>)}
              </div>
            )}
          </div>
        </section>

        {certifications.length > 0 && (
          <section className="preview-profile-section">
            <h2>{t('previewProfileCredentials')}</h2>
            <div className="preview-profile-cred-chips">
              {certifications.map((c) => <span key={c} className="preview-profile-soft-chip">{c}</span>)}
            </div>
          </section>
        )}

        {profile.bio?.trim() && (
          <section className="preview-profile-section">
            <h2>{t('previewProfileAbout')}</h2>
            <p className="preview-profile-bio">{profile.bio}</p>
          </section>
        )}

        <section className="preview-profile-section">
          <h2>{t('previewProfileOfferings')}</h2>
          {offerings.length > 0 ? (
            <div className="preview-profile-offerings">
              {offerings.map((o) => {
                const isSelected = o.id === selectedId;
                const color = TYPE_BADGE_COLOR[o.type] ?? ACCENT;
                const formatLabel = t(
                  o.format === 'online' ? 'previewProfileFormatOnline'
                    : o.format === 'in_person' ? 'previewProfileFormatInPerson'
                      : 'previewProfileFormatBoth',
                );
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`preview-profile-offering${isSelected ? ' is-selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(o.id)}
                  >
                    <div className="preview-profile-offering-head">
                      <span className="preview-profile-type-badge" style={{ background: `${color}22`, color }}>
                        {t(TYPE_LABEL_KEY[o.type])}
                      </span>
                      <span className={`preview-profile-check${isSelected ? ' is-on' : ''}`}>
                        {isSelected && <CheckIcon size={11} color="#FFFFFF" />}
                      </span>
                    </div>
                    <div className="preview-profile-offering-name">{o.name}</div>
                    {o.description?.trim() && <div className="preview-profile-offering-desc">{o.description}</div>}
                    <div className="preview-profile-offering-foot">
                      <span>{[o.duration, formatLabel].filter(Boolean).join(' · ')}</span>
                      <span className="preview-profile-price">
                        {o.price > 0 ? `${o.price} ${currency}` : t('previewProfileFree')}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="preview-profile-empty">{t('previewProfileNoOfferings')}</p>
          )}
        </section>

        <section className="preview-profile-section">
          <h2>{t('previewProfileReviewsTitle')}</h2>
          {reviews.length > 0 ? (
            <div className="preview-profile-reviews">
              {reviews.map((r) => {
                const isLong = r.quote.length > REVIEW_TRUNCATE_LEN;
                const isOpen = !!expanded[r.key];
                const shown = isLong && !isOpen ? `${r.quote.slice(0, REVIEW_TRUNCATE_LEN).trim()}…` : r.quote;
                return (
                  <div key={r.key} className="preview-profile-review">
                    <div className="preview-profile-review-head">
                      <span className="preview-profile-review-avatar" style={{ background: r.avatarBg }}>{r.initials}</span>
                      <span className="preview-profile-review-name">{r.name}</span>
                      <span className="preview-profile-review-rating">
                        <StarIcon size={11} color="var(--amber)" filled />{r.rating}
                      </span>
                    </div>
                    <p className="preview-profile-review-quote">{shown}</p>
                    {isLong && (
                      <button
                        type="button"
                        className="preview-profile-read-more"
                        onClick={() => setExpanded((e) => ({ ...e, [r.key]: !isOpen }))}
                      >
                        {t(isOpen ? 'previewProfileShowLess' : 'previewProfileReadMore')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="preview-profile-empty">{t('previewProfileNoReviews')}</p>
          )}
        </section>
      </div>

      <div className="preview-profile-cta">
        <button type="button" className="preview-profile-book" onClick={book} disabled={!selected}>
          {selected ? t('previewProfileBookOffering', { name: selected.name }) : t('previewProfileTryBooking')}
        </button>
      </div>
    </div>
  );
}
