# Moving off mockStore — a plan

LAUNCH-CHECKLIST.md §2 is the checklist; this is the *how*. The live
Supabase project has the full schema (`supabase/migrations/`, with schema
tests in CI). Most screens still read and write `src/lib/mockStore.ts` /
`src/lib/directory.ts` (`localStorage`).

**Done so far:** auth itself (`auth.ts`, `session.ts`); step 1, the admin
queues (`adminQueues.ts`); step 2, the signed-in user's own profile and
onboarding (`profileData.ts`). Each has its own section below.

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
4. **Scheduling** — `time_blocks`, depends on real clients existing.
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
