-- Rafiq — schema parity with the app
--
-- 0001 modelled the app as it was then. Since, every screen that stores
-- something has shipped against mockStore/directory, and about half of it had
-- nowhere to go in Postgres. This adds the missing columns and tables, and the
-- two read paths a marketplace needs: a coach's public card and reviews, for
-- members who are not (yet) that coach's client.
--
-- Nothing had been applied to a real project when this was written (the live
-- database had no tables), which is why ratings is dropped and recreated
-- rather than migrated.
--
-- Rules carried over from 0004: every new table and view gets explicit
-- GRANTs (defaults grant nothing now), and anything only Rafiq may decide —
-- verification, featured, account status, report outcomes — is not in any
-- column the app can write. Those change as service_role, i.e. the admin panel.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type offering_type    as enum ('session', 'consultation', 'group', 'workshop', 'program', 'event');
create type session_type     as enum ('intro', 'short', 'standard');
create type account_status   as enum ('active', 'suspended', 'deleted');
create type review_status    as enum ('pending', 'approved', 'rejected');
create type report_reason    as enum ('no_show', 'inappropriate', 'payment', 'other');
create type report_status    as enum ('open', 'actioned', 'dismissed');
create type deletion_status  as enum ('pending', 'completed', 'cancelled');
create type cancel_reason    as enum ('too_expensive', 'not_using', 'missing_features', 'switching', 'other');
create type agreement_status as enum ('sent', 'signed');
create type mood             as enum ('great', 'good', 'okay', 'low', 'hard');
create type template_cadence as enum ('Weekly', 'Bi-weekly', '2x/week', '3x/week');
create type request_status   as enum ('pending', 'accepted', 'declined', 'withdrawn');

-- Every kind the two notification feeds render (ProNotificationKind and
-- ClientNotificationKind in mockStore).
alter type notification_kind add value if not exists 'session-pending';
alter type notification_kind add value if not exists 'session-confirmed';
alter type notification_kind add value if not exists 'task-overdue';
alter type notification_kind add value if not exists 'feedback';
alter type notification_kind add value if not exists 'payment-overdue';
alter type notification_kind add value if not exists 'payment-due';
alter type notification_kind add value if not exists 'package-expired';
alter type notification_kind add value if not exists 'package-out';
alter type notification_kind add value if not exists 'package-soon';

-- ---------------------------------------------------------------------------
-- Shared: limit what the non-owning side of a row may change
--
-- Generalises 0004's tasks_member_scope: the trigger's arguments are the only
-- columns a signed-in caller who is not the coach of the row may change.
-- Whole-row comparison, so a column added later is protected by default.
-- ---------------------------------------------------------------------------

create or replace function public.member_update_scope()
returns trigger language plpgsql set search_path = public as $$
declare
  allowed text[] := tg_argv;
