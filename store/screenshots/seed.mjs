/**
 * The sample practice the store screenshots show.
 *
 * Everyone here is invented. No real person's name, photo or number
 * appears: avatars are initials (every `avatar_photo_url` is null), phone
 * numbers are the +20 1 55x range reserved for examples, and emails are
 * on example.com. Prices are EGP, the only currency the app charges in.
 *
 * Arabic is not a translation of the English rows — it is its own cast
 * with Arabic names and Arabic content, so an Arabic screenshot has no
 * English text sitting inside an Arabic screen.
 *
 * Stored values that the app translates for display (a specialty such as
 * 'Life coaching', a `session_mode`) stay English in BOTH seeds on
 * purpose: they are enum-like values keyed to `src/lib/specialties.ts`,
 * and the screen renders them through `t()`. Free text the app shows
 * verbatim — a goal, a task title, a message — is written in the
 * language of the seed.
 *
 * Shapes follow tests/fakeSupabase.js and the specs that already drive
 * these screens signed in (home-real, roster-remote, member-remote,
 * member-schedule, messaging-remote, offerings-remote).
 */

/** Mon 28 Sep 2026, 12:00 in Cairo. Every date below is relative to it. */
export const NOW = new Date('2026-09-28T09:00:00Z');

export const COACH = 'coach-1';
export const MEMBER = 'member-1';

const EN = {
  coach: 'Laila Hafez',
  coachBio: 'Life and career coach in Cairo. Ten years helping people make the next move with less noise in their head.',
  members: [
    { id: 'c-nour', name: 'Nour Adham', goal: 'Leave the job that is making me ill, without panicking about money' },
    { id: 'c-tarek', name: 'Tarek Said', goal: 'Decide whether to take the Dubai offer' },
    { id: 'c-salma', name: 'Salma Ragab', goal: 'Stop working past 9pm' },
  ],
  program: 'Career coaching · Full access',
  planBasic: 'Career coaching · Basic',
  planWord: 'Basic',
  tasks: [
    'Write down what a good Tuesday looks like',
    'List three people who have done this move',
    'Ten minutes outside before opening the laptop',
  ],
  offerings: [
    { name: 'Single session', desc: 'One hour, online, to work through whatever is loudest right now.', duration: '60 min' },
    { name: 'Six-week block', desc: 'Six weekly sessions and tasks between them.', duration: '6 × 50 min' },
    { name: 'Intro call', desc: 'Twenty minutes to see whether we are a fit. No charge.', duration: '20 min' },
  ],
  messages: [
    { who: 'coach', text: 'How did the week go?' },
    { who: 'client', text: 'Better. I said no to the Thursday meeting.' },
    { who: 'client', text: 'It felt awful for an hour and then it was fine.' },
  ],
  recap: 'Named the real blocker: it is the commute, not the work.',
  member: 'Yara Kamel',
  memberGoal: 'Build a running habit that survives a bad week',
  memberProgram: 'Life coaching · Basic',
  memberTasks: ['Run twice this week, slowly', 'Lay the kit out the night before'],
  memberRecap: 'Three runs last week. The slow pace is what made it stick.',
  directory: [
    { id: 'd-hany', name: 'Hany Zaki', title: 'Life coaching', bio: 'Helps people get unstuck without a five-year plan.' },
    { id: 'd-rasha', name: 'Rasha Lotfy', title: 'Nutrition coaching', bio: 'Food that fits the week you actually have.' },
    { id: 'd-sherif', name: 'Sherif Galal', title: 'Sleep coaching', bio: 'Sleep, for people who have tried everything.' },
  ],
};

