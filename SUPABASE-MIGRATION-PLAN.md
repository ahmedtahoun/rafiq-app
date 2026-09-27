# Moving off mockStore — a plan

LAUNCH-CHECKLIST.md §2 is the checklist; this is the *how*. The live
Supabase project has the full schema (`supabase/migrations/0001`–`0005`,
144 schema tests in CI). The app doesn't use it yet — every screen reads
and writes `src/lib/mockStore.ts` / `src/lib/directory.ts`
(`localStorage`), apart from auth itself (`src/lib/auth.ts`,
`src/lib/session.ts`), which is already real.

This file is the plan; **`src/lib/adminQueues.ts` is the first slice**
landing in the same PR — see its own section below. Wait for review on
that slice before converting the rest, per the checklist.

## The shape of the problem

`mockStore`'s functions are synchronous — `getClients()` returns an array,
`updateClient()` returns immediately. Every screen reads and renders in
one pass with no `useEffect`, no loading state, no possibility of failure.
A Supabase query is none of those things: it's async, it can be slow, and
it can fail (network, RLS, a constraint). Converting a function's body
from `localStorage` to `supabase.from(...)` is the easy part; the screen
that called it synchronously is the real work.

## Conventions already set, worth reusing rather than reinventing

- **`isSupabaseConfigured()` guards every real call** (`src/lib/
  supabase.ts`). Screens branch on it today (`Profile.tsx`'s `logOut()`,
  now also its verification/delete flows) and should keep doing so until
  every screen converts — there is no flag day, so both branches need to
  keep working right up until `mockStore`'s fallback is deleted for good.
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

1. **Reports, verification, deletion requests** (this PR's slice) — no
   screen *reads* these back (no admin UI in the app; the admin panel is
   `service_role`, `supabase/README.md`), so converting them is pure
   upside: zero risk of a half-migrated screen, and the admin queues have
   real rows to work with immediately, even from Supabase's own table
   editor (§9's suggested stopgap before a real admin app exists).
2. **Profile and onboarding** — `getCoachProfile()`/`getClient()` and their
   writers. Everything else reads through these, so screens converted
   later can start reading real data without a second pass. This is also
   where `coach_profiles.verification_status` starts being read for real,
   closing the gap this PR's slice deliberately leaves open (see below).
3. **Clients, tasks and sessions** — the coach's own roster. This is also
   where **the demo identities go away**: 14 member screens hardcode
   `const CLIENT_ID = 'sara'`; the coach side hardcodes `DEFAULT_PRO_ID =
   'pro-yasmin'`. Both become the signed-in user
   (`useAppStore.getState().userId`, already real). A member can have more
   than one coach, so this is also where a member picks which
   relationship they're viewing, not just a single hardcoded row.
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

## This PR's slice: `src/lib/adminQueues.ts`

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
  file real rows when Supabase is configured, with a `busy` state
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

**A gap this slice leaves open on purpose:** `Profile.tsx`'s verification
badge still reads `mockStore`'s local `verification_status` flag, not
`coach_profiles.verification_status` (which `0005`'s own
`sync_verification_status` trigger updates for real the moment a request
is filed). Reading that column for real is step 2 above ("profile and
onboarding") — until then, filing a real request also flips the local
mock flag so the on-screen badge doesn't silently stay "Unverified" after
a successful real submission.

## Testing this kind of code

`tests/README.md`'s existing pattern (`native-oauth.spec.js`) already
covers async Supabase code without a real project or network: replace the
client's own methods with recorders, so nothing ever leaves the browser,
and assert on the exact table/payload a real call would send.
`tests/admin-queues.spec.js` follows it for this slice. Needs
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set (placeholders are fine,
same as CI) for `isSupabaseConfigured()` to be true — otherwise every
function takes its `not_configured` early return before ever reaching the
client, same as `auth.ts`'s equivalent guard.
