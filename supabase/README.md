# Supabase backend

The database behind Rafiq. Nothing in `src/` reads from it yet — the app still
runs entirely on `src/lib/mockStore.ts`'s localStorage layer. This is the
target that layer gets pointed at, built ahead of the wiring so the schema can
be reviewed and corrected before screens depend on it.

## Layout

```
supabase/
  migrations/0001_init.sql   tables, constraints, RLS policies, grants
  migrations/0002_*.sql      triggers that write notification rows
  migrations/0003_storage.sql  profile photo buckets and their policies
  seed.sql                   the 6 demo members from mockStore, for dev
  tests/                     applies every migration to a throwaway Postgres
                             and asserts the policies really hold
```

TypeScript side: `src/lib/database.types.ts` (typed schema),
`src/lib/supabase.ts` (the client), `src/lib/auth.ts` (sign-up/in/out),
`src/lib/storage.ts` (profile photo upload and signed URLs).

## Setting it up

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migration — `supabase db push`, or paste
   `migrations/0001_init.sql` into the SQL editor.
3. Copy the project URL and anon key into `.env.local`
   (`cp .env.local.example .env.local`).
4. Regenerate the types against the real project, replacing the hand-written
   file wholesale:

   ```bash
   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
   ```

5. Optionally sign up as a coach, then `psql "$DATABASE_URL" -f supabase/seed.sql`.

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
the script exits non-zero if any fail — or if fewer than 40 assertions ran at
all, so a test file that quietly failed to load can't read as a clean run.
Currently 74 assertions across RLS, constraints, notification triggers and
storage policies, all passing.

These exist because RLS is the kind of thing that looks right and isn't. The
first run of this suite caught the migration having no `GRANT`s at all — every
query failed with `42501`. A real Supabase project's default privileges would
have hidden that by handing `authenticated` blanket access to every table,
which is both broader than this app needs and invisible in the schema.

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
- **A member can only ever mark their own task done**, request a `pending` time
  block, send messages as themselves, and rate their coach. Everything else on
  the relationship is the coach's to write.
