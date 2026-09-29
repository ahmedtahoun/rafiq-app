-- 0013's member_cancel_session(), as member M under the real policies.
-- Coach A has booked sessions for member M (clientM): one weeks ahead, one
-- a few hours ahead, a free intro a few hours ahead, and one already past.
-- clientM's package is set to 5 credits with 1 used. Every refusal has an
-- allowed case beside it.
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
\set clientM '''aaaaaaaa-0000-0000-0000-000000000001'''
\set bEarly '''eeeeeeee-0000-0000-0000-000000000171'''
\set bLate '''eeeeeeee-0000-0000-0000-000000000172'''
\set bIntro '''eeeeeeee-0000-0000-0000-000000000173'''
\set bPast '''eeeeeeee-0000-0000-0000-000000000174'''
\set sEarly '''ffffffff-0000-0000-0000-000000000171'''
\set sLate '''ffffffff-0000-0000-0000-000000000172'''
\set sIntro '''ffffffff-0000-0000-0000-000000000173'''
\set sPast '''ffffffff-0000-0000-0000-000000000174'''

select date_trunc('hour', now()) + interval '25 days' as te \gset
select date_trunc('hour', now()) + interval '3 hours' as tl \gset
select date_trunc('hour', now()) + interval '5 hours' as ti \gset
select date_trunc('hour', now()) - interval '26 days' as tp \gset

insert into public.time_blocks (id, coach_id, client_id, kind, label, starts_at, ends_at, session_type) values
  (:bEarly, :coachA, :clientM, 'booked', 'Session · Member M', :'te', :'te'::timestamptz + interval '50 minutes', 'standard'),
  (:bLate, :coachA, :clientM, 'booked', 'Session · Member M', :'tl', :'tl'::timestamptz + interval '50 minutes', 'standard'),
  (:bIntro, :coachA, :clientM, 'booked', 'Session · Member M', :'ti', :'ti'::timestamptz + interval '20 minutes', 'intro'),
  (:bPast, :coachA, :clientM, 'booked', 'Session · Member M', :'tp', :'tp'::timestamptz + interval '50 minutes', 'standard');
insert into public.sessions (id, client_id, scheduled_at, time_block_id) values
  (:sEarly, :clientM, :'te', :bEarly), (:sLate, :clientM, :'tl', :bLate),
  (:sIntro, :clientM, :'ti', :bIntro), (:sPast, :clientM, :'tp', :bPast);
insert into public.packages (client_id, total, used, expires_at) values (:clientM, 5, 1, now() + interval '30 days')
on conflict (client_id) do update set total = 5, used = 1;
select public.refresh_next_session(:clientM);

set role authenticated;

-- Who may -------------------------------------------------------------------------
select pg_temp.expect('the coach cannot use the member''s way',
  pg_temp.as_user(:coachA, format('select public.member_cancel_session(%L)::text', :sEarly)), 'DENIED(P0002)');
select pg_temp.expect('another member cannot cancel it',
  pg_temp.as_user(:memberN, format('select public.member_cancel_session(%L)::text', :sEarly)), 'DENIED(P0002)');
select pg_temp.expect('...nor another coach',
  pg_temp.as_user(:coachC, format('select public.member_cancel_session(%L)::text', :sEarly)), 'DENIED(P0002)');
select pg_temp.expect('no such session',
  pg_temp.as_user(:memberM, format('select public.member_cancel_session(%L)::text', 'ffffffff-0000-0000-0000-000000000999')), 'DENIED(P0002)');
select pg_temp.expect('signed out cannot call it',
  has_function_privilege('anon', 'public.member_cancel_session(uuid, text)', 'execute')::text, 'false');
select pg_temp.expect('a session that has started stays',
  pg_temp.as_user(:memberM, format('select public.member_cancel_session(%L)::text', :sPast)), 'DENIED(22023)');
select pg_temp.expect('the member still can''t cancel it directly',
  pg_temp.as_user(:memberM, format('with u as (update public.sessions set attendance = ''cancelled'', attendance_set_by = ''client'' where id = %L returning 1) select count(*)::text from u', :sEarly)), 'DENIED(42501)');
reset role;
select pg_temp.expect('...and none of that changed anything',
  (select count(*)::text from public.sessions where id in (:sEarly, :sPast) and attendance is not null)
    || ':' || (select count(*)::text from public.time_blocks where id in (:bEarly, :bPast))
    || ':' || (select used::text from public.packages where client_id = :clientM), '0:2:1');
set role authenticated;

-- With notice -----------------------------------------------------------------------
select pg_temp.expect('weeks ahead: cancelled, no credit',
  pg_temp.as_user(:memberM, format('select public.member_cancel_session(%L, %L)::text', :sEarly, '  Exams  ')), 'false');
reset role;
select pg_temp.expect('...kept in history as the member''s cancel',
  (select attendance || ':' || attendance_set_by from public.sessions where id = :sEarly), 'cancelled:client');
select pg_temp.expect('...the coach''s time is free',
  (select count(*)::text from public.time_blocks where id = :bEarly), '0');
select pg_temp.expect('...recorded, with notice and the reason',
  (select cancelled_by_role || ':' || within_grace || ':' || (cancelled_by = :memberM) || ':' || reason
   from public.cancellations where client_id = :clientM and cancelled_by_role = 'client' and hours_until_session > 24), 'client:true:true:Exams');
select pg_temp.expect('...and the coach is told',
  (select count(*)::text from public.notifications
   where recipient_id = :coachA and kind = 'session-cancelled' and payload->>'session_id' = :sEarly), '1');
select pg_temp.expect('...the member who did it is not',
  (select count(*)::text from public.notifications
   where recipient_id = :memberM and payload->>'session_id' = :sEarly), '0');
set role authenticated;
select pg_temp.expect('cancelling it again is refused',
  pg_temp.as_user(:memberM, format('select public.member_cancel_session(%L)::text', :sEarly)), 'DENIED(55000)');

-- Late ------------------------------------------------------------------------------
select pg_temp.expect('a few hours ahead: a credit is used',
  pg_temp.as_user(:memberM, format('select public.member_cancel_session(%L)::text', :sLate)), 'true');
select pg_temp.expect('a late free intro costs nothing',
  pg_temp.as_user(:memberM, format('select public.member_cancel_session(%L)::text', :sIntro)), 'false');
reset role;
select pg_temp.expect('the package: one credit used',
  (select used || '/' || total from public.packages where client_id = :clientM), '2/5');
select pg_temp.expect('the late cancel is recorded as late',
  (select within_grace::text from public.cancellations where client_id = :clientM and cancelled_by_role = 'client' and hours_until_session between 2 and 3), 'false');
select pg_temp.expect('next session moves on to what''s left',
  (select (c.next_session_at is not distinct from (
     select min(s.scheduled_at) from public.sessions s
     where s.client_id = :clientM and s.scheduled_at > now() and s.attendance is null))::text
   from public.clients c where c.id = :clientM), 'true');
select pg_temp.expect('...never a cancelled one',
  (select (next_session_at is distinct from :'tl'::timestamptz and next_session_at is distinct from :'ti'::timestamptz)::text
   from public.clients where id = :clientM), 'true');
