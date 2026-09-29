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
  Messages (step 5), Notifications, Programs and RateCoach (step 6), and
  Discover's goal matching — Discover's coaches are real since step 4. Each reads `DEMO_MEMBER_CLIENT_ID` from mockStore with a note
  naming its step, so what's left is one grep. The pieces of converted
  screens that belong to those steps (milestones, the live-session badge,
  the agreement, the Full Access upgrade and standing slot) are hidden
  signed in rather than showing the demo's.

## Step 3, the gap: inviting a client who has no account

**Design only — the migration is Ahmed's side, then the UI is wired.**

`0008` is the reason this is needed. A coach may set `clients.member_id`
only for a member who has a pending or accepted `session_requests` row
with that coach, because user ids are not secret (every avatar's storage
path starts with one) and without the guard any coach could link any
member and read their name, email and phone. The marketplace path
satisfies it: the member asks, the coach accepts, `accept_session_request()`
creates the roster row already linked.

A coach's existing clients don't come that way. A coach adds them by hand
in AddClient — a name and a phone number, no account — and `addClient`
writes a walk-in row with `member_id` null. That row can never become the
member's, however much both sides want it to: the member has no request
to that coach and cannot make the row's owner link them. They would have
to go to Discover, find their own coach among strangers and request a
session they have already agreed, which is a bad flow and produces a
second roster row.

So: the coach hands out an invite, and the member claims it.

### What the coach sees

On a walk-in client's ClientDetail (a row with no linked account), a card
reading roughly *"{name} hasn't joined Rafiq yet"* with **Invite to
Rafiq**. Tapping it generates a code and offers the system share sheet
(WhatsApp, SMS), with the code also shown to read out. Once generated,
the card shows the code, when it expires and **Revoke**; revoking is
immediate, and generating again replaces the old code rather than adding
a second.

A coach must not be able to claim their own invite, and the card is never
shown on a row that already has a `member_id`.

Nothing else on the roster row changes. `client_private` (the coach's
notes and favourite flag) stays coach-only after linking, by its own
policies — worth stating plainly, because a coach will reasonably worry
that inviting someone exposes what they wrote about them. Tasks,
sessions, package and payments on that row do become visible to the
member, which is the point, so the coach should be told that in the
sheet before the code is generated.

### What the member sees

Two ways in, one destination:

1. **A link** (`https://rafiqpro.com/join/<code>`, once §1's domain
   exists) — opens the app on the claim screen with the code filled in,
   or the web app if it isn't installed.
2. **Typing the code**, for a code read out or sent as plain text.
   ClientHome's "No coach yet" empty state gets a second action next to
   Discover: **I have an invite code**.

Either lands on a claim screen showing the coach's name, photo and title
— read from the `coach_directory` view by the coach id the code resolves
to, so the member can see who they are about to link to *before*
confirming, not after. Confirming calls the function. On success the app
switches to that relationship (the same per-account selection MyCoaches
already writes) and lands on ClientCoach.

A member who is signed out is sent through sign-in first and returned to
the claim, code intact. A member who already has that coach sees "You're
already working with {coach}" rather than an error.

Every failure below needs its own message; "something went wrong" on a
code someone typed off a WhatsApp message is not enough to act on.

### What the schema needs

Smallest version that works — columns on `clients`, not a second table,
since an invite belongs to exactly one roster row and dies with it:

```
alter table public.clients
  add column invite_code       text,
  add column invite_expires_at timestamptz,
  add column invite_created_at timestamptz;

create unique index clients_invite_code_uniq
  on public.clients (invite_code) where invite_code is not null;
```

The code is **never** granted to `authenticated` for select — the member
cannot read `clients` at all before linking, and the coach reads their own
rows anyway. It is only ever returned by the generate function to the
coach who owns the row.

`0004` turned default privileges off, so every new function needs an
explicit `grant execute ... to authenticated`, and any new column the app
writes needs its own column grant.