begin
  if current_user <> 'authenticated' or public.is_coach_of(old.client_id) then
    return new;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'on %, a member may only change %', tg_table_name, array_to_string(allowed, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Same, for tables where *no* signed-in caller may change anything beyond
-- the listed columns, whichever side they are on.
create or replace function public.app_update_scope()
returns trigger language plpgsql set search_path = public as $$
declare
  allowed text[] := tg_argv;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'on %, only % may change', tg_table_name, array_to_string(allowed, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Columns the app already stores
-- ---------------------------------------------------------------------------

-- Suspension and deletion are Rafiq's to set, never the user's own.
alter table public.profiles add column account_status account_status not null default 'active';

revoke update on public.profiles from authenticated;
grant update (role, full_name, email, phone, country_code, country, country_flag, city, avatar_photo_url)
  on public.profiles to authenticated;

-- Discover's "featured" badge — editorial, so absent from 0004's column grants.
alter table public.coach_profiles add column featured boolean not null default false;

-- AddClient / EditClient / ClientOnboarding fields. The coach's private notes
-- are NOT here: a member can read their own roster row, so notes live in
-- client_private below.
alter table public.clients
  add column age                 smallint check (age between 0 and 130),
  add column phone               text,
  add column country_code        text,
  add column email               text,
  add column city                text,
  add column specialty           text         not null default '',
  add column focus               text         not null default '',
  add column goal                text         not null default '',
  add column signup_completed_at timestamptz,
  add column program_completed   boolean      not null default false,
  add column next_session_type   session_type;

alter table public.tasks
  add column description  text    not null default '',
  add column due_has_time boolean not null default false;

-- Who last set attendance, for SessionRoom's dispute flow.
alter table public.sessions
  add column attendance_set_by app_role,
  add column attendance_set_at timestamptz;

alter table public.time_blocks add column session_type session_type;

-- sessionsTotal is null for an open-ended offering (ongoing 1:1, one-off event).
alter table public.offerings
  add column type     offering_type not null default 'session',
  add column duration text          not null default '',
  add column format   session_mode  not null default 'both';
alter table public.offerings alter column session_count drop not null;
alter table public.offerings alter column session_count drop default;

-- ---------------------------------------------------------------------------
-- sessions: a member may dispute attendance, and do nothing else
-- ---------------------------------------------------------------------------

create policy sessions_dispute_member on public.sessions
  for update
  using (public.is_member_of(client_id))
  with check (
    public.is_member_of(client_id)
    and attendance = 'disputed'
    and attendance_set_by = 'client'
  );

create trigger sessions_member_scope
  before update on public.sessions
  for each row execute function public.member_update_scope('attendance', 'attendance_set_by', 'attendance_set_at', 'updated_at');

-- ---------------------------------------------------------------------------
-- ratings — one per session, or one per finished program
--
-- 0001 allowed one rating per relationship; the app rates each session
-- (RateCoach) and each completed program (the milestone review).
-- ---------------------------------------------------------------------------

drop table public.ratings;

create table public.ratings (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references public.clients (id) on delete cascade,
  coach_id    uuid        not null references public.coach_profiles (profile_id) on delete cascade,
  session_id  uuid        references public.sessions (id) on delete cascade,
  offering_id uuid        references public.offerings (id) on delete cascade,
  rating      smallint    not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ratings_one_subject check ((session_id is null) <> (offering_id is null))
);

create unique index ratings_one_per_session on public.ratings (session_id) where session_id is not null;
create unique index ratings_one_per_program on public.ratings (client_id, offering_id) where offering_id is not null;
create index ratings_coach_id_idx on public.ratings (coach_id);

create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

alter table public.ratings enable row level security;

create policy ratings_select on public.ratings
  for select using (public.can_see_client(client_id));
-- The member rates their own coach, for a session of their own or a program
-- of that coach's. Subqueries read as the member, who can see all three rows.
create policy ratings_write_member on public.ratings
  for all
  using (public.is_member_of(client_id))
  with check (
    public.is_member_of(client_id)
    and coach_id = (select c.coach_id from public.clients c where c.id = client_id)
    and (session_id is null or exists (
      select 1 from public.sessions s where s.id = session_id and s.client_id = ratings.client_id))
    and (offering_id is null or exists (
      select 1 from public.offerings o where o.id = offering_id and o.coach_id = ratings.coach_id))
  );

grant select, insert, update, delete on public.ratings to authenticated;

-- ---------------------------------------------------------------------------
-- client_private — the coach's own notes and favourite flag on a member
-- ---------------------------------------------------------------------------

create table public.client_private (
  client_id    uuid        primary key references public.clients (id) on delete cascade,
  notes        text        not null default '',
  is_favourite boolean     not null default false,
  updated_at   timestamptz not null default now()
);

create trigger client_private_set_updated_at
  before update on public.client_private
  for each row execute function public.set_updated_at();

alter table public.client_private enable row level security;
create policy client_private_coach on public.client_private
  for all using (public.is_coach_of(client_id)) with check (public.is_coach_of(client_id));

grant select, insert, update, delete on public.client_private to authenticated;

-- ---------------------------------------------------------------------------
-- weekly_availability — a coach's open hours, one window per weekday
--
-- Readable by every signed-in user: members book from it, and Discover's
-- "available today / this week" comes from it.
-- ---------------------------------------------------------------------------

create table public.weekly_availability (
  coach_id    uuid         not null references public.coach_profiles (profile_id) on delete cascade,
  day_of_week smallint     not null check (day_of_week between 0 and 6),  -- 0 = Monday, as the app counts
  enabled     boolean      not null default true,
  start_hour  numeric(4,2) not null,
  end_hour    numeric(4,2) not null,
  primary key (coach_id, day_of_week),
  constraint weekly_availability_hours check (start_hour >= 0 and end_hour <= 24 and end_hour > start_hour)
);

alter table public.weekly_availability enable row level security;
create policy weekly_availability_select on public.weekly_availability
  for select to authenticated using (true);
create policy weekly_availability_write_own on public.weekly_availability
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

grant select, insert, update, delete on public.weekly_availability to authenticated;

-- ---------------------------------------------------------------------------
-- standing_slots — a member's preferred recurring slot with their coach
-- ---------------------------------------------------------------------------

create table public.standing_slots (
  client_id   uuid         primary key references public.clients (id) on delete cascade,
  day_of_week smallint     not null check (day_of_week between 0 and 6),
  start_hour  numeric(4,2) not null,
  end_hour    numeric(4,2) not null,
  set_at      timestamptz  not null default now(),
  constraint standing_slots_hours check (start_hour >= 0 and end_hour <= 24 and end_hour > start_hour)
);

alter table public.standing_slots enable row level security;
create policy standing_slots_select on public.standing_slots
  for select using (public.can_see_client(client_id));
create policy standing_slots_write_member on public.standing_slots
  for all using (public.is_member_of(client_id)) with check (public.is_member_of(client_id));

grant select, insert, update, delete on public.standing_slots to authenticated;

-- ---------------------------------------------------------------------------
-- cancellations — a record of every cancelled booking, by either side
-- ---------------------------------------------------------------------------

create table public.cancellations (
  id                  uuid         primary key default gen_random_uuid(),
  client_id           uuid         not null references public.clients (id) on delete cascade,
  time_block_id       uuid         references public.time_blocks (id) on delete set null,
  cancelled_by_role   app_role     not null,
  cancelled_by        uuid         references public.profiles (id) on delete set null,
  cancelled_at        timestamptz  not null default now(),
  hours_until_session numeric(8,2),
  within_grace        boolean      not null default false,
  reason              text
);

create index cancellations_client_idx on public.cancellations (client_id, cancelled_at desc);

alter table public.cancellations enable row level security;
create policy cancellations_select on public.cancellations
  for select using (public.can_see_client(client_id));
create policy cancellations_insert on public.cancellations
  for insert with check (
    cancelled_by = auth.uid()
    and (
      (cancelled_by_role = 'coach'  and public.is_coach_of(client_id)) or
      (cancelled_by_role = 'client' and public.is_member_of(client_id))
    )
  );

grant select, insert on public.cancellations to authenticated;  -- a record, not editable

-- ---------------------------------------------------------------------------
-- agreements — the coaching service agreement: the coach sends, the member signs
-- ---------------------------------------------------------------------------

create table public.agreements (
  client_id  uuid             primary key references public.clients (id) on delete cascade,
  status     agreement_status not null default 'sent',
  sent_at    timestamptz      not null default now(),
  signed_at  timestamptz,
  updated_at timestamptz      not null default now(),
  constraint agreements_signed_at check ((status = 'signed') = (signed_at is not null))
);

create trigger agreements_set_updated_at
  before update on public.agreements
  for each row execute function public.set_updated_at();
create trigger agreements_member_scope
  before update on public.agreements
  for each row execute function public.member_update_scope('status', 'signed_at', 'updated_at');

alter table public.agreements enable row level security;
create policy agreements_select on public.agreements
  for select using (public.can_see_client(client_id));
create policy agreements_write_coach on public.agreements
  for all using (public.is_coach_of(client_id)) with check (public.is_coach_of(client_id));
create policy agreements_sign_member on public.agreements
  for update
  using (public.is_member_of(client_id))
  with check (public.is_member_of(client_id) and status = 'signed');

grant select, insert, update, delete on public.agreements to authenticated;

-- ---------------------------------------------------------------------------
-- mood_checkins — the member's daily mood, kept as history
-- ---------------------------------------------------------------------------

create table public.mood_checkins (
  id         uuid        primary key default gen_random_uuid(),
  client_id  uuid        not null references public.clients (id) on delete cascade,
  mood       mood        not null,
  created_at timestamptz not null default now()
);

create index mood_checkins_client_idx on public.mood_checkins (client_id, created_at desc);

alter table public.mood_checkins enable row level security;
create policy mood_checkins_select on public.mood_checkins
  for select using (public.can_see_client(client_id));
create policy mood_checkins_insert_member on public.mood_checkins
  for insert with check (public.is_member_of(client_id));

grant select, insert on public.mood_checkins to authenticated;

-- ---------------------------------------------------------------------------
-- enrollments — a member's place in one of their coach's offerings
--
-- offering_id RESTRICTS, like payments: a member's program history should not
-- vanish because the coach tidied their catalogue. Deactivate
-- (offerings.active = false) instead of deleting.
-- ---------------------------------------------------------------------------

create table public.enrollments (
  client_id             uuid        not null references public.clients (id) on delete cascade,
  offering_id           uuid        not null references public.offerings (id) on delete restrict,
  sessions_completed    smallint    not null default 0 check (sessions_completed >= 0),
  enrolled_at           timestamptz not null default now(),
  milestone_reviewed_at timestamptz,
  primary key (client_id, offering_id)
);

create trigger enrollments_member_scope
  before update on public.enrollments
  for each row execute function public.member_update_scope('milestone_reviewed_at');

alter table public.enrollments enable row level security;
create policy enrollments_select on public.enrollments
  for select using (public.can_see_client(client_id));
create policy enrollments_write_coach on public.enrollments
  for all
  using (public.is_coach_of(client_id))
  with check (
    public.is_coach_of(client_id)
    and exists (select 1 from public.offerings o where o.id = offering_id and o.coach_id = auth.uid())
  );
-- The member marks a finished program as reviewed (or dismisses the prompt).
create policy enrollments_review_member on public.enrollments
  for update using (public.is_member_of(client_id)) with check (public.is_member_of(client_id));

grant select, insert, update, delete on public.enrollments to authenticated;

-- ---------------------------------------------------------------------------
-- templates — a coach's reusable session templates
-- ---------------------------------------------------------------------------

create table public.templates (
  id         uuid             primary key default gen_random_uuid(),
  coach_id   uuid             not null references public.coach_profiles (profile_id) on delete cascade,
  name       text             not null,
  specialty  text             not null default '',
  plan       text             not null default 'Basic',
  cadence    template_cadence not null default 'Weekly',
  icon       text             not null default '',
  bg         text             not null default '#7A7166',
  tasks      text[]           not null default '{}',
  created_at timestamptz      not null default now(),
  updated_at timestamptz      not null default now()
);

create index templates_coach_idx on public.templates (coach_id);

create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

alter table public.templates enable row level security;
create policy templates_own on public.templates
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

grant select, insert, update, delete on public.templates to authenticated;

-- ---------------------------------------------------------------------------
-- favourite_coaches — a member's saved coaches on Discover
-- ---------------------------------------------------------------------------

create table public.favourite_coaches (
  member_id  uuid        not null references public.profiles (id) on delete cascade,
  coach_id   uuid        not null references public.coach_profiles (profile_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, coach_id)
);

alter table public.favourite_coaches enable row level security;
create policy favourite_coaches_own on public.favourite_coaches
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

grant select, insert, delete on public.favourite_coaches to authenticated;

-- ---------------------------------------------------------------------------
-- notification_prefs — one row per user; the union of both sides' toggles
-- ---------------------------------------------------------------------------

create table public.notification_prefs (
  profile_id uuid        primary key references public.profiles (id) on delete cascade,
  enabled    boolean     not null default true,
  sessions   boolean     not null default true,
  tasks      boolean     not null default true,
  messages   boolean     not null default true,
  checkins   boolean     not null default true,
  payments   boolean     not null default true,
  updated_at timestamptz not null default now()
);

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function public.set_updated_at();

alter table public.notification_prefs enable row level security;
create policy notification_prefs_own on public.notification_prefs
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select, insert, update on public.notification_prefs to authenticated;

-- ---------------------------------------------------------------------------
-- session_requests — a member asking a coach they are not yet working with
--
-- The marketplace half of booking (CoachPreview → MyCoaches). Accepting one is
-- where a roster row gets created; that is the coach's app, not this table.
-- ---------------------------------------------------------------------------

create table public.session_requests (
  id              uuid           primary key default gen_random_uuid(),
  member_id       uuid           not null references public.profiles (id) on delete cascade,
  coach_id        uuid           not null references public.coach_profiles (profile_id) on delete cascade,
  offering_id     uuid           references public.offerings (id) on delete set null,
  requested_start timestamptz    not null,
  price           numeric(12,2)  not null check (price >= 0),
  currency        char(3)        not null default 'EGP',
  status          request_status not null default 'pending',
  created_at      timestamptz    not null default now(),
  responded_at    timestamptz
);

-- The app keeps one open request per coach: a new time replaces the old one.
create unique index session_requests_one_pending
  on public.session_requests (member_id, coach_id) where status = 'pending';
create index session_requests_coach_idx on public.session_requests (coach_id, created_at desc);

-- Either side may only move the status (and stamp when); nobody rewrites
-- the price or time of a request after sending it.
create trigger session_requests_scope
  before update on public.session_requests
  for each row execute function public.app_update_scope('status', 'responded_at');

alter table public.session_requests enable row level security;
create policy session_requests_select on public.session_requests
  for select using (member_id = auth.uid() or coach_id = auth.uid());
create policy session_requests_insert_member on public.session_requests
  for insert with check (
    member_id = auth.uid()
    and status = 'pending'
    and coach_id <> auth.uid()
    and (offering_id is null or exists (
      select 1 from public.offerings o where o.id = offering_id and o.coach_id = session_requests.coach_id))
  );
create policy session_requests_withdraw_member on public.session_requests
  for update using (member_id = auth.uid()) with check (member_id = auth.uid() and status = 'withdrawn');
create policy session_requests_answer_coach on public.session_requests
  for update using (coach_id = auth.uid()) with check (coach_id = auth.uid() and status in ('accepted', 'declined'));

grant select, insert, update on public.session_requests to authenticated;

-- A coach needs to know who is asking: their name and contact, the same as
-- for a member already on their roster.
drop policy profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.clients c
      where (c.coach_id = auth.uid() and c.member_id = profiles.id)
         or (c.member_id = auth.uid() and c.coach_id = profiles.id)
    )
    or exists (
      select 1 from public.session_requests r
      where r.coach_id = auth.uid() and r.member_id = profiles.id
    )
  );

