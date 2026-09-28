-- 0008 assertions: a coach can only link a member who asked them. Every
-- refusal has an allowed case beside it, so the guard can't pass by
-- refusing everything.
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
\set walkIn '''aaaaaaaa-0000-0000-0000-000000000002'''
-- Two members who have never contacted anyone.
\set memberV '''66666666-6666-6666-6666-666666666666'''
\set memberX '''77777777-7777-7777-7777-777777777777'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:memberV, 'memberV@x.com', '{"role":"client","full_name":"Member V"}'),
  (:memberX, 'memberX@x.com', '{"role":"client","full_name":"Member X"}');

set role authenticated;

-- Before any request ------------------------------------------------------------
select pg_temp.expect('coach cannot link a stranger',
  pg_temp.as_user(:coachA, 'with i as (insert into public.clients (coach_id, member_id, full_name) values (' || quote_literal(:coachA) || ', ' || quote_literal(:memberV) || ', ''V'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('...nor attach one to a walk-in row',
  pg_temp.as_user(:coachA, 'with u as (update public.clients set member_id = ' || quote_literal(:memberV) || ' where id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('...so cannot read their profile',
  pg_temp.as_user(:coachA, 'select count(*)::text from public.profiles where id = ' || quote_literal(:memberV)), '0');
select pg_temp.expect('a walk-in row is still fine',
  pg_temp.as_user(:coachA, 'with i as (insert into public.clients (coach_id, full_name) values (' || quote_literal(:coachA) || ', ''Walk-in 3'') returning 1) select count(*)::text from i'), '1');

-- Member V asks coach A --------------------------------------------------------
select pg_temp.expect('member V requests coach A',
  pg_temp.as_user(:memberV, 'with i as (insert into public.session_requests (member_id, coach_id, requested_start, price) values (' || quote_literal(:memberV) || ', ' || quote_literal(:coachA) || ', now() + interval ''2 days'', 500) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('another coach still cannot link V',
  pg_temp.as_user(:coachC, 'with i as (insert into public.clients (coach_id, member_id, full_name) values (' || quote_literal(:coachC) || ', ' || quote_literal(:memberV) || ', ''V'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('coach A accepts and links V',
  pg_temp.as_user(:coachA, 'with u as (update public.session_requests set status = ''accepted'', responded_at = now() where member_id = ' || quote_literal(:memberV) || ' returning 1), i as (insert into public.clients (coach_id, member_id, full_name) values (' || quote_literal(:coachA) || ', ' || quote_literal(:memberV) || ', ''Member V'') returning 1) select ((select count(*) from u) + (select count(*) from i))::text'), '2');
select pg_temp.expect('the member now sees the roster row',
  pg_temp.as_user(:memberV, 'select count(*)::text from public.clients where coach_id = ' || quote_literal(:coachA)), '1');
select pg_temp.expect('coach edits the linked row as usual',
  pg_temp.as_user(:coachA, 'with u as (update public.clients set progress = 40 where member_id = ' || quote_literal(:memberV) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('coach can unlink the row',
  pg_temp.as_user(:coachA, 'with u as (update public.clients set member_id = null where member_id = ' || quote_literal(:memberV) || ' returning 1) select count(*)::text from u'), '1');

-- A declined request doesn't count --------------------------------------------
select pg_temp.expect('member X requests coach A',
  pg_temp.as_user(:memberX, 'with i as (insert into public.session_requests (member_id, coach_id, requested_start, price) values (' || quote_literal(:memberX) || ', ' || quote_literal(:coachA) || ', now() + interval ''2 days'', 500) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('a pending request is enough to link',
  pg_temp.as_user(:coachA, 'with u as (update public.clients set member_id = ' || quote_literal(:memberX) || ' where id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('coach unlinks X again',
  pg_temp.as_user(:coachA, 'with u as (update public.clients set member_id = null where id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('coach declines X',
  pg_temp.as_user(:coachA, 'with u as (update public.session_requests set status = ''declined'', responded_at = now() where member_id = ' || quote_literal(:memberX) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('declined: X cannot be linked',
  pg_temp.as_user(:coachA, 'with u as (update public.clients set member_id = ' || quote_literal(:memberX) || ' where id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');

reset role;

-- As the owner (service_role's stand-in): not limited ----------------------------
create or replace function pg_temp.try(q text) returns text
language plpgsql as $$
begin
  execute q;
  return 'OK';
exception when others then
  return 'REJECTED(' || sqlstate || ')';
end;
$$;

select pg_temp.expect('service role links without a request',
  pg_temp.try('insert into public.clients (coach_id, member_id, full_name) values (' || quote_literal(:coachC) || ', ' || quote_literal(:memberX) || ', ''X'')'), 'OK');