const AR = {
  coach: 'ليلى حافظ',
  coachBio: 'مدرِّبة حياة ومسار مهني في القاهرة. عشر سنوات في مساعدة الناس على اتخاذ خطوتهم التالية بضجيج أقل في رؤوسهم.',
  members: [
    { id: 'c-nour', name: 'نور أدهم', goal: 'أترك العمل الذي يرهقني دون أن أفزع بشأن المال' },
    { id: 'c-tarek', name: 'طارق منصور', goal: 'أقرر إن كنت سأقبل عرض دبي' },
    { id: 'c-salma', name: 'سلمى رجب', goal: 'أتوقف عن العمل بعد التاسعة مساءً' },
  ],
  program: 'إرشاد مهني · وصول كامل',
  planBasic: 'إرشاد مهني · أساسي',
  planWord: 'أساسي',
  tasks: [
    'اكتب كيف يبدو يوم ثلاثاء جيد',
    'دوِّن ثلاثة أشخاص خاضوا هذه النقلة',
    'عشر دقائق في الخارج قبل فتح الحاسوب',
  ],
  offerings: [
    { name: 'جلسة مفردة', desc: 'ساعة واحدة عبر الإنترنت، نعمل فيها على ما يشغلك الآن.', duration: '60 دقيقة' },
    { name: 'باقة ستة أسابيع', desc: 'ست جلسات أسبوعية ومهام بينها.', duration: '6 × 50 دقيقة' },
    { name: 'مكالمة تعارف', desc: 'عشرون دقيقة لنرى إن كنا متفاهمين. بدون رسوم.', duration: '20 دقيقة' },
  ],
  messages: [
    { who: 'coach', text: 'كيف مرَّ الأسبوع؟' },
    { who: 'client', text: 'أفضل. اعتذرت عن اجتماع الخميس.' },
    { who: 'client', text: 'شعرت بالسوء لساعة ثم مرَّ الأمر.' },
  ],
  recap: 'حدَّدنا العائق الحقيقي: الطريق إلى العمل، لا العمل نفسه.',
  member: 'يارا كامل',
  memberGoal: 'عادة جري تصمد في الأسبوع السيئ',
  memberProgram: 'إرشاد حياة · أساسي',
  memberTasks: ['اجري مرتين هذا الأسبوع، ببطء', 'جهِّز الملابس في الليلة السابقة'],
  memberRecap: 'ثلاث مرات جري الأسبوع الماضي. البطء هو ما جعلها تستمر.',
  directory: [
    { id: 'd-hany', name: 'هاني زكي', title: 'Life coaching', bio: 'يساعد الناس على تجاوز الجمود دون خطة خمسية.' },
    { id: 'd-rasha', name: 'رشا لطفي', title: 'Nutrition coaching', bio: 'طعام يناسب أسبوعك الحقيقي.' },
    { id: 'd-sherif', name: 'شريف جلال', title: 'Sleep coaching', bio: 'النوم، لمن جرَّب كل شيء.' },
  ],
};

export const COPY = { en: EN, ar: AR };

const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');

