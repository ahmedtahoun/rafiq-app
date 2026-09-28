-- ---------------------------------------------------------------------------
-- member_profiles — the member-only half of a profile, mirroring
-- coach_profiles.
--
-- ClientOnboarding asks a member for their goal and focus and marks their
-- signup complete. Until now the only columns for those were on `clients`
-- (0005), and `clients` is the coach's roster row: clients_update_own lets
-- only the coach write it. So a member finishing their own onboarding had
-- nowhere they were allowed to write. The roster's goal/focus stay as the
-- coach's own notes about the relationship; these are the member's words
-- about themselves, and signup_completed_at is what tells the app whether to
-- show onboarding again after a sign-in on a new device.
-- ---------------------------------------------------------------------------

create table public.member_profiles (
  profile_id          uuid        primary key references public.profiles (id) on delete cascade,
  goal                text        not null default '',
  focus               text        not null default '',  -- a stable slug ('life', 'meditation', …), never display text
  signup_completed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger member_profiles_set_updated_at
  before update on public.member_profiles
  for each row execute function public.set_updated_at();

alter table public.member_profiles enable row level security;

-- The member, and any coach who has them on their roster (the same
-- relationship profiles_select_own already opens to a coach).
create policy member_profiles_select on public.member_profiles
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.clients c
      where c.coach_id = auth.uid() and c.member_id = member_profiles.profile_id
    )
  );
create policy member_profiles_insert_own on public.member_profiles
  for insert with check (profile_id = auth.uid());
create policy member_profiles_update_own on public.member_profiles
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- 0004 revoked default privileges, so a new table starts with none.
-- profile_id is insert-only: once the row exists it cannot be re-pointed.
grant select on public.member_profiles to authenticated;
grant insert (profile_id, goal, focus, signup_completed_at) on public.member_profiles to authenticated;
grant update (goal, focus, signup_completed_at) on public.member_profiles to authenticated;
