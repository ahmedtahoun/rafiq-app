-- 0030: the signup consent. Member P agrees for themselves; Q is a stranger.
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

\set memberP '''34343434-3400-0000-0000-000000000001'''
\set memberQ '''34343434-3400-0000-0000-000000000002'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:memberP, 'memberP34@x.com', '{"role":"client","full_name":"Member Perihan"}'),
  (:memberQ, 'memberQ34@x.com', '{"role":"client","full_name":"Member Qadri"}');

set role authenticated;

select pg_temp.expect('an unticked transfer box can''t be stored',
  pg_temp.as_user(:memberP, format('insert into public.signup_consents (profile_id, version, transfer_abroad, age_18_plus) values (%L, ''v'', false, true) returning 1', :memberP)), 'DENIED(23514)');
select pg_temp.expect('...nor an unticked age box',
  pg_temp.as_user(:memberP, format('insert into public.signup_consents (profile_id, version, transfer_abroad, age_18_plus) values (%L, ''v'', true, false) returning 1', :memberP)), 'DENIED(23514)');
select pg_temp.expect('nobody agrees for someone else',
  pg_temp.as_user(:memberQ, format('insert into public.signup_consents (profile_id, version, transfer_abroad, age_18_plus) values (%L, ''v'', true, true) returning 1', :memberP)), 'DENIED(42501)');
select pg_temp.expect('the time is the database''s, not the app''s',
  pg_temp.as_user(:memberP, format('insert into public.signup_consents (profile_id, version, transfer_abroad, age_18_plus, agreed_at) values (%L, ''v'', true, true, now() - interval ''1 year'') returning 1', :memberP)), 'DENIED(42501)');
select pg_temp.expect('the member agrees',
  pg_temp.as_user(:memberP, format('insert into public.signup_consents (profile_id, version, transfer_abroad, age_18_plus) values (%L, ''2026-10-13'', true, true) returning (agreed_at between now() - interval ''1 minute'' and now())::text', :memberP)), 'true');
select pg_temp.expect('...once: a second row is a conflict',
  pg_temp.as_user(:memberP, format('insert into public.signup_consents (profile_id, version, transfer_abroad, age_18_plus) values (%L, ''2026-10-13'', true, true) returning 1', :memberP)), 'DENIED(23505)');
select pg_temp.expect('the record can''t be changed',
  pg_temp.as_user(:memberP, 'update public.signup_consents set version = ''other'' returning 1'), 'DENIED(42501)');
select pg_temp.expect('...or deleted',
  pg_temp.as_user(:memberP, 'delete from public.signup_consents returning 1'), 'DENIED(42501)');
select pg_temp.expect('each reads only their own',
  pg_temp.as_user(:memberP, 'select count(*)::text from public.signup_consents') || '/' ||
  pg_temp.as_user(:memberQ, 'select count(*)::text from public.signup_consents'), '1/0');

reset role;
