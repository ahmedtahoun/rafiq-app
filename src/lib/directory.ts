/**
 * The browsable coach directory behind Discover and CoachPreview.
 *
 * This is the one place the app models *more than one* Pro. Everywhere
 * else — `getCoachProfile()` in mockStore.ts — there is exactly one coach
 * record, because every coach-side screen is the signed-in Pro looking at
 * their own data. Discover's whole premise is the opposite: a member
 * browsing pros they have no relationship with yet.
 *
 * So this file carries a **seeded mock dataset**, ported from the design
 * prototype's own Discover.dc.html coach list, and is deliberately NOT
 * wired to Supabase. Real multi-tenant discovery needs a public,
 * RLS-readable projection of `profiles` plus ratings aggregated across
 * members — none of which exists yet, and guessing at its shape now would
 * bake a wrong one into two screens. Everything below is shaped as the
 * seam that projection will fill: swap DIRECTORY_COACHES for a query and
 * the screens do not change.
 *
 * What IS real: favourites and session requests persist to localStorage
 * under the same `rafiq_` prefix as the rest of the app, following the
 * file-wide rule that a store starts empty and only a real feature writes
 * to it.
 */
import { COUNTRIES } from './countries';
import type { SpecialtyIconKey } from '../components/specialtyIcons';

const PREFIX = 'rafiq_';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, quota) — same no-op fallback
    // mockStore.ts and appStore.ts both use.
  }
}

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
  availability: Availability;
  verified?: boolean;
  featured?: boolean;
}

/**
 * The seed. Ported 1:1 from Discover.dc.html's own `baseCoaches`, with
 * its ad-hoc specialty keys mapped onto the app's real SPECIALTIES
 * values so one vocabulary covers both.
 *
 * These are illustrative demo records, not real people. They are a
 * constant rather than a seeded-then-mutable store because nothing in the
 * app writes a coach — only a real directory backend ever will.
 */
export const DIRECTORY_COACHES: DirectoryCoach[] = [
  { id: 'mariam', name: 'Mariam Adel', specialty: 'Meditation coaching', icon: 'meditation', color: '#7A6BAE', rating: 4.8, price: 750, years: 6, country: 'Egypt', languages: ['Arabic', 'English'], availability: 'this-week' },
  { id: 'ahmed', name: 'Ahmed Nabil', specialty: 'Yoga coaching', icon: 'yoga', color: '#5C8A6B', rating: 4.7, price: 600, years: 4, country: 'Jordan', languages: ['Arabic'], availability: 'today' },
  { id: 'dina', name: 'Dina Kamal', specialty: 'Career coaching', icon: 'career', color: '#3E6F6F', rating: 4.9, price: 900, years: 8, country: 'Saudi Arabia', languages: ['Arabic', 'English'], availability: 'today', verified: true, featured: true },
  { id: 'hana', name: 'Hana Farouk', specialty: 'Sleep coaching', icon: 'sleep', color: '#4A5A78', rating: 4.6, price: 700, years: 5, country: 'United Arab Emirates', languages: ['English', 'Arabic'], availability: 'next-week' },
  { id: 'karim', name: 'Karim Adly', specialty: 'Relationship coaching', icon: 'relationship', color: '#A65D6E', rating: 4.8, price: 800, years: 7, country: 'Egypt', languages: ['Arabic', 'English'], availability: 'this-week' },
  { id: 'rania', name: 'Rania Saeed', specialty: 'Nutrition coaching', icon: 'nutrition', color: '#3E6FB0', rating: 4.9, price: 850, years: 6, country: 'Morocco', languages: ['Arabic', 'French', 'English'], availability: 'this-week', verified: true },
  { id: 'youssef', name: 'Youssef Adel', specialty: 'Free diving coaching', icon: 'freeDiving', color: '#1F7A8C', rating: 4.8, price: 950, years: 9, country: 'Egypt', languages: ['Arabic', 'English'], availability: 'today' },
  { id: 'tarek', name: 'Tarek Hamdy', specialty: 'Scuba diving coaching', icon: 'scuba', color: '#26547C', rating: 4.7, price: 1100, years: 10, country: 'Egypt', languages: ['Arabic', 'English'], availability: 'next-week' },
];

export function getDirectoryCoaches(): DirectoryCoach[] {
  return DIRECTORY_COACHES;
}

export function getDirectoryCoach(id: string): DirectoryCoach | undefined {
  return DIRECTORY_COACHES.find((c) => c.id === id);
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
        && AVAILABILITY_RANK[c.availability] > AVAILABILITY_RANK[filters.availability]) return false;
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

/** The three highest-rated coaches, for Discover's "trending" rail. */
export function getTrendingCoaches(): DirectoryCoach[] {
  return [...DIRECTORY_COACHES].sort((a, b) => b.rating - a.rating).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Favourites
// ---------------------------------------------------------------------------

/** Saved coaches, keyed by id. Starts empty — only the heart button writes. */
export function getFavouriteCoaches(): Record<string, boolean> {
  return readLocal<Record<string, boolean>>('fav_coaches', {});
}

export function toggleFavouriteCoach(coachId: string): Record<string, boolean> {
  const favourites = getFavouriteCoaches();
  const next = { ...favourites, [coachId]: !favourites[coachId] };
  if (!next[coachId]) delete next[coachId];
  writeLocal('fav_coaches', next);
  return next;
}

// ---------------------------------------------------------------------------
// Session requests
// ---------------------------------------------------------------------------

/**
 * A member asking a directory coach for a session.
 *
 * Booking a coach you have no relationship with cannot go through
 * mockStore's schedule: that models the signed-in Pro's own calendar, and
 * these coaches are not that Pro. So a request is recorded here, pending,
 * and nothing reads it yet — MyCoaches.dc.html (Track B #8) is the screen
 * that shows a member their pending requests. Writing the seam now means
 * CoachPreview's confirm button does something durable instead of
 * pretending, which is the same rule the rest of this codebase follows.
 */
export interface SessionRequest {
  coachId: string;
  coachName: string;
  /** Which of the coach's offerings was picked. */
  offeringId: string;
  offeringName: string;
  /** Day and time exactly as the member saw them on the picker. */
  when: string;
  price: number;
  /** Set by requestSession, not by the caller. */
  requestedAtMs: number;
}

export function getSessionRequests(): SessionRequest[] {
  return readLocal<SessionRequest[]>('coach_requests', []);
}

/**
 * Record a request, replacing any earlier one for the same coach.
 *
 * De-duping by coach matches how the design's own pending list reads —
 * one card per coach you are waiting on, not one per tap — so a member
 * who changes their mind about the time does not end up with two
 * requests to the same person.
 */
export function requestSession(request: Omit<SessionRequest, 'requestedAtMs'>): SessionRequest[] {
  const next = getSessionRequests().filter((r) => r.coachId !== request.coachId);
  next.push({ ...request, requestedAtMs: Date.now() });
  writeLocal('coach_requests', next);
  return next;
}
