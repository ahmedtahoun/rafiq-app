-- The member side's own reads and writes (src/lib/memberData.ts and the
-- report ClientCoach files through adminQueues.ts), against the real
-- policies and grants, as the authenticated role. Member M is on coach A's
-- roster (clientM); member N is put on coach C's below (clientN — coach B's
-- was deleted in 03_constraints). Every refusal has an allowed case beside it.
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
\set clientN '''cccccccc-0000-0000-0000-000000000012'''

-- As the owner (service_role's stand-in): member N on coach C's roster, and a
-- task on each relationship for the checks below.
insert into public.clients (id, coach_id, member_id, full_name) values (:clientN, :coachC, :memberN, 'Member N');
insert into public.tasks (client_id, title) values (:clientM, 'Member M task'), (:clientN, 'Member N task');

set role authenticated;

-- Reads: their own relationships, and who their coach is ------------------------
select pg_temp.expect('member reads own roster rows only',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.clients where member_id = ' || quote_literal(:memberM)), '1');
select pg_temp.expect('...never another member''s',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.clients where id = ' || quote_literal(:clientN)), '0');
select pg_temp.expect('member finds their coach in the directory',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.coach_directory where coach_id = ' || quote_literal(:coachA)), '1');
select pg_temp.expect('member reads own package and sessions',
  pg_temp.as_user(:memberM, 'select ((select count(*) from public.sessions where client_id = ' || quote_literal(:clientM) || ') > 0)::text'), 'true');

-- Tasks: done / not done on their own, nothing else ----------------------------
select pg_temp.expect('member ticks own task (done, done_at)',
  pg_temp.as_user(:memberM, 'with u as (update public.tasks set done = true, done_at = now() where title = ''Member M task'' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('member cannot tick another''s task',
  pg_temp.as_user(:memberM, 'with u as (update public.tasks set done = true where title = ''Member N task'' returning 1) select count(*)::text from u'), '0');

-- Mood check-ins -----------------------------------------------------------------
select pg_temp.expect('member checks in on own relationship',
  pg_temp.as_user(:memberM, 'with i as (insert into public.mood_checkins (client_id, mood) values (' || quote_literal(:clientM) || ', ''great'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('...not on someone else''s',
  pg_temp.as_user(:memberM, 'with i as (insert into public.mood_checkins (client_id, mood) values (' || quote_literal(:clientN) || ', ''low'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('the coach reads the check-in',
  pg_temp.as_user(:coachA, 'select (count(*) > 0)::text from public.mood_checkins where client_id = ' || quote_literal(:clientM)), 'true');

-- A report on their coach (ClientCoach, through fileProReport) -------------------
select pg_temp.expect('member reports own coach on own relationship',
  pg_temp.as_user(:memberM, 'with i as (insert into public.pro_reports (reporter_id, coach_id, client_id, reason, details) values (' || quote_literal(:memberM) || ', ' || quote_literal(:coachA) || ', ' || quote_literal(:clientM) || ', ''no_show'', '''') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('...not naming a different coach',
  pg_temp.as_user(:memberM, 'with i as (insert into public.pro_reports (reporter_id, coach_id, client_id, reason, details) values (' || quote_literal(:memberM) || ', ' || quote_literal(:coachC) || ', ' || quote_literal(:clientM) || ', ''no_show'', '''') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('...nor on another member''s relationship',
  pg_temp.as_user(:memberM, 'with i as (insert into public.pro_reports (reporter_id, coach_id, client_id, reason, details) values (' || quote_literal(:memberM) || ', ' || quote_literal(:coachC) || ', ' || quote_literal(:clientN) || ', ''other'', '''') returning 1) select count(*)::text from i'), 'DENIED(42501)');

-- Their own contact details (EditClientProfile) ----------------------------------
select pg_temp.expect('member edits own account',
  pg_temp.as_user(:memberM, 'with u as (update public.profiles set full_name = ''Member M2'', phone = ''10 5550 9999'', country_code = ''+20'' where id = ' || quote_literal(:memberM) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('...not another''s',
  pg_temp.as_user(:memberM, 'with u as (update public.profiles set full_name = ''x'' where id = ' || quote_literal(:memberN) || ' returning 1) select count(*)::text from u'), '0');
select pg_temp.expect('...and never the coach''s roster row',
  pg_temp.as_user(:memberM, 'with u as (update public.clients set full_name = ''x'' where id = ' || quote_literal(:clientM) || ' returning 1) select count(*)::text from u'), '0');

reset role;
