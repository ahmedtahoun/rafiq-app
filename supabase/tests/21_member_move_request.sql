-- 0017: member M asking coach A to move a booked session (a session_requests
-- row with reschedule_of), coach A accepting or declining it, and blocks
-- and inactive accounts stopping requests, under the real policies.
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

-- A member's request, as the app sends it.
create or replace function pg_temp.ask(member text, coach text, start_at timestamptz, moves text default null,
                                       offering text default null, price numeric default 0) returns text
language sql as $$
  select pg_temp.as_user(member, format(
    'with i as (insert into public.session_requests (member_id, coach_id, offering_id, requested_start, price, status, reschedule_of)'
    || ' values (%L, %L, %L, %L, %s, ''pending'', %L) returning 1) select count(*)::text from i',
    member, coach, offering, start_at, price, moves));
$$;

\set coachA '''11111111-1111-1111-1111-111111111111'''
\set coachC '''55555555-5555-5555-5555-555555555555'''
\set memberM '''33333333-3333-3333-3333-333333333333'''
\set memberN '''44444444-4444-4444-4444-444444444444'''
\set clientM '''aaaaaaaa-0000-0000-0000-000000000001'''
\set bMove '''eeeeeeee-0000-0000-0000-000000000211'''
\set bSoon '''eeeeeeee-0000-0000-0000-000000000212'''
\set bClash '''eeeeeeee-0000-0000-0000-000000000213'''
\set bBusy '''eeeeeeee-0000-0000-0000-000000000214'''
\set bGone '''eeeeeeee-0000-0000-0000-000000000215'''
\set sMove '''ffffffff-0000-0000-0000-000000000211'''
\set sClash '''ffffffff-0000-0000-0000-000000000213'''
\set sGone '''ffffffff-0000-0000-0000-000000000215'''

-- Whole hours, on days no other test books.
select date_trunc('hour', now()) + interval '40 days' as tmove \gset
select date_trunc('hour', now()) + interval '41 days' as tnew \gset
select date_trunc('hour', now()) + interval '42 days' as tclash \gset
select date_trunc('hour', now()) + interval '43 days' as tbusy \gset
select date_trunc('hour', now()) + interval '44 days' as tgone \gset
select date_trunc('hour', now()) + interval '45 days' as tfree \gset
select date_trunc('hour', now()) + interval '3 hours' as tsoon \gset

-- A clean start: no block on M and A, no open requests from M.
update public.clients set blocked_by_member_at = null, blocked_by_coach_at = null where id = :clientM;
update public.session_requests set status = 'withdrawn' where member_id = :memberM and status = 'pending';

insert into public.time_blocks (id, coach_id, client_id, kind, label, starts_at, ends_at, session_type) values
  (:bMove, :coachA, :clientM, 'booked', 'Session · Member M', :'tmove', :'tmove'::timestamptz + interval '20 minutes', 'intro'),
  (:bSoon, :coachA, :clientM, 'booked', 'Session · Member M', :'tsoon', :'tsoon'::timestamptz + interval '50 minutes', 'standard'),
  (:bClash, :coachA, :clientM, 'booked', 'Session · Member M', :'tclash', :'tclash'::timestamptz + interval '50 minutes', 'standard'),
  (:bBusy, :coachA, null, 'busy', 'Unavailable', :'tbusy', :'tbusy'::timestamptz + interval '2 hours', null),
  (:bGone, :coachA, :clientM, 'booked', 'Session · Member M', :'tgone', :'tgone'::timestamptz + interval '50 minutes', 'standard');
insert into public.sessions (id, client_id, scheduled_at, time_block_id) values
  (:sMove, :clientM, :'tmove', :bMove), (:sClash, :clientM, :'tclash', :bClash), (:sGone, :clientM, :'tgone', :bGone);

set role authenticated;

-- Asking to move ----------------------------------------------------------------------
select pg_temp.expect('M asks to move their booking',
  pg_temp.ask(:memberM, :coachA, :'tnew', :bMove), '1');
select pg_temp.expect('...one open move per booking',
  pg_temp.ask(:memberM, :coachA, :'tfree', :bMove), 'DENIED(23505)');
select pg_temp.expect('...and a new-session request beside it',
  pg_temp.ask(:memberM, :coachA, :'tfree'), '1');
select pg_temp.expect('...but still one of those per coach',
  pg_temp.ask(:memberM, :coachA, :'tfree'::timestamptz + interval '1 hour'), 'DENIED(23505)');
select pg_temp.expect('not within 12 hours of the session',
  pg_temp.ask(:memberM, :coachA, :'tfree', :bSoon), 'DENIED(42501)');
select pg_temp.expect('not someone else''s booking',
  pg_temp.ask(:memberN, :coachA, :'tfree', :bClash), 'DENIED(42501)');
select pg_temp.expect('not time the coach marked unavailable',
  pg_temp.ask(:memberM, :coachA, :'tfree', :bBusy), 'DENIED(42501)');
select pg_temp.expect('not with a price',
  pg_temp.ask(:memberM, :coachA, :'tfree', :bClash, null, 500), 'DENIED(42501)');
select pg_temp.expect('not addressed to another coach',
  pg_temp.ask(:memberM, :coachC, :'tfree', :bClash), 'DENIED(42501)');
select pg_temp.expect('signed out cannot check who may ask',
  has_function_privilege('anon', 'public.can_request_session(uuid)', 'execute')::text, 'false');

-- The coach answers --------------------------------------------------------------------
select pg_temp.expect('coach A accepts the move',
  pg_temp.as_user(:coachA, format(
    'select (public.accept_session_request((select id from public.session_requests where reschedule_of = %L and status = ''pending'')) = %L)::text',
    :bMove, :clientM)), 'true');
