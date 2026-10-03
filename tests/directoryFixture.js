/**
 * A test directory of eight coaches, as `coach_directory` rows for
 * tests/fakeSupabase.js. Test data, not app data: the app's own fictional
 * coaches are gone (LAUNCH-CHECKLIST §2), so Discover and the coach page are
 * exercised signed in, over these. The spread mirrors the old demo's —
 * eight specialties, prices either side of the filter bands, three
 * countries beyond Egypt, one featured — so the same behaviours stay tested.
 */

export const DIRECTORY_MEMBER = 'member-1';

const row = (id, name, specialty, price, rating, years, country, languages, extra = {}) => ({
  coach_id: id, full_name: name, title: specialty, country, country_flag: '', languages, experience_years: years,
  verified: false, featured: false, from_price: price, rating_count: 10, rating_avg: rating, bio: `${name} coaches ${specialty.toLowerCase()}.`,
  avatar_photo_url: null, session_mode: 'online', certifications: [], cover_photo_url: null, ...extra,
});

export const DIRECTORY = [
  row('c-laila', 'Laila Hassan', 'Meditation coaching', 750, 4.8, 6, 'Egypt', ['Arabic', 'English']),
  row('c-omar', 'Omar Nabil', 'Yoga coaching', 600, 4.7, 4, 'Jordan', ['Arabic']),
  row('c-dina', 'Dina Farouk', 'Career coaching', 900, 4.9, 8, 'Saudi Arabia', ['Arabic', 'English'], { verified: true, featured: true }),
  row('c-salma', 'Salma Fouad', 'Sleep coaching', 700, 4.6, 5, 'United Arab Emirates', ['English', 'Arabic']),
  row('c-karim', 'Karim Mansour', 'Relationship coaching', 800, 4.8, 7, 'Egypt', ['Arabic', 'English']),
  row('c-rana', 'Rana Aziz', 'Nutrition coaching', 850, 4.9, 6, 'Morocco', ['Arabic', 'French', 'English'], { verified: true }),
  row('c-youssef', 'Youssef Kamel', 'Free diving coaching', 950, 4.8, 9, 'Egypt', ['Arabic', 'English']),
  row('c-tamer', 'Tamer Said', 'Scuba diving coaching', 1100, 4.7, 10, 'Egypt', ['Arabic', 'English']),
];

/** Weekly hours for a coach: weekdays (0 = Monday) 9–17. */
export const hours = (coachId, days = [0, 1, 2, 3, 4]) =>
  days.map((d) => ({ coach_id: coachId, day_of_week: d, enabled: true, start_hour: 9, end_hour: 17 }));

/** Everything a signed-in member's Discover and coach pages read. */
export const directoryTables = ({ relationship = false } = {}) => ({
  profiles: [{ id: DIRECTORY_MEMBER, full_name: 'Hana Mostafa', phone: '', country_code: '+20', email: 'hana@x.com', account_status: 'active' }],
  coach_directory: DIRECTORY,
  // Dina works only on Mondays: an empty day is a day she is off.
  weekly_availability: DIRECTORY.flatMap((c) => hours(c.coach_id, c.coach_id === 'c-dina' ? [0] : [0, 1, 2, 3, 4])),
  offerings: [
    { id: 'off-dina', coach_id: 'c-dina', name: 'Career deep-dive', description: 'Map your next role.', type: 'session', duration: '60 min', format: 'online', price: 900, currency: 'EGP', active: true, created_at: '2026-09-01T00:00:00Z' },
    { id: 'off-tamer', coach_id: 'c-tamer', name: 'Open water dive', description: 'Your first open water dive.', type: 'session', duration: '90 min', format: 'in_person', price: 1100, currency: 'EGP', active: true, created_at: '2026-09-01T00:00:00Z' },
  ],
  session_requests: [],
  coach_reviews: [],
  member_profiles: [],
  clients: relationship ? [{
    id: 'rel-a', coach_id: 'c-dina', member_id: DIRECTORY_MEMBER, full_name: 'Hana Mostafa', age: null, phone: '', country_code: '+20',
    email: null, city: null, program: '', specialty: 'Career coaching', plan: 'Basic', initials: 'HM', avatar_bg: '#3E6FB0', active: true,
    progress: 0, needs_checkin: false, next_session_at: null, next_session_type: null, program_completed: false,
    payment_status: 'due', goal: '', focus: '', signup_completed_at: null, created_at: '2026-09-01T00:00:00Z',
  }] : [],
  tasks: [], mood_checkins: [], packages: [], sessions: [], time_blocks: [],
});
