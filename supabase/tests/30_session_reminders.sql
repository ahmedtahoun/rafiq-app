-- 0025: a reminder before each session, to both sides. Coach R (Pro),
-- members S and U, and a walk-in are new here. Every run passes its own
-- "now", so the windows are exact.
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
  select case when actual is not distinct from expected then 'PASS  ' else 'FAIL  ' end
      || rpad(label, 44)
      || ' expected=' || rpad(expected, 14) || ' actual=' || coalesce(actual, 'NULL');
$$;

-- How many reminders `who` has, and for which sessions, oldest first.
create or replace function pg_temp.reminders(who text) returns text
language sql as $$
  select count(*)::text || coalesce(':' || string_agg(payload->>'session_id', ',' order by created_at, payload->>'session_id'), '')
  from public.notifications where recipient_id = who::uuid and kind = 'session-reminder';
$$;

\set coachR  '''30303030-0000-0000-0000-00000000000c'''
\set memberS '''30303030-0000-0000-0000-000000000001'''
\set memberU '''30303030-0000-0000-0000-000000000002'''
\set clientS '''30303030-1111-0000-0000-000000000001'''
\set clientU '''30303030-1111-0000-0000-000000000002'''
\set clientW '''30303030-1111-0000-0000-000000000003'''

-- Far from today, so nothing else in the suite is in any window.
select date_trunc('hour', now()) + interval '120 days' as t0 \gset

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachR,  'coachR@x.com',  '{"role":"coach","full_name":"Coach Rasha"}'),
  (:memberS, 'memberS@x.com', '{"role":"client","full_name":"Member Salma"}'),
  (:memberU, 'memberU@x.com', '{"role":"client","full_name":"Member Usama"}');
insert into public.coach_profiles (profile_id, title) values (:coachR, 'Career coaching');
insert into public.subscriptions (coach_id, tier) values (:coachR, 'pro');
insert into public.clients (id, coach_id, member_id, full_name) values
  (:clientS, :coachR, :memberS, 'Salma'),
  (:clientU, :coachR, :memberU, 'Usama'),
  (:clientW, :coachR, null,     'Walk-in Wael');

-- Booked days ahead (created_at), at t0 + the minutes in the id.
insert into public.sessions (id, client_id, scheduled_at, created_at) values
  ('30303030-2222-0000-0000-000000000050', :clientS, :'t0'::timestamptz + interval '50 minutes', :'t0'::timestamptz - interval '2 days'),
  ('30303030-2222-0000-0000-000000000070', :clientS, :'t0'::timestamptz + interval '70 minutes', :'t0'::timestamptz - interval '2 days'),
  ('30303030-2222-0000-0000-000000000030', :clientS, :'t0'::timestamptz + interval '30 minutes', :'t0'::timestamptz - interval '2 days');

-- One session, both sides ------------------------------------------------------------------
select pg_temp.expect('a run at t0 reminds the one in its window',
  public.queue_session_reminders(:'t0')::text, '1');
select pg_temp.expect('...the coach is told',
  pg_temp.reminders(:coachR), '1:30303030-2222-0000-0000-000000000050');
select pg_temp.expect('...and the member',
  pg_temp.reminders(:memberS), '1:30303030-2222-0000-0000-000000000050');
select pg_temp.expect('...on their relationship, with the time',
  (select bool_and(client_id = :clientS)::text || '|' || bool_and((payload->>'scheduled_at')::timestamptz = :'t0'::timestamptz + interval '50 minutes')::text
   from public.notifications where kind = 'session-reminder'),
  'true|true');
select pg_temp.expect('the one in 30 minutes is too late to remind',
  (select count(*)::text from public.notifications where payload->>'session_id' = '30303030-2222-0000-0000-000000000030'), '0');

-- Once, then the next one -----------------------------------------------------------------
select pg_temp.expect('five minutes later: nothing new',
  public.queue_session_reminders(:'t0'::timestamptz + interval '5 minutes')::text || '|' || pg_temp.reminders(:memberS),
  '0|1:30303030-2222-0000-0000-000000000050');
select pg_temp.expect('fifteen minutes later: the 70-minute one',
  public.queue_session_reminders(:'t0'::timestamptz + interval '15 minutes')::text || '|' || pg_temp.reminders(:memberS),
  '1|2:30303030-2222-0000-0000-000000000050,30303030-2222-0000-0000-000000000070');
select pg_temp.expect('...once, however often the job runs',
  (select string_agg(public.queue_session_reminders(:'t0'::timestamptz + make_interval(mins => m))::text, '' order by m)
   from generate_series(16, 25) m) || '|' || pg_temp.reminders(:coachR),
  '0000000000|2:30303030-2222-0000-0000-000000000050,30303030-2222-0000-0000-000000000070');

-- Moved: reminded again at the new time ---------------------------------------------------
update public.sessions set scheduled_at = :'t0'::timestamptz + interval '1 day 50 minutes'
 where id = '30303030-2222-0000-0000-000000000050';
