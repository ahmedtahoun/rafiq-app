/**
 * The browsable coach directory behind Discover and CoachPreview: the
 * shape of a directory coach, and filtering and ordering.
 *
 * The coaches themselves are real ones, from Supabase (requestData.ts's
 * fetchDirectory, the public `coach_directory` view). The eight fictional
 * coaches the design prototype carried are gone (LAUNCH-CHECKLIST §2: a
 * marketplace of invented coaches misleads members, and Apple rejects
 * placeholder content), so signed out there is no directory at all and
 * Discover shows its "still filling up" state.
 *
 * Nothing here is stored. A member's saved coaches are their own
 * `favourite_coaches` rows (favouriteData.ts), and their session requests
 * are real ones (session_requests, requestData.ts), signed in only.
 */
import { COUNTRIES } from './countries';
import type { SpecialtyIconKey } from '../components/specialtyIcons';

// ---------------------------------------------------------------------------
// The dataset
// ---------------------------------------------------------------------------

/** How soon a coach has an opening. Ordered: a 'today' coach also
    satisfies a "this week" filter, which is why these are ranked below
    rather than compared for equality. */
export type Availability = 'today' | 'this-week' | 'next-week';

const AVAILABILITY_RANK: Record<Availability, number> = {
  today: 0,
  'this-week': 1,
  'next-week': 2,
};

/**
 * One browsable coach.
 *
 * `specialty` is the same English stored value SPECIALTIES uses, so a
 * coach's specialty resolves to the same icon and translated label the
 * onboarding picker already gives it — no second vocabulary.
 */
export interface DirectoryCoach {
  id: string;
  name: string;
  /** Stored value from src/lib/specialties.ts (never translated). */
  specialty: string;
  /** Icon key, mirroring the specialty above. */
  icon: SpecialtyIconKey;
  /** The card's avatar colour — stands in for a photo nobody has uploaded. */
  color: string;
  rating: number;
  /** EGP per session, matching the currency every other screen shows. */
  price: number;
  years: number;
  /** Full country name, as COUNTRIES stores it (not an ISO code). */
  country: string;
  languages: string[];
  /** null: a real coach who hasn't set any weekly hours yet. */
  availability: Availability | null;
  verified?: boolean;
  featured?: boolean;
}

/** Two-letter initials, the same treatment every avatar in the app uses. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function countryFlagOf(country: string): string {
  return COUNTRIES.find((c) => c.name === country)?.flag ?? '';
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface DirectoryFilters {
  /** A SPECIALTIES value, or '' for no specialty filter. */
  specialty: string;
  search: string;
  price: 'all' | 'under700' | '700to850' | 'over850';
  minRating: number;
  /** Full country name, or '' for any. */
  country: string;
  availability: 'all' | Availability;
  /** Language name as DirectoryCoach stores it, or '' for any. */
  language: string;
  minYears: number;
}

export const NO_FILTERS: DirectoryFilters = {
  specialty: '',
  search: '',
  price: 'all',
  minRating: 0,
  country: '',
  availability: 'all',
  language: '',
  minYears: 0,
};

/** Whether anything in the filter sheet is narrowing results — drives the
    dot on the filter button. Search and specialty are excluded: both have
    their own visible control outside the sheet. */
export function hasActiveFilters(f: DirectoryFilters): boolean {
  return (
    f.price !== 'all' ||
    f.minRating > 0 ||
    f.country !== '' ||
    f.availability !== 'all' ||
    f.language !== '' ||
    f.minYears > 0
  );
}

function priceMatches(coach: DirectoryCoach, price: DirectoryFilters['price']): boolean {
  if (price === 'under700') return coach.price < 700;
  if (price === '700to850') return coach.price >= 700 && coach.price <= 850;
  if (price === 'over850') return coach.price > 850;
  return true;
}

/**
 * Apply the filters, then order the survivors.
 *
 * `searchLabel` translates a coach's specialty for matching, so a member
 * reading Arabic can search the Arabic word they can actually see on the
 * card. The prototype matched the English label only, which silently
 * returned nothing for every Arabic search.
 *
 * `goalSpecialty` is the member's own coaching goal: with no specialty
 * filter chosen, coaches who match it sort to the top. Featured coaches
 * outrank even that — it is a paid placement, and burying it under a
 * personalisation signal would make it not one.
 */
export function filterCoaches(
  coaches: DirectoryCoach[],
  filters: DirectoryFilters,
  searchLabel: (coach: DirectoryCoach) => string,
  goalSpecialty: string | null,
): DirectoryCoach[] {
  const q = filters.search.trim().toLowerCase();

  return coaches
    .filter((c) => {
      if (filters.specialty && c.specialty !== filters.specialty) return false;
      if (q && !c.name.toLowerCase().includes(q) && !searchLabel(c).toLowerCase().includes(q)) return false;
      if (!priceMatches(c, filters.price)) return false;
      if (filters.minRating && c.rating < filters.minRating) return false;
      if (filters.country && c.country !== filters.country) return false;
      if (filters.availability !== 'all'
        && (c.availability === null || AVAILABILITY_RANK[c.availability] > AVAILABILITY_RANK[filters.availability])) return false;
      if (filters.language && !c.languages.includes(filters.language)) return false;
      if (filters.minYears && c.years < filters.minYears) return false;
      return true;
    })
    .sort((a, b) => {
      const featured = Number(!!b.featured) - Number(!!a.featured);
      if (featured !== 0) return featured;
      if (!filters.specialty && goalSpecialty) {
        const goal = Number(b.specialty === goalSpecialty) - Number(a.specialty === goalSpecialty);
        if (goal !== 0) return goal;
      }
      return 0;
    });
}

