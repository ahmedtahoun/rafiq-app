import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import {
  SearchIcon, FilterIcon, BellIcon, SunIcon, MoonIcon, CloseIcon,
  StarIcon, CheckIcon, HomeIcon, ProgramsIcon, TasksIcon, ScheduleIcon, PersonIcon,
} from '../components/icons';
import { SpecialtyIcon } from '../components/specialtyIcons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import { CountryPicker } from '../components/CountryPicker';
import { SPECIALTIES } from '../lib/specialties';
import { COUNTRIES } from '../lib/countries';
import { getClient } from '../lib/mockStore';
import {
  getDirectoryCoaches, getTrendingCoaches, filterCoaches, hasActiveFilters,
  getFavouriteCoaches, toggleFavouriteCoach, initialsOf, countryFlagOf,
  NO_FILTERS, type DirectoryCoach, type DirectoryFilters,
} from '../lib/directory';
import './Discover.css';

const CLIENT_ID = 'sara';
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

// Member stories. Illustrative sample content, exactly as the prototype
// carries it — the app has no cross-coach review store, and inventing one
// silently would put fabricated numbers on screen. Kept beside the copy
// it belongs to so it is obvious what is real and what is a sample.
const STORY_KEYS = [
  { id: 's1', coachId: 'mariam', reviewer: 'Nour Hassan', reviewerAr: 'نور حسن', color: '#7A7166', daysAgo: 2, helpful: 24 },
  { id: 's2', coachId: 'dina', reviewer: 'Omar Fathy', reviewerAr: 'عمر فتحي', color: '#3E6FB0', daysAgo: 5, helpful: 18 },
];
const STORY_QUOTES: Record<string, { en: string; ar: string }> = {
  s1: {
    en: 'The meditation sessions completely changed how I handle stress. Highly recommend.',
    ar: 'جلسات التأمل غيّرت طريقة تعاملي مع التوتر تمامًا. أنصح بها بشدة.',
  },
  s2: {
    en: 'Dina helped me get a clear career direction in just 3 sessions.',
    ar: 'ساعدتني دينا في تحديد مسار مهني واضح خلال 3 جلسات فقط.',
  },
};

