-- Rafiq — security fixes from the pre-launch schema review
--
-- Six holes, each with an assertion in supabase/tests/02_rls.sql that fails
-- without this file:
--
--   1. Supabase's default privileges grant anon and authenticated ALL on
--      every table and function in public. 0001's GRANTs were meant to be the
--      narrower set, but they were added on top of ALL, not instead of it.
--   2. With those defaults any signed-in user could call push_notification()
--      (security definer) and put a notification in anyone's feed.
--   3. A coach could set their own verification_status to 'verified'.
--   4. A member's "tick my task done" policy let them rewrite the whole task.
--   5. A rating's coach_id was never checked against the relationship, so a
--      member could post a rating onto any coach's profile.
--   6. time_blocks never checked that coach_id and client_id belong together:
--      a member could put a request on any coach's calendar, and a coach could
--      attach a block to another coach's client.

-- ---------------------------------------------------------------------------
-- 1 + 2. Privileges: take back the defaults, then grant only what is needed
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

-- And for everything created after this: a new table or function starts with
-- no access, and its migration grants what it needs.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;

grant usage on schema public to authenticated;

grant select, update                 on public.profiles       to authenticated;
grant select, delete                 on public.coach_profiles to authenticated;
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

-- The RLS helpers run inside policies as the querying user, so that user
-- needs EXECUTE. Nothing else in public is callable from the app: the
-- trigger functions fire without it, and push_notification /
-- client_counterparty are for triggers only.
grant execute on function public.is_coach_of(uuid)    to authenticated;
grant execute on function public.is_member_of(uuid)   to authenticated;
grant execute on function public.can_see_client(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Verification is decided by Rafiq, not by the coach
--
-- Column grants rather than a trigger: verification_status is simply absent
-- from what the app may write, so a coach's insert gets the 'unverified'
-- default and an update naming the column is refused. Review happens as
-- service_role (the admin panel), which bypasses these grants.
-- ---------------------------------------------------------------------------

grant insert (profile_id, title, cert, bio, languages, session_mode, experience_years,
              certifications, cover_photo_url, signup_completed_at)
  on public.coach_profiles to authenticated;
grant update (title, cert, bio, languages, session_mode, experience_years,
              certifications, cover_photo_url, signup_completed_at)
  on public.coach_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 4. A member may mark a task done or not done, and change nothing else
--
-- Coach and member are the same database role, so a column grant can't tell
-- them apart; this trigger does. Comparing whole rows minus the allowed
-- columns means a column added to tasks later is protected by default.
-- ---------------------------------------------------------------------------

create or replace function public.tasks_member_scope()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Only the app's signed-in users are limited; service_role and migrations are not.
  if current_user <> 'authenticated' or public.is_coach_of(old.client_id) then
    return new;
  end if;
  if (to_jsonb(new) - '{done,done_at,updated_at}'::text[])
       is distinct from (to_jsonb(old) - '{done,done_at,updated_at}'::text[]) then
    raise exception 'a member may only mark a task done or not done'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tasks_member_scope
  before update on public.tasks
  for each row execute function public.tasks_member_scope();

-- ---------------------------------------------------------------------------
-- 5. A rating belongs to the coach of the relationship it rates
--
-- The subquery reads clients as the member, which clients_select allows for
-- their own row — and is_member_of already requires it to be their own.
-- ---------------------------------------------------------------------------

drop policy ratings_write_member on public.ratings;
create policy ratings_write_member on public.ratings
  for all
  using (public.is_member_of(client_id))
  with check (
    public.is_member_of(client_id)
    and coach_id = (select c.coach_id from public.clients c where c.id = client_id)
  );

-- ---------------------------------------------------------------------------
-- 6. A time block's coach and client belong together
-- ---------------------------------------------------------------------------

drop policy time_blocks_write_coach on public.time_blocks;
create policy time_blocks_write_coach on public.time_blocks
  for all
  using (coach_id = auth.uid())
  with check (
    coach_id = auth.uid()
    and (client_id is null or public.is_coach_of(client_id))
  );

drop policy time_blocks_request_member on public.time_blocks;
create policy time_blocks_request_member on public.time_blocks
  for insert with check (
    kind = 'pending'
    and client_id is not null
    and public.is_member_of(client_id)
    and coach_id = (select c.coach_id from public.clients c where c.id = client_id)
  );