-- ---------------------------------------------------------------------------
-- Things only Rafiq resolves: reports, verification, deletion, churn feedback
--
-- The app may file each and read back its own; the outcome columns are not
-- in its grants. The admin panel works these queues as service_role.
-- ---------------------------------------------------------------------------

-- A member reports their coach. The coach never sees it.
create table public.pro_reports (
  id              uuid          primary key default gen_random_uuid(),
  reporter_id     uuid          references public.profiles (id) on delete set null,
  coach_id        uuid          references public.profiles (id) on delete set null,
  client_id       uuid          references public.clients (id) on delete set null,
  reason          report_reason not null,
  details         text          not null default '',
  status          report_status not null default 'open',
  created_at      timestamptz   not null default now(),
  resolved_at     timestamptz,
  resolution_note text
);

create index pro_reports_open_idx on public.pro_reports (created_at) where status = 'open';

alter table public.pro_reports enable row level security;
create policy pro_reports_select_own on public.pro_reports
  for select using (reporter_id = auth.uid());
create policy pro_reports_insert_member on public.pro_reports
  for insert with check (
    reporter_id = auth.uid()
    and client_id is not null
    and public.is_member_of(client_id)
    and coach_id = (select c.coach_id from public.clients c where c.id = client_id)
  );

grant select on public.pro_reports to authenticated;
grant insert (reporter_id, coach_id, client_id, reason, details) on public.pro_reports to authenticated;