export default function Discover() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const [filters, setFilters] = useState<DirectoryFilters>(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  // Favourites live in localStorage, which is not reactive — this mirrors
  // them into render state so a tapped heart repaints immediately.
  const [favourites, setFavourites] = useState(getFavouriteCoaches);

  const coaches = getDirectoryCoaches();
  const rail = specialtyRail(coaches);

  // The member's own coaching goal, used to float matching pros to the
  // top and to caption the section. Absent for a member who has not
  // finished onboarding — in which case the section is simply unlabelled
  // rather than claiming a match that was never made.
  const member = getClient(CLIENT_ID);
  const goalSpecialty = member?.specialty ?? null;
  const goalLabelKey = SPECIALTIES.find((s) => s.value === goalSpecialty)?.labelKey ?? null;

  // A coach's specialty label, translated. Used for display and, in
  // filterCoaches, for search — so searching in Arabic matches the
  // Arabic words actually on screen.
  const labelOf = (coach: DirectoryCoach) => {
    const def = SPECIALTIES.find((s) => s.value === coach.specialty);
    return def ? t(def.labelKey) : coach.specialty;
  };

  const results = filterCoaches(coaches, filters, labelOf, goalSpecialty);
  const trending = getTrendingCoaches();
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
    setFavourites(toggleFavouriteCoach(coachId));
  }

  const navItems: BottomNavItem[] = [
    { key: 'discover', label: t('discoverNav'), icon: SearchIcon, screen: 'discover' },
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'clientHome' },
    { key: 'programs', label: t('myProgramsNav'), icon: ProgramsIcon, screen: 'myPrograms' },
    { key: 'tasks', label: t('clientTasksNav'), icon: TasksIcon, screen: 'clientTasks' },
    { key: 'schedule', label: t('clientScheduleNav'), icon: ScheduleIcon, screen: 'clientSchedule' },
    { key: 'coach', label: t('clientCoachNav'), icon: PersonIcon, screen: 'clientCoach' },
  ];

  const heroGrad = `linear-gradient(135deg, ${ACCENT_HEX} 0%, ${darken(ACCENT_HEX, 45)} 100%)`;

  function coachCard(coach: DirectoryCoach) {
    const isFav = !!favourites[coach.id];
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
              {initialsOf(coach.name)}
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
              <span className="discover-card-name">{coach.name}</span>
            </div>
            <div className="discover-card-specialty" style={{ color: coach.color }}>{labelOf(coach)}</div>
            <div className="discover-card-meta">
              <span className="discover-rating">
                <StarIcon size={10} color="var(--amber)" />
                {coach.rating.toFixed(1)}
              </span>
              <span className="discover-meta-text">{coach.price} {t('currency')}</span>
              <span className="discover-meta-text">{t('discoverYearsExp', { n: coach.years })}</span>
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
              aria-label={t('switchLanguage')}
              onClick={() => setLang(isAr ? 'en' : 'ar')}
            >
              {isAr ? 'EN' : 'ع'}
            </button>
            <button
              type="button"
              className="discover-hero-btn"
              aria-label={t('toggleDarkMode')}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
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

      <div className="discover-scroll">
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
              <h2 className="discover-section-title">{t('discoverRecommended')}</h2>
              {!filters.specialty && !filters.search.trim() && goalLabelKey && (
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
                  <span className="discover-trend-avatar">{initialsOf(coach.name)}</span>
                  {i === 0 && (
                    <span className="discover-trend-badge" style={{ color: coach.color }}>
                      {t('discoverTopRated')}
                    </span>
                  )}
                </div>
                <div className="discover-trend-body">
                  <div className="discover-trend-name">{coach.name}</div>
                  <div className="discover-trend-meta">
                    <span className="discover-rating">
                      <StarIcon size={10} color="var(--amber)" />
                      {coach.rating.toFixed(1)}
                    </span>
                    <span className="discover-meta-text">{coach.price} {t('currency')}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="discover-section">
          <div>
            <h2 className="discover-section-title">{t('discoverStories')}</h2>
            <div className="discover-section-sub">{t('discoverStoriesSub')}</div>
          </div>
          {STORY_KEYS.map((story) => {
            const coach = coaches.find((c) => c.id === story.coachId);
            const reviewer = isAr ? story.reviewerAr : story.reviewer;
            const withLabel = isAr ? `مع ${coach?.name ?? ''}` : `with ${coach?.name ?? ''}`;
            const ago = isAr ? `قبل ${story.daysAgo} أيام` : `${story.daysAgo} days ago`;
            return (
              <div key={story.id} className="discover-story">
                <div className="discover-story-head">
                  <span className="discover-story-avatar" style={{ background: story.color }}>
                    {initialsOf(reviewer)}
                  </span>
                  <div className="discover-story-who">
                    <div className="discover-story-name">{reviewer}</div>
                    <div className="discover-story-meta">{withLabel} · {ago}</div>
                  </div>
                  <svg width="20" height="16" viewBox="0 0 24 20" fill="var(--accent-soft)" aria-hidden="true">
                    <path d="M4 10c0-4 2.5-7 6.5-8l1 2.3C8.8 5.2 7.5 7 7.3 9H10v7H2v-6zm11 0c0-4 2.5-7 6.5-8l1 2.3C19.8 5.2 18.5 7 18.3 9H21v7h-8v-6z" />
                  </svg>
                </div>
                <p className="discover-story-quote">{STORY_QUOTES[story.id][isAr ? 'ar' : 'en']}</p>
                <div className="discover-story-helpful">
                  {t('discoverStoryHelpful', { n: story.helpful })}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <BottomNav items={navItems} />

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
