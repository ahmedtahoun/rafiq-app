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

set role authenticated;

select 'coachA sees own clients (expect 2)        : ' || pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'select count(*)::text from public.clients');
select 'coachA sees coachB clients (expect 0)     : ' || pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'select count(*)::text from public.clients where coach_id = ''22222222-2222-2222-2222-222222222222''');
select 'memberM sees own roster row (expect 1)    : ' || pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'select count(*)::text from public.clients');
select 'memberN sees coachA rows (expect 0)       : ' || pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'select count(*)::text from public.clients where coach_id = ''11111111-1111-1111-1111-111111111111''');
select 'memberM sees own tasks (expect 1)         : ' || pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'select count(*)::text from public.tasks');
select 'memberN sees M tasks (expect 0)           : ' || pg_temp.as_user('44444444-4444-4444-4444-444444444444', 'select count(*)::text from public.tasks');
select 'memberM sees own payments (expect 1)      : ' || pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'select count(*)::text from public.payments');
select 'memberM inserts payment (expect DENIED/0) : ' || pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'with i as (insert into public.payments (client_id, amount) values (''aaaaaaaa-0000-0000-0000-000000000001'', 9) returning 1) select count(*)::text from i');
select 'coachA inserts payment (expect 1)         : ' || pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'with i as (insert into public.payments (client_id, amount) values (''aaaaaaaa-0000-0000-0000-000000000001'', 9) returning 1) select count(*)::text from i');
select 'coachB steals A client (expect DENIED/0)  : ' || pg_temp.as_user('22222222-2222-2222-2222-222222222222', 'with u as (update public.clients set full_name=''hacked'' where id=''aaaaaaaa-0000-0000-0000-000000000001'' returning 1) select count(*)::text from u');
select 'memberM posts AS coach (expect DENIED/0)  : ' || pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'with i as (insert into public.messages (client_id, sender_role, sender_id, body) values (''aaaaaaaa-0000-0000-0000-000000000001'',''coach'',''33333333-3333-3333-3333-333333333333'',''fake'') returning 1) select count(*)::text from i');
select 'memberM posts as self (expect 1)          : ' || pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'with i as (insert into public.messages (client_id, sender_role, sender_id, body) values (''aaaaaaaa-0000-0000-0000-000000000001'',''client'',''33333333-3333-3333-3333-333333333333'',''hi'') returning 1) select count(*)::text from i');
select 'memberM rates coach (expect 1)            : ' || pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'with i as (insert into public.ratings (client_id, coach_id, rating) values (''aaaaaaaa-0000-0000-0000-000000000001'',''11111111-1111-1111-1111-111111111111'',5) returning 1) select count(*)::text from i');
select 'coachA rates self (expect DENIED/0)       : ' || pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'with i as (insert into public.ratings (client_id, coach_id, rating) values (''aaaaaaaa-0000-0000-0000-000000000002'',''11111111-1111-1111-1111-111111111111'',5) returning 1) select count(*)::text from i');
select 'anon-ish (no uid) sees clients (expect 0) : ' || pg_temp.as_user('', 'select count(*)::text from public.clients');
