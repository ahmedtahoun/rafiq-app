-- 0021: telling a member when a coach answers their session request.
--
-- A member asks a coach for a session from the coach's page (0005's
-- session_requests), or asks to move a booked one (0017). The coach answers
-- in their Notifications, and until now the member heard nothing back: they
-- found out only by opening Sessions. Now they are told, through 0002's
-- push_notification(), the way a moved or cancelled session already tells
-- them (0011):
--
--   request-accepted  a new session was booked from their request.
--   request-declined  the coach declined it: a new session, or a move of a
--                     booked one (payload.move). Also when a coach who
--                     deletes their account declines everything still open
--                     (0012).
--
-- Nothing new for an accepted move: accepting moves the session, and 0011's
-- trigger on sessions already tells the member it moved. A member
-- withdrawing their own request tells nobody.
--
-- A constraint trigger, deferred to commit, for two reasons.
-- accept_session_request() marks the request accepted before it creates the
-- roster row and the booking, so only at commit is there a relationship for
-- the notification to point at. And an accept refused after that (an
-- overlap, the free plan's limit, a block) rolls back, and a deferred
-- trigger in a rolled-back transaction never fires: a member is never told
-- "accepted" about a session that doesn't exist.
--
-- The payload is what the member's screen needs: the coach's id and name
-- (the name they already saw on Discover, coach_directory), the time asked
-- for, and whether it was a move. A coach whose account is gone has a blank
-- name; the app then says "the coach". client_id is the roster row when
-- there is one, so opening it lands on that relationship; a declined
-- stranger has none.

alter type public.notification_kind add value if not exists 'request-accepted';
alter type public.notification_kind add value if not exists 'request-declined';

create or replace function public.on_session_request_answered()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
  v_name   text;
begin
  if old.status <> 'pending' or new.status not in ('accepted', 'declined') then
    return null;
  end if;
  if new.status = 'accepted' and new.reschedule_of is not null then
    return null;
  end if;

  select c.id into v_client from public.clients c
  where c.coach_id = new.coach_id and c.member_id = new.member_id;
  select coalesce(p.full_name, '') into v_name from public.profiles p where p.id = new.coach_id;

  perform public.push_notification(
    new.member_id,
    (case new.status when 'accepted' then 'request-accepted' else 'request-declined' end)::public.notification_kind,
    v_client,
    jsonb_build_object(
      'request_id', new.id,
      'coach_id', new.coach_id,
      'coach_name', coalesce(v_name, ''),
      'requested_start', new.requested_start,
      'move', new.reschedule_of is not null
    )
  );
  return null;
end;
$$;

-- As 0018 did for every trigger function: never callable as an RPC.
revoke execute on function public.on_session_request_answered() from public, anon, authenticated;

create constraint trigger session_requests_notify_answer
  after update of status on public.session_requests
  deferrable initially deferred
  for each row execute function public.on_session_request_answered();
