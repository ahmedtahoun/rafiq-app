-- 0011: a coach moving or cancelling a booked session.
--
-- A booking is two rows kept in step: the block on the coach's calendar
-- (time_blocks, kind 'booked') and the session on the relationship's history
-- (sessions), tied by sessions.time_block_id since 0010. The roster row's
-- next_session_at points at the earliest upcoming one. Moving or cancelling
-- from the app as separate writes could leave the calendar saying one time
-- and the member's history another, so each is one function, run as the
-- calling coach (SECURITY INVOKER) like 0010: every policy, grant and trigger
-- that guards those tables still applies.
--
-- reschedule_booking(block, start) moves the block to a new start, keeping
-- its length, and the session with it. It takes 0010's per-coach lock, so a
-- move and an accept for the same coach can't both pass the overlap check.
--
-- cancel_booking(block, reason) records the cancellation (who, how far
-- ahead, whether with 12 hours' notice — the app's CANCELLATION_GRACE_HOURS),
-- marks the session cancelled so the history keeps it, and removes the block
-- so the time is free again. The cancellation's time_block_id is then null
-- (its foreign key is ON DELETE SET NULL); the session row keeps the time.
--
-- Both refuse, changing nothing:
--   * a block that isn't this coach's, or doesn't exist      P0002
--   * one that isn't a booked session (busy time, a request)  55000
--   * a session that has already started, or a move into
--     the past                                               22023
--   * a move that overlaps another booked session, or time
--     the coach marked unavailable (a busy block)            23P01
--
-- Busy time now blocks a booking everywhere. Until this migration a busy
-- block was only drawn on the calendar: 0010 checked a new booking against
-- other bookings alone, so a coach who marked 2–4 PM Unavailable could
-- still accept a request straight onto it. accept_session_request() is
-- replaced below with the same body and 'busy' added to its overlap check.
--
-- A member's own moves and cancellations come with their Schedule (step 4,
-- part 3); until then only the coach's side calls these.

-- The other side hears about it. A moved or cancelled session notifies the
-- counterparty of whoever made the change (0002's client_counterparty and
-- push_notification): the member when the coach moves or cancels, the coach
-- when a member does (their side comes with step 4, part 3). A trigger on
-- sessions rather than a line in each function, so any path that moves or
-- cancels a session — these functions, a later member one — tells them, and
-- a refused change (rolled back) tells nobody. A walk-in with no account has
-- nobody to tell.
alter type public.notification_kind add value if not exists 'session-moved';
alter type public.notification_kind add value if not exists 'session-cancelled';

create or replace function public.on_session_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.attendance = 'cancelled' and old.attendance is distinct from 'cancelled' then
    perform public.push_notification(
      public.client_counterparty(new.client_id, auth.uid()),
      'session-cancelled',
      new.client_id,
      jsonb_build_object('session_id', new.id, 'scheduled_at', new.scheduled_at)
    );
  elsif new.scheduled_at is distinct from old.scheduled_at and new.attendance is null then
    perform public.push_notification(
      public.client_counterparty(new.client_id, auth.uid()),
      'session-moved',
      new.client_id,
      jsonb_build_object('session_id', new.id, 'from', old.scheduled_at, 'to', new.scheduled_at)
    );
  end if;
  return new;
end;
$$;

create trigger sessions_notify_change
  after update of scheduled_at, attendance on public.sessions
  for each row execute function public.on_session_changed();