-- A coach asks for their credentials to be reviewed. Filing one sets their
-- profile to 'pending'; the review's outcome sets 'verified' or back to
-- 'unverified'. The coach still cannot write verification_status (0004).
create table public.verification_requests (
  id            uuid          primary key default gen_random_uuid(),
  coach_id      uuid          not null references public.coach_profiles (profile_id) on delete cascade,
  note          text          not null default '',
  status        review_status not null default 'pending',
  submitted_at  timestamptz   not null default now(),
  reviewed_at   timestamptz,
  reviewer_note text
);

create unique index verification_requests_one_pending
  on public.verification_requests (coach_id) where status = 'pending';

create or replace function public.sync_verification_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.coach_profiles
     set verification_status = case new.status
       when 'pending'  then 'pending'::verification_status
       when 'approved' then 'verified'::verification_status
       else 'unverified'::verification_status
     end
   where profile_id = new.coach_id;
  return new;
end;
$$;

create trigger verification_requests_sync
  after insert or update of status on public.verification_requests
  for each row execute function public.sync_verification_status();

alter table public.verification_requests enable row level security;
create policy verification_requests_select_own on public.verification_requests
  for select using (coach_id = auth.uid());
create policy verification_requests_insert_own on public.verification_requests
  for insert with check (coach_id = auth.uid());

