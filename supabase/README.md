# Supabase backend

The database behind Rafiq. The app is moving onto it in steps
(`SUPABASE-MIGRATION-PLAN.md` at the repo root): auth, the admin queues, and
the signed-in user's own profile and onboarding read and write it now;
everything else still runs on `src/lib/mockStore.ts`'s localStorage layer.

## Layout

```
supabase/
  migrations/0001_init.sql   tables, constraints, RLS policies, grants
  migrations/0002_*.sql      triggers that write notification rows
  migrations/0003_storage.sql  profile photo buckets and their policies
  migrations/0004_*.sql      grants locked down, column-level where it matters
  migrations/0005_*.sql      tables and columns for parity with the app
  migrations/0006_*.sql      member_profiles: a member's own onboarding answers
  seed.sql                   the 6 demo members from mockStore, for dev
  tests/                     applies every migration to a throwaway Postgres
                             and asserts the policies really hold
```

TypeScript side: `src/lib/database.types.ts` (typed schema),
`src/lib/supabase.ts` (the client), `src/lib/auth.ts` (sign-up/in/out),
`src/lib/storage.ts` (profile photo upload and signed URLs),
`src/lib/adminQueues.ts` and `src/lib/profileData.ts` (the app's reads and
writes so far).

## Setting it up

The live project is `muikkxccdamtejvheepx`; migrations `0001`–`0005` were
applied to it on 2026-09-26. For a new migration:

1. `npx supabase login` — the browser must be signed into the Supabase
   account that owns the project. The CLI answers "does not have the
   necessary privileges" for a project your logged-in account can't see;
   `npx supabase projects list` shows which ones it can.
2. `npx supabase link --project-ref muikkxccdamtejvheepx` (asks for the
   database password; stored under `supabase/.temp`, which is gitignored).
3. `npx supabase db push --dry-run`, then `npx supabase db push`. Never paste
   a migration into the SQL editor instead — the CLI's history table is how
   the next push knows what has already run.