/** Everything the coach-side screens read. */
export function coachTables(lang) {
  const L = COPY[lang];
  const [m0, m1, m2] = L.members;

  const member = (m, extra = {}) => ({
    id: m.id, coach_id: COACH, member_id: `u-${m.id}`, full_name: m.name, age: null,
    phone: '', country_code: '+20', email: null, city: null,
    program: L.program, specialty: 'Career coaching', plan: 'Full access', initials: initials(m.name),
    avatar_bg: '#3E6FB0', active: true, progress: 60, needs_checkin: false,
    next_session_at: null, next_session_type: null, program_completed: false, payment_status: 'paid',
    goal: m.goal, focus: '', signup_completed_at: '2026-09-02T00:00:00Z', invite_code: null,
    invite_expires_at: null, created_at: '2026-08-20T00:00:00Z',
    // 0019. Nothing renders it yet, but the fake applies no column
    // defaults, so a screen that starts reading it would see undefined.
    origin: 'coach_invited', ...extra,
  });

  return {
    profiles: [
      {
        id: COACH, full_name: L.coach, phone: '10 5550 0101', country_code: '+20',
        email: 'coach@example.com', country: 'Egypt', country_flag: '🇪🇬', city: 'Cairo',
        // An avatar, so the profile reads as finished and Home shows the
        // running practice instead of the new-coach setup checklist. It is
        // drawn as initials by serveInitialsAvatar() in shots.mjs — nobody's
        // photograph, and a coach who uploads a plain avatar is ordinary.
        avatar_photo_url: `${COACH}/avatar.png`, account_status: 'active', role: 'coach',
      },
      ...L.members.map((m) => ({ id: `u-${m.id}`, full_name: m.name, phone: null, country_code: null, email: null })),
    ],
    coach_profiles: [{
      profile_id: COACH, title: 'Career coaching', cert: '', bio: L.coachBio,
      languages: ['Arabic', 'English'], session_mode: 'online', experience_years: 10,
      certifications: ['ICF PCC'], cover_photo_url: null, verification_status: 'verified',
      signup_completed_at: '2026-06-01T00:00:00Z',
    }],
    // Two active members and one archived, which is deliberate: 0020 caps
    // the free plan at three ACTIVE members, and at the cap the roster
    // shows "Free plan: 3/3 active members used — upgrade to Rafiq Pro
    // Plus for unlimited". Rafiq Pro Plus is a "Coming soon" screen
    // (Subscription.tsx), so a store screenshot carrying that banner
    // would advertise a purchase nobody can make — which is the one thing
    // store/listing.md says the listing must not do. Archived members
    // still appear under the default "all" filter, badged Inactive, so
    // the roster is no thinner for it and a lapsed member is ordinary.
    clients: [
      member(m0, { origin: 'marketplace', next_session_at: '2026-09-28T12:00:00Z', next_session_type: 'standard', progress: 70 }),
      member(m1, { plan: L.planWord, program: L.planBasic, progress: 35, active: false }),
      member(m2, { progress: 85, needs_checkin: true, next_session_at: '2026-09-30T13:00:00Z', next_session_type: 'standard' }),
    ],
    client_private: [{ client_id: m0.id, notes: '' }],
    tasks: [
      { id: 't-1', client_id: m0.id, title: L.tasks[0], description: '', due_at: '2026-09-29T21:00:00Z', due_has_time: false, recurring: false, done: false, created_at: '2026-09-21T00:00:00Z' },
      { id: 't-2', client_id: m0.id, title: L.tasks[1], description: '', due_at: '2026-10-02T21:00:00Z', due_has_time: false, recurring: false, done: false, created_at: '2026-09-21T00:00:00Z' },
      { id: 't-3', client_id: m0.id, title: L.tasks[2], description: '', due_at: '2026-09-26T21:00:00Z', due_has_time: false, recurring: true, done: true, created_at: '2026-09-14T00:00:00Z' },
    ],
    // 0010 writes a booking as a pair: a `booked` time_block AND a
    // `sessions` row carrying its `time_block_id`. Seeding only the block
    // left the Schedule showing sessions with nothing behind them.
    sessions: [
      { id: 's-1', client_id: m0.id, scheduled_at: '2026-09-21T12:00:00Z', recap: L.recap, attendance: 'attended' },
      { id: 's-2', client_id: m0.id, scheduled_at: '2026-09-28T12:00:00Z', recap: '', attendance: null, time_block_id: 'tb-1' },
      { id: 's-3', client_id: m2.id, scheduled_at: '2026-09-28T08:30:00Z', recap: '', attendance: null, time_block_id: 'tb-3' },
      { id: 's-4', client_id: m2.id, scheduled_at: '2026-09-30T13:00:00Z', recap: '', attendance: null, time_block_id: 'tb-2' },
    ],
    packages: [{ client_id: m0.id, total: 6, used: 2, expires_at: '2026-11-15T21:00:00Z' }],
    payments: [],
    offerings: L.offerings.map((o, i) => ({
      id: `off-${i + 1}`, coach_id: COACH, name: o.name, description: o.desc,
      type: 'session', duration: o.duration, format: 'online',
      price: [700, 3600, 0][i], currency: 'EGP', session_count: [1, 6, 1][i], active: true,
      created_at: '2026-07-01T00:00:00Z',
    })),
    subscriptions: [{ coach_id: COACH, tier: 'free', renews_at: null }],
    weekly_availability: [0, 1, 2, 3].map((d) => ({ coach_id: COACH, day_of_week: d, enabled: true, start_hour: 10, end_hour: 18 })),
    // Labels and lengths as 0010/0011 write them, not as a blank row.
    //
    // `label` is `'Session · ' || <member name>`. Left empty, Schedule
    // falls back to t('schedulePreferredHours') for anything that is not
    // `busy` (Schedule.tsx:254), so every booking read "Preferred hours"
    // — the coach's availability, not a session with a person.
    //
    // A `standard` session is 50 minutes and an `intro` 20
    // (0010:69). Two of these were an hour long, so the block was 60
    // minutes while the screen said 50.
    time_blocks: [
      { id: 'tb-1', coach_id: COACH, client_id: m0.id, kind: 'booked', label: `Session · ${m0.name}`, starts_at: '2026-09-28T12:00:00Z', ends_at: '2026-09-28T12:50:00Z', session_type: 'standard' },
      { id: 'tb-2', coach_id: COACH, client_id: m2.id, kind: 'booked', label: `Session · ${m2.name}`, starts_at: '2026-09-30T13:00:00Z', ends_at: '2026-09-30T13:50:00Z', session_type: 'standard' },
      // A morning session as well as the 15:00 one, so the Day view has
      // bookings inside the hours it opens on rather than an empty
      // morning with everything below the fold.
      { id: 'tb-3', coach_id: COACH, client_id: m2.id, kind: 'booked', label: `Session · ${m2.name}`, starts_at: '2026-09-28T08:30:00Z', ends_at: '2026-09-28T09:20:00Z', session_type: 'standard' },
      // `busy` is the one kind whose blank label is right: Schedule reads
      // it as "Unavailable", which is what a coach's own blocked time is.
      { id: 'tb-4', coach_id: COACH, client_id: null, kind: 'busy', label: '', starts_at: '2026-09-29T09:00:00Z', ends_at: '2026-09-29T11:00:00Z', session_type: null },
    ],
    messages: L.messages.map((m, i) => ({
      id: `msg-${i + 1}`, client_id: m0.id, sender: m.who, body: m.text,
      sent_at: `2026-09-27T0${7 + i}:00:00Z`,
    })),
    message_reads: [{ client_id: m0.id, reader: 'coach', read_at: '2026-09-27T08:30:00Z' }],
    session_requests: [],
    notifications: [],
    ratings: [],
  };
}

