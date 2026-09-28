-- Profile and onboarding (SUPABASE-MIGRATION-PLAN.md step 2).
--
-- Two jobs. First, 0006's member_profiles: who may read and write it. Second,
-- every write src/lib/profileData.ts makes to the existing tables, issued
-- here exactly as PostgREST issues it, as the authenticated role — so a
-- column the app writes that the grants refuse fails here, not on a phone.
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
\set coachB '''22222222-2222-2222-2222-222222222222'''
\set coachC '''55555555-5555-5555-5555-555555555555'''
\set memberM '''33333333-3333-3333-3333-333333333333'''
\set memberN '''44444444-4444-4444-4444-444444444444'''

-- A coach who has signed in but not onboarded: a profiles row (from
-- handle_new_user) and no coach_profiles row yet. The fixtures' coaches
-- already have one, so they can't exercise the first-insert path.
insert into auth.users (id, email, raw_user_meta_data) values
  (:coachC, 'coachC@x.com', '{"role":"coach","full_name":""}');

set role authenticated;

-- member_profiles -------------------------------------------------------------
select pg_temp.expect('member creates own member profile',
  pg_temp.as_user(:memberM, 'with i as (insert into public.member_profiles (profile_id, goal, focus, signup_completed_at) values ('
    || quote_literal(:memberM) || ', ''Sleep better'', ''Wellness'', now()) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('member cannot create one for another',
  pg_temp.as_user(:memberN, 'with i as (insert into public.member_profiles (profile_id, goal) values ('
    || quote_literal(:memberM) || ', ''x'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('member updates own goal',
  pg_temp.as_user(:memberM, 'with u as (update public.member_profiles set goal = ''Sleep 8 hours'' where profile_id = '
    || quote_literal(:memberM) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('member cannot update another member',
  pg_temp.as_user(:memberN, 'with u as (update public.member_profiles set goal = ''x'' where profile_id = '
    || quote_literal(:memberM) || ' returning 1) select count(*)::text from u'), '0');
select pg_temp.expect('profile_id cannot be re-pointed',
  pg_temp.as_user(:memberM, 'with u as (update public.member_profiles set profile_id = ' || quote_literal(:memberN)
    || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('member reads own member profile',
  pg_temp.as_user(:memberM, 'select goal from public.member_profiles where profile_id = ' || quote_literal(:memberM)), 'Sleep 8 hours');
select pg_temp.expect('their coach reads the member goal',
  pg_temp.as_user(:coachA, 'select goal from public.member_profiles where profile_id = ' || quote_literal(:memberM)), 'Sleep 8 hours');
select pg_temp.expect('another coach cannot',
  pg_temp.as_user(:coachB, 'select count(*)::text from public.member_profiles where profile_id = ' || quote_literal(:memberM)), '0');
select pg_temp.expect('another member cannot',
  pg_temp.as_user(:memberN, 'select count(*)::text from public.member_profiles where profile_id = ' || quote_literal(:memberM)), '0');

-- profiles: the columns profileData.ts writes, and the one it must not -------
select pg_temp.expect('coach saves own contact fields',
  pg_temp.as_user(:coachC, 'with u as (update public.profiles set full_name = ''Coach C'', phone = ''10 1'', country_code = ''+20'','
    || ' email = ''c@x.com'', city = ''Cairo'', country = ''Egypt'', country_flag = ''EG'', avatar_photo_url = '
    || quote_literal(:coachC || '/avatar') || ' where id = ' || quote_literal(:coachC) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('member saves own contact fields',
  pg_temp.as_user(:memberM, 'with u as (update public.profiles set phone = ''11 2'', country_code = ''+20'', email = ''m@x.com'','
    || ' city = ''Giza'' where id = ' || quote_literal(:memberM) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('account_status stays Rafiq''s',
  pg_temp.as_user(:coachC, 'with u as (update public.profiles set account_status = ''active'' where id = '
    || quote_literal(:coachC) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');

-- coach_profiles: first insert at signup, then updates -----------------------
-- The app inserts, then updates: a PostgREST upsert names profile_id in its
-- ON CONFLICT ... SET list, and profile_id has no UPDATE grant.
select pg_temp.expect('an upsert naming profile_id is refused',
  pg_temp.as_user(:coachA, 'with i as (insert into public.coach_profiles (profile_id, title) values (' || quote_literal(:coachA)
    || ', ''x'') on conflict (profile_id) do update set profile_id = excluded.profile_id, title = excluded.title returning 1)'
    || ' select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('first signup inserts coach profile',
  pg_temp.as_user(:coachC, 'with i as (insert into public.coach_profiles (profile_id, title, signup_completed_at) values ('
    || quote_literal(:coachC) || ', ''Life coaching · Nutrition'', now()) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach cannot insert for another',
  pg_temp.as_user(:coachC, 'with i as (insert into public.coach_profiles (profile_id, title) values ('
    || quote_literal(:memberN) || ', ''x'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('Edit Profile saves every field',
  pg_temp.as_user(:coachC, 'with u as (update public.coach_profiles set title = ''Life coaching'', cert = ''ICF'', bio = ''Hi'','
    || ' languages = ''{Arabic,English}'', session_mode = ''online'', experience_years = 6, certifications = ''{ICF}'','
    || ' cover_photo_url = ' || quote_literal(:coachC || '/cover') || ' where profile_id = ' || quote_literal(:coachC)
    || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('verification_status is not writable',
  pg_temp.as_user(:coachC, 'with u as (update public.coach_profiles set verification_status = ''verified'' where profile_id = '
    || quote_literal(:coachC) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('featured is not writable',
  pg_temp.as_user(:coachC, 'with u as (update public.coach_profiles set featured = true where profile_id = '
    || quote_literal(:coachC) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');

-- Profile's verification row reads the real column ---------------------------
select pg_temp.expect('fresh coach reads unverified',
  pg_temp.as_user(:coachC, 'select verification_status::text from public.coach_profiles where profile_id = ' || quote_literal(:coachC)), 'unverified');
select pg_temp.expect('filing a request',
  pg_temp.as_user(:coachC, 'with i as (insert into public.verification_requests (coach_id, note) values ('
    || quote_literal(:coachC) || ', '''') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('then reads pending, via the trigger',
  pg_temp.as_user(:coachC, 'select verification_status::text from public.coach_profiles where profile_id = ' || quote_literal(:coachC)), 'pending');

reset role;
set role anon;
select pg_temp.expect('signed-out cannot read member profiles',
  pg_temp.as_user('', 'select count(*)::text from public.member_profiles'), 'DENIED(42501)');
reset role;
