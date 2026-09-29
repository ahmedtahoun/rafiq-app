-- 0015: the coach records what happened at a session, after it.
--
-- mark_attendance(session, outcome) sets the session's attendance and, for a
-- session that was held or that the member missed, uses one credit from the
-- relationship's package — the demo's setAttendance(): 'completed' and
-- 'member_no_show' charge, 'disputed' holds. As two writes from the app a
-- failure between them could mark a session without charging it, or charge
-- it twice on a retry, so it is one function, run as the calling coach
-- (SECURITY INVOKER) like 0010 and 0011: every policy, grant and trigger
-- that guards sessions and packages still applies.
--
-- Outcomes, as the app names them:
--   attended   'completed'        a credit is used
--   no_show    'member_no_show'   a credit is used
--   disputed   'disputed'         no credit; it waits to be settled
-- 'cancelled' is cancel_booking()'s (0011), never set here.
--
-- A credit is used only when one is left: a package already used up, or no
-- package at all (a first session straight from an accepted request has
-- none until the coach sets one up), leaves the session marked and nothing
-- charged. A free intro call never uses one. The function returns whether a
-- credit was used, so the app can say so.
--
-- It refuses, changing nothing:
--   * a session that isn't this coach's, or doesn't exist     P0002
--   * one whose attendance is already recorded — by the coach,
--     a member's dispute, or a cancellation                   55000
--   * one that hasn't started yet                             22023
--   * 'cancelled' as the outcome                              23514
--
-- Once recorded it stays: correcting a mark, and settling a dispute, come
-- with the member's side (step 4, part 3) and payments (§3).

create or replace function public.mark_attendance(p_session uuid, p_outcome public.attendance)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  s         public.sessions%rowtype;
  v_type    public.session_type;
  v_charged boolean := false;
begin
  if p_outcome = 'cancelled' then
    raise exception 'a session is cancelled with cancel_booking, not marked cancelled' using errcode = '23514';
  end if;

  select * into s from public.sessions
  where id = p_session and public.is_coach_of(client_id)
  for update;
  if not found then
    raise exception 'no such session' using errcode = 'P0002';
  end if;
  if s.attendance is not null then
    raise exception 'this session''s attendance is already recorded' using errcode = '55000';
  end if;
  if s.scheduled_at > now() then
    raise exception 'this session hasn''t started yet' using errcode = '22023';
  end if;

  if p_outcome in ('attended', 'no_show') then
    select b.session_type into v_type from public.time_blocks b where b.id = s.time_block_id;
    if v_type is distinct from 'intro' then
      update public.packages set used = used + 1
      where client_id = s.client_id and used < total;
      v_charged := found;
    end if;
  end if;

  update public.sessions
  set attendance = p_outcome, attendance_set_by = 'coach', attendance_set_at = now()
  where id = s.id;

  return v_charged;
end;
$$;

revoke execute on function public.mark_attendance(uuid, public.attendance) from public, anon;
grant execute on function public.mark_attendance(uuid, public.attendance) to authenticated;
