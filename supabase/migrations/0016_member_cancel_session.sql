-- 0016: a member cancelling one of their own booked sessions.
--
-- The member's side of 0011's cancel_booking(): it records the cancellation
-- (who, how far ahead, whether with 12 hours' notice — the app's
-- CANCELLATION_GRACE_HOURS), keeps the session in history marked cancelled,
-- frees the coach's time, and keeps the roster row's next session right.
-- Like the demo's cancelBooking(), a member cancelling with less than 12
-- hours' notice gives up one package credit, when one is left; a free intro
-- call never costs one. The coach is told by 0011's trigger on sessions,
-- which notifies the counterparty of whoever made the change.
--
-- Unlike 0010, 0011 and 0015 this is SECURITY DEFINER: a member may read their
-- sessions and blocks but, by design, may not update a session beyond a
-- dispute (0005), delete the coach's block, or touch the package. So the
-- function checks for itself that the caller is the member on the
-- session's relationship (is_member_of, from the caller's own JWT) and
-- does only this one thing. Execute is for signed-in users only.
--
-- It takes the session, not the block: that is what the member's screens
-- read, and a session names its relationship directly.
--
-- It refuses, changing nothing:
--   * a session that isn't the caller's, or doesn't exist    P0002
--   * one already cancelled, or already recorded (held,
--     missed, disputed)                                      55000
--   * one that has already started                          22023
--
-- It returns whether a credit was used.

create or replace function public.member_cancel_session(p_session uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s         public.sessions%rowtype;
  v_type    public.session_type;
  v_hours   numeric;
  v_late    boolean;
  v_charged boolean := false;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or auth.uid() is null or not public.is_member_of(s.client_id) then
    raise exception 'no such session' using errcode = 'P0002';
  end if;
  if s.attendance is not null then
    raise exception 'this session is already cancelled or recorded' using errcode = '55000';
  end if;
  if s.scheduled_at <= now() then
    raise exception 'a session that has started can''t be cancelled' using errcode = '22023';
  end if;

  select b.session_type into v_type from public.time_blocks b where b.id = s.time_block_id for update;

  v_hours := round((extract(epoch from s.scheduled_at - now()) / 3600)::numeric, 2);
  v_late  := v_hours < 12;

  insert into public.cancellations (client_id, time_block_id, cancelled_by_role, cancelled_by, hours_until_session, within_grace, reason)
  values (s.client_id, s.time_block_id, 'client', auth.uid(), v_hours, not v_late, nullif(trim(coalesce(p_reason, '')), ''));

  update public.sessions
  set attendance = 'cancelled', attendance_set_by = 'client', attendance_set_at = now()
  where id = s.id;

  if s.time_block_id is not null then
    delete from public.time_blocks where id = s.time_block_id;
  end if;

  if v_late and v_type is distinct from 'intro' then
    update public.packages set used = used + 1
    where client_id = s.client_id and used < total;
    v_charged := found;
  end if;

  perform public.refresh_next_session(s.client_id);
  return v_charged;
end;
$$;

revoke execute on function public.member_cancel_session(uuid, text) from public, anon;
grant execute on function public.member_cancel_session(uuid, text) to authenticated;
