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
--   * a move that overlaps another booked session            23P01
--
-- A member's own moves and cancellations come with their Schedule (step 4,
-- part 3); until then only the coach's side calls these.

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
      and o.kind = 'booked'
      and o.id <> b.id
      and tstzrange(o.starts_at, o.ends_at) && tstzrange(p_start, v_end)
  ) then
    raise exception 'that time overlaps a session already booked' using errcode = '23P01';
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

revoke execute on function public.refresh_next_session(uuid) from public, anon;
revoke execute on function public.reschedule_booking(uuid, timestamptz) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.refresh_next_session(uuid) to authenticated;
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
