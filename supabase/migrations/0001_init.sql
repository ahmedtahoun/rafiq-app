-- Rafiq — initial schema
--
-- Derived from src/lib/mockStore.ts, which is the app's current data layer
-- (localStorage-backed) and itself a 1:1 port of the design prototype's
-- store.js. Every table below backs a type that already exists in that file,
-- so the eventual swap is mockStore's functions changing their body from
-- readLocal()/writeLocal() to a supabase query — not a remodelling.
--
-- Two deliberate departures from mockStore, both because it stores what the
-- prototype rendered rather than what the data means:
--   * display strings become real timestamps — mockStore's Client.nextSession
--     ('Next: Today, 10:00 AM' / 'No upcoming session') and Task.due
--     ('Due Fri, Oct 24') are formatted text. Here they are timestamptz and
--     the UI formats them, per-locale, which is what EN/AR + RTL needs anyway.
--   * a client roster row is not the same thing as a member's account. A coach
--     can add a client who has never signed up (AddClient), and the design's
--     "relationship" model lets one member work with more than one coach. So
--     clients.member_id is a nullable link to a real account, not the identity.
--
-- Apply with:  supabase db push     (or paste into the SQL editor)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type app_role            as enum ('coach', 'client');
create type payment_status      as enum ('paid', 'due', 'overdue');
create type payment_kind        as enum ('charge', 'refund');
create type payment_state       as enum ('completed', 'pending', 'refunded');
create type session_mode        as enum ('online', 'in_person', 'both');
create type verification_status as enum ('unverified', 'pending', 'verified');
create type subscription_tier   as enum ('free', 'pro');
create type attendance          as enum ('attended', 'no_show', 'cancelled', 'disputed');
create type time_block_kind     as enum ('available', 'busy', 'pending', 'booked');
create type notification_kind   as enum ('session-request', 'payment-received', 'task-completed', 'message');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users, for both roles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  role             app_role    not null,
  full_name        text        not null default '',
  email            text,
  phone            text,
  country_code     text,                       -- dial code, e.g. '+20'
  country          text,
  country_flag     text,
  city             text,
  avatar_photo_url text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Mirrors a new auth user into profiles. Role comes from the sign-up call's
-- metadata (supabase.auth.signUp({ options: { data: { role } } })) and falls
-- back to 'client', the safer of the two — a coach gets more read surface.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'client'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- coach_profiles — the coach-only half of CoachProfile
-- ---------------------------------------------------------------------------

create table public.coach_profiles (
  profile_id          uuid primary key references public.profiles (id) on delete cascade,
  title               text                not null default '',  -- specialties joined with ' · '
  cert                text                not null default '',
  bio                 text                not null default '',
  languages           text[]              not null default '{}',
  session_mode        session_mode        not null default 'both',
  experience_years    int,
  certifications      text[]              not null default '{}',
  cover_photo_url     text,
  verification_status verification_status not null default 'unverified',
  signup_completed_at timestamptz,
  created_at          timestamptz         not null default now(),
  updated_at          timestamptz         not null default now()
);

create trigger coach_profiles_set_updated_at
  before update on public.coach_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- subscriptions — Rafiq Pro tier, one row per coach
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  coach_id   uuid primary key references public.coach_profiles (profile_id) on delete cascade,
  tier       subscription_tier not null default 'free',
  renews_at  timestamptz,
  created_at timestamptz       not null default now(),
  updated_at timestamptz       not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clients — a coach's roster row, optionally linked to a member account
-- ---------------------------------------------------------------------------

create table public.clients (
  id              uuid           primary key default gen_random_uuid(),
  coach_id        uuid           not null references public.coach_profiles (profile_id) on delete cascade,
  member_id       uuid           references public.profiles (id) on delete set null,
  full_name       text           not null,
  program         text           not null default '',
  plan            text           not null default 'Basic',
  initials        text           not null default '',
  avatar_bg       text           not null default '#7A7166',
  active          boolean        not null default true,
  progress        smallint       not null default 0 check (progress between 0 and 100),
  needs_checkin   boolean        not null default false,
  next_session_at timestamptz,
  payment_status  payment_status not null default 'due',
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now()
);

-- The same member can't be on one coach's roster twice.
create unique index clients_coach_member_uniq
  on public.clients (coach_id, member_id) where member_id is not null;
create index clients_coach_id_idx  on public.clients (coach_id);
create index clients_member_id_idx on public.clients (member_id) where member_id is not null;

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers
--
-- security definer so a policy on clients can check membership without
-- re-entering that table's own policy (which recurses). search_path is pinned
-- because a definer function that resolves names through the caller's
-- search_path is a privilege-escalation hole.
-- ---------------------------------------------------------------------------