**Code format:** 10 characters of Crockford base32 (no I/L/O/U, so it
survives being read aloud), ~50 bits, shown grouped as `XXXXX-XXXXX`.
Generated with `gen_random_bytes`, never a sequence or a short numeric
PIN: this is a bearer token, and anyone holding it becomes that client.
**Expiry:** 14 days, and single use.

### `claim_client_invite(code text)`

`SECURITY DEFINER` — unavoidably, unlike `0010`'s `accept_session_request()`,
which is `SECURITY INVOKER` because the coach genuinely holds every
privilege it uses. Here the caller is the member, who may not select
`clients`, may not update it, and must still set `member_id` on a row
`0008`'s trigger is specifically written to stop them setting. So it runs
as the owner, `set search_path = public`, and does its own authorisation.
Everything below is a check the invoker's own policies would otherwise
have made:

In order, each with its own error code so the screen can say which:

1. **Caller is signed in** — `auth.uid()` is not null. (`28000`)
2. **Caller is a member**, not a coach: a `member_profiles` row exists,
   or at least `profiles.role = 'client'`. A coach claiming an invite
   would put a coach account on another coach's roster. (`42501`)
3. **The code resolves** to exactly one `clients` row. (`P0002` — same
   "no such thing for you" code 0010 uses.)
4. **Not expired** — `invite_expires_at > now()`. (`22023`)
5. **Not already claimed** — that row's `member_id` is null. A code on a
   linked row is spent, whatever its expiry says. (`55000`)
6. **The caller isn't the coach who owns the row** —
   `clients.coach_id <> auth.uid()`. (`42501`)
7. **The caller has no other row with this coach** — the
   `clients_coach_member_uniq` index would refuse the write anyway, but
   raising here lets the screen say "you're already working with them"
   instead of surfacing a constraint violation. (`23505`)
8. **Rate limit** — see below. (`53400`)

Then, in one transaction: set `member_id = auth.uid()`, clear
`invite_code`, `invite_expires_at` and `invite_created_at` so the code
cannot be replayed, and return the `clients.id` and `coach_id` so the app
can select that relationship and show who it linked.

It must **not** create a `session_requests` row to satisfy `0008`. The
guard returns early for a non-`authenticated` `current_user`, so a
definer function does not trip it; faking a request to get past it would
put a session nobody asked for on the coach's calendar.

**A lookup companion:** the claim screen wants the coach's name before
the member commits, and the member cannot read `clients`. So a second,
read-only `SECURITY DEFINER` function — `peek_client_invite(code)` —
returning just `coach_id`, the coach's display name and photo from
`coach_directory`, and the roster row's `full_name` so the member can
confirm it is really their record. It must apply checks 1–5 and the rate
limit, and must return nothing identifying on a bad code.

### The one thing that needs a decision

**Rate limiting.** Both functions are online guess oracles for a bearer
token, and `peek` is the cheaper target. 50 bits is far beyond guessing
at any sane request rate, so the limit is defence in depth rather than
the primary control — but without one, nothing stops a signed-in account
grinding. Options, cheapest first:

- Count failed attempts per `auth.uid()` in a rolling window inside the
  function, in a small `client_invite_attempts` table (needs its own
  table, grants and a cleanup job).
- Do it at the edge instead, if Supabase's own rate limiting can be
  pointed at an RPC.
- Ship without it, on the strength of the entropy and the 14-day expiry,
  and add it if abuse appears.

My recommendation is the first, with a low limit (10 failures per account
per hour) — it is maybe fifteen lines and it is the only one that
survives the code length ever being shortened for usability, which is
exactly the change someone will ask for.

### What the app does after the migration lands

`src/lib/rosterData.ts` gains `createClientInvite(clientId)` and
`revokeClientInvite(clientId)`; `src/lib/memberData.ts` gains
`peekInvite(code)` and `claimInvite(code)`. Both follow the module
convention: `{ ok: true, data } | { ok: false, code, message }`, with
`code` mapped to an i18n key at the call site. Screens touched:
ClientDetail (the invite card), a new claim screen, and ClientHome's
empty state. `supabase/tests/` gets a file issuing each of these as both
roles, covering every refusal above.

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
