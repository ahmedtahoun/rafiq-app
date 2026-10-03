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

## What the tests cannot tell you

Three of the function's selects embed a related row and name the joining
column, because reports and verification requests both reference
`profiles` twice:

```
reporter:profiles!reporter_id(id, full_name, email)
```

The Deno tests use a recorder that models tables, not PostgREST's query
grammar, so **those three strings are the part of this change only the
real project can confirm.** It is the same class of gap as
`tests/fakeSupabase.js` not enforcing enums, which cost a crashed screen
in the screenshot seed. Worth a look at Reports and Verification on the
real database the first time it is deployed; if an embed is wrong it
fails loudly, as a `list_failed` with PostgREST's own message.

## Not here yet

Creating, sending and syncing payouts (§3, *"an admin screen to create,
send and sync payouts (§9)"*). The `payouts` function is already written
and already admin-only, so it is UI over a finished backend and belongs
in this app — next commit on this branch.