select pg_temp.expect('a session moved to tomorrow is reminded then',
  public.queue_session_reminders(:'t0'::timestamptz + interval '1 day')::text || '|' || pg_temp.reminders(:memberS),
  '1|3:30303030-2222-0000-0000-000000000050,30303030-2222-0000-0000-000000000070,30303030-2222-0000-0000-000000000050');

-- Not reminded ---------------------------------------------------------------------------
insert into public.sessions (id, client_id, scheduled_at, created_at, attendance) values
  ('30303030-2222-0000-0000-0000000000c1', :clientU, :'t0'::timestamptz + interval '2 days 50 minutes', :'t0'::timestamptz - interval '2 days', 'cancelled');
insert into public.sessions (id, client_id, scheduled_at, created_at) values
  ('30303030-2222-0000-0000-0000000000b1', :clientU, :'t0'::timestamptz + interval '3 days 50 minutes', :'t0'::timestamptz + interval '3 days 10 minutes');
select pg_temp.expect('a cancelled session is not reminded',
  public.queue_session_reminders(:'t0'::timestamptz + interval '2 days')::text, '0');
select pg_temp.expect('...nor one booked 40 minutes before',
  public.queue_session_reminders(:'t0'::timestamptz + interval '3 days')::text, '0');
insert into public.sessions (id, client_id, scheduled_at, created_at) values
  ('30303030-2222-0000-0000-0000000000a1', :clientU, :'t0'::timestamptz + interval '4 days 50 minutes', :'t0'::timestamptz - interval '2 days');
update public.clients set active = false where id = :clientU;
select pg_temp.expect('...nor one in an archived relationship',
  public.queue_session_reminders(:'t0'::timestamptz + interval '4 days')::text || '|' || pg_temp.reminders(:memberU), '0|0');

-- A walk-in: the coach only ----------------------------------------------------------------
insert into public.sessions (id, client_id, scheduled_at, created_at) values
  ('30303030-2222-0000-0000-0000000000d1', :clientW, :'t0'::timestamptz + interval '5 days 50 minutes', :'t0'::timestamptz - interval '2 days');
select pg_temp.expect('a walk-in''s session is reminded',
  public.queue_session_reminders(:'t0'::timestamptz + interval '5 days')::text, '1');
select pg_temp.expect('...to the coach alone',
  (select count(*)::text from public.notifications where kind = 'session-reminder' and payload->>'session_id' = '30303030-2222-0000-0000-0000000000d1')
  || '|' || pg_temp.reminders(:coachR),
  '1|4:30303030-2222-0000-0000-000000000050,30303030-2222-0000-0000-000000000070,30303030-2222-0000-0000-000000000050,30303030-2222-0000-0000-0000000000d1');

-- Who can see and do what ----------------------------------------------------------------
set role authenticated;
select pg_temp.expect('the member reads their own reminders',
  pg_temp.as_user(:memberS, 'select count(*)::text from public.notifications where kind = ''session-reminder'''), '3');
select pg_temp.expect('...and only theirs',
  pg_temp.as_user(:memberU, 'select count(*)::text from public.notifications where kind = ''session-reminder'''), '0');
select pg_temp.expect('nobody runs the job from the app',
  pg_temp.as_user(:coachR, format('select public.queue_session_reminders(%L)::text', :'t0')), 'DENIED(42501)');
select pg_temp.expect('...or reads what it sent',
  pg_temp.as_user(:coachR, 'select count(*)::text from public.session_reminders'), 'DENIED(42501)');
reset role;
select pg_temp.expect('...signed out either',
  has_function_privilege('anon', 'public.queue_session_reminders(timestamptz)', 'execute')::text, 'false');

-- The schedule (pg_cron) -------------------------------------------------------------------
-- Without pg_cron, as on the live project today: nothing is scheduled and nothing fails.
select pg_temp.expect('without pg_cron, nothing is scheduled',
  public.schedule_session_reminders()::text, 'false');
-- With it: a stand-in for pg_cron's cron.schedule(), recording what it is asked.
create schema cron;
create table cron.asked (job_name text, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$ insert into cron.asked values (job_name, schedule, command); select 1::bigint; $$;
select pg_temp.expect('with pg_cron, the job is scheduled',
  public.schedule_session_reminders()::text, 'true');
select pg_temp.expect('...by name, every five minutes',
  (select string_agg(job_name || ' ' || schedule, ',') from cron.asked), 'session-reminders */5 * * * *');
select pg_temp.expect('...running the reminder job',
  (select string_agg(command, ',') from cron.asked), 'select public.queue_session_reminders()');
drop schema cron cascade;
select pg_temp.expect('the app cannot schedule it',
  has_function_privilege('authenticated', 'public.schedule_session_reminders()', 'execute')::text, 'false');
