-- 0020: where a relationship and a request came from — set by the database
-- from who made the first move, whatever the app sends, and fixed after.
-- Coach O is new here; member D finds them as a stranger (marketplace),
-- member E is the coach's walk-in who claims an invite (coach_invited).
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

-- A request as the app sends it, plus an origin the app has no business
-- choosing. Returns the origin stored.
create or replace function pg_temp.ask(member text, coach text, start_at timestamptz, claimed text) returns text
language sql as $$
  select pg_temp.as_user(member, format(
    'with i as (insert into public.session_requests (member_id, coach_id, requested_start, price, status, origin)'
    || ' values (%L, %L, %L, 0, ''pending'', %L) returning origin) select origin::text from i',
    member, coach, start_at, claimed));
$$;

\set coachO  '''20202020-0000-0000-0000-000000000001'''
\set memberD '''20202020-0000-0000-0000-00000000000d'''
\set memberE '''20202020-0000-0000-0000-00000000000e'''
\set walkE   '''20202020-1111-0000-0000-00000000000e'''

select date_trunc('hour', now()) + interval '50 days' as t1 \gset
select date_trunc('hour', now()) + interval '51 days' as t2 \gset
select date_trunc('hour', now()) + interval '52 days' as t3 \gset

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachO,  'coachO@x.com',  '{"role":"coach","full_name":"Coach Omar"}'),
  (:memberD, 'memberD@x.com', '{"role":"client","full_name":"Member Dina"}'),
  (:memberE, 'memberE@x.com', '{"role":"client","full_name":"Member Ezz"}');
insert into public.coach_profiles (profile_id, title) values (:coachO, 'Free diving coaching');

set role authenticated;

-- The coach's own client ---------------------------------------------------------------
select pg_temp.expect('a walk-in the coach adds is coach_invited',
  pg_temp.as_user(:coachO, format(
    'with i as (insert into public.clients (id, coach_id, full_name, origin) values (%L, %L, ''Walk-in Ezz'', ''marketplace'')'
    || ' returning origin) select origin::text from i', :walkE, :coachO)), 'coach_invited');
select pg_temp.expect('...and the coach cannot relabel it',
  pg_temp.as_user(:coachO, format(
    'with u as (update public.clients set origin = ''marketplace'' where id = %L returning 1) select count(*)::text from u', :walkE)),
  'DENIED(42501)');
select pg_temp.as_user(:coachO, format('select public.create_client_invite(%L) ->> ''code''', :walkE)) as code_e \gset
select pg_temp.expect('E claims the coach''s invite',
  pg_temp.as_user(:memberE, format('select public.claim_client_invite(%L) ->> ''client_id''', :'code_e')),
  trim(both '''' from :'walkE'));
select pg_temp.expect('...and the row is still coach_invited',
  pg_temp.as_user(:memberE, format('select origin::text from public.clients where id = %L', :walkE)), 'coach_invited');
select pg_temp.expect('E''s request is coach_invited, whatever is sent',
  pg_temp.ask(:memberE, :coachO, :'t1', 'marketplace'), 'coach_invited');

-- A stranger from Discover ---------------------------------------------------------------
select pg_temp.expect('D, a stranger, asks: marketplace',
  pg_temp.ask(:memberD, :coachO, :'t2', 'coach_invited'), 'marketplace');
select pg_temp.expect('...and D cannot relabel the request',
  pg_temp.as_user(:memberD, format(
    'with u as (update public.session_requests set origin = ''coach_invited'' where member_id = %L returning 1) select count(*)::text from u', :memberD)),
  'DENIED(42501)');
select pg_temp.expect('...nor can the coach',
  pg_temp.as_user(:coachO, format(
    'with u as (update public.session_requests set origin = ''coach_invited'' where member_id = %L returning 1) select count(*)::text from u', :memberD)),
  'DENIED(42501)');
select pg_temp.as_user(:memberD, format(
  'select id::text from public.session_requests where member_id = %L and status = ''pending''', :memberD)) as req_d \gset
select pg_temp.expect('the coach accepts D''s request',
  pg_temp.as_user(:coachO, format(
    'select (public.accept_session_request(%L) is not null)::text', :'req_d')), 'true');
select pg_temp.expect('...D''s roster row is marketplace',
  pg_temp.as_user(:coachO, format(
    'select origin::text from public.clients where coach_id = %L and member_id = %L', :coachO, :memberD)), 'marketplace');
select pg_temp.expect('...and so is D''s next request',
  pg_temp.ask(:memberD, :coachO, :'t3', 'coach_invited'), 'marketplace');

reset role;

-- Rafiq can correct either, outside the app's role.
update public.clients set origin = 'coach_invited' where coach_id = :coachO and member_id = :memberD;
select pg_temp.expect('the owner can correct an origin',
  (select origin::text from public.clients where coach_id = :coachO and member_id = :memberD), 'coach_invited');

select pg_temp.expect('neither origin trigger is callable as an RPC',
  (select (has_function_privilege('authenticated', 'public.clients_origin_guard()', 'execute')
        or has_function_privilege('authenticated', 'public.session_requests_origin()', 'execute'))::text), 'false');
