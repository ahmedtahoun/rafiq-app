-- 0026: a coach's public page, if they want one. Coaches V (finished
-- signup) and X (didn't), and member Y, are new here.
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

-- What a signed-out visitor gets for `code`: 'none', or the name.
create or replace function pg_temp.page(code text) returns text
language plpgsql as $$
declare r text;
begin
  set local role anon;
  select coalesce(public.public_coach_page(code)->>'full_name', 'none') into r;
  reset role;
  return r;
end;
$$;

\set coachV  '''31313131-0000-0000-0000-00000000000c'''
\set coachX  '''31313131-0000-0000-0000-00000000000d'''
\set memberY '''31313131-0000-0000-0000-000000000001'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachV,  'coachV@x.com',  '{"role":"coach","full_name":"Coach Valeria"}'),
  (:coachX,  'coachX@x.com',  '{"role":"coach","full_name":"Coach Xena"}'),
  (:memberY, 'memberY@x.com', '{"role":"client","full_name":"Member Yara"}');
insert into public.coach_profiles (profile_id, title, bio, languages, experience_years, certifications, signup_completed_at) values
  (:coachV, 'Career coaching', 'Helps people find work they love.', '{Arabic,English}', 6, '{ICF ACC}', now()),
  (:coachX, 'Life coaching', '', '{}', 1, '{}', null);
update public.profiles set phone = '01000000000' where id = :coachV;
insert into public.offerings (coach_id, name, price, currency, active) values
  (:coachV, 'Intro call', 0, 'EGP', true),
  (:coachV, 'Deep dive', 600, 'EGP', true),
  (:coachV, 'Package', 2400, 'EGP', true),
  (:coachV, 'Old', 100, 'EGP', false);

-- Off until the coach turns it on -------------------------------------------------------
select pg_temp.expect('a new coach has no public page',
  (select public_page::text || '|' || coalesce(public_code, 'no code') from public.coach_profiles where profile_id = :coachV),
  'false|no code');

set role authenticated;
select pg_temp.as_user(:coachV, 'select public.set_public_page(true)') as codev \gset
reset role;
select pg_temp.expect('turning it on makes a six-character code',
  (:'codev' ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{6}$')::text, 'true');
select pg_temp.expect('...and anyone, signed out, can read the page',
  pg_temp.page(:'codev'), 'Coach Valeria');
select pg_temp.expect('...however the code is typed',
  pg_temp.page('  ' || upper(:'codev') || ' '), 'Coach Valeria');

-- Only what a public page may show ----------------------------------------------------------
select pg_temp.expect('what it shows, and nothing else',
  (select string_agg(k, ',' order by k) from jsonb_object_keys(public.public_coach_page(:'codev')) k),
  'bio,certifications,coach_id,currency,experience_years,from_price,full_name,languages,rating_avg,rating_count,session_mode,title,verified');
select pg_temp.expect('...the lowest paid, active price',
  (select (j->>'from_price') || ' ' || (j->>'currency') || '|' || (j->>'languages') || '|' || (j->>'verified')
   from public.public_coach_page(:'codev') j),
  '600.00 EGP|["Arabic", "English"]|false');
select pg_temp.expect('...never a phone or an email',
  (public.public_coach_page(:'codev')::text ~* '01000000000|@x\.com')::text, 'false');

-- Off, on again, and the same code -------------------------------------------------------
set role authenticated;
select pg_temp.expect('the coach turns it off',
  pg_temp.as_user(:coachV, 'select public.set_public_page(false)'), :'codev');
reset role;
select pg_temp.expect('...and the page is gone',
  pg_temp.page(:'codev'), 'none');
set role authenticated;
select pg_temp.expect('on again: the same code, so old links work',
  pg_temp.as_user(:coachV, 'select public.set_public_page(true)'), :'codev');
reset role;
select pg_temp.expect('...and the page is back', pg_temp.page(:'codev'), 'Coach Valeria');

-- Not available, all the same way ------------------------------------------------------------
select pg_temp.expect('a code nobody has',
  pg_temp.page('zzzzzz') || '|' || pg_temp.page('') || '|' || pg_temp.page(null), 'none|none|none');
update public.coach_profiles set unlisted = true where profile_id = :coachV;
select pg_temp.expect('an unlisted coach has no public page',
  pg_temp.page(:'codev'), 'none');
update public.coach_profiles set unlisted = false where profile_id = :coachV;
update public.profiles set account_status = 'suspended' where id = :coachV;
select pg_temp.expect('...nor a suspended one',
  pg_temp.page(:'codev'), 'none');
update public.profiles set account_status = 'active' where id = :coachV;
set role authenticated;
select pg_temp.as_user(:coachX, 'select public.set_public_page(true)') as codex \gset
reset role;
select pg_temp.expect('...nor one who hasn''t finished signing up',
  pg_temp.page(:'codex'), 'none');
select pg_temp.expect('two coaches, two codes',
  (:'codex' <> :'codev')::text, 'true');

-- Who can change it ----------------------------------------------------------------------
set role authenticated;
select pg_temp.expect('a member has no page to turn on',
  pg_temp.as_user(:memberY, 'select public.set_public_page(true)'), 'DENIED(42501)');
select pg_temp.expect('a coach can''t set the flag directly',
  pg_temp.as_user(:coachV, format('update public.coach_profiles set public_page = false where profile_id = %L returning 1', :coachV)),
  'DENIED(42501)');
select pg_temp.expect('...or choose their own code',
  pg_temp.as_user(:coachV, format('update public.coach_profiles set public_code = ''vanity'' where profile_id = %L returning 1', :coachV)),
  'DENIED(42501)');
reset role;
set role anon;
select pg_temp.expect('signed out, nothing is turned on',
  pg_temp.as_user(:coachV, 'select public.set_public_page(false)'), 'DENIED(42501)');
reset role;
select pg_temp.expect('...and V''s page is still on',
  pg_temp.page(:'codev'), 'Coach Valeria');
select pg_temp.expect('codes are made only by the server',
  has_function_privilege('authenticated', 'public.new_public_code()', 'execute')::text
  || '/' || has_function_privilege('anon', 'public.new_public_code()', 'execute')::text, 'false/false');