4. Regenerate the types from the live schema, overwriting the file wholesale
   (it is generated — don't hand-edit it):

   ```bash
   npx supabase gen types typescript --linked > src/lib/database.types.ts
   ```

For a brand-new project, create it at [supabase.com](https://supabase.com),
link it as above, push, and copy its URL and anon key into `.env.local`
(`cp .env.local.example .env.local`).

5. Optionally sign up as a coach, then `psql "$DATABASE_URL" -f supabase/seed.sql`.

## Backups

The project is on Supabase's free plan, which keeps **no backups**
(LAUNCH-CHECKLIST §5). Ahmed runs one himself, **every week**:

```sh
npm run backup-db              # into ~/RafiqBackups; never inside the repo
```

The script dumps the roles, the schema and every row of the linked project,
the way Supabase's own guide does. That includes auth users and storage
metadata, but not the photo files themselves. It encrypts the dump with a
passphrase that openssl asks for and nothing stores (keep it in the
password manager), and deletes backups older than 28 days. Members are told a
deleted account can stay in a backup for up to four weeks, so skipping weeks
breaks that promise.

To restore, into a project whose connection string is `$DB_URL`:

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in rafiq-db-<date>.tar.gz.enc | tar xzf -
cd rafiq-db-<date>
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$DB_URL"
```

Delete the decrypted folder when you are done: it holds every member's data
in plain text.

## Running the tests

```bash
supabase/tests/run.sh                                # builds its own cluster
DATABASE_URL=postgres://... supabase/tests/run.sh     # uses a server you have
```

Needs a local Postgres 16 (`initdb`/`pg_ctl`/`psql`) — no Supabase project and
no network. It builds a throwaway cluster, stands in for the `auth` schema and
the `anon`/`authenticated`/`service_role` roles, applies the migration, and
runs every check as a real signed-in user via `auth.uid()`. Given a
`DATABASE_URL` it uses that server instead and resets the schema first, which
is how CI runs it against a `postgres:16` service container.

Every assertion prints `PASS`/`FAIL` with its expected and actual value, and
the script exits non-zero if any fail — or if fewer assertions ran than
`MIN_ASSERTIONS` in `run.sh`, so a test file that quietly failed to load can't
read as a clean run. Currently 166 assertions across RLS, constraints,
notification triggers, storage policies, the 0005 app-parity tables, and
(`07_profiles.sql`) 0006's member_profiles plus every profile write the app
makes, issued as the authenticated role — all passing.

These exist because RLS is the kind of thing that looks right and isn't. The
first run of this suite caught the migration having no `GRANT`s at all — every
query failed with `42501`. A real Supabase project's default privileges hand
`anon` and `authenticated` blanket access to every table and function in
`public` — and adding GRANTs on top of that narrows nothing, which the suite
could not see until the shim reproduced those defaults. `0004` revokes them
and turns them off for future objects, so **a new table or function starts
with no access: its migration must GRANT what the app needs**, and a
security-definer function must not be granted to the app at all unless the
app is meant to call it.

`.github/workflows/ci.yml` runs this suite on every push, alongside the app's
typecheck, build and lint.

## How the model differs from mockStore

Two deliberate departures, both because `mockStore` stores what the prototype
rendered rather than what the data means:

- **Display strings become timestamps.** `Client.nextSession` (`'Next: Today,
  10:00 AM'`, `'No upcoming session'`) and `Task.due` (`'Due Fri, Oct 24'`) are
  formatted English text. Here they are `timestamptz` (nullable), and the UI
  formats them — which EN/AR needs regardless, since those strings can't be
  translated after the fact.
- **A roster row is not an account.** A coach can add a client who never signs
  up (AddClient), and the design's relationship model lets one member work with
  several coaches. So `clients.member_id` is a nullable link to a real account,
  and the roster row — not the user — is what tasks, payments, sessions and
  messages hang off.

## Things decided here, worth a second opinion

- **`anon` is granted nothing.** Every screen is behind sign-in, Discover
  included. If the marketplace should be browsable logged-out, that changes.
- **Payments and messages are append-only** (no `UPDATE`/`DELETE` grant). A
  correction is a refund row pointing at the charge it reverses, so the ledger
  stays auditable. One refund per charge is enforced by a unique index.
  `payments.client_id` also **restricts** rather than cascades — an
  append-only ledger a coach can erase by deleting the client is not
  append-only. The app never hard-deletes a client (EditClient's Archive sets
  `clients.active = false` and promises the history stays saved), so this only
  stops the schema contradicting that promise. It does mean a coach account
  with recorded payments cannot be hard-deleted either, which matches
  `requestProAccountDeletion` anonymizing the Pro rather than erasing client
  history. Refusals come back as SQLSTATE `23503`.
- **Only payments restricts, for now.** `sessions`, `ratings` and `messages`
  still cascade from `clients`. The same "it is the member's record, not the
  coach's to erase" argument arguably covers session history and a member's
  rating of their coach — left as-is deliberately rather than widened without
  a decision, and moot while nothing hard-deletes a client.
- **Subscription tier has no client write path.** Tier changes should arrive
  from a payment webhook running as `service_role`, not from the app.
- **Notifications are read-only to the client** apart from marking them read.
  `0002` writes the rows from triggers, and the rule is always *notify the
  other side, never the actor*. One naming wart falls out of that: the enum
  value is `payment-received`, but only a coach can insert a payment, so the
  member is who gets told — it is really their receipt. If member-initiated
  payments land, this should flip to notifying the coach.
- **Photo buckets are private**, so there is no public URL and the client signs
  one per read. That keeps them consistent with `anon` getting nothing, at the
  cost of a `createSignedUrl` call. It also means `profiles.avatar_photo_url`
  and `coach_profiles.cover_photo_url` hold an object *path*, not a URL — worth
  renaming whenever something else is touching that schema anyway.
- **What a member may write on the relationship is short and enforced.** Mark a
  task done, dispute a session's attendance, sign the agreement, mark a
  finished program reviewed, request a `pending` time block, set a standing
  slot, log a mood, cancel as themselves, message as themselves, and rate their
  own coach's sessions and programs. Where they may touch only some columns of
  a row the coach owns, a `member_update_scope` trigger lists them and refuses
  everything else. The rest of the relationship is the coach's to write.
- **Ratings are per session or per finished program** (`0005`), not one per
  relationship — RateCoach rates each session, and the milestone review rates
  a program.
- **The marketplace reads through two views.** A member browsing Discover isn't
  the coach's client, so `profiles` and `ratings` RLS hide both. `coach_directory`
  publishes a coach card (name, photo, title, languages, from-price, rating
  count and average) and `coach_reviews` publishes written reviews signed with a
  first name and last initial only.
- **Only Rafiq decides some things.** Verification outcome, `featured`,
  `account_status` and report outcomes are in no column the app can write; the
  app files a request (`verification_requests`, `pro_reports`,
  `account_deletion_requests`) and the admin panel resolves it as
  `service_role`. A coach's private notes on a member live in `client_private`,
  not on the roster row the member can read.
