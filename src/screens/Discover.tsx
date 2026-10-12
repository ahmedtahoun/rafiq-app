import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, isolate } from '../lib/i18n';
import { darken } from '../lib/color';
import { useFormat } from '../lib/format';
import {
  SearchIcon, FilterIcon, BellIcon, CloseIcon,
  StarIcon, CheckIcon, 
} from '../components/icons';
import { SpecialtyIcon } from '../components/specialtyIcons';
import { MemberTabBar } from '../components/TabBars';
import { BottomSheet } from '../components/BottomSheet';
import { CountryPicker } from '../components/CountryPicker';
import { SPECIALTIES } from '../lib/specialties';
import { COUNTRIES } from '../lib/countries';
import { DEMO_MEMBER_CLIENT_ID, MIN_REVIEWS_FOR_RATING, getClient } from '../lib/mockStore';
import { LoadState } from '../components/LoadState';
import { useRemoteSession } from '../lib/remoteSession';
import { fetchDirectory, type RealDirectoryCoach } from '../lib/requestData';
import { fetchOwnFocus } from '../lib/memberData';
import { wallNowMs } from '../lib/wallClock';
import { useRemoteLoad } from '../store/remoteLoad';
import { fetchRecentReviews, type CoachReview } from '../lib/reviewData';
import { fetchOwnFavourites } from '../lib/favouriteData';
import { useFavourites } from '../store/favourites';
import {
  filterCoaches, hasActiveFilters,
  initialsOf, countryFlagOf,
  NO_FILTERS, type DirectoryCoach, type DirectoryFilters,
} from '../lib/directory';
import './Discover.css';

// Signed in, the coaches are the real directory (step 4) and the goal that
// floats matching coaches up is the member's own focus from onboarding
// (member_profiles, step 6). Signed out, both are the demo's.
const CLIENT_ID = DEMO_MEMBER_CLIENT_ID;

const isReal = (coach: DirectoryCoach): coach is RealDirectoryCoach => 'ratingCount' in coach;

/** A real coach's average means little over one or two reviews. */
function hasRating(coach: DirectoryCoach): boolean {
  return !isReal(coach) || coach.ratingCount >= MIN_REVIEWS_FOR_RATING;
}
const ACCENT_HEX = '#B75C3D';

// The specialty rail. The prototype had its own nine-entry list with
// ad-hoc keys; these are the real SPECIALTIES the rest of the app uses,
// narrowed to the ones the seeded directory actually contains. A rail of
// filters that return nothing is worse than a shorter rail — so this is
// derived from the data rather than hardcoded, and stays correct when the
// directory becomes a real query.
function specialtyRail(coaches: DirectoryCoach[]) {
  const present = new Set(coaches.map((c) => c.specialty));
  return SPECIALTIES.filter((s) => present.has(s.value));
}

// The design gives each specialty circle its own colour. Rather than a
// second colour table that could drift, each specialty borrows the colour
// of the first directory coach who teaches it.
function specialtyColour(coaches: DirectoryCoach[], value: string): string {
  return coaches.find((c) => c.specialty === value)?.color ?? ACCENT_HEX;
}

/** Signed in: how many of the newest reviews to look through, and how
    many to show (some may be of coaches no longer listed). */
const REVIEW_POOL = 20;
const STORIES_SHOWN = 3;
const NO_FAVOURITES: string[] = [];

