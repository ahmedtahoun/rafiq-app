# Supabase backend

The database behind Rafiq. Nothing in `src/` reads from it yet — the app still
runs entirely on `src/lib/mockStore.ts`'s localStorage layer. This is the
target that layer gets pointed at, built ahead of the wiring so the schema can
be reviewed and corrected before screens depend on it.

## Layout

```
supabase/
  migrations/0001_init.sql   tables, constraints, RLS policies, grants
  seed.sql                   the 6 demo members from mockStore, for dev
  tests/                     applies the migration to a throwaway Postgres
                             and asserts the policies really hold
```

TypeScript side: `src/lib/database.types.ts` (typed schema),
`src/lib/supabase.ts` (the client), `src/lib/auth.ts` (sign-up/in/out).

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
supabase/tests/run.sh
```

Needs a local Postgres 16 (`initdb`/`pg_ctl`/`psql`) — no Supabase project and
no network. It builds a throwaway cluster, stands in for the `auth` schema and
the `anon`/`authenticated`/`service_role` roles, applies the migration, and
runs every check as a real signed-in user via `auth.uid()`.

Each line prints an expectation and the result. A number where the line says
`DENIED`, or `ALLOWED` where it says `REJECTED`, is a failure. Currently 15 RLS
assertions and 19 constraint assertions, all passing.

These exist because RLS is the kind of thing that looks right and isn't. The
first run of this suite caught the migration having no `GRANT`s at all — every
query failed with `42501`. A real Supabase project's default privileges would
have hidden that by handing `authenticated` blanket access to every table,
which is both broader than this app needs and invisible in the schema.

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
- **Subscription tier has no client write path.** Tier changes should arrive
  from a payment webhook running as `service_role`, not from the app.
- **Notifications are read-only to the client** apart from marking them read;
  rows are expected to come from triggers or server-side jobs, which aren't
  written yet.
- **A member can only ever mark their own task done**, request a `pending` time
  block, send messages as themselves, and rate their coach. Everything else on
  the relationship is the coach's to write.