create or replace function public.is_coach_of(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client and c.coach_id = auth.uid()
  );
$$;

create or replace function public.is_member_of(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client and c.member_id = auth.uid()
  );
$$;

-- Either side of the relationship — the common read predicate.
create or replace function public.can_see_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_coach_of(p_client) or public.is_member_of(p_client);
$$;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id         uuid        primary key default gen_random_uuid(),
  client_id  uuid        not null references public.clients (id) on delete cascade,
  title      text        not null,
  due_at     timestamptz,
  recurring  boolean     not null default false,
  done       boolean     not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_client_id_idx on public.tasks (client_id, due_at);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- packages — session credits. One live package per client; renewal adds to
-- total rather than opening a second row, matching how the app mutates it.
-- ---------------------------------------------------------------------------

create table public.packages (
  client_id  uuid        primary key references public.clients (id) on delete cascade,
  total      smallint    not null default 8 check (total >= 0),
  used       smallint    not null default 0 check (used >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packages_used_within_total check (used <= total)
);

create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions — scheduled and logged sessions (mockStore's SessionLog, plus the
-- scheduling side Schedule/AddTimeBlock will need)
-- ---------------------------------------------------------------------------

create table public.sessions (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references public.clients (id) on delete cascade,
  scheduled_at timestamptz not null,
  ended_at     timestamptz,
  attendance   attendance,                       -- null until the session is logged
  followed_up  boolean     not null default false,
  recap        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index sessions_client_id_idx on public.sessions (client_id, scheduled_at desc);
-- getProActiveObligations() counts open disputes; keep that cheap.
create index sessions_disputed_idx  on public.sessions (client_id) where attendance = 'disputed';

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments — an append-only ledger. A refund is its own row pointing at the
-- charge it reverses, so the history stays auditable instead of a charge row
-- being edited into a different amount.
--
-- client_id RESTRICTS rather than cascades, and that is the whole point: a
-- ledger that a coach can erase by deleting the client is not auditable, and
-- cascade made "append-only" true only until someone pressed delete. The app
-- never hard-deletes a client anyway — EditClient's Archive sets
-- clients.active = false, and its own copy promises "their history and
-- progress stay saved", so clients.active IS the soft delete and this FK just
-- stops the schema from contradicting that promise.
--
-- Consequence worth knowing: because clients -> coach_profiles -> profiles ->
-- auth.users all cascade, a coach account with any recorded payment can no
-- longer be hard-deleted either. That matches what mockStore's
-- requestProAccountDeletion already does — it anonymizes the Pro and leaves
-- every client's history intact, on the grounds that the history is the
-- member's own record of the relationship, not the Pro's to erase.
--
-- Refused deletes surface as SQLSTATE 23503 (foreign_key_violation); a UI that
-- offers delete should catch that and point at Archive instead.
-- ---------------------------------------------------------------------------

create table public.payments (
  id         uuid          primary key default gen_random_uuid(),
  client_id  uuid          not null references public.clients (id) on delete restrict,
  kind       payment_kind  not null default 'charge',
  amount     numeric(12,2) not null check (amount > 0),
  currency   char(3)       not null default 'EGP',
  state      payment_state not null default 'completed',
  method     text,
  note       text,
  refund_of  uuid          references public.payments (id) on delete restrict,
  paid_at    timestamptz   not null default now(),
  created_at timestamptz   not null default now(),
  -- a refund must name the charge it reverses; a charge must not
  constraint payments_refund_link check (
    (kind = 'refund' and refund_of is not null) or
    (kind = 'charge' and refund_of is null)
  )
);

create index payments_client_id_idx on public.payments (client_id, paid_at desc);
create unique index payments_one_refund_per_charge on public.payments (refund_of) where refund_of is not null;

-- ---------------------------------------------------------------------------
-- time_blocks — the coach's calendar. 'pending' is a member's session request
-- awaiting the coach's answer (mockStore's CustomBlock kind = 'pending').
-- ---------------------------------------------------------------------------

create table public.time_blocks (
  id         uuid            primary key default gen_random_uuid(),
  coach_id   uuid            not null references public.coach_profiles (profile_id) on delete cascade,
  client_id  uuid            references public.clients (id) on delete cascade,
  kind       time_block_kind not null,
  label      text,
  starts_at  timestamptz     not null,
  ends_at    timestamptz     not null,
  created_at timestamptz     not null default now(),
  constraint time_blocks_ordered check (ends_at > starts_at)
);

create index time_blocks_coach_idx on public.time_blocks (coach_id, starts_at);

-- ---------------------------------------------------------------------------
-- messages — one thread per client row, both sides writing into it
-- ---------------------------------------------------------------------------

create table public.messages (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references public.clients (id) on delete cascade,
  sender_role app_role    not null,
  sender_id   uuid        references public.profiles (id) on delete set null,
  body        text        not null check (length(body) > 0),
  created_at  timestamptz not null default now()
);

create index messages_client_id_idx on public.messages (client_id, created_at desc);

-- Read cursors, one per side — getUnreadMessageCount(clientId, forRole).
create table public.message_reads (
  client_id    uuid        not null references public.clients (id) on delete cascade,
  reader_role  app_role    not null,
  last_read_at timestamptz not null default now(),
  primary key (client_id, reader_role)
);

-- ---------------------------------------------------------------------------
-- ratings — a member rates their coach (RateCoach), one rating per relationship
-- ---------------------------------------------------------------------------

create table public.ratings (
  client_id  uuid        primary key references public.clients (id) on delete cascade,
  coach_id   uuid        not null references public.coach_profiles (profile_id) on delete cascade,
  rating     smallint    not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ratings_coach_id_idx on public.ratings (coach_id);

create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- offerings — what a coach sells (Offerings screen, and Discover's listings)
-- ---------------------------------------------------------------------------

create table public.offerings (
  id            uuid          primary key default gen_random_uuid(),
  coach_id      uuid          not null references public.coach_profiles (profile_id) on delete cascade,
  name          text          not null,
  description   text          not null default '',
  session_count smallint      not null default 1 check (session_count > 0),
  price         numeric(12,2) not null check (price >= 0),
  currency      char(3)       not null default 'EGP',
  active        boolean       not null default true,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create index offerings_coach_id_idx on public.offerings (coach_id) where active;

create trigger offerings_set_updated_at
  before update on public.offerings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

create table public.notifications (
  id           uuid              primary key default gen_random_uuid(),
  recipient_id uuid              not null references public.profiles (id) on delete cascade,
  kind         notification_kind not null,
  client_id    uuid              references public.clients (id) on delete cascade,
  payload      jsonb             not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz       not null default now()
);

-- Main's unread dot is the hot read: "do I have any unread at all".
create index notifications_unread_idx
  on public.notifications (recipient_id, created_at desc) where read_at is null;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Every table is deny-by-default. Nothing below trusts a client-supplied id:
-- each policy re-derives the caller's access from auth.uid().
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.coach_profiles enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.clients        enable row level security;
alter table public.tasks          enable row level security;
alter table public.packages       enable row level security;
alter table public.sessions       enable row level security;
alter table public.payments       enable row level security;
alter table public.time_blocks    enable row level security;
alter table public.messages       enable row level security;
alter table public.message_reads  enable row level security;
alter table public.ratings        enable row level security;
alter table public.offerings      enable row level security;
alter table public.notifications  enable row level security;

-- profiles: your own row, always. Plus any profile you share a roster row
-- with, so a coach can see their members and vice versa.
create policy profiles_select_own on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.clients c
      where (c.coach_id = auth.uid() and c.member_id = profiles.id)
         or (c.member_id = auth.uid() and c.coach_id = profiles.id)
    )
  );
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- inserts come from handle_new_user() (security definer), not from clients.

-- coach_profiles: a coach edits their own. Readable by anyone signed in —
-- Discover is a marketplace, coach profiles are the product being browsed.
create policy coach_profiles_select_all on public.coach_profiles
  for select to authenticated using (true);
create policy coach_profiles_write_own on public.coach_profiles
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- subscriptions: private to the coach. Tier changes belong to a webhook
-- running as service_role, not to the app, so there is no client write policy.
create policy subscriptions_select_own on public.subscriptions
  for select using (coach_id = auth.uid());

-- clients: the coach owns the row; the linked member may read it.
create policy clients_select on public.clients
  for select using (coach_id = auth.uid() or member_id = auth.uid());
create policy clients_insert_own on public.clients
  for insert with check (coach_id = auth.uid());
create policy clients_update_own on public.clients
  for update using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy clients_delete_own on public.clients
  for delete using (coach_id = auth.uid());

-- Per-relationship data: both sides read, the coach writes. The member's own
-- writes (completing a task, sending a message, rating) are carved out below.
create policy tasks_select on public.tasks
  for select using (public.can_see_client(client_id));
create policy tasks_write_coach on public.tasks
  for all using (public.is_coach_of(client_id)) with check (public.is_coach_of(client_id));
-- a member may tick their own task off, nothing more
create policy tasks_update_member on public.tasks
  for update using (public.is_member_of(client_id)) with check (public.is_member_of(client_id));

create policy packages_select on public.packages
  for select using (public.can_see_client(client_id));
create policy packages_write_coach on public.packages
  for all using (public.is_coach_of(client_id)) with check (public.is_coach_of(client_id));

create policy sessions_select on public.sessions
  for select using (public.can_see_client(client_id));
create policy sessions_write_coach on public.sessions
  for all using (public.is_coach_of(client_id)) with check (public.is_coach_of(client_id));

-- Payments are readable by both sides — it is the member's record of what they
-- paid too — but only the coach records them, and nobody edits or deletes a
-- ledger row. A correction is a refund row, which is an insert.
create policy payments_select on public.payments
  for select using (public.can_see_client(client_id));
create policy payments_insert_coach on public.payments
  for insert with check (public.is_coach_of(client_id));

create policy time_blocks_select on public.time_blocks
  for select using (
    coach_id = auth.uid()
    or (client_id is not null and public.is_member_of(client_id))
  );
create policy time_blocks_write_coach on public.time_blocks
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
-- a member may request a slot, and only as a 'pending' block on their own row
create policy time_blocks_request_member on public.time_blocks
  for insert with check (
    kind = 'pending' and client_id is not null and public.is_member_of(client_id)
  );

-- Messages: either side reads the thread and writes into it, but only as
-- themselves — the sender_role check stops a member posting as their coach.
create policy messages_select on public.messages
  for select using (public.can_see_client(client_id));
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and (
      (sender_role = 'coach'  and public.is_coach_of(client_id)) or
      (sender_role = 'client' and public.is_member_of(client_id))
    )
  );

create policy message_reads_select on public.message_reads
  for select using (public.can_see_client(client_id));
create policy message_reads_write on public.message_reads
  for all using (
    (reader_role = 'coach'  and public.is_coach_of(client_id)) or
    (reader_role = 'client' and public.is_member_of(client_id))
  ) with check (
    (reader_role = 'coach'  and public.is_coach_of(client_id)) or
    (reader_role = 'client' and public.is_member_of(client_id))
  );

-- Ratings: the member writes their own, both sides read it. A coach cannot
-- write or delete a rating of themselves.
create policy ratings_select on public.ratings
  for select using (public.can_see_client(client_id));
create policy ratings_write_member on public.ratings
  for all using (public.is_member_of(client_id)) with check (public.is_member_of(client_id));

create policy offerings_select_all on public.offerings
  for select to authenticated using (true);
create policy offerings_write_own on public.offerings
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Notifications: yours only, and you may only ever mark them read — rows are
-- created by triggers and server-side jobs running as service_role.
create policy notifications_select_own on public.notifications
  for select using (recipient_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants
--
-- RLS decides which rows; grants decide which statements reach the table at
-- all. A Supabase project's default privileges would hand `authenticated`
-- blanket DML on everything here, so these are deliberately narrower: a table
-- with no UPDATE grant cannot be updated even if a future policy is written
-- carelessly. payments and messages are append-only for exactly that reason.
--
-- `anon` gets nothing. Every screen in this app is behind sign-in, including
-- Discover — an unauthenticated visitor has no reason to read coach profiles.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, update                 on public.profiles       to authenticated;
grant select, insert, update, delete on public.coach_profiles to authenticated;
grant select                         on public.subscriptions  to authenticated;
grant select, insert, update, delete on public.clients        to authenticated;
grant select, insert, update, delete on public.tasks          to authenticated;
grant select, insert, update, delete on public.packages       to authenticated;
grant select, insert, update, delete on public.sessions       to authenticated;
grant select, insert                 on public.payments       to authenticated;  -- ledger: no edits, no deletes
grant select, insert, update, delete on public.time_blocks    to authenticated;
grant select, insert                 on public.messages       to authenticated;  -- a sent message is not editable
grant select, insert, update, delete on public.message_reads  to authenticated;
grant select, insert, update, delete on public.ratings        to authenticated;
grant select, insert, update, delete on public.offerings      to authenticated;
grant select, update                 on public.notifications  to authenticated;  -- created server-side; only markable read

-- Trigger functions are never called directly.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.set_updated_at() from public;
