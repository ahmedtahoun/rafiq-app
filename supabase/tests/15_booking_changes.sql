-- 0011's reschedule_booking() and cancel_booking(), as the coach under the
-- real policies. Coach A books two sessions for member M (clientM) as the
-- owner below; a busy block and a past session stand beside them. Every
-- refusal has an allowed case beside it.
\set QUIET on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.as_user(uid text, q text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute q into r;
  return coalesce(r, 'NULL');
exception when others then
  return 'DENIED(' || sqlstate || ')';
end;
$$;

create or replace function pg_temp.expect(label text, actual text, expected text) returns text
language sql immutable as $$
  select case when actual = expected then 'PASS  ' else 'FAIL  ' end
      || rpad(label, 44)
      || ' expected=' || rpad(expected, 14) || ' actual=' || actual;
$$;

\set coachA '''11111111-1111-1111-1111-111111111111'''
\set coachC '''55555555-5555-5555-5555-555555555555'''
\set memberM '''33333333-3333-3333-3333-333333333333'''
\set memberN '''44444444-4444-4444-4444-444444444444'''
\set reqN '''dddddddd-0000-0000-0000-000000000150'''
\set clientM '''aaaaaaaa-0000-0000-0000-000000000001'''
\set b1 '''eeeeeeee-0000-0000-0000-000000000151'''
\set b2 '''eeeeeeee-0000-0000-0000-000000000152'''
\set busy '''eeeeeeee-0000-0000-0000-000000000153'''
\set past '''eeeeeeee-0000-0000-0000-000000000154'''

-- Whole hours, days ahead, on days no other test books.
select date_trunc('hour', now()) + interval '11 days' as t1 \gset
select date_trunc('hour', now()) + interval '12 days' as t2 \gset
select date_trunc('hour', now()) + interval '13 days' as t3 \gset
select date_trunc('hour', now()) + interval '14 days' as t4 \gset
select date_trunc('hour', now()) + interval '12 days 10 minutes' as t2_clash \gset
select date_trunc('hour', now()) - interval '2 hours' as tpast \gset

insert into public.time_blocks (id, coach_id, client_id, kind, label, starts_at, ends_at, session_type) values
  (:b1, :coachA, :clientM, 'booked', 'Session · Member M', :'t1', :'t1'::timestamptz + interval '50 minutes', 'standard'),
  (:b2, :coachA, :clientM, 'booked', 'Session · Member M', :'t2', :'t2'::timestamptz + interval '20 minutes', 'intro'),
  (:busy, :coachA, null, 'busy', 'Unavailable', :'t3', :'t3'::timestamptz + interval '1 hour', null),
  (:past, :coachA, :clientM, 'booked', 'Session · Member M', :'tpast', :'tpast'::timestamptz + interval '50 minutes', 'standard');
insert into public.sessions (client_id, scheduled_at, time_block_id) values
  (:clientM, :'t1', :b1), (:clientM, :'t2', :b2), (:clientM, :'tpast', :past);
-- Anything else upcoming on clientM from earlier files stops counting, so
-- "next session" below is only these.
update public.sessions set attendance = 'attended'
where client_id = :clientM and time_block_id is null and scheduled_at > now();
select public.refresh_next_session(:clientM);

set role authenticated;

-- Who may -------------------------------------------------------------------------
select pg_temp.expect('refresh sets the earliest upcoming session',
  pg_temp.as_user(:coachA, format('select (next_session_at = %L::timestamptz)::text || '':'' || next_session_type from public.clients where id = %L', :'t1', :clientM)), 'true:standard');
select pg_temp.expect('another coach cannot move it',
  pg_temp.as_user(:coachC, format('select public.reschedule_booking(%L, %L)::text', :b1, :'t3')), 'DENIED(P0002)');
select pg_temp.expect('...nor cancel it',
  pg_temp.as_user(:coachC, format('select public.cancel_booking(%L)::text', :b1)), 'DENIED(P0002)');
select pg_temp.expect('the member cannot move it this way',
  pg_temp.as_user(:memberM, format('select public.reschedule_booking(%L, %L)::text', :b1, :'t3')), 'DENIED(P0002)');
select pg_temp.expect('...nor cancel it',
  pg_temp.as_user(:memberM, format('select public.cancel_booking(%L)::text', :b1)), 'DENIED(P0002)');
select pg_temp.expect('signed out cannot call either',
  (has_function_privilege('anon', 'public.reschedule_booking(uuid, timestamptz)', 'execute')
    or has_function_privilege('anon', 'public.cancel_booking(uuid, text)', 'execute')
    or has_function_privilege('anon', 'public.refresh_next_session(uuid)', 'execute'))::text, 'false');

-- Moving --------------------------------------------------------------------------
select pg_temp.expect('busy time is not a booking',
  pg_temp.as_user(:coachA, format('select public.reschedule_booking(%L, %L)::text', :busy, :'t1')), 'DENIED(55000)');
select pg_temp.expect('a session that has started stays put',
  pg_temp.as_user(:coachA, format('select public.reschedule_booking(%L, %L)::text', :past, :'t3')), 'DENIED(22023)');
select pg_temp.expect('...and nothing moves into the past',
  pg_temp.as_user(:coachA, format('select public.reschedule_booking(%L, %L)::text', :b1, :'tpast')), 'DENIED(22023)');
select pg_temp.expect('a time on another booking is refused',
  pg_temp.as_user(:coachA, format('select public.reschedule_booking(%L, %L)::text', :b1, :'t2_clash')), 'DENIED(23P01)');
reset role;
select pg_temp.expect('...and changed nothing',
  (select (starts_at = :'t1')::text from public.time_blocks where id = :b1)
    || ':' || (select (scheduled_at = :'t1')::text from public.sessions where time_block_id = :b1), 'true:true');
set role authenticated;

select pg_temp.expect('time marked unavailable is refused too',
  pg_temp.as_user(:coachA, format('select public.reschedule_booking(%L, %L)::text', :b1, :'t3')), 'DENIED(23P01)');
select pg_temp.expect('the coach moves it to a free time',
  pg_temp.as_user(:coachA, format('select public.reschedule_booking(%L, %L)::text', :b1, :'t4')), '');
reset role;
select pg_temp.expect('block moved, same 50 minutes',
  (select (starts_at = :'t4')::text || ':' || extract(epoch from ends_at - starts_at)::int / 60 from public.time_blocks where id = :b1), 'true:50');
select pg_temp.expect('the session moved with it',
  (select (scheduled_at = :'t4')::text from public.sessions where time_block_id = :b1), 'true');
select pg_temp.expect('next session is now the intro',
  (select (next_session_at = :'t2')::text || ':' || next_session_type from public.clients where id = :clientM), 'true:intro');
set role authenticated;
select pg_temp.expect('a booking can move onto its own old time',
  pg_temp.as_user(:coachA, format('select public.reschedule_booking(%L, %L)::text', :b1, :'t4'::timestamptz + interval '10 minutes')), '');

-- Cancelling ----------------------------------------------------------------------
select pg_temp.expect('busy time is not a booking to cancel',
  pg_temp.as_user(:coachA, format('select public.cancel_booking(%L)::text', :busy)), 'DENIED(55000)');
select pg_temp.expect('a session that has started stays',
  pg_temp.as_user(:coachA, format('select public.cancel_booking(%L)::text', :past)), 'DENIED(22023)');
select pg_temp.expect('the coach cancels the intro, with a reason',
  pg_temp.as_user(:coachA, format('select public.cancel_booking(%L, %L)::text', :b2, '  Travelling  ')), '');
reset role;
select pg_temp.expect('the block is gone, the time free',
  (select count(*)::text from public.time_blocks where id = :b2), '0');
select pg_temp.expect('the session stays, marked cancelled by coach',
  (select attendance || ':' || attendance_set_by from public.sessions where client_id = :clientM and scheduled_at = :'t2'), 'cancelled:coach');
select pg_temp.expect('a cancellation on record, with notice',
  (select cancelled_by_role || ':' || within_grace || ':' || (hours_until_session > 200) || ':' || reason
   from public.cancellations where client_id = :clientM and cancelled_by = :coachA order by cancelled_at desc limit 1), 'coach:true:true:Travelling');
select pg_temp.expect('next session moves on to what is left',
  (select (next_session_at = :'t4'::timestamptz + interval '10 minutes')::text || ':' || next_session_type from public.clients where id = :clientM), 'true:standard');
set role authenticated;
select pg_temp.expect('member M sees the cancellation',
  pg_temp.as_user(:memberM, format('select count(*)::text from public.cancellations where client_id = %L and cancelled_by_role = ''coach''', :clientM)), '1');
select pg_temp.expect('cancelling twice finds nothing',
  pg_temp.as_user(:coachA, format('select public.cancel_booking(%L)::text', :b2)), 'DENIED(P0002)');
select pg_temp.expect('cancelling the last clears next session',
  pg_temp.as_user(:coachA, format('select public.cancel_booking(%L)::text', :b1)), '');
reset role;
select pg_temp.expect('...to nothing',
  (select coalesce(next_session_at::text, 'none') from public.clients where id = :clientM), 'none');

-- Accepting onto busy time (0010's accept, replaced in 0011) ---------------------
insert into public.session_requests (id, member_id, coach_id, requested_start, price)
values (:reqN, :memberN, :coachA, :'t3'::timestamptz + interval '15 minutes', 0);
set role authenticated;
select pg_temp.expect('a request onto time marked unavailable is refused',
  pg_temp.as_user(:coachA, format('select public.accept_session_request(%L)::text', :reqN)), 'DENIED(23P01)');
select pg_temp.expect('the coach removes their busy block',
  pg_temp.as_user(:coachA, format('with d as (delete from public.time_blocks where id = %L and kind = ''busy'' returning 1) select count(*)::text from d', :busy)), '1');
select pg_temp.expect('...and then it can be accepted',
  pg_temp.as_user(:coachA, format('select (public.accept_session_request(%L) is not null)::text', :reqN)), 'true');
select pg_temp.expect('accept keeps 0010''s grants',
  has_function_privilege('anon', 'public.accept_session_request(uuid)', 'execute')::text
    || ':' || has_function_privilege('authenticated', 'public.accept_session_request(uuid)', 'execute')::text, 'false:true');

-- The member hears about it --------------------------------------------------------
reset role;
select pg_temp.expect('member M told of each move',
  (select count(*)::text from public.notifications where recipient_id = :memberM and kind = 'session-moved' and client_id = :clientM), '2');
select pg_temp.expect('...and each cancellation, with its time',
  (select count(*)::text || ':' || bool_and(payload ? 'scheduled_at') from public.notifications
   where recipient_id = :memberM and kind = 'session-cancelled' and client_id = :clientM), '2:true');
select pg_temp.expect('a move says from and to',
  (select ((payload->>'to')::timestamptz = :'t4')::text from public.notifications
   where recipient_id = :memberM and kind = 'session-moved' order by created_at limit 1), 'true');
select pg_temp.expect('the coach who made them is not told',
  (select count(*)::text from public.notifications where recipient_id = :coachA and kind in ('session-moved', 'session-cancelled')), '0');
set role authenticated;
select pg_temp.expect('member M reads their notifications',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.notifications where kind in (''session-moved'', ''session-cancelled'')'), '4');
