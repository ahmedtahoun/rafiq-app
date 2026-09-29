-- 0010: a coach accepting a member's session request, in one step.
--
-- A request (0005's session_requests) is a member asking a coach they are
-- not yet working with for a first session. Accepting it is where the
-- relationship starts, and it touches five rows: the request itself, the
-- coach's roster row for the member (new, or an archived one brought back),
-- the booked block on the coach's calendar, the session on the
-- relationship's history, and the roster row's "next session". Done as five
-- separate calls from the app, a dropped connection halfway leaves a member
-- marked accepted with no session, or on the roster with nothing booked.
--
-- So this is one function, and it is SECURITY INVOKER on purpose: it runs as
-- the calling coach, so every policy, column grant and trigger that guards
-- those tables when the app writes them directly still applies here
-- (session_requests_answer_coach, clients_insert_own, 0008's member-link
-- guard, time_blocks_write_coach, sessions_write_coach). It adds no power a
-- coach did not already have; it only makes the steps all-or-nothing.
--
-- It refuses, without changing anything:
--   * a request that isn't this coach's, or doesn't exist     P0002
--   * one that is no longer pending (withdrawn, answered)      55000
--   * one whose time has already passed                        22023
--   * one that overlaps a session already booked               23P01
--
-- How long the session is comes from what was asked for, as the app's
-- getSessionTypeInfo() has it: a free request with no offering is the
-- design's 20-minute intro call, anything else a 50-minute session.
--
-- sessions gains time_block_id so a booking can later be moved or cancelled
-- (scheduling, step 4) on both the calendar and the history together.

alter table public.sessions
  add column time_block_id uuid references public.time_blocks (id) on delete set null;

create index sessions_time_block_idx on public.sessions (time_block_id) where time_block_id is not null;

create or replace function public.accept_session_request(p_request uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  r          public.session_requests%rowtype;
  who        public.profiles%rowtype;
  v_type     public.session_type;
  v_end      timestamptz;
  v_client   uuid;
  v_block    uuid;
  v_name     text;
  v_offering text;
begin
  -- Locks the row, so a member withdrawing at the same moment either lands
  -- first (and this sees 'withdrawn') or waits for this to finish.
  select * into r from public.session_requests
  where id = p_request and coach_id = auth.uid()
  for update;
  if not found then
    raise exception 'no such request' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'this request has already been answered or withdrawn' using errcode = '55000';
  end if;
  if r.requested_start <= now() then
    raise exception 'the requested time has already passed' using errcode = '22023';
  end if;

  v_type := case when r.offering_id is null and r.price = 0 then 'intro' else 'standard' end;
  v_end  := r.requested_start + make_interval(mins => case when v_type = 'intro' then 20 else 50 end);

  if exists (
    select 1 from public.time_blocks b
    where b.coach_id = r.coach_id
      and b.kind = 'booked'
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(r.requested_start, v_end)
  ) then
    raise exception 'that time overlaps a session already booked' using errcode = '23P01';
  end if;

  update public.session_requests
  set status = 'accepted', responded_at = now()
  where id = r.id;

  -- Readable to this coach through profiles_select_own's session_requests arm.
  select * into who from public.profiles where id = r.member_id;
  v_name := coalesce(who.full_name, '');
  select o.name into v_offering from public.offerings o where o.id = r.offering_id;

  select c.id into v_client from public.clients c
  where c.coach_id = r.coach_id and c.member_id = r.member_id;

  if v_client is null then
    insert into public.clients (
      coach_id, member_id, full_name, initials, avatar_bg,
      phone, country_code, email, program, active, payment_status
    ) values (
      r.coach_id, r.member_id, v_name,
      upper(left(split_part(trim(v_name), ' ', 1), 1) || left(split_part(trim(v_name), ' ', 2), 1)),
      (array['#B75C3D', '#3E6FB0', '#3F7D58', '#7A6BAE', '#A65D6E', '#1F7A8C', '#96472D', '#26547C'])
        [1 + abs(hashtext(r.member_id::text)) % 8],
      who.phone, who.country_code, who.email,
      coalesce(v_offering, ''), true, 'due'
    )
    returning id into v_client;
  else
    -- An archived member coming back: EditClient's Archive is the soft
    -- delete, so their history is still on this row.
    update public.clients set active = true where id = v_client and not active;
  end if;

  insert into public.time_blocks (coach_id, client_id, kind, label, starts_at, ends_at, session_type)
  values (r.coach_id, v_client, 'booked', 'Session · ' || v_name, r.requested_start, v_end, v_type)
  returning id into v_block;

  insert into public.sessions (client_id, scheduled_at, time_block_id)
  values (v_client, r.requested_start, v_block);

  update public.clients c
  set next_session_at = s.first_at, next_session_type = v_type
  from (
    select min(scheduled_at) as first_at from public.sessions
    where client_id = v_client and scheduled_at > now() and attendance is null
  ) s
  where c.id = v_client and s.first_at = r.requested_start;

  return v_client;
end;
$$;

revoke execute on function public.accept_session_request(uuid) from public, anon;
grant execute on function public.accept_session_request(uuid) to authenticated;