reset role;
select pg_temp.expect('...the booking moved, keeping its length',
  (select (starts_at = :'tnew'::timestamptz and ends_at = :'tnew'::timestamptz + interval '20 minutes')::text
   from public.time_blocks where id = :bMove), 'true');
select pg_temp.expect('...and its session with it',
  (select (scheduled_at = :'tnew'::timestamptz)::text from public.sessions where id = :sMove), 'true');
select pg_temp.expect('...no second booking was made',
  (select count(*)::text from public.time_blocks where coach_id = :coachA and starts_at = :'tnew'), '1');
select pg_temp.expect('...the request is answered',
  (select status::text from public.session_requests where reschedule_of = :bMove), 'accepted');
select pg_temp.expect('...and M is told it moved',
  (select count(*)::text from public.notifications
   where recipient_id = :memberM and kind = 'session-moved' and payload->>'session_id' = :sMove), '1');
select pg_temp.expect('...next session stays the earliest',
  (select (c.next_session_at is not distinct from (
     select min(s.scheduled_at) from public.sessions s
     where s.client_id = :clientM and s.scheduled_at > now() and s.attendance is null))::text
   from public.clients c where c.id = :clientM), 'true');
set role authenticated;

select pg_temp.expect('a move by ten minutes, overlapping itself',
  pg_temp.ask(:memberM, :coachA, :'tnew'::timestamptz + interval '10 minutes', :bMove), '1');
select pg_temp.expect('...is not a clash with itself',
  pg_temp.as_user(:coachA, format(
    'select (public.accept_session_request((select id from public.session_requests where reschedule_of = %L and status = ''pending'')) = %L)::text',
    :bMove, :clientM)), 'true');

select pg_temp.expect('a move onto unavailable time is asked',
  pg_temp.ask(:memberM, :coachA, :'tbusy'::timestamptz + interval '1 hour', :bClash), '1');
select pg_temp.expect('...and refused on accept',
  pg_temp.as_user(:coachA, format(
    'select public.accept_session_request((select id from public.session_requests where reschedule_of = %L and status = ''pending''))::text',
    :bClash)), 'DENIED(23P01)');
reset role;
select pg_temp.expect('...leaving the booking where it was',
  (select (starts_at = :'tclash'::timestamptz)::text from public.time_blocks where id = :bClash), 'true');
set role authenticated;
select pg_temp.expect('declining it leaves it there too',
  pg_temp.as_user(:coachA, format(
    'with u as (update public.session_requests set status = ''declined'' where reschedule_of = %L and status = ''pending'' returning 1) select count(*)::text from u',
    :bClash)), '1');

select pg_temp.expect('a move for a booking later cancelled',
  pg_temp.ask(:memberM, :coachA, :'tfree'::timestamptz + interval '2 hours', :bGone), '1');
select pg_temp.expect('...the coach cancels the booking',
  pg_temp.as_user(:coachA, format('select public.cancel_booking(%L)::text', :bGone)), '');
reset role;
select pg_temp.expect('...and the move request goes with it',
  (select count(*)::text from public.session_requests where reschedule_of = :bGone), '0');

-- Blocks and inactive accounts ------------------------------------------------------------
update public.session_requests set status = 'withdrawn' where member_id = :memberM and status = 'pending';
-- Sent before the block.
insert into public.session_requests (member_id, coach_id, requested_start, price, status)
values (:memberM, :coachA, :'tfree'::timestamptz + interval '3 hours', 0, 'pending');
update public.clients set blocked_by_coach_at = now() where id = :clientM;
set role authenticated;
select pg_temp.expect('blocked by the coach: M cannot ask',
  pg_temp.ask(:memberM, :coachA, :'tfree'::timestamptz + interval '4 hours', :bClash), 'DENIED(42501)');
select pg_temp.expect('...nor accept what M sent before',
  pg_temp.as_user(:coachA, format(
    'select public.accept_session_request((select id from public.session_requests where member_id = %L and coach_id = %L and status = ''pending''))::text',
    :memberM, :coachA)), 'DENIED(42501)');
select pg_temp.expect('...M can still ask another coach',
  pg_temp.ask(:memberM, :coachC, :'tfree'), '1');
reset role;
update public.clients set blocked_by_coach_at = null, blocked_by_member_at = now() where id = :clientM;
set role authenticated;
select pg_temp.expect('blocked by M: M cannot ask either',
  pg_temp.ask(:memberM, :coachA, :'tfree'::timestamptz + interval '5 hours', :bClash), 'DENIED(42501)');
reset role;
update public.clients set blocked_by_member_at = null where id = :clientM;
set role authenticated;
select pg_temp.expect('unblocked, the request can be accepted',
  pg_temp.as_user(:coachA, format(
    'select (public.accept_session_request((select id from public.session_requests where member_id = %L and coach_id = %L and status = ''pending'')) = %L)::text',
    :memberM, :coachA, :clientM)), 'true');
reset role;
update public.profiles set account_status = 'suspended' where id = :memberM;
set role authenticated;
select pg_temp.expect('a suspended member cannot ask',
  pg_temp.ask(:memberM, :coachA, :'tfree'::timestamptz + interval '6 hours'), 'DENIED(42501)');
reset role;
update public.profiles set account_status = 'active' where id = :memberM;
update public.profiles set account_status = 'suspended' where id = :coachC;
update public.session_requests set status = 'withdrawn' where member_id = :memberM and coach_id = :coachC and status = 'pending';
set role authenticated;
select pg_temp.expect('nor ask a suspended coach',
  pg_temp.ask(:memberM, :coachC, :'tfree'::timestamptz + interval '7 hours'), 'DENIED(42501)');
reset role;
update public.profiles set account_status = 'active' where id = :coachC;