/** Everything the member-side screens read. */
export function memberTables(lang) {
  const L = COPY[lang];
  const coachOf = (d, extra = {}) => ({
    coach_id: d.id, full_name: d.name, title: d.title, country: 'Egypt', country_flag: '🇪🇬',
    languages: ['Arabic', 'English'], experience_years: 8, verified: true, featured: false,
    from_price: 700, rating_count: 11, rating_avg: 4.8, bio: d.bio, avatar_photo_url: null,
    session_mode: 'online', certifications: ['ICF ACC'], cover_photo_url: null, ...extra,
  });

  return {
    profiles: [{
      id: MEMBER, full_name: L.member, phone: '10 5550 0202', country_code: '+20',
      email: 'member@example.com', account_status: 'active', role: 'client',
    }],
    member_profiles: [{ profile_id: MEMBER, specialty: 'Life coaching', goal: L.memberGoal, signup_completed_at: '2026-09-01T00:00:00Z' }],
    clients: [{
      id: 'rel-1', coach_id: 'd-hany', member_id: MEMBER, full_name: L.member, age: null,
      phone: '', country_code: '+20', email: null, city: null, program: L.memberProgram,
      specialty: 'Life coaching', plan: L.planWord, initials: initials(L.member), avatar_bg: '#7A6BAE',
      active: true, progress: 55, needs_checkin: false, next_session_at: '2026-09-29T15:00:00Z',
      next_session_type: 'standard', program_completed: false, payment_status: 'paid',
      goal: L.memberGoal, focus: '', signup_completed_at: '2026-09-05T00:00:00Z',
      created_at: '2026-09-05T00:00:00Z', origin: 'marketplace',
    }],
    coach_directory: L.directory.map((d, i) => coachOf(d, i === 1 ? { from_price: 850, rating_count: 7 } : {})),
    tasks: [
      { id: 'mt-1', client_id: 'rel-1', title: L.memberTasks[0], description: '', due_at: '2026-09-29T21:00:00Z', due_has_time: false, recurring: false, done: false, created_at: '2026-09-22T00:00:00Z' },
      { id: 'mt-2', client_id: 'rel-1', title: L.memberTasks[1], description: '', due_at: '2026-09-30T21:00:00Z', due_has_time: false, recurring: true, done: true, created_at: '2026-09-22T00:00:00Z' },
    ],
    packages: [{ client_id: 'rel-1', total: 6, used: 2, expires_at: '2026-11-20T21:00:00Z' }],
    sessions: [
      { id: 'ms-1', client_id: 'rel-1', scheduled_at: '2026-09-22T15:00:00Z', recap: L.memberRecap, attendance: 'attended' },
      { id: 'ms-2', client_id: 'rel-1', scheduled_at: '2026-09-29T15:00:00Z', recap: '', attendance: null, time_block_id: 'mtb-1' },
    ],
    time_blocks: [{ id: 'mtb-1', coach_id: 'd-hany', client_id: 'rel-1', kind: 'booked', label: `Session · ${L.member}`, starts_at: '2026-09-29T15:00:00Z', ends_at: '2026-09-29T15:50:00Z', session_type: 'standard' }],
    weekly_availability: L.directory.flatMap((d) => [0, 2, 4].map((day) => ({ coach_id: d.id, day_of_week: day, enabled: true, start_hour: 10, end_hour: 18 }))),
    offerings: [
      { id: 'moff-1', coach_id: 'd-hany', name: L.offerings[0].name, description: L.offerings[0].desc, type: 'session', duration: L.offerings[0].duration, format: 'online', price: 700, currency: 'EGP', session_count: 1, active: true, created_at: '2026-07-01T00:00:00Z' },
      { id: 'moff-2', coach_id: 'd-hany', name: L.offerings[2].name, description: L.offerings[2].desc, type: 'session', duration: L.offerings[2].duration, format: 'online', price: 0, currency: 'EGP', session_count: 1, active: true, created_at: '2026-07-01T00:00:00Z' },
    ],
    session_requests: [],
    mood_checkins: [],
    messages: [],
    ratings: [],
  };
}
