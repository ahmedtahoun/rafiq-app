-- 0017: a member asking to move a booked session, and blocks stopping
-- requests.
--
-- Moving. In the demo a member's move reopens the session for the coach to
-- confirm; here it is a request, like the one that booked it: a
-- session_requests row whose reschedule_of names the booked block, with the
-- new start. The coach answers it in Notifications. Accepting moves the
-- block and its session (keeping the length), through the same lock and
-- overlap check as 0011's reschedule_booking(), and the member is told by
-- 0011's trigger on sessions. Declining, or the member withdrawing it,
-- leaves the booking where it was. If the booking goes (cancelled by either
-- side), its move request goes with it (on delete cascade).
--
-- A member may ask only for their own booked session with that coach, at
-- least 12 hours before it starts (the app's CANCELLATION_GRACE_HOURS, the
-- demo's rule for moving), and a move carries no offering or price: the
-- session stays what it was.
--
-- One open request per coach (0005) becomes one open request for a new
-- session per coach, plus one open move per booking — otherwise asking for
-- a new session would withdraw a pending move, and the other way round.
--
-- Blocks. 0014 lets either side block the other and stops messages while
-- either does, or either account isn't active; requests didn't check. Now a
-- member can't send a request while their relationship with that coach is
-- blocked from either side, or while either account isn't active
-- (can_request_session, which only ever looks at the caller's own
-- relationship), and accepting refuses the same (42501) — so a request sent
-- before a block can't be accepted after it.

alter table public.session_requests
  add column reschedule_of uuid references public.time_blocks (id) on delete cascade;

drop index public.session_requests_one_pending;
create unique index session_requests_one_pending
  on public.session_requests (member_id, coach_id) where status = 'pending' and reschedule_of is null;
create unique index session_requests_one_move
  on public.session_requests (reschedule_of) where status = 'pending' and reschedule_of is not null;

-- Whether the caller may ask this coach for a session: both accounts
-- active, and no block from either side on a relationship between them.
-- Definer so it can read the coach's account status; it says nothing about
-- anyone but the caller.
create or replace function public.can_request_session(p_coach uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.profiles p where p.id = p_coach and p.account_status = 'active')
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.account_status = 'active')
    and not exists (
      select 1 from public.clients c
      where c.coach_id = p_coach and c.member_id = auth.uid()
        and (c.blocked_by_member_at is not null or c.blocked_by_coach_at is not null)
    );
$$;

drop policy session_requests_insert_member on public.session_requests;
create policy session_requests_insert_member on public.session_requests
  for insert with check (
    member_id = auth.uid()
    and status = 'pending'
    and coach_id <> auth.uid()
    and public.can_request_session(coach_id)
    and (offering_id is null or exists (
      select 1 from public.offerings o where o.id = offering_id and o.coach_id = session_requests.coach_id))
    and (reschedule_of is null or (
      offering_id is null and price = 0
      and exists (
        select 1 from public.time_blocks b
        join public.clients c on c.id = b.client_id
        where b.id = reschedule_of
          and b.kind = 'booked'
          and b.coach_id = session_requests.coach_id
          and c.member_id = auth.uid()
          and b.starts_at > now() + interval '12 hours')))
  );

-- 0011's accept, with the block check and the move. Everything else is as
-- 0011 has it, including 0010's per-coach lock.
create or replace function public.accept_session_request(p_request uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  r          public.session_requests%rowtype;
  who        public.profiles%rowtype;
  b          public.time_blocks%rowtype;
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
  -- Readable to this coach: their own roster row's block columns, and the
  -- member's profile through profiles_select_own's session_requests arm.
  if exists (
       select 1 from public.clients c
       where c.coach_id = r.coach_id and c.member_id = r.member_id
         and (c.blocked_by_member_at is not null or c.blocked_by_coach_at is not null))
     or exists (
       select 1 from public.profiles p
       where p.id = r.member_id and p.account_status <> 'active') then
    raise exception 'this relationship is blocked, or the member''s account is not active' using errcode = '42501';
  end if;

  if r.reschedule_of is not null then
    -- A move. The block first, then the per-coach lock: the order 0011's
    -- reschedule_booking() takes them in, so the two wait for each other
    -- rather than deadlock.
    select * into b from public.time_blocks
    where id = r.reschedule_of and coach_id = r.coach_id and kind = 'booked'
    for update;
    if not found then
      raise exception 'the booking this request moves has changed' using errcode = '55000';
    end if;
    if b.starts_at <= now() then
      raise exception 'the session this request moves has started' using errcode = '22023';
    end if;
    v_end := r.requested_start + (b.ends_at - b.starts_at);

    perform pg_advisory_xact_lock(hashtextextended('accept_session_request:' || r.coach_id::text, 0));

    if exists (
      select 1 from public.time_blocks o
      where o.coach_id = r.coach_id
        and o.kind in ('booked', 'busy')
        and o.id <> b.id
        and tstzrange(o.starts_at, o.ends_at) && tstzrange(r.requested_start, v_end)
    ) then
      raise exception 'that time overlaps a booked session or time marked unavailable' using errcode = '23P01';
    end if;

    update public.session_requests
    set status = 'accepted', responded_at = now()
    where id = r.id;
    update public.time_blocks set starts_at = r.requested_start, ends_at = v_end where id = b.id;
    update public.sessions set scheduled_at = r.requested_start where time_block_id = b.id;
    perform public.refresh_next_session(b.client_id);
    return b.client_id;
  end if;

  v_type := case when r.offering_id is null and r.price = 0 then 'intro' else 'standard' end;
  v_end  := r.requested_start + make_interval(mins => case when v_type = 'intro' then 20 else 50 end);

  -- The row lock above only covers this request. Two different requests
  -- for the same slot, accepted at the same instant (two tabs, a double
  -- tap), would both pass the overlap check before either inserts its
  -- block. One lock per coach, held to the end of the transaction, makes
  -- the second accept wait and then see the first one's booking.
  perform pg_advisory_xact_lock(hashtextextended('accept_session_request:' || r.coach_id::text, 0));

  if exists (
    select 1 from public.time_blocks tb
    where tb.coach_id = r.coach_id
      and tb.kind in ('booked', 'busy')
      and tstzrange(tb.starts_at, tb.ends_at) && tstzrange(r.requested_start, v_end)
  ) then
    raise exception 'that time overlaps a booked session or time marked unavailable' using errcode = '23P01';
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

revoke execute on function public.can_request_session(uuid) from public, anon;
grant execute on function public.can_request_session(uuid) to authenticated;
