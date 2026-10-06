-- 0027: a coach on an active Elite Pro plan is featured in the directory,
-- and the directory says so with one boolean and nothing else. Nobody is on
-- Elite Pro yet, so the coaches here are fixtures, one per plan: E (Elite
-- Pro), H (Elite Pro granted by hand, no renewal date), L (Elite Pro,
-- lapsed), P (Pro Plus), F (free). Member M is nobody's member.
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

\set coachE  '''32323232-0000-0000-0000-00000000000e'''
\set coachH  '''32323232-0000-0000-0000-000000000011'''
\set coachL  '''32323232-0000-0000-0000-000000000012'''
\set coachP  '''32323232-0000-0000-0000-000000000013'''
\set coachF  '''32323232-0000-0000-0000-00000000000f'''
\set memberM '''32323232-0000-0000-0000-000000000001'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachE,  'coachE32@x.com',  '{"role":"coach","full_name":"Coach Eman"}'),
  (:coachH,  'coachH32@x.com',  '{"role":"coach","full_name":"Coach Hoda"}'),
  (:coachL,  'coachL32@x.com',  '{"role":"coach","full_name":"Coach Laila"}'),
  (:coachP,  'coachP32@x.com',  '{"role":"coach","full_name":"Coach Passant"}'),
  (:coachF,  'coachF32@x.com',  '{"role":"coach","full_name":"Coach Farida"}'),
  (:memberM, 'memberM32@x.com', '{"role":"client","full_name":"Member Mona"}');
insert into public.coach_profiles (profile_id, title, signup_completed_at) values
  (:coachE, 'Life coaching', now()), (:coachH, 'Life coaching', now()), (:coachL, 'Life coaching', now()),
  (:coachP, 'Career coaching', now()), (:coachF, 'Career coaching', now());
insert into public.subscriptions (coach_id, tier, renews_at) values
  (:coachE, 'elite_pro', now() + interval '30 days'),
  (:coachH, 'elite_pro', null),
  (:coachL, 'elite_pro', now() - interval '1 day'),
  (:coachP, 'pro',       now() + interval '30 days');

-- Whether `who` sees coach `c` featured in the directory ('none': not listed).
create or replace function pg_temp.featured(who text, c text) returns text
language sql as $$
  select pg_temp.as_user(who, format(
    'select coalesce((select featured::text from public.coach_directory where coach_id = %L), ''none'')', c));
$$;

set role authenticated;

-- Who is featured ----------------------------------------------------------------------------
select pg_temp.expect('Elite Pro is featured',            pg_temp.featured(:memberM, :coachE), 'true');
select pg_temp.expect('...granted by hand, no end date',  pg_temp.featured(:memberM, :coachH), 'true');
select pg_temp.expect('a lapsed Elite Pro is not',        pg_temp.featured(:memberM, :coachL), 'false');
select pg_temp.expect('Pro Plus is not',                  pg_temp.featured(:memberM, :coachP), 'false');
select pg_temp.expect('free is not',                      pg_temp.featured(:memberM, :coachF), 'false');
select pg_temp.expect('the coach sees it on their own row', pg_temp.featured(:coachE, :coachE), 'true');

-- Why the directory checks for itself: from a member's session, coach_plan()
-- can't see anyone else's plan.
select pg_temp.expect('coach_plan() says free to a member',
  pg_temp.as_user(:memberM, format('select public.coach_plan(%L)', :coachE)), 'free');

-- It changes with the plan, with nothing to run -----------------------------------------------
reset role;
update public.subscriptions set renews_at = now() - interval '1 minute' where coach_id = :coachE;
set role authenticated;
select pg_temp.expect('Elite Pro lapsing ends it at once',  pg_temp.featured(:memberM, :coachE), 'false');
reset role;
update public.subscriptions set tier = 'elite_pro', renews_at = now() + interval '1 year' where coach_id = :coachP;
set role authenticated;
select pg_temp.expect('moving up to Elite Pro starts it',   pg_temp.featured(:memberM, :coachP), 'true');

-- The Dashboard's own flag (0005) still features a coach -----------------------------------
reset role;
update public.coach_profiles set featured = true where profile_id = :coachF;
set role authenticated;
select pg_temp.expect('featured by hand, on the free plan', pg_temp.featured(:memberM, :coachF), 'true');

-- What it does not open ----------------------------------------------------------------------
select pg_temp.expect('a member still reads nobody''s plan',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.subscriptions'), '0');
select pg_temp.expect('...nor does another coach',
  pg_temp.as_user(:coachF, format('select count(*)::text from public.subscriptions where coach_id = %L', :coachH)), '0');
select pg_temp.expect('the directory gains no plan column',
  (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
   where table_schema = 'public' and table_name = 'coach_directory'),
  'coach_id,full_name,avatar_photo_url,country,country_flag,title,bio,languages,session_mode,experience_years,certifications,cover_photo_url,verified,featured,from_price,rating_count,rating_avg');
select pg_temp.expect('...and featured is only a boolean',
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'coach_directory' and column_name = 'featured'), 'boolean');
reset role;
update public.coach_profiles set unlisted = true where profile_id = :coachH;
set role authenticated;
select pg_temp.expect('Elite Pro doesn''t list an unlisted coach', pg_temp.featured(:memberM, :coachH), 'none');
reset role;
select pg_temp.expect('signed out, still no directory',
  has_table_privilege('anon', 'public.coach_directory', 'select')::text, 'false');

-- The public page's rating (0026's public_coach_page, replaced here) -------------------------
-- Signed out, anyone with the code reads the page. Below three ratings its
-- average would be one or two members' own scores, so it says nothing.
create or replace function pg_temp.public_rating(code text) returns text
language plpgsql as $$
declare r text;
begin
  set local role anon;
  select coalesce(j->>'rating_count', 'null') || '/' || coalesce(j->>'rating_avg', 'null')
    || '/' || (j ? 'rating_count')::text || (j ? 'rating_avg')::text
    into r from public.public_coach_page(code) j;
  reset role;
  return r;
end;
$$;

update public.coach_profiles set public_page = true, public_code = 'kq32ab' where profile_id = :coachF;
insert into public.clients (id, coach_id, full_name, active) values
  ('32323232-1111-0000-0000-000000000001', :coachF, 'Rater One', true),
  ('32323232-1111-0000-0000-000000000002', :coachF, 'Rater Two', true),
  ('32323232-1111-0000-0000-000000000003', :coachF, 'Rater Three', true);
insert into public.sessions (id, client_id, scheduled_at) values
  ('32323232-2222-0000-0000-000000000001', '32323232-1111-0000-0000-000000000001', now() - interval '3 days'),
  ('32323232-2222-0000-0000-000000000002', '32323232-1111-0000-0000-000000000002', now() - interval '2 days'),
  ('32323232-2222-0000-0000-000000000003', '32323232-1111-0000-0000-000000000003', now() - interval '1 day');
insert into public.ratings (client_id, coach_id, session_id, rating) values
  ('32323232-1111-0000-0000-000000000001', :coachF, '32323232-2222-0000-0000-000000000001', 2);
select pg_temp.expect('one rating: the public page gives no score',
  pg_temp.public_rating('kq32ab'), 'null/null/truetrue');
insert into public.ratings (client_id, coach_id, session_id, rating) values
  ('32323232-1111-0000-0000-000000000002', :coachF, '32323232-2222-0000-0000-000000000002', 4);
select pg_temp.expect('...two: still none, and no count',
  pg_temp.public_rating('kq32ab'), 'null/null/truetrue');
insert into public.ratings (client_id, coach_id, session_id, rating) values
  ('32323232-1111-0000-0000-000000000003', :coachF, '32323232-2222-0000-0000-000000000003', 5);
select pg_temp.expect('...three: the count and the average',
  pg_temp.public_rating('kq32ab'), '3/3.67/truetrue');
select pg_temp.expect('...and still anyone may call it',
  has_function_privilege('anon', 'public.public_coach_page(text)', 'execute')::text, 'true');
