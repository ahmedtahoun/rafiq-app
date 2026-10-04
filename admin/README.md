# Rafiq admin

The queues only Rafiq can resolve: reports, coach verification, account
deletions, suspensions, and finding a user by email or name. It replaces
working them by hand in the Supabase dashboard
(`supabase/admin/README.md`), which is what LAUNCH-CHECKLIST §9 says is
enough for closed testing and not enough for launch.

English only, on purpose: the people using it are Rafiq's own.

## The one rule

**The `service_role` key never goes in this app.** Not in `.env`, not in
a build, not in a browser tab. This app signs in with ordinary Supabase
Auth and holds nothing but the anon key, which is designed to be public.

Everything privileged happens in `supabase/functions/admin/`, which runs
on the server, verifies the caller's JWT, checks they are in
`admin_users`, and only then acts as `service_role`. `admin_users` has
RLS on and no grants — only `service_role` can read it — so that check
cannot be moved into the browser even if someone wanted to.

Signing in is open to any Google account. Being an admin is not: a
non-admin signs in fine and then gets a 403 from every operation, which
the app shows as a refusal.

## Running it locally

```sh
cd admin
npm install
cp .env.example .env.local      # then fill in the URL and anon key
npm run dev                     # http://127.0.0.1:5175
```

Port 5175 keeps it clear of the app's dev server (5173) and the
screenshot run (5174), and it has its own `node_modules`, so its Vite
dep cache cannot collide with theirs.

To use it you must be in `admin_users`. Add yourself once, from the
Supabase SQL editor (it has no policies, so the dashboard is the only
way in):

```sql
insert into admin_users (profile_id)
select id from profiles where email = 'you@rafiqpro.com'
on conflict do nothing;
```

## Tests

```sh
cd admin && npm test          # add PW_CHROMIUM=… in a sandbox, as at the root
```

Ten Playwright tests, against a **faked function**: the dev server is
pointed at `http://127.0.0.1:1` and every call to it is intercepted, so a
run cannot reach the real project even by accident. They assert the app
asks for the named operation with the right input, and that refusals
(403, and a 409 when another admin got there first) reach the screen
instead of a blank panel.

These are separate from the repo's own suite both ways: the root
`playwright.config.ts` has `testDir: './tests'`, so `npm test` at the
root never collects them.

The function's own tests are Deno, beside it:

```sh
npx --yes deno test --no-prompt supabase/functions
```

## Deploying — for Ahmed

```sh
# 1. The function. It picks up SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
#    from the platform; you do not set those yourself.
supabase functions deploy admin

# 2. The app.
cd admin && npm install && npm run build      # → admin/dist
```

`admin/dist` is a static bundle; host it wherever the marketing site
goes (§5). Two things to set wherever it lands:

- **Add its URL to Supabase → Auth → URL Configuration → Redirect
  URLs**, or Google sign-in will bounce. The app asks for
  `window.location.origin` back.
- **Keep it off the public web if you can** — an access-controlled host,
  or at least not a guessable address. It is not a security boundary (the
  function is), but an internal tool does not need visitors, and
  `index.html` carries `noindex` for the same reason.

## What each action does

| Operation | Effect |
|---|---|
| `listReports` | open `pro_reports`, oldest first |
| `actionReport` / `dismissReport` | sets `status` + `resolved_at` + `resolution_note` |
| `suspend` / `unsuspend` | `profiles.account_status` |
| `listVerifications` | pending `verification_requests`, oldest first |
| `approveVerification` / `rejectVerification` | sets `status` + `reviewed_at` + `reviewer_note` |
| `listDeletions` / `processDeletion` | delegated to the `account-deletion` function |
| `lookupUser` | `profiles` by email or name, 20 at most |

There is deliberately no "run this query" and no "update this table".
The function holds the `service_role` key, so what it can be asked to do
is a fixed list, not a parameter, and an unknown operation is a 400.

Three things in that table are less obvious than they look:

**Closing a report is two operations.** `report_status` is
`('open','actioned','dismissed')` — there is no "closed". `actioned`
means Rafiq did something about it, `dismissed` means it needed nothing,
and which one was chosen *is* the record of the decision. So neither
stands in for the other, and one operation taking a status string would
be the "update this table" shape this avoids.