-- The earliest upcoming, not-cancelled session on a roster row, and its
-- length, as next_session_at / next_session_type. Invoker: it can only
-- update a row the caller could already update.
create or replace function public.refresh_next_session(p_client uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.clients c
  set next_session_at = n.scheduled_at,
      next_session_type = n.session_type
  from (
    select s.scheduled_at, b.session_type
    from (select 1) one
    left join lateral (
      select s.scheduled_at, s.time_block_id
      from public.sessions s
      where s.client_id = p_client and s.scheduled_at > now() and s.attendance is null
      order by s.scheduled_at
      limit 1
    ) s on true
    left join public.time_blocks b on b.id = s.time_block_id
  ) n
  where c.id = p_client;
$$;

create or replace function public.reschedule_booking(p_block uuid, p_start timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  b     public.time_blocks%rowtype;
  v_end timestamptz;
begin
  select * into b from public.time_blocks
  where id = p_block and coach_id = auth.uid()
  for update;
  if not found then
    raise exception 'no such booking' using errcode = 'P0002';
  end if;
  if b.kind <> 'booked' or b.client_id is null then
    raise exception 'only a booked session can be moved' using errcode = '55000';
  end if;
  if b.starts_at <= now() or p_start <= now() then
    raise exception 'a session that has started, or a time that has passed, can''t be moved to' using errcode = '22023';
  end if;

  v_end := p_start + (b.ends_at - b.starts_at);

  -- 0010's lock: a move and an accept for this coach take turns.
  perform pg_advisory_xact_lock(hashtextextended('accept_session_request:' || b.coach_id::text, 0));

  if exists (
    select 1 from public.time_blocks o
    where o.coach_id = b.coach_id
      and o.kind in ('booked', 'busy')
      and o.id <> b.id
      and tstzrange(o.starts_at, o.ends_at) && tstzrange(p_start, v_end)
  ) then
    raise exception 'that time overlaps a booked session or time marked unavailable' using errcode = '23P01';
  end if;

  update public.time_blocks set starts_at = p_start, ends_at = v_end where id = b.id;
  update public.sessions set scheduled_at = p_start where time_block_id = b.id;
  perform public.refresh_next_session(b.client_id);
end;
$$;

create or replace function public.cancel_booking(p_block uuid, p_reason text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  b       public.time_blocks%rowtype;
  v_hours numeric;
begin
  select * into b from public.time_blocks
  where id = p_block and coach_id = auth.uid()
  for update;
  if not found then
    raise exception 'no such booking' using errcode = 'P0002';
  end if;
  if b.kind <> 'booked' or b.client_id is null then
    raise exception 'only a booked session can be cancelled' using errcode = '55000';
  end if;
  if b.starts_at <= now() then
    raise exception 'a session that has started can''t be cancelled' using errcode = '22023';
  end if;

  v_hours := round((extract(epoch from b.starts_at - now()) / 3600)::numeric, 2);

  insert into public.cancellations (client_id, time_block_id, cancelled_by_role, cancelled_by, hours_until_session, within_grace, reason)
  values (b.client_id, b.id, 'coach', auth.uid(), v_hours, v_hours >= 12, nullif(trim(coalesce(p_reason, '')), ''));

  update public.sessions
  set attendance = 'cancelled', attendance_set_by = 'coach', attendance_set_at = now()
  where time_block_id = b.id;

  delete from public.time_blocks where id = b.id;
  perform public.refresh_next_session(b.client_id);
end;
$$;

-- 0010's accept, with busy time counted as taken. Everything else is as 0010
-- has it, including its per-coach lock.
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

  -- The row lock above only covers this request. Two different requests
  -- for the same slot, accepted at the same instant (two tabs, a double
  -- tap), would both pass the overlap check before either inserts its
  -- block. One lock per coach, held to the end of the transaction, makes
  -- the second accept wait and then see the first one's booking.
  perform pg_advisory_xact_lock(hashtextextended('accept_session_request:' || r.coach_id::text, 0));

  if exists (
    select 1 from public.time_blocks b
    where b.coach_id = r.coach_id
      and b.kind in ('booked', 'busy')
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(r.requested_start, v_end)
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

revoke execute on function public.refresh_next_session(uuid) from public, anon;
revoke execute on function public.reschedule_booking(uuid, timestamptz) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.refresh_next_session(uuid) to authenticated;
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
