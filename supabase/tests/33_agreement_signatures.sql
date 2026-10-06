-- 0028: the coaching agreement, signed for real. Coach C sends to member S
-- (an account) and can't send to walk-in W (none). Member T is a stranger.
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

\set coachC  '''33333333-3300-0000-0000-00000000000c'''
\set memberS '''33333333-3300-0000-0000-000000000001'''
\set memberT '''33333333-3300-0000-0000-000000000002'''
\set clientS '''33333333-3311-0000-0000-000000000001'''
\set clientW '''33333333-3311-0000-0000-000000000002'''
\set sha     '''9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachC,  'coachC33@x.com',  '{"role":"coach","full_name":"Coach Camilia"}'),
  (:memberS, 'memberS33@x.com', '{"role":"client","full_name":"Member Salma"}'),
  (:memberT, 'memberT33@x.com', '{"role":"client","full_name":"Member Taha"}');
insert into public.coach_profiles (profile_id, title, signup_completed_at) values (:coachC, 'Life coaching', now());
insert into public.clients (id, coach_id, member_id, full_name, active) values
  (:clientS, :coachC, :memberS, 'Member Salma', true),
  (:clientW, :coachC, null,     'Walk-in Wael', true);

-- How a signature reads: status|category|lang|signer is the member|hash|when is now.
create or replace function pg_temp.record(c text) returns text
language plpgsql as $$
begin
  return (select a.status || '|' || coalesce(a.category, '-') || '|' || coalesce(a.lang, '-')
      || '|' || coalesce((a.signed_by = '33333333-3300-0000-0000-000000000001')::text, '-')
      || '|' || coalesce(left(a.text_sha256, 8), '-')
      || '|' || coalesce((a.signed_at between now() - interval '1 minute' and now())::text, '-')
  from public.agreements a where a.client_id = c::uuid);
end;
$$;

set role authenticated;

-- The coach sends ---------------------------------------------------------------------------
select pg_temp.expect('the coach can''t send it pre-signed',
  pg_temp.as_user(:coachC, format('insert into public.agreements (client_id, status, signed_at) values (%L, ''signed'', now()) returning 1', :clientS)), 'DENIED(42501)');
select pg_temp.expect('...or with a signature filled in',
  pg_temp.as_user(:coachC, format('insert into public.agreements (client_id, lang) values (%L, ''en'') returning 1', :clientS)), 'DENIED(42501)');
select pg_temp.expect('...or to a walk-in with no account',
  pg_temp.as_user(:coachC, format('insert into public.agreements (client_id) values (%L) returning 1', :clientW)), 'DENIED(42501)');
select pg_temp.expect('the coach sends it',
  pg_temp.as_user(:coachC, format('insert into public.agreements (client_id) values (%L) returning status::text', :clientS)), 'sent');
select pg_temp.expect('...and both sides read it as sent',
  pg_temp.as_user(:coachC, 'select status::text from public.agreements') || '/' ||
  pg_temp.as_user(:memberS, 'select status::text from public.agreements'), 'sent/sent');

-- Nobody signs for the member ---------------------------------------------------------------
select pg_temp.expect('the coach can''t mark it signed',
  pg_temp.as_user(:coachC, format('update public.agreements set status = ''signed'', signed_at = now() where client_id = %L returning 1', :clientS)), 'DENIED(42501)');
select pg_temp.expect('...nor sign it through the function',
  pg_temp.as_user(:coachC, format('select public.sign_agreement(%L, ''general'', %L, ''en'')::text', :clientS, :sha)), 'DENIED(42501)');
select pg_temp.expect('a stranger can''t sign it',
  pg_temp.as_user(:memberT, format('select public.sign_agreement(%L, ''general'', %L, ''en'')::text', :clientS, :sha)), 'DENIED(42501)');
select pg_temp.expect('...or read it',
  pg_temp.as_user(:memberT, 'select count(*)::text from public.agreements'), '0');
select pg_temp.expect('the member can''t sign by writing the row',
  pg_temp.as_user(:memberS, format('update public.agreements set status = ''signed'', signed_at = now() where client_id = %L returning 1', :clientS)), 'DENIED(42501)');

-- A signature is the whole record, or nothing -----------------------------------------------
select pg_temp.expect('no signature without the text''s hash',
  pg_temp.as_user(:memberS, format('select public.sign_agreement(%L, ''emotional'', ''not-a-hash'', ''ar'')::text', :clientS)), 'DENIED(23514)');
select pg_temp.expect('...or in a language the app doesn''t have',
  pg_temp.as_user(:memberS, format('select public.sign_agreement(%L, ''emotional'', %L, ''fr'')::text', :clientS, :sha)), 'DENIED(23514)');
select pg_temp.expect('...or for an agreement that doesn''t exist',
  pg_temp.as_user(:memberS, format('select public.sign_agreement(%L, ''legal'', %L, ''ar'')::text', :clientS, :sha)), 'DENIED(23514)');
select pg_temp.expect('...and the row is still only sent',
  pg_temp.as_user(:memberS, format('select status::text from public.agreements where client_id = %L', :clientS)), 'sent');

-- The member signs ----------------------------------------------------------------------------
select pg_temp.expect('the member signs, in Arabic',
  pg_temp.as_user(:memberS, format('select (public.sign_agreement(%L, ''emotional'', %L, ''ar'') is not null)::text', :clientS, upper(:sha))), 'true');
reset role;
select pg_temp.expect('it records what, in which language, who, when',
  pg_temp.record(:clientS), 'signed|emotional|ar|true|9f86d081|true');
set role authenticated;
select pg_temp.expect('the coach sees it signed',
  pg_temp.as_user(:coachC, format('select status::text || ''/'' || lang from public.agreements where client_id = %L', :clientS)), 'signed/ar');
select pg_temp.expect('it can''t be signed again',
  pg_temp.as_user(:memberS, format('select public.sign_agreement(%L, ''general'', %L, ''en'')::text', :clientS, :sha)), 'DENIED(P0002)');
select pg_temp.expect('nobody changes it after: not the member',
  pg_temp.as_user(:memberS, format('update public.agreements set lang = ''en'' where client_id = %L returning 1', :clientS)), 'DENIED(42501)');
select pg_temp.expect('...not the coach',
  pg_temp.as_user(:coachC, format('update public.agreements set lang = ''en'' where client_id = %L returning 1', :clientS)), 'DENIED(42501)');
select pg_temp.expect('...and the coach can''t delete it',
  pg_temp.as_user(:coachC, format('delete from public.agreements where client_id = %L returning 1', :clientS)), 'DENIED(42501)');
reset role;

-- The table holds it too, not only the function ----------------------------------------------
select pg_temp.expect('signed without the evidence is refused',
  pg_temp.as_user(:coachC, format('update public.agreements set text_sha256 = null where client_id = %L returning 1', :clientS)), 'DENIED(23514)');
select pg_temp.expect('signed out, no one signs',
  has_function_privilege('anon', 'public.sign_agreement(uuid, text, text, text)', 'execute')::text, 'false');