**Approving verification does not set the coach's badge.** Migration
0005's `verification_requests_sync` trigger already maps
`verification_requests.status` onto
`coach_profiles.verification_status` (`approved` → `verified`,
`rejected` → `unverified`). The function writes the request row and
nothing else; writing both would give one field two sources of truth,
and they would disagree the first time one write landed and the other
did not.

**Suspension records no reason, because there is nowhere to put one.**
`profiles` has no note column and this change adds no migration, so the
reason lives on the report that prompted it: the report view actions the
report with a note first, then offers Suspend. If you want a reason
stored against the account itself, that needs a column — tell me and
you can assign the migration a number.

Every queue move is conditional on the row's current state, so two
people working the same queue cannot action one report twice or review
one request twice: the second gets a 409 and the first decision stands.
An account already `deleted` is never moved back to active — it has been
through `process_account_deletion()`, and someone who asked to be gone
should stay gone.

## Deletions go through the existing function

`processDeletion` calls `supabase/functions/account-deletion` rather than
repeating what it does. That function runs the database half (which
refuses while a session, credit, dispute or payout is still open), clears
the person's photos from Storage, then deletes or locks the login, and
marks the request completed only at the end — so a failure anywhere
leaves it pending and safe to run again. None of that is worth having a
second, slightly different copy of.

Its refusals are passed through unflattened: a 409 saying *an unsettled
payout remains* is what an admin needs, not a generic failure.

## The two embeds, which are not alike

An earlier draft of this tool got this wrong and `listVerifications`
would have errored on the real database every time, so it is worth
stating plainly: **the two queues reach the person by different routes,
because the two tables are shaped differently.**

`pro_reports` references `profiles` **twice** — `reporter_id` and
`coach_id`, both to `profiles(id)` (0005). Two relationships between the
same pair of tables are ambiguous, so each embed names the joining
column:

```
reporter:profiles!reporter_id(id, full_name, email)
coach:profiles!coach_id(id, full_name, email, account_status)
```

`verification_requests` does **not** reference `profiles` at all.
`coach_id` references `coach_profiles(profile_id)` (0005), and
`coach_profiles.profile_id` references `profiles(id)` (0001). There is no
direct relationship for PostgREST to follow, so the embed goes through
`coach_profiles` and the person arrives nested:

```
coach:coach_profiles!coach_id(profile:profiles!profile_id(id, full_name, email, account_status))
```

The app flattens that in one place, `coachOf()` in `src/api.ts`.

### What the tests still cannot tell you

The Deno tests use a recorder that models tables, not PostgREST's query
grammar. They pin the *shape* of these strings — that verification goes
through `coach_profiles` and never straight to `profiles`, and that the
report embeds name their joining column — which is what would have
caught the earlier mistake. They cannot confirm the relationships
resolve. That is the same class of gap as `tests/fakeSupabase.js` not
enforcing enums, which cost a crashed screen in the screenshot seed.

So: look at Reports and Verification on the real database the first time
this is deployed. A wrong embed fails loudly, as a `list_failed` carrying
PostgREST's own message.

## Building it: the variables are not optional

`npm run build` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
unset **exits 0 and builds almost nothing.** Vite replaces
`import.meta.env.*` at build time, so the app's "not configured" branch
becomes a compile-time constant and the bundler drops everything behind
it: 231 KB instead of 443 KB, with no queues in it.

The app itself handles this — it renders a screen naming the two
variables rather than a blank page, which is why `src/supabase.ts` uses a
flag and a lazily created client instead of a module-level `throw` (a
throw at module scope was the original bug: the minifier treated the
whole app as unreachable after it).

What it means for you: **build with the real values set**, from
`.env.local` or the environment, and sanity-check the output size. CI
builds with harmless placeholders, which is enough to typecheck and
bundle the real code but produces an artifact that cannot talk to
anything.

## Not here yet

Creating, sending and syncing payouts (§3, *"an admin screen to create,
send and sync payouts (§9)"*). The `payouts` function is already written
and already admin-only, so it is UI over a finished backend and belongs
in this app — but as its own PR, not bolted onto this one. It needs a
`listPayouts` operation adding here (the `payouts` function has create,
send, sync and balance, but no list, and the table is behind RLS), which
is a change worth reviewing on its own rather than inside a PR about the
queues.
