-- 0015's mark_attendance(), as the coach under the real policies. Coach A
-- has past sessions with member M (clientM) — standard ones, a free intro,
-- one with no calendar block — and one still to come; clientM's package is
-- set to 3 credits with 1 used. Every refusal has an allowed case beside it.
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
\set clientM '''aaaaaaaa-0000-0000-0000-000000000001'''
\set bA '''eeeeeeee-0000-0000-0000-000000000161'''
\set bN '''eeeeeeee-0000-0000-0000-000000000162'''
\set bD '''eeeeeeee-0000-0000-0000-000000000163'''
\set bI '''eeeeeeee-0000-0000-0000-000000000164'''
\set bF '''eeeeeeee-0000-0000-0000-000000000165'''
\set sA '''ffffffff-0000-0000-0000-000000000161'''
\set sN '''ffffffff-0000-0000-0000-000000000162'''
\set sD '''ffffffff-0000-0000-0000-000000000163'''
\set sI '''ffffffff-0000-0000-0000-000000000164'''
\set sF '''ffffffff-0000-0000-0000-000000000165'''
\set sLoose '''ffffffff-0000-0000-0000-000000000166'''
\set sMember '''ffffffff-0000-0000-0000-000000000167'''
\set sLast '''ffffffff-0000-0000-0000-000000000168'''

-- Past days no other test books, and one ahead.
select date_trunc('hour', now()) - interval '20 days' as pa \gset
select date_trunc('hour', now()) - interval '19 days' as pn \gset
select date_trunc('hour', now()) - interval '18 days' as pd \gset
select date_trunc('hour', now()) - interval '17 days' as pi \gset
select date_trunc('hour', now()) + interval '20 days' as pf \gset

insert into public.time_blocks (id, coach_id, client_id, kind, label, starts_at, ends_at, session_type) values
  (:bA, :coachA, :clientM, 'booked', 'Session · Member M', :'pa', :'pa'::timestamptz + interval '50 minutes', 'standard'),
  (:bN, :coachA, :clientM, 'booked', 'Session · Member M', :'pn', :'pn'::timestamptz + interval '50 minutes', 'standard'),
  (:bD, :coachA, :clientM, 'booked', 'Session · Member M', :'pd', :'pd'::timestamptz + interval '50 minutes', 'standard'),
  (:bI, :coachA, :clientM, 'booked', 'Session · Member M', :'pi', :'pi'::timestamptz + interval '20 minutes', 'intro'),
  (:bF, :coachA, :clientM, 'booked', 'Session · Member M', :'pf', :'pf'::timestamptz + interval '50 minutes', 'standard');
insert into public.sessions (id, client_id, scheduled_at, time_block_id) values
  (:sA, :clientM, :'pa', :bA), (:sN, :clientM, :'pn', :bN), (:sD, :clientM, :'pd', :bD),
  (:sI, :clientM, :'pi', :bI), (:sF, :clientM, :'pf', :bF),
  (:sLoose, :clientM, :'pa'::timestamptz - interval '1 day', null),
  (:sMember, :clientM, :'pa'::timestamptz - interval '2 days', null),
  (:sLast, :clientM, :'pa'::timestamptz - interval '3 days', null);
insert into public.packages (client_id, total, used, expires_at) values (:clientM, 3, 1, now() + interval '30 days')
on conflict (client_id) do update set total = 3, used = 1;

set role authenticated;

-- Who may -------------------------------------------------------------------------
select pg_temp.expect('another coach cannot mark it',
  pg_temp.as_user(:coachC, format('select public.mark_attendance(%L, %L)::text', :sA, 'attended')), 'DENIED(P0002)');
select pg_temp.expect('...nor the member, this way',
  pg_temp.as_user(:memberM, format('select public.mark_attendance(%L, %L)::text', :sA, 'attended')), 'DENIED(P0002)');
select pg_temp.expect('signed out cannot call it',
  has_function_privilege('anon', 'public.mark_attendance(uuid, public.attendance)', 'execute')::text, 'false');

-- Refusals ------------------------------------------------------------------------
select pg_temp.expect('a session still to come waits',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sF, 'attended')), 'DENIED(22023)');
select pg_temp.expect('cancelling is cancel_booking''s',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sA, 'cancelled')), 'DENIED(23514)');
select pg_temp.expect('no such session',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', 'ffffffff-0000-0000-0000-000000000999', 'attended')), 'DENIED(P0002)');
reset role;
select pg_temp.expect('...and none of that changed anything',
  (select count(*)::text from public.sessions where id in (:sA, :sF) and attendance is not null)
    || ':' || (select used::text from public.packages where client_id = :clientM), '0:1');
set role authenticated;

-- Held, missed, disputed ----------------------------------------------------------
select pg_temp.expect('held: marked, and a credit used',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sA, 'attended')), 'true');
select pg_temp.expect('...recorded as the coach''s',
  pg_temp.as_user(:coachA, format('select attendance || '':'' || attendance_set_by || '':'' || (attendance_set_at is not null) from public.sessions where id = %L', :sA)), 'attended:coach:true');
select pg_temp.expect('...once: marking it again is refused',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sA, 'no_show')), 'DENIED(55000)');
select pg_temp.expect('a free intro uses no credit',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sI, 'attended')), 'false');
select pg_temp.expect('disputed holds the credit',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sD, 'disputed')), 'false');
select pg_temp.expect('the package so far',
  pg_temp.as_user(:coachA, format('select used || ''/'' || total from public.packages where client_id = %L', :clientM)), '2/3');
select pg_temp.expect('a no-show uses one too',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sN, 'no_show')), 'true');
select pg_temp.expect('with none left, marked and not charged',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sLoose, 'attended')), 'false');
select pg_temp.expect('...the package stays full, not over',
  pg_temp.as_user(:coachA, format('select used || ''/'' || total from public.packages where client_id = %L', :clientM)), '3/3');
select pg_temp.expect('...and that session is marked',
  pg_temp.as_user(:coachA, format('select attendance::text from public.sessions where id = %L', :sLoose)), 'attended');

-- A member's dispute stands --------------------------------------------------------
select pg_temp.expect('the member disputes a session first',
  pg_temp.as_user(:memberM, format('with u as (update public.sessions set attendance = ''disputed'', attendance_set_by = ''client'', attendance_set_at = now() where id = %L returning 1) select count(*)::text from u', :sMember)), '1');
select pg_temp.expect('...so the coach cannot mark over it',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sMember, 'attended')), 'DENIED(55000)');

-- No package at all ---------------------------------------------------------------
reset role;
delete from public.packages where client_id = :clientM;
set role authenticated;
select pg_temp.expect('no package: nothing to charge',
  pg_temp.as_user(:coachA, format('select public.mark_attendance(%L, %L)::text', :sLast, 'attended')), 'false');
select pg_temp.expect('...and the session is marked',
  pg_temp.as_user(:coachA, format('select attendance::text from public.sessions where id = %L', :sLast)), 'attended');

-- Quietly ------------------------------------------------------------------------
reset role;
select pg_temp.expect('marking sends no notification',
  (select count(*)::text from public.notifications
   where client_id = :clientM and payload->>'session_id' in (:sA, :sN, :sD, :sI, :sLoose, :sLast)), '0');
