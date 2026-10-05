-- 0022: an unlisted coach is out of coach_directory and coach_reviews for
-- everyone but the coach and their own members, and only the dashboard
-- sets it. Coach U (onboarded, rated) is new here, with member O on their
-- roster, member Q archived on it, and member S a stranger.
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

\set coachU  '''27272727-0000-0000-0000-00000000000c'''
\set memberO '''27272727-0000-0000-0000-000000000001'''
\set memberQ '''27272727-0000-0000-0000-000000000002'''
\set memberS '''27272727-0000-0000-0000-000000000003'''
\set coachV  '''27272727-0000-0000-0000-00000000000d'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachU,  'coachU@x.com',  '{"role":"coach","full_name":"Coach Usama"}'),
  (:memberO, 'memberO@x.com', '{"role":"client","full_name":"Member Omnia"}'),
  (:memberQ, 'memberQ@x.com', '{"role":"client","full_name":"Member Qadri"}'),
  (:memberS, 'memberS@x.com', '{"role":"client","full_name":"Member Salwa"}'),
  (:coachV,  'coachV@x.com',  '{"role":"coach","full_name":"Coach Vera"}');
insert into public.coach_profiles (profile_id, title, signup_completed_at) values
  (:coachU, 'Life coaching', now()), (:coachV, 'Career coaching', now());
insert into public.clients (id, coach_id, member_id, full_name, active) values
  ('27272727-1111-0000-0000-000000000001', :coachU, :memberO, 'Member Omnia', true),
  ('27272727-1111-0000-0000-000000000002', :coachU, :memberQ, 'Member Qadri', false);
insert into public.sessions (id, client_id, scheduled_at) values
  ('27272727-2222-0000-0000-000000000001', '27272727-1111-0000-0000-000000000001', now() - interval '2 days');
insert into public.ratings (client_id, coach_id, session_id, rating, comment)
values ('27272727-1111-0000-0000-000000000001', :coachU, '27272727-2222-0000-0000-000000000001', 5, 'Very clear.');

-- How many rows of coach U each person sees: directory/reviews.
create or replace function pg_temp.seen_by(who text) returns text
language sql as $$
  select pg_temp.as_user(who,
    'select (select count(*) from public.coach_directory where coach_id = ''27272727-0000-0000-0000-00000000000c'')::text'
    || ' || ''/'' || (select count(*) from public.coach_reviews where coach_id = ''27272727-0000-0000-0000-00000000000c'')::text');
$$;

set role authenticated;

-- Listed by default --------------------------------------------------------------------------
select pg_temp.expect('a coach starts listed',
  (select (not unlisted)::text from public.coach_profiles where profile_id = :coachU), 'true');
select pg_temp.expect('...a stranger sees them and their review',
  pg_temp.seen_by(:memberS), '1/1');

-- Unlisted ----------------------------------------------------------------------------------------
reset role;
update public.coach_profiles set unlisted = true where profile_id = :coachU;
set role authenticated;
select pg_temp.expect('unlisted: a stranger sees neither',
  pg_temp.seen_by(:memberS), '0/0');
select pg_temp.expect('...their member still sees both',
  pg_temp.seen_by(:memberO), '1/1');
select pg_temp.expect('...so does an archived member',
  pg_temp.seen_by(:memberQ), '1/1');
select pg_temp.expect('...and the coach themselves',
  pg_temp.seen_by(:coachU), '1/1');
select pg_temp.expect('another coach sees neither',
  pg_temp.seen_by(:coachV), '0/0');
select pg_temp.expect('other coaches stay listed for the stranger',
  pg_temp.as_user(:memberS, format('select count(*)::text from public.coach_directory where coach_id = %L', :coachV)), '1');
select pg_temp.expect('the directory keeps its columns',
  pg_temp.as_user(:memberO, format('select rating_count::text || '':'' || full_name from public.coach_directory where coach_id = %L', :coachU)),
  '1:Coach Usama');

-- Only the dashboard sets it ---------------------------------------------------------------------
select pg_temp.expect('the coach cannot list themselves again',
  pg_temp.as_user(:coachU, format('update public.coach_profiles set unlisted = false where profile_id = %L returning 1', :coachU)), 'DENIED(42501)');
select pg_temp.expect('...nor another coach unlist themselves',
  pg_temp.as_user(:coachV, format('update public.coach_profiles set unlisted = true where profile_id = %L returning 1', :coachV)), 'DENIED(42501)');
select pg_temp.expect('...but still edits their profile',
  pg_temp.as_user(:coachU, format('with u as (update public.coach_profiles set bio = ''Still here.'' where profile_id = %L returning 1) select count(*)::text from u', :coachU)), '1');
reset role;
select pg_temp.expect('...and stays unlisted',
  (select unlisted::text from public.coach_profiles where profile_id = :coachU), 'true');

-- Listed again -----------------------------------------------------------------------------------
update public.coach_profiles set unlisted = false where profile_id = :coachU;
set role authenticated;
select pg_temp.expect('listed again: the stranger sees both',
  pg_temp.seen_by(:memberS), '1/1');
reset role;
