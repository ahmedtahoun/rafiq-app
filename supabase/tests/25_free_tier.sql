-- 0021: the free plan's 3 active members, as the app meets it — adding,
-- reactivating and accepting — and Pro (by hand, lapsed, renewing) lifting it.
-- Coach F is new here and starts with no subscriptions row (free).
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

-- A walk-in, as AddClient sends it.
create or replace function pg_temp.add(coach text, id text, active boolean default true) returns text
language sql as $$
  select pg_temp.as_user(coach, format(
    'with i as (insert into public.clients (id, coach_id, full_name, active) values (%L, %L, %L, %L) returning 1)'
    || ' select count(*)::text from i', id, coach, 'Walk-in ' || right(id, 2), active));
$$;

create or replace function pg_temp.set_active(coach text, id text, active boolean) returns text
language sql as $$
  select pg_temp.as_user(coach, format(
    'with u as (update public.clients set active = %L where id = %L returning 1) select count(*)::text from u', active, id));
$$;

\set coachF  '''21212121-0000-0000-0000-000000000001'''
\set memberG '''21212121-0000-0000-0000-00000000000a'''
\set w1 '''21212121-1111-0000-0000-000000000001'''
\set w2 '''21212121-1111-0000-0000-000000000002'''
\set w3 '''21212121-1111-0000-0000-000000000003'''
\set w4 '''21212121-1111-0000-0000-000000000004'''
\set w5 '''21212121-1111-0000-0000-000000000005'''
\set w6 '''21212121-1111-0000-0000-000000000006'''
\set w7 '''21212121-1111-0000-0000-000000000007'''

select date_trunc('hour', now()) + interval '60 days' as tg \gset

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachF,  'coachF@x.com',  '{"role":"coach","full_name":"Coach Farida"}'),
  (:memberG, 'memberG@x.com', '{"role":"client","full_name":"Member Gamal"}');
insert into public.coach_profiles (profile_id, title) values (:coachF, 'Career coaching');

set role authenticated;

-- Free: three, and no fourth ----------------------------------------------------------
select pg_temp.expect('a free coach adds three members',
  pg_temp.add(:coachF, :w1) || pg_temp.add(:coachF, :w2) || pg_temp.add(:coachF, :w3), '111');
select pg_temp.expect('...the fourth is refused',
  pg_temp.add(:coachF, :w4), 'DENIED(53400)');
select pg_temp.expect('...an archived one can still be added',
  pg_temp.add(:coachF, :w4, false), '1');
select pg_temp.expect('...but not reactivated at the limit',
  pg_temp.set_active(:coachF, :w4, true), 'DENIED(53400)');
select pg_temp.expect('editing a member at the limit still works',
  pg_temp.as_user(:coachF, format(
    'with u as (update public.clients set goal = ''Run a 10k'' where id = %L returning 1) select count(*)::text from u', :w1)), '1');
select pg_temp.expect('archiving one makes room to reactivate',
  pg_temp.set_active(:coachF, :w1, false) || pg_temp.set_active(:coachF, :w4, true), '11');
select pg_temp.expect('the app can ask whether it is on Pro',
  pg_temp.as_user(:coachF, format('select public.coach_on_pro(%L)::text', :coachF)), 'false');

-- Accepting a request is adding a member too ------------------------------------------
select pg_temp.as_user(:memberG, format(
  'with i as (insert into public.session_requests (member_id, coach_id, requested_start, price, status)'
  || ' values (%L, %L, %L, 0, ''pending'') returning id) select id::text from i', :memberG, :coachF, :'tg')) as req_g \gset
select pg_temp.expect('accepting at the limit is refused',
  pg_temp.as_user(:coachF, format('select (public.accept_session_request(%L) is not null)::text', :'req_g')), 'DENIED(53400)');
select pg_temp.expect('...and the request is still waiting',
  pg_temp.as_user(:coachF, format('select status::text from public.session_requests where id = %L', :'req_g')), 'pending');

-- Pro -----------------------------------------------------------------------------------
reset role;
insert into public.subscriptions (coach_id, tier, renews_at) values (:coachF, 'pro', null);
set role authenticated;

select pg_temp.expect('Pro by hand (no end date): no limit',
  pg_temp.add(:coachF, :w5), '1');
select pg_temp.expect('...and the request can be accepted',
  pg_temp.as_user(:coachF, format('select (public.accept_session_request(%L) is not null)::text', :'req_g')), 'true');
select pg_temp.expect('...coach_on_pro says so',
  pg_temp.as_user(:coachF, format('select public.coach_on_pro(%L)::text', :coachF)), 'true');

reset role;
update public.subscriptions set renews_at = now() - interval '1 day' where coach_id = :coachF;
set role authenticated;
select pg_temp.expect('a lapsed Pro is free again: no new member',
  pg_temp.add(:coachF, :w6), 'DENIED(53400)');
select pg_temp.expect('...but keeps the five already active',
  pg_temp.as_user(:coachF, format('select count(*)::text from public.clients where coach_id = %L and active', :coachF)), '5');

reset role;
update public.subscriptions set renews_at = now() + interval '30 days' where coach_id = :coachF;
set role authenticated;
select pg_temp.expect('a renewing Pro adds again',
  pg_temp.add(:coachF, :w7), '1');

reset role;
select pg_temp.expect('the coach cannot make themselves Pro',
  (select has_table_privilege('authenticated', 'public.subscriptions', 'insert')
       or has_table_privilege('authenticated', 'public.subscriptions', 'update'))::text, 'false');
select pg_temp.expect('the limit trigger is not callable as an RPC',
  has_function_privilege('authenticated', 'public.clients_member_cap()', 'execute')::text, 'false');
