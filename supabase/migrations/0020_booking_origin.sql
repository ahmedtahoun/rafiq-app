-- 0020: where each coach–member relationship, and each session request,
-- came from — Rafiq's marketplace, or the coach's own client list.
--
-- Why now, with no commission switched on: commission is only fair on
-- demand Rafiq generated (the payments decision, LAUNCH-CHECKLIST §3). A coach
-- will not pay a cut on a client they brought with them, and nobody can tell
-- the two apart after the fact. Recording it from the first request costs a
-- column; retrofitting it onto months of rows means guessing.
--
-- The rule, decided by the database rather than by whatever the app sends:
--
--   clients.origin  — fixed when the roster row is created.
--     coach_invited  the coach added them (a walk-in row, member_id null),
--                    including one the member later links by claiming the
--                    coach's invite (0013).
--     marketplace    the row was created already linked to a member. 0008
--                    allows that only for a member who had asked this coach
--                    for a session first — in practice accept_session_request()
--                    creating the row. The member came to the coach.
--
--   session_requests.origin — fixed when the request is sent: the roster
--     row's origin if this member is already on this coach's roster,
--     otherwise marketplace (a stranger asking).
--
-- Neither can be changed by a signed-in caller afterwards: clients by the
-- guard below, session_requests by 0005's app_update_scope (only status and
-- responded_at move). service_role and migrations may still set either, for
-- corrections.
--
-- What the rule cannot see: a coach's existing offline client who installs
-- the app and finds them in Discover reads as marketplace. Anything that
-- charges on this must let a coach dispute it.

create type public.relationship_origin as enum ('marketplace', 'coach_invited');

alter table public.clients
  add column origin public.relationship_origin not null default 'coach_invited';
alter table public.session_requests
  add column origin public.relationship_origin not null default 'marketplace';

-- Existing rows. A linked row is marketplace if the member had asked this
-- coach before the row existed; otherwise it began as a walk-in and an
-- invite linked it.
update public.clients c set origin = 'marketplace'
where c.member_id is not null
  and exists (
    select 1 from public.session_requests r
    where r.coach_id = c.coach_id and r.member_id = c.member_id and r.created_at <= c.created_at);

update public.session_requests r set origin = c.origin
from public.clients c
where c.coach_id = r.coach_id and c.member_id = r.member_id and c.created_at < r.created_at;

create or replace function public.clients_origin_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.origin := case when new.member_id is null then 'coach_invited' else 'marketplace' end;
  elsif new.origin is distinct from old.origin then
    raise exception 'where a client came from is recorded once, when they join the roster'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger clients_origin_guard
  before insert or update on public.clients
  for each row execute function public.clients_origin_guard();

-- Read as the caller: the member sending the request sees their own roster
-- row through clients_select (member_id = auth.uid()), and no other. Not
-- definer — inside one, current_user is the owner and the stamp would never
-- run.
create or replace function public.session_requests_origin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  new.origin := coalesce(
    (select c.origin from public.clients c
     where c.coach_id = new.coach_id and c.member_id = new.member_id),
    'marketplace');
  return new;
end;
$$;

create trigger session_requests_origin
  before insert on public.session_requests
  for each row execute function public.session_requests_origin();

-- 0018: trigger functions are not callable as RPCs.
revoke execute on function public.clients_origin_guard() from public, anon, authenticated;
revoke execute on function public.session_requests_origin() from public, anon, authenticated;
