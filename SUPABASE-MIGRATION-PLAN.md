# Moving off mockStore — a plan

LAUNCH-CHECKLIST.md §2 is the checklist; this is the *how*. The live
Supabase project has the full schema (`supabase/migrations/`, with schema
tests in CI). Most screens still read and write `src/lib/mockStore.ts` /
`src/lib/directory.ts` (`localStorage`).

**Done so far:** auth itself (`auth.ts`, `session.ts`); step 1, the admin
queues (`adminQueues.ts`); step 2, the signed-in user's own profile and
onboarding (`profileData.ts`); step 3, the coach's roster
(`rosterData.ts`) and the member's side of it (`memberData.ts`). Each has
its own section below.

## The shape of the problem

`mockStore`'s functions are synchronous — `getClients()` returns an array,
`updateClient()` returns immediately. Every screen reads and renders in
one pass with no `useEffect`, no loading state, no possibility of failure.
A Supabase query is none of those things: it's async, it can be slow, and
it can fail (network, RLS, a constraint). Converting a function's body
from `localStorage` to `supabase.from(...)` is the easy part; the screen
that called it synchronously is the real work.

## Conventions already set, worth reusing rather than reinventing

- **Real data means configured *and* signed in** — `isRemoteSession()` /
  `useRemoteSession()` in `src/lib/remoteSession.ts`. Configured alone is
  not enough: real rows only exist for a signed-in account. Signed out
  (or unconfigured), screens keep reading `mockStore` exactly as before,
  which is also why CI — configured with placeholder credentials, never
  signed in — keeps exercising the same screens it always has. There is
  no flag day, so both branches keep working until `mockStore`'s fallback
  is deleted for good. (`isSupabaseConfigured()` still guards each call
  inside the data modules, and auth's own flows.)
- **Fallible async calls return `{ ok: true, data } | { ok: false, code,
  message }`**, never a thrown error a screen has to try/catch
  (`auth.ts`'s `AuthResult<T>`, `adminQueues.ts`'s `QueueResult<T>`). Follow
  the same shape for every new module — a screen already knows how to
  handle it.
- **`code` is a stable, translatable string; `message` is raw upstream
  text for logs only**, never rendered. Map `code` to an i18n key at the
  call site, same as `auth.ts`'s doc comment says.
- **One shared client** (`getSupabase()`), created lazily so a screen with
  no `.env.local` doesn't crash the whole app at import time.

## Loading / empty / error states

None of today's screens have them because nothing async exists yet. Once
a screen's data comes from a query:

- **Loading**: a screen that reads on mount needs a `status: 'loading' |
  'ready' | 'error'` (or a small union like it), starting at `'loading'`,
  set in a `useEffect`. Don't render the old synchronous layout with
  empty/default values while waiting — that's a flash of wrong content,
  not a loading state.
- **Empty**: several screens already have a real empty state for "no
  data yet" (ProgramDetail's not-found, RateCoach's "nothing to rate",
  MyCoaches' permanently-empty Past section) — an empty *query result* is
  the same kind of state, not an error.
- **Error**: network failure or an RLS denial. Show something the user
  can act on (retry, or "try again later") — never the raw Postgres
  message. `adminQueues.ts`'s `code` union is the model: a screen switches
  on `code`, not on `message`.

A mutation (not just a read) additionally needs a busy/disabled state on
whatever triggered it, so a slow network can't be double-submitted —
`Profile.tsx`'s new `busy` state and `Auth.tsx`'s existing `pending` are
the two examples so far.

## Suggested order

Matches LAUNCH-CHECKLIST.md §2's own list, expanded with why:

1. ✅ **Reports, verification, deletion requests** — no
   screen *reads* these back (no admin UI in the app; the admin panel is
   `service_role`, `supabase/README.md`), so converting them is pure
   upside: zero risk of a half-migrated screen, and the admin queues have
   real rows to work with immediately, even from Supabase's own table
   editor (§9's suggested stopgap before a real admin app exists).
2. ✅ **Profile and onboarding** — the signed-in coach's own profile
   (`getCoachProfile()` on the coach's own screens) and its writers, both
   signups, and Edit Profile's photos. `coach_profiles.verification_status`
   is read for real, closing step 1's gap. The member-side screens'
   `getCoachProfile()` ("my coach") is a different identity and moves with
   step 3.
3. **Clients, tasks and sessions** — the coach's own roster. This is also
   where **the demo identities go away**: 14 member screens hardcode
   `const CLIENT_ID = 'sara'`; the coach side hardcodes `DEFAULT_PRO_ID =
   'pro-yasmin'`. Both become the signed-in user
   (`useAppStore.getState().userId`, already real). A member can have more
   than one coach, so this is also where a member picks which
   relationship they're viewing, not just a single hardcoded row.
   A roster row is linked to a member account (`clients.member_id`) only
   for a member with a pending or accepted session request to that coach
   (`0008`); a coach can't attach an arbitrary account. Walk-in rows
   (`member_id` null) are unaffected.
4. **Scheduling** — `time_blocks`, depends on real clients existing. In
   two parts: ✅ the accept flow (a member asks a real coach for a first
   session and the coach accepts, which is how a relationship starts), then
   the calendar itself (Schedule, booking and rescheduling between people
   already working together, attendance).
5. **Messaging** — depends on real clients; also where Realtime
   subscriptions replace `mockStore`'s "read on every render" pattern,
   which is where the loading/empty/error work above matters most (a
   chat screen is never "done loading" the way a profile screen is).
6. **The rest** — offerings, templates, ratings, notifications, and
   `directory.ts`'s coach-discovery side (`coach_directory` /
   `coach_reviews` views — remember reviews only ever show a first name +
   last initial publicly, never the full name the app shows today).

Each step removes the matching `DEFAULT_*` seed
(`DEFAULT_CLIENTS`/`DEFAULT_TASKS`/`DEFAULT_ENROLLMENTS`/
`DEFAULT_TEMPLATES`/`FALLBACK_MEMBER_SESSIONS`, the 8 fictional
`DIRECTORY_COACHES`) once nothing reads it any more, and the fixed
fictional clock (`TODAY_MS = Date.UTC(2025, 9, 22)`, `TODAY_INDEX = 2`)
gets replaced with the real wall clock once real bookings exist to test
against — doing either early just breaks the still-unconverted screens'
demo data out from under them.

## Step 1: `src/lib/adminQueues.ts`

Three functions, one per table in `supabase/migrations/0005_app_parity.sql`'s
"Things only Rafiq resolves" section — `pro_reports`,
`verification_requests`, `account_deletion_requests`. All three share a
shape: the signed-in user can insert a new row and read their own back,
but the columns that record an outcome (`status`, reviewer/resolution
notes, `resolved_at`/`reviewed_at`/`processed_at`) aren't in the app's
grants — only the admin panel (`service_role`) resolves these. So every
function here is a fire-and-record insert, not a workflow.

**Wired into screens:**

- `Profile.tsx` (coach): "Request verification" and "Delete Account" now
  file real rows when signed in, with a `busy` state
  disabling the control while in flight and a toast on failure. The
  mockStore fallback (unconfigured) is untouched.
- `ClientProfile.tsx` (member): "Delete Account" does the same, plus an
  inline error in the confirm sheet on failure (kept open, so the member
  can retry instead of it silently closing).
- Both delete flows deliberately do **not** also run `mockStore`'s
  anonymize-immediately functions once the real insert succeeds — that
  local demo data isn't the real signed-in account, and *processing* a
  real request (the anonymization itself) is the admin queue's job
  (`supabase/README.md`'s payments note), not something filing it does.
  They do sign the user out afterwards, same as today's mock flow.

**Deliberately not wired:** `ClientCoach.tsx`'s "Report" flow. `fileProReport`
needs a real `clients.id` for `client_id` and the coach's real profile id
— neither exists until step 3 above lands (`CLIENT_ID`/`DEFAULT_PRO_ID`
are still mock strings, not real rows), so wiring it in now would just
fail the insert's RLS check the moment real credentials are configured,
for no benefit. The function is written and tested against a stubbed
`clientId`/`coachId` so that conversion has nothing left to build here —
see the comment at the call site in `ClientCoach.tsx`.

**Closed in step 2:** step 1 left `Profile.tsx`'s verification badge on a
local mock flag it also flipped after a real request. The badge now reads
`coach_profiles.verification_status`, re-fetched after filing (0005's
`sync_verification_status` trigger sets it to `pending`); the local mirror
is gone.

## Step 2: `src/lib/profileData.ts`

The signed-in user's own rows: `profiles` (both roles), `coach_profiles`,
and `member_profiles`, which is new in `0006`.

- **Why `member_profiles`:** ClientOnboarding collects the member's goal
  and focus. The only columns for those were on `clients` — the coach's
  roster row, which only the coach may write (`clients_update_own`). So a
  member finishing onboarding had nowhere they were allowed to write.
  `member_profiles` mirrors `coach_profiles`: the member writes their own
  row, and a coach can read the rows of members on their roster. `focus`
  holds a stable slug (`life`, `meditation`, …), never the translated label.
- **What the app writes** is limited to the granted columns and nothing
  else — never `verification_status`/`featured` (coach_profiles) or
  `account_status` (profiles). `supabase/tests/07_profiles.sql` issues
  each write `profileData.ts` makes, as the `authenticated` role, against
  the real schema.
- **No upsert:** a PostgREST upsert names the primary key in its
  `ON CONFLICT … SET` list, and `profile_id` has no UPDATE grant, so it's
  refused. The first write inserts; later ones update.
- **One shared copy:** `src/store/ownProfileStore.ts` fetches the coach's
  own profile once for Profile, EditProfile, AccountDetails, PreviewProfile
  and ShareProfile, so a save on one is already on the next.
  `useOwnCoachProfile()` returns loading / error / ready, and each screen
  renders `components/LoadState.tsx` until it's ready — never a flash of
  the demo profile.
- **Photos** upload through `storage.ts` to the private `avatars`/`covers`
  buckets; the columns store the object path, and reads sign a URL.
  EditProfile refuses a photo that's too large or the wrong type the moment
  it's picked, by the same rule the upload applies.
- **Sign-in routing** (`session.ts`) now asks the database whether this
  account finished onboarding — `coach_profiles` or `member_profiles` — so
  a new phone doesn't send an onboarded coach through onboarding again,
  and a member who signs in with Google before onboarding is sent to it.
- **Still mockStore, on purpose:** the Pro tier gating Edit Profile's
  photo controls (`isVerified()`) waits for payments (LAUNCH-CHECKLIST.md
  §3); obligations, ratings and clients wait for step 3.

## Step 3, coach side: `src/lib/rosterData.ts`

The signed-in coach's roster: `clients`, the coach-only `client_private`
(notes, favourite), `tasks`, and on ClientDetail one relationship's
`sessions` (recaps), `packages` and `payments`. Members, ClientDetail,
AddClient, EditClient and AddTask read it through
`src/store/rosterStore.ts`'s `useRoster()` — mockStore signed out, the
shared Supabase copy signed in, with LoadState until it arrives — and
ClientDetail's record through `src/store/clientRecord.ts`.

- **Real dates, real "today":** timestamps are converted to the app's
  wall-clock values at this edge (`src/lib/wallClock.ts`), and these
  screens take "today" from `useRoster().todayMs` — the real day signed
  in. The fixed demo week (`TODAY_MS`) still drives everything signed out
  and every screen not converted yet.
- **Writes land in the store only once they succeed**, so a failure leaves
  the screen showing what is stored, plus an inline "try again". Each
  action's control is disabled while its write is in flight.
- **No upsert** for `client_private` (update, then insert the first time),
  as in step 2. **Payments stay a ledger:** recording inserts a charge,
  refunding inserts a refund row pointing at it; nothing is edited. The
  member's `payment_status` is what moves.
- **Recaps** save when the field loses focus, not on every keystroke.
- **No demo content signed in:** a real client with no package shows "no
  package yet" (and setting one up creates it); session history is the
  real `sessions`, not ClientDetail.dc.html's two fixed entries.
- **Not here:** `clients.member_id` is never set from these screens —
  linking a member account happens when a session request is accepted
  (`0008`). `supabase/tests/11_roster_app.sql` issues each write this
  module makes, as the `authenticated` role.
- **Still mockStore signed in:** Home, Profile's stats, Earnings' totals,
  Schedule, Messages (steps 4–6), and the member side of step 3 — the 14
  screens still on `CLIENT_ID = 'sara'`.

## Step 3, member side: `src/lib/memberData.ts`

The member screens were hardcoded to the demo member (`CLIENT_ID = 'sara'`)
and the demo coach. Signed in, ClientHome, ClientTasks, MyCoaches,
ClientCoach, ClientProfile and EditClientProfile now read the member's own
relationships through `src/store/memberStore.ts`'s `useMemberSpace()`:

- **A relationship** is a `clients` row with `member_id` = the member (set
  when a coach accepts their request, `0008`), its coach from the public
  `coach_directory` view, and its tasks, package, past sessions (count and
  latest recap) and mood check-ins. A member with no relationship — every
  real member until the accept flow exists — sees "No coach yet" with a way
  to Discover, never the demo member or coach.
- **More than one coach:** MyCoaches lists every current relationship, and
  any action on a card makes that coach the one the app shows (remembered
  per account on the device). Relationships the coach archived are the
  "Past" section, which was always empty before.
- **What a member writes:** a task's done state (0004's trigger refuses
  anything else), a mood check-in (a new `mood_checkins` row each time),
  their own name and phone on `profiles` — EditClientProfile no longer
  writes the coach's roster row, which a member was never allowed to — and
  a report on their coach, now through step 1's real `fileProReport`.
  `supabase/tests/12_member_app.sql` issues each of these as the member.
- **Account deletion** now weighs the member's own obligations (unused
  sessions, a booked one). Signed in, it used to read the demo member's,
  which always has sessions left.
- **Still the demo member's, signed in:** Schedule and Booking (step 4),
  Messages (step 5).
  Each reads `DEMO_MEMBER_CLIENT_ID` from mockStore with a note
  naming its step, so what's left is one grep. The pieces of converted
  screens that belong to those steps (milestones, the live-session badge,
  the agreement, the Full Access upgrade and standing slot) are hidden
  signed in rather than showing the demo's.

## Step 3, the gap: inviting a client who has no account

`0008` lets a coach set `clients.member_id` only for a member who has a
pending or accepted `session_requests` row with them — user ids are not
secret, so without that guard any coach could link any member and read
their name, email and phone. The marketplace path satisfies it. A coach's
existing clients do not: `AddClient` writes a walk-in row with `member_id`
null, and nothing could ever link it.

`0013` turns it around. The coach issues a bearer code on the walk-in row
and the *member* claims it, so nobody is linked without holding the code.

- **The coach** sees an invite card on a walk-in row (ClientDetail,
  signed in only — there are no accounts to link on the demo path). It
  issues a code, shows when it expires, copies it, and revokes it.
  Generating again replaces the old one. The card is hidden once the row
  has a `member_id`, and on an archived row.
- **The member** reaches the claim screen from ClientHome's "no coach
  yet" state — the only place a member with no relationship lands. It is
  two steps, not one: they cannot read `clients`, so `peek_client_invite`
  names the coach and the record *before* they confirm. Confirming blind
  would mean linking to a stranger's row on the strength of a string
  someone sent them. On success the app selects that relationship, the
  way MyCoaches does, and opens on the coach.
- **Every refusal has its own line.** `not_found`, `expired`,
  `already_used`, `own_invite`, `already_linked` (which names the coach,
  since peek resolves it anyway), `rate_limited`, `not_a_member`. A code
  typed off a WhatsApp message deserves better than "something went
  wrong". A code can also be spent between the peek and the confirm, so a
  refusal at that point returns the member to the field with the reason
  rather than dead-ending.
- **Both functions return their refusals in the payload** rather than
  raising, because a raised error would roll back the rate-limit attempt
  they just counted. So a call can succeed at the transport level and
  still carry a refusal; `rosterData.ts` and `memberData.ts` fold that
  into the usual `{ ok: false, code: 'refused', message }`, and the
  screens map `message` to a key. It is never rendered raw.
- **`client_private` stays coach-only** after linking, by its own
  policies. The card says so before the coach generates anything: tasks,
  sessions, package and payments do become visible, private notes do not.

`tests/client-invite.spec.js` covers both sides, including every refusal
and the rate limit.

## Step 4, the accept flow: `src/lib/requestData.ts`

How a member and a coach who don't know each other start working together —
until this, no real member could ever get a coach:

- **The coach sets their hours** (Availability) on `weekly_availability`,
  one row per weekday, inserted the first time a day is saved. Members book
  from these hours; they're wall-clock hours, read in each viewer's own
  time zone (below).
- **The member finds them** (Discover) in the `coach_directory` view: real
  coaches only, never the demo's eight or its sample stories. "Available
  today / this week" comes from the coach's hours; fewer than
  `MIN_REVIEWS_FOR_RATING` reviews reads "New", and a coach with only free
  offerings reads "Free". Matching the member's own goal is still the demo
  member's (step 6), so signed in it is off.
- **The member asks** (CoachPreview): the coach's active offerings plus the
  design's free intro call, and slots on the hour through the coach's hours
  for the next three weeks, none in the past. Sending inserts a
  `session_requests` row; the one open request per coach (0005's unique
  index) means an earlier one is withdrawn first, so a new time replaces
  it. Members can't see a coach's bookings, so no slot shows as taken —
  accepting refuses a clash instead. MyCoaches lists open requests; one
  opens that coach again.
- **The coach answers** (Notifications, and the dot on Home's bell): each
  waiting request opens a sheet with Accept and Decline. Declining is an
  update, limited to a still-pending row. Accepting is **`0010`'s
  `accept_session_request()`**: one transaction that marks the request
  accepted, creates the member's roster row (or brings back an archived
  one), books the block on the coach's calendar and the session on the
  relationship (`sessions.time_block_id`, new in 0010, ties the two for the
  calendar work next), and sets the row's next session. It is `SECURITY
  INVOKER`, so every policy and trigger that guards those tables for the
  app's own writes applies to it too. It refuses a request that isn't the
  caller's (P0002), isn't pending (55000), whose time has passed (22023),
  or that overlaps a booked session (23P01); the sheet says which.
  `supabase/tests/13_accept_flow.sql` covers each, as the coach and member.
- **Time zones:** weekly hours carry no zone. A coach in Cairo and a member
  in Dubai each read "9–5" in their own zone, an hour apart. Fine while
  both sides are in one country; storing the coach's zone is the fix when
  that stops being true.

## Step 4, the calendar: `src/lib/scheduleData.ts`

In small PRs, so each can be reviewed on its own:

1. ✅ **The coach's week.** Signed in, Schedule is the real current week
   (Monday first), the real month around it, and the coach's own
   `time_blocks` starting that week — sessions booked by accepting a
   request, requests pending, their busy and open blocks — with their
   weekly hours as each day's open time and names from their roster. A
   block before 8 AM or after 8 PM widens the day. AddTimeBlock adds a busy
   or open block on a day of this week (not one already gone); Repeat
   weekly is left out signed in, because recurring hours are Availability's.
   The block sheet offers what is real: the member's profile. Messages and
   the session room are later steps.
2. ✅ **The coach moving and cancelling a booking.** 0011's
   `reschedule_booking()` moves the block and its session together
   (`sessions.time_block_id`), keeping the length, and takes 0010's
   per-coach lock so a move and an accept can't both pass the overlap
   check. `cancel_booking()` records the cancellation (with or without 12
   hours' notice), keeps the session in history as cancelled, and frees the
   time. Both keep the roster row's next session right
   (`refresh_next_session()`), run as the coach (`SECURITY INVOKER`), and
   refuse a block that isn't theirs, isn't a booking, has started, or would
   clash. **Busy time counts as taken:** a move, and an accept (0011
   replaces 0010's function with 'busy' added to its overlap check), can't
   land on time the coach marked Unavailable, and the coach can remove a
   busy block from its sheet. Members still can't see busy time when they
   pick a slot, so such a request is refused when the coach accepts it.
   The other side is told: a trigger on `sessions` sends the member a
   `session-moved` or `session-cancelled` notification (the coach, when a
   member makes the change, later); the member's notifications screen is
   still the demo's, so these wait in the table until it's converted. A
   cancelled session no longer counts as one held on the member's side.
   Schedule offers move and cancel on a real booking until it starts;
   moving needs 12 hours' notice, as in the demo. A session or request is
   drawn above busy time it overlaps, so it can still be tapped.
3. ✅ **Attendance.** Once a booked session has started, its sheet asks
   the coach how it went. 0015's `mark_attendance()` records the outcome
   on the session and, for one that was held or that the member missed,
   uses one credit from the relationship's package — the demo's rule
   (`setAttendance`): completed and no-show charge, disputed holds. A
   free intro call never uses one, and a package already used up (or none
   yet) leaves the session marked and nothing charged, so the signed-in
   no-show label doesn't claim a credit. It runs as the coach (`SECURITY
   INVOKER`), in one transaction so a retry can't charge twice, and
   refuses a session that isn't theirs, hasn't started, or is already
   recorded — including a member's own dispute, which the sheet shows as
   theirs. Once recorded it stays; correcting a mark and settling a
   dispute come with payments (§3). A missed session no longer counts as
   one held on the member's side. Only this week's sessions can be marked,
   since Schedule shows one week.
4. ✅ **The member's own Schedule** (`src/lib/memberScheduleData.ts`).
   Signed in, Sessions is the member's own sessions with the coach they're
   viewing: the next booked one (its length and type from its block), or
   else their open request to that coach, and the sessions that have
   happened, newest first, with the coach's recap — a missed or disputed
   one says so, a cancelled one isn't listed. They can cancel a booked
   session with 0016's `member_cancel_session()`: the member's side of
   `cancel_booking()`, recorded as theirs, and with less than 12 hours'
   notice it uses one package credit when one is left (never for a free
   intro), as the demo's `cancelBooking()` does; the confirmation says so
   only then. The coach is told by 0011's trigger. A member may not update
   a session or delete a block themselves (0005), so this one is `SECURITY
   DEFINER` and checks the caller is the member on that relationship. A
   request is withdrawn as MyCoaches already does. "Request a session"
   opens the coach's own page (CoachPreview), which sends a real request
   an existing pair's coach accepts like any other; the demo's booking
   screen, with its 25-minute type that 0010 doesn't book, stays the
   demo's. Moving, joining the session room and rating a session aren't
   offered signed in yet.
5. ✅ **The member moving a session** (0017). As in the demo, a member's
   move is confirmed by the coach: it is a `session_requests` row whose
   `reschedule_of` names the booked block, at least 12 hours before the
   session, with no offering or price. The coach sees it in Notifications
   with both times; accepting moves the block and its session (keeping the
   length) under 0010's lock and the booked-or-busy overlap check, and the
   member is told by 0011's trigger. Declining or withdrawing leaves the
   booking where it was, and cancelling the booking removes its move
   request (on delete cascade). The one-open-request rule is now one open
   request for a new session per coach, plus one open move per booking, so
   neither withdraws the other. **Blocks stop requests:** a member can't
   ask a coach while either side blocks the other (0014) or either account
   isn't active (`can_request_session`, which only looks at the caller's own
   relationship), and accepting refuses the same, so a request sent before a
   block can't be accepted after it. Home and the coach page's "book a
   session" open the coach's page signed in, like Sessions does; the
   demo booking screen is still reached from the programs screens, which
   are step 6's.

## Step 6, the member side

What is left of the member app on `mockStore` when signed in, in small PRs
(LAUNCH-CHECKLIST §2, "Remove the demo identities"). None needs a schema
change: the tables, their policies and the `coach_reviews` view are all
in place.

- ✅ **Discover's goal matching.** Signed in, the goal is the member's own
  focus from onboarding (`member_profiles.focus`, `memberData.ts`'s
  `fetchOwnFocus`). Onboarding stores a stable slug, the `icon` key of a
  `SPECIALTIES` entry, so it matches coaches by that entry's value. It is
  read with the directory: a failed read shows retry, never the demo
  member's goal. "Recommended for you" and "Matches your goal" show only
  when a coach on the list matches it; no focus, or a search, reads "Pros
  on Rafiq".
- ✅ **My Programs and Program Detail** → the member's `enrollments`.
- ✅ **Rate Coach** → `ratings`; reviews on the coach's page and Discover
  from the `coach_reviews` view, signed with its `reviewer_name` (first
  name and last initial) — never a reviewer's full name.
- ✅ **The member's Notifications** → `notifications`, and Home's dot.
- ✅ **The real clock** in ClientBooking, ClientSchedule and CoachPreview.
- ✅ **The demo member is demo-only**: nothing signed in reads
  `DEMO_MEMBER_CLIENT_ID`.

## Step 6, the member side: programs

No schema change. My Programs and Program Detail read the member's own
`enrollments` for the relationship being viewed (src/lib/programData.ts;
enrollments_select via can_see_client), each joined to its offering
(offerings_select_all, archived ones included, so a program the coach has
stopped selling keeps its name). Progress is worked out by mockStore's
`programProgressOf`, the same as the demo's. The enrolled date is a real
instant (`fmt.instantDate`); "Reviewed" is `milestone_reviewed_at`. The
goal is the coach's for the relationship, else the member's own from
onboarding (member_profiles.goal), else no goal card: never the demo's
fallback. Program Detail is opened with `params.offeringId`. "Book a
session" opens the coach's page (`bookSessionTarget`), never ClientBooking.
A failed read shows LoadState with retry. Tests: tests/member-programs.spec.js.

## Step 6, the member side: rating a session

No schema change. A past session the member had (attended, or not yet
marked; never one they missed or that was cancelled) has a Rate button on
their Sessions screen, or its stars once rated: fetchMemberSchedule reads
the relationship's `ratings`. RateCoach, signed in, rates the session named
by `params.sessionId` (src/lib/ratingData.ts): one `ratings` row with the
relationship, its coach and the session (ratings_write_member; one per
session, so a second is "already rated", 23505). An empty comment is
stored as null, so it is no public review. A failed save keeps what they
wrote and says so. Rating a finished program (the milestone card) stays
the demo's until Home's milestones move (step 6, demo identities).
Tests: tests/member-rate.spec.js.

## Step 6, the member side: reviews

No schema change. Signed in, a coach's page and Discover's "Member
Stories" show members' own reviews from the `coach_reviews` view
(src/lib/reviewData.ts): only ratings with a comment, signed with
`reviewer_name` (first name and last initial). Nothing joins back to
`profiles.full_name` or `clients.full_name`: a reviewer's full name must
not be public. The coach's page shows their 5 newest, beside the average
once there are enough ratings for one; Discover shows the 3 newest of
coaches on the list. Signed out, Discover keeps its sample stories. A
failed read shows LoadState with retry. Tests: tests/coach-reviews.spec.js.

## Step 6, the member side: notifications

No schema change. Signed in, the member's Notifications screen is their
own `notifications` rows (src/lib/notificationData.ts;
notifications_select_own), newest 50, of the four kinds the database
sends a member today: a message from their coach (0002), a payment
recorded (0002), and a session their coach moved or cancelled (0011).
Other kinds are left out rather than shown blank, and payloads are read
defensively. Session times are wall-clock. Opening one marks it read
(notifications_update_own: `read_at` only, where it is still null),
switches to the relationship it is about, and opens its screen; "Mark all
read" marks only theirs, and says so if it fails. Home's bell dot is
whether any of them is unread, re-read each time Home mounts; a failed
read shows no dot. Nothing yet tells a member when a coach accepts or
declines their request: that would need a trigger (a later migration).
Tests: tests/member-notifications.spec.js.

## Step 6, the member side: the real clock

No schema change. Signed in, the member's calendars were already on the
real clock (their Sessions screen and the coach's page take today from
`wallTodayMs()` and the week from `weekdayOf`); the demo booking screen
(ClientBooking) was the gap. Signed in it is never shown now: a member who
lands on it (an old back stack) gets their coach's own page in its place
(`RemoteCoachPreview`), or "No coach yet". Signed out, ClientBooking,
ClientSchedule and CoachPreview no longer hardcode `TODAY_INDEX`, the
week's dates or the .ics year and month: they derive them from the demo's
`TODAY_MS` and `getMonthAnchorMs()` (CLAUDE.md), so the demo stays on its
fixed week whatever the real date. `TODAY_INDEX` is left only in the
coach's Schedule. Tests: tests/member-real-clock.spec.js.

## Step 6, the member side: the demo member signed out only

No schema change. Signed in, nothing reads the demo member
(`DEMO_MEMBER_CLIENT_ID`): Profile's agreement state is read only signed
out (its card was already hidden), `useThread` no longer seeds its unused
local copy from the demo message store, and Home, Tasks and Profile show
the goal the coach set, or none, rather than the demo's sample goal
("Feel more in control of life"). The rest of Home, the coach page, Edit
profile and Messages were already guarded. tests/member-demo-identity.spec.js
walks the member screens signed in, watching every localStorage key read:
only the member's own and the device's are allowed, so a demo read keyed
by the demo member *or* hidden in a shared demo store (`clients`,
`standing_slots`, …) fails it.
Since 2026-10-04 the walk covers every member screen that reads the
member's data (Discover, Notifications, My programs, Program detail, Rate
coach, Booking and the coach page added), waits for each screen's chunk
(`installScreenSettle`) instead of a fixed delay, and fails if any of them
is switched back to its demo version. Favourites (`rafiq_fav_coaches`) are
the one device-local store left on the member side; moving them to
`favourite_coaches` (0005) would take that key off the walk's allowlist.

## Testing this kind of code

`tests/README.md`'s existing pattern (`native-oauth.spec.js`) already
covers async Supabase code without a real project or network: replace the
client's own methods with recorders, so nothing ever leaves the browser,
and assert on the exact table/payload a real call would send.
`tests/admin-queues.spec.js` follows it for step 1.

Screens that *read* need more than a recorder, so step 2 added
`tests/fakeSupabase.js`: small in-memory tables behind the client's own
`from()`/`auth`/`storage`, plus `signIn()`. Tests can assert on the rows
that landed. It doesn't enforce RLS or grants — that is the schema
suite's job (`supabase/tests/`, real Postgres, runnable locally with
`supabase/tests/run.sh`), so every new write gets an assertion there too.

Both need
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set (placeholders are fine,
same as CI) for `isSupabaseConfigured()` to be true — otherwise every
function takes its `not_configured` early return before ever reaching the
client, same as `auth.ts`'s equivalent guard.