export default function Discover() {
  const t = useT();
  const { money, instantDate } = useFormat();
  const nav = useAppStore((s) => s.nav);

  const [filters, setFilters] = useState<DirectoryFilters>(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const remote = useRemoteSession();
  // The member's saved coaches load with the directory: a heart shown
  // empty because its read failed would be a wrong answer, not a blank one.
  const load = useRemoteLoad<{ coaches: RealDirectoryCoach[]; focus: string | null; favourites: string[] }>('directory', remote, async () => {
    const [directory, focus, favourites] = await Promise.all([fetchDirectory(wallNowMs()), fetchOwnFocus(), fetchOwnFavourites()]);
    return directory.ok && focus.ok && favourites.ok
      ? { ok: true as const, data: { coaches: directory.data, focus: focus.data, favourites: favourites.data } }
      : { ok: false as const };
  });
  const favourites = useFavourites(load.status === 'ready' ? load.data.favourites : NO_FAVOURITES);
  // Members' own reviews (coach_reviews, step 6), newest first.
  const reviewsLoad = useRemoteLoad<CoachReview[]>('discover-reviews', remote, () => fetchRecentReviews(REVIEW_POOL));

  if (remote && load.status === 'loading') return <LoadState status="loading" />;
  if (remote && load.status === 'error') return <LoadState status="error" onRetry={load.retry} />;
  if (remote && reviewsLoad.status === 'loading') return <LoadState status="loading" />;
  if (remote && reviewsLoad.status === 'error') return <LoadState status="error" onRetry={reviewsLoad.retry} />;
  // Signed out there is no directory: the demo's fictional coaches are gone
  // (LAUNCH-CHECKLIST §2), so Discover shows its "still filling up" state.
  const coaches: DirectoryCoach[] = remote && load.status === 'ready' ? load.data.coaches : [];
  // Only reviews of coaches the member can see on the list.
  const stories = remote && reviewsLoad.status === 'ready'
    ? reviewsLoad.data
        .flatMap((review) => {
          const coach = coaches.find((c) => c.id === review.coachId);
          return coach ? [{ review, coach }] : [];
        })
        .slice(0, STORIES_SHOWN)
    : [];
  // No coaches at all is not a failed search: until real pros sign up the
  // whole directory is empty, and "No pros match your search" over an
  // untouched search box reads like the screen is broken. Search, filters
  // and the specialty rail are hidden too — there is nothing to filter.
  const directoryEmpty = coaches.length === 0;
  const rail = specialtyRail(coaches);

  // The member's own coaching goal, used to float matching pros to the
  // top and to caption the section. Absent for a member who has not
  // finished onboarding — in which case the section is simply unlabelled
  // rather than claiming a match that was never made.
  // Signed in, the focus slug onboarding stored names the specialty by its
  // icon key; signed out, the demo member's roster row carries the value.
  const goalSpecialty = remote
    ? (load.status === 'ready' ? SPECIALTIES.find((s) => s.icon === load.data.focus)?.value ?? null : null)
    : getClient(CLIENT_ID)?.specialty ?? null;
  const goalLabelKey = SPECIALTIES.find((s) => s.value === goalSpecialty)?.labelKey ?? null;

  // A coach's specialty label, translated. Used for display and, in
  // filterCoaches, for search — so searching in Arabic matches the
  // Arabic words actually on screen.
  const labelOf = (coach: DirectoryCoach) => {
    const def = SPECIALTIES.find((s) => s.value === coach.specialty);
    return def ? t(def.labelKey) : coach.specialty;
  };

  const results = filterCoaches(coaches, filters, labelOf, goalSpecialty);
  // "Recommended for you" only when the list really is: no search or
  // specialty narrowing it, and at least one coach on it matching the
  // member's goal (filterCoaches floats those first). Otherwise it is every
  // coach, unranked for this member, and says so. The demo member's goal is
  // Life coaching, which no demo coach offers, and the heading claimed a
  // match above a career coach.
  const goalMatched = !filters.specialty && !filters.search.trim() && !!goalLabelKey
    && results.some((c) => c.specialty === goalSpecialty);
  const trending = coaches.filter(hasRating).sort((a, b) => b.rating - a.rating).slice(0, 3);
  const filtersActive = hasActiveFilters(filters);

  const patch = (p: Partial<DirectoryFilters>) => setFilters((f) => ({ ...f, ...p }));

  function openCoach(coach: DirectoryCoach) {
    // The router's params carry which coach was tapped. The prototype had
    // to stash it in its store because each .dc.html artboard is a
    // separate page with its own state; here the screen is a component
    // and the id is simply an argument.
    nav({ screen: 'coachPreview', params: { coachId: coach.id } });
  }

  function toggleFav(coachId: string) {
    void favourites.toggle(coachId);
  }


  const heroGrad = 'var(--hero-grad)';

  // A real coach with only free offerings has no price to show; the demo's all do.
  const priceLabel = (coach: DirectoryCoach) =>
    isReal(coach) && !coach.hasPaidOffering ? t('offeringsFree') : money(coach.price);

  function avatarContent(coach: DirectoryCoach) {
    return isReal(coach) && coach.avatarPhotoUrl
      ? <img className="discover-avatar-photo" src={coach.avatarPhotoUrl} alt="" />
      : initialsOf(coach.name);
  }

  function ratingBadge(coach: DirectoryCoach) {
    return hasRating(coach) ? (
      <span className="discover-rating">
        <StarIcon size={10} color="var(--amber)" />
        {coach.rating.toFixed(1)}
      </span>
    ) : (
      <span className="discover-meta-text">{t('discoverNewCoach')}</span>
    );
  }

  function coachCard(coach: DirectoryCoach) {
    const isFav = favourites.isFavourite(coach.id);
    const showGoalMatch = !filters.specialty && !!goalSpecialty && coach.specialty === goalSpecialty;
    return (
      <div key={coach.id} className="discover-card">
        <button
          type="button"
          className="discover-card-main"
          onClick={() => openCoach(coach)}
        >
          <div className="discover-avatar-wrap">
            <div
              className="discover-avatar"
              style={{
                background: `linear-gradient(135deg, ${coach.color} 0%, ${darken(coach.color, 35)} 100%)`,
                boxShadow: `0 10px 18px -8px ${coach.color}66`,
              }}
            >
              {avatarContent(coach)}
            </div>
            {coach.verified && (
              <span className="discover-verified-badge">
                <CheckIcon size={10} color="#FFFFFF" />
              </span>
            )}
          </div>

          <div className="discover-card-body">
            <div className="discover-card-name-row">
              <span aria-hidden="true" className="discover-flag">{countryFlagOf(coach.country)}</span>
              <span className="discover-card-name"><bdi>{coach.name}</bdi></span>
            </div>
            <div className="discover-card-specialty" style={{ color: coach.color }}>{labelOf(coach)}</div>
            <div className="discover-card-meta">
              {ratingBadge(coach)}
              <span className="discover-meta-text">{priceLabel(coach)}</span>
              {coach.years > 0 && <span className="discover-meta-text">{t('discoverYearsExp', { n: coach.years })}</span>}
              {coach.availability === 'today' && (
                <span className="discover-pill discover-pill-green">
                  <span className="discover-dot" />
                  {t('discoverAvailableToday')}
                </span>
              )}
              {coach.featured && (
                <span className="discover-pill discover-pill-accent">{t('discoverFeatured')}</span>
              )}
              {showGoalMatch && (
                <span className="discover-pill discover-pill-green">{t('discoverMatchesGoal')}</span>
              )}
            </div>
          </div>
        </button>

        <button
          type="button"
          className={`discover-heart${isFav ? ' discover-heart-on' : ''}`}
          aria-label={isFav
            ? t('discoverFavouriteRemove', { name: coach.name })
            : t('discoverFavouriteAdd', { name: coach.name })}
          aria-pressed={isFav}
          onClick={() => toggleFav(coach.id)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="phone-frame discover-screen">
      <div className="discover-hero" style={{ background: heroGrad }}>
        <div className="discover-hero-row">
          <div>
            <div className="discover-eyebrow">{t('discoverEyebrow')}</div>
            <h1 className="discover-title">{t('discoverTitle')}</h1>
          </div>
          <div className="discover-hero-actions">
            <button
              type="button"
              className="discover-hero-btn"
              aria-label={t('notifications')}
              onClick={() => nav('clientNotifications')}
            >
              <BellIcon size={16} color="#FFFFFF" />
            </button>
          </div>
        </div>
      </div>

      {!directoryEmpty && (
      <div className="discover-searchbar">
        <div className="discover-search">
          <SearchIcon size={16} color="var(--ink-soft)" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder={t('discoverSearchPlaceholder')}
            aria-label={t('discoverSearchPlaceholder')}
          />
          {filters.search && (
            <button
              type="button"
              className="discover-search-clear"
              aria-label={t('clearSearch')}
              onClick={() => patch({ search: '' })}
            >
              <CloseIcon size={9} color="var(--ink-soft)" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="discover-filter-btn"
          aria-label={t('discoverFilter')}
          onClick={() => setSheetOpen(true)}
        >
          <FilterIcon size={18} color="#FFFFFF" />
          {filtersActive && <span className="discover-filter-dot" />}
        </button>
      </div>
      )}

      <div className="discover-scroll">
        {favourites.failed && <div className="discover-fav-error" role="alert">{t('favouriteSaveFailed')}</div>}
        {directoryEmpty ? (
          <div className="discover-no-coaches">
            <span className="discover-no-coaches-icon">
              <SearchIcon size={26} color="var(--ink-soft)" />
            </span>
            <div className="discover-no-coaches-title">{t('discoverNoCoachesTitle')}</div>
            <div className="discover-no-coaches-body">{t('discoverNoCoachesBody')}</div>
          </div>
        ) : (
        <>
        <div className="discover-rail" role="group" aria-label={t('discoverFilterTitle')}>
          <button
            type="button"
            className="discover-rail-item"
            aria-pressed={filters.specialty === ''}
            onClick={() => patch({ specialty: '' })}
          >
            <span
              className="discover-rail-circle"
              style={filters.specialty === ''
                ? { background: 'var(--ink-soft)', boxShadow: '0 10px 20px -8px rgba(122,113,102,.6)' }
                : undefined}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={filters.specialty === '' ? '#FFFFFF' : 'var(--ink-soft)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </span>
            <span className={`discover-rail-label${filters.specialty === '' ? ' discover-rail-label-on' : ''}`}>
              {t('discoverSpecialtyAll')}
            </span>
          </button>

          {rail.map((spec) => {
            const selected = filters.specialty === spec.value;
            const colour = specialtyColour(coaches, spec.value);
            return (
              <button
                key={spec.value}
                type="button"
                className="discover-rail-item"
                aria-pressed={selected}
                onClick={() => patch({ specialty: selected ? '' : spec.value })}
              >
                <span
                  className="discover-rail-circle"
                  style={selected
                    ? { background: colour, boxShadow: `0 10px 20px -8px ${colour}99` }
                    : undefined}
                >
                  <SpecialtyIcon specialty={spec.icon} size={18} color={selected ? '#FFFFFF' : colour} />
                </span>
                <span className={`discover-rail-label${selected ? ' discover-rail-label-on' : ''}`}>
                  {t(spec.labelKey)}
                </span>
              </button>
            );
          })}
        </div>

        <section className="discover-section">
          <div className="discover-section-head">
            <div>
              <h2 className="discover-section-title">{t(goalMatched ? 'discoverRecommended' : 'discoverAllPros')}</h2>
              {goalMatched && goalLabelKey && (
                <div className="discover-section-sub">
                  {t('discoverRecommendedSub', { specialty: t(goalLabelKey) })}
                </div>
              )}
            </div>
            <span className="discover-count">
              {results.length === 1 ? t('discoverResultCountOne') : t('discoverResultCount', { n: results.length })}
            </span>
          </div>

          {results.length > 0 ? (
            results.map(coachCard)
          ) : (
            <div className="discover-empty">
              <span className="discover-empty-icon">
                <SearchIcon size={22} color="var(--ink-soft)" />
              </span>
              <div className="discover-empty-text">{t('discoverNoResults')}</div>
            </div>
          )}
        </section>

        {trending.length > 0 && (
        <section className="discover-section">
          <h2 className="discover-section-title">{t('discoverTrending')}</h2>
          <div className="discover-trending">
            {trending.map((coach, i) => (
              <button
                key={coach.id}
                type="button"
                className="discover-trend-card"
                onClick={() => openCoach(coach)}
              >
                <div
                  className="discover-trend-top"
                  style={{ background: `linear-gradient(135deg, ${coach.color} 0%, ${darken(coach.color, 35)} 100%)` }}
                >
                  <span className="discover-trend-avatar">{avatarContent(coach)}</span>
                  {i === 0 && (
                    <span className="discover-trend-badge" style={{ color: coach.color }}>
                      {t('discoverTopRated')}
                    </span>
                  )}
                </div>
                <div className="discover-trend-body">
                  <div className="discover-trend-name"><bdi>{coach.name}</bdi></div>
                  <div className="discover-trend-meta">
                    {ratingBadge(coach)}
                    <span className="discover-meta-text">{priceLabel(coach)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
        )}

        {/* Signed in, members' own reviews of coaches on the list, signed
            with a first name and last initial (coach_reviews). */}
        {stories.length > 0 && (
        <section className="discover-section">
          <div>
            <h2 className="discover-section-title">{t('discoverStories')}</h2>
            <div className="discover-section-sub">{t('discoverStoriesSub')}</div>
          </div>
          {stories.map(({ review, coach }) => (
            <div key={review.id} className="discover-story">
              <div className="discover-story-head">
                <span className="discover-story-avatar" style={{ background: review.avatarBg }}>
                  {initialsOf(review.reviewerName)}
                </span>
                <div className="discover-story-who">
                  <div className="discover-story-name"><bdi>{review.reviewerName}</bdi></div>
                  <div className="discover-story-meta">
                    {t('discoverStoryWith', { coach: isolate(coach.name) })} · {instantDate(review.createdAt)}
                  </div>
                </div>
                <svg width="20" height="16" viewBox="0 0 24 20" fill="var(--accent-soft)" aria-hidden="true">
                  <path d="M4 10c0-4 2.5-7 6.5-8l1 2.3C8.8 5.2 7.5 7 7.3 9H10v7H2v-6zm11 0c0-4 2.5-7 6.5-8l1 2.3C19.8 5.2 18.5 7 18.3 9H21v7h-8v-6z" />
                </svg>
              </div>
              <p className="discover-story-quote" dir="auto">{review.comment}</p>
              <div className="discover-story-helpful" role="img" aria-label={t('rateCoachStarLabel', { n: review.rating })}>
                {'★'.repeat(review.rating)}
              </div>
            </div>
          ))}
        </section>
        )}
        </>
        )}
      </div>

      <MemberTabBar />

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('discoverFilterTitle')}>
        <div className="discover-filters">
          <FilterGroup label={t('discoverPriceLabel')}>
            {([
              ['all', t('discoverPriceAny')],
              ['under700', t('discoverPriceUnder700')],
              ['700to850', t('discoverPrice700to850')],
              ['over850', t('discoverPriceOver850')],
            ] as const).map(([key, label]) => (
              <Chip key={key} label={label} on={filters.price === key} onClick={() => patch({ price: key })} />
            ))}
          </FilterGroup>

          <FilterGroup label={t('discoverRatingLabel')}>
            {[0, 4.5, 4.7, 4.9].map((value) => (
              <Chip
                key={value}
                label={value === 0 ? t('discoverRatingAny') : `${value}+`}
                on={filters.minRating === value}
                onClick={() => patch({ minRating: value })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t('discoverCountryLabel')}>
            <button type="button" className="discover-country-btn" onClick={() => setCountryOpen(true)}>
              <span>
                {filters.country
                  ? `${countryFlagOf(filters.country)} ${filters.country}`
                  : t('discoverCountryAny')}
              </span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </FilterGroup>

          <FilterGroup label={t('discoverAvailabilityLabel')}>
            {([
              ['all', t('discoverAvailabilityAny')],
              ['today', t('discoverAvailabilityToday')],
              ['this-week', t('discoverAvailabilityThisWeek')],
              ['next-week', t('discoverAvailabilityNextWeek')],
            ] as const).map(([key, label]) => (
              <Chip key={key} label={label} on={filters.availability === key} onClick={() => patch({ availability: key })} />
            ))}
          </FilterGroup>

          <FilterGroup label={t('discoverLanguageLabel')}>
            {([
              ['', t('discoverLanguageAny')],
              ['Arabic', t('discoverLanguageArabic')],
              ['English', t('discoverLanguageEnglish')],
              ['French', t('discoverLanguageFrench')],
            ] as const).map(([key, label]) => (
              <Chip key={key || 'any'} label={label} on={filters.language === key} onClick={() => patch({ language: key })} />
            ))}
          </FilterGroup>

          <FilterGroup label={t('discoverExperienceLabel')}>
            {[0, 3, 5, 8].map((value) => (
              <Chip
                key={value}
                label={value === 0 ? t('discoverExperienceAny') : `${value}+`}
                on={filters.minYears === value}
                onClick={() => patch({ minYears: value })}
              />
            ))}
          </FilterGroup>

          <div className="discover-filter-actions">
            <button
              type="button"
              className="discover-filter-clear"
              // Search and specialty are not part of the sheet, so clearing
              // it must not wipe what the member typed or tapped outside it.
              onClick={() => setFilters((f) => ({ ...NO_FILTERS, search: f.search, specialty: f.specialty }))}
            >
              {t('discoverClearAll')}
            </button>
            <button type="button" className="discover-filter-apply" onClick={() => setSheetOpen(false)}>
              {t('discoverShowResults')}
            </button>
          </div>
        </div>
      </BottomSheet>

      <CountryPicker
        open={countryOpen}
        onClose={() => setCountryOpen(false)}
        title={t('discoverCountryLabel')}
        searchPlaceholder={t('discoverSearchCountry')}
        noResultsLabel={t('discoverNoCountryResults')}
        // The picker keys rows by ISO code; the directory stores country
        // names, so the selection is translated at this boundary rather
        // than changing either side's own vocabulary.
        selectedCode={COUNTRIES.find((c) => c.name === filters.country)?.code ?? ''}
        onSelect={(country) => {
          patch({ country: country.name });
          setCountryOpen(false);
        }}
      />
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="discover-filter-group">
      <div className="discover-filter-label">{label}</div>
      <div className="discover-chips">{children}</div>
    </div>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`discover-chip${on ? ' discover-chip-on' : ''}`}
      aria-pressed={on}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