grant select on public.verification_requests to authenticated;
grant insert (coach_id, note) on public.verification_requests to authenticated;

-- Either role asks for their account to be deleted. Processing it is
-- deliberate work (a coach with payments is anonymised, not erased — see
-- 0001's payments note), so it is a queue, not a cascade.
create table public.account_deletion_requests (
  id           uuid            primary key default gen_random_uuid(),
  profile_id   uuid            references public.profiles (id) on delete set null,
  status       deletion_status not null default 'pending',
  requested_at timestamptz     not null default now(),
  processed_at timestamptz,
  note         text
);

create unique index account_deletion_requests_one_pending
  on public.account_deletion_requests (profile_id) where status = 'pending';

alter table public.account_deletion_requests enable row level security;
create policy account_deletion_requests_select_own on public.account_deletion_requests
  for select using (profile_id = auth.uid());
create policy account_deletion_requests_insert_own on public.account_deletion_requests
  for insert with check (profile_id = auth.uid());

grant select on public.account_deletion_requests to authenticated;
grant insert (profile_id) on public.account_deletion_requests to authenticated;

-- Why a coach downgraded from Pro.
create table public.subscription_cancel_feedback (
  id         uuid          primary key default gen_random_uuid(),
  coach_id   uuid          references public.coach_profiles (profile_id) on delete set null,
  reason     cancel_reason not null,
  note       text          not null default '',
  created_at timestamptz   not null default now()
);

alter table public.subscription_cancel_feedback enable row level security;
create policy subscription_cancel_feedback_select_own on public.subscription_cancel_feedback
  for select using (coach_id = auth.uid());
create policy subscription_cancel_feedback_insert_own on public.subscription_cancel_feedback
  for insert with check (coach_id = auth.uid());

grant select on public.subscription_cancel_feedback to authenticated;
grant insert (coach_id, reason, note) on public.subscription_cancel_feedback to authenticated;

-- ---------------------------------------------------------------------------
-- Marketplace read paths
--
-- A member browsing Discover is not the coach's client, so profiles and
-- ratings RLS rightly hide both from them. These views publish only what a
-- public coach card needs. They run as their owner, so they see past RLS —
-- which is exactly why each lists its columns rather than selecting *.
-- ---------------------------------------------------------------------------

create view public.coach_directory with (security_barrier) as
select
  cp.profile_id                          as coach_id,
  p.full_name,
  p.avatar_photo_url,
  p.country,
  p.country_flag,
  cp.title,
  cp.bio,
  cp.languages,
  cp.session_mode,
  cp.experience_years,
  cp.certifications,
  cp.cover_photo_url,
  cp.verification_status = 'verified'    as verified,
  cp.featured,
  (select min(o.price) from public.offerings o
    where o.coach_id = cp.profile_id and o.active and o.price > 0) as from_price,
  r.rating_count,
  r.rating_avg
from public.coach_profiles cp
join public.profiles p on p.id = cp.profile_id
left join lateral (
  select count(*)::int as rating_count, round(avg(x.rating)::numeric, 2) as rating_avg
  from public.ratings x where x.coach_id = cp.profile_id
) r on true
where p.account_status = 'active'
  and cp.signup_completed_at is not null;

-- Written reviews, signed with a first name and last initial. The roster
-- name is the coach's own label for someone who may be talking about a
-- breakup or their health; a public page gets no more of it than that.
create view public.coach_reviews with (security_barrier) as
select
  x.id,
  x.coach_id,
  x.rating,
  x.comment,
  x.created_at,
  split_part(trim(c.full_name), ' ', 1)
    || coalesce(' ' || nullif(left(split_part(trim(c.full_name), ' ', 2), 1), '') || '.', '') as reviewer_name,
  c.avatar_bg
from public.ratings x
join public.clients c on c.id = x.client_id
where coalesce(trim(x.comment), '') <> '';

grant select on public.coach_directory to authenticated;
grant select on public.coach_reviews   to authenticated;
