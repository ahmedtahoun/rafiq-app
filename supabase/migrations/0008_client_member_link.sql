-- 0008: a coach can only link a member account to their roster if that
-- member asked them.
--
-- clients.member_id is what makes a roster row the member's too: once set,
-- the member reads the row, its tasks, sessions and payments, and the coach
-- can read the member's profiles and member_profiles rows (0005's
-- profiles_select_own, 0006's member_profiles_select). Until now nothing
-- limited which member a coach could put there — clients_insert_own and
-- clients_update_own only check coach_id — so a coach who learned any
-- member's user id could link them without their say and read their name,
-- email and phone. User ids are not secret: every avatar's storage path
-- starts with one, and the avatars bucket is readable (so listable) by any
-- signed-in user (0003).
--
-- The intended way in is the marketplace: a member sends a session request,
-- and accepting it is where the coach's app creates the roster row (0005's
-- note on session_requests). So a signed-in caller may set member_id only to
-- a member with a pending or accepted request to that same coach. A walk-in
-- row (member_id null) is unaffected, and so is unlinking one. service_role
-- and migrations are not limited.

create or replace function public.clients_member_link_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' or new.member_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.member_id is not distinct from old.member_id
     and new.coach_id is not distinct from old.coach_id then
    return new;
  end if;
  -- Read as the caller: session_requests_select shows a coach only their own.
  if not exists (
    select 1 from public.session_requests r
    where r.member_id = new.member_id
      and r.coach_id = new.coach_id
      and r.coach_id = auth.uid()
      and r.status in ('pending', 'accepted')
  ) then
    raise exception 'a member can only be added to a roster after asking that coach for a session'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger clients_member_link_guard
  before insert or update of member_id, coach_id on public.clients
  for each row execute function public.clients_member_link_guard();
