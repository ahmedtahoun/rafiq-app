-- 0024: Pro Plus holds 15 active members, Elite Pro has no limit, and a
-- lapsed paid tier is free again. 24_free_tier.sql covers the free plan's 3
-- and accepting a request; this is the two paid tiers.
-- Coach P is new here, starts on Pro Plus, and moves between tiers.
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

-- A walk-in, as AddClient sends it; n numbers it.
create or replace function pg_temp.add(coach text, n int) returns text
language sql as $$
  select pg_temp.as_user(coach, format(
    'with i as (insert into public.clients (id, coach_id, full_name, active) values (%L, %L, %L, true) returning 1)'
    || ' select count(*)::text from i',
    '29292929-1111-0000-0000-' || lpad(n::text, 12, '0'), coach, 'Walk-in ' || n));
$$;

-- Adds a..b, and says how many went in.
create or replace function pg_temp.add_range(coach text, a int, b int) returns text
language plpgsql as $$
declare ok int := 0;
begin
  for n in a..b loop
    if pg_temp.add(coach, n) = '1' then ok := ok + 1; end if;
  end loop;
  return ok::text;
end;
$$;

create or replace function pg_temp.plan_of(coach text) returns text
language sql as $$
  select pg_temp.as_user(coach, format('select public.coach_plan(%L) || ''/'' || coalesce(public.coach_member_cap(%L)::text, ''none'')', coach, coach));
$$;

\set coachP '''29292929-0000-0000-0000-000000000001'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachP, 'coachP@x.com', '{"role":"coach","full_name":"Coach Passant"}');
insert into public.coach_profiles (profile_id, title) values (:coachP, 'Career coaching');
insert into public.subscriptions (coach_id, tier, renews_at) values (:coachP, 'pro', now() + interval '30 days');

set role authenticated;

-- Pro Plus: fifteen, and no sixteenth ---------------------------------------------------
select pg_temp.expect('Pro Plus reads as pro, cap 15',
  pg_temp.plan_of(:coachP), 'pro/15');
select pg_temp.expect('a Pro Plus coach adds fifteen members',
  pg_temp.add_range(:coachP, 1, 15), '15');
select pg_temp.expect('...the sixteenth is refused',
  pg_temp.add(:coachP, 16), 'DENIED(53400)');
select pg_temp.expect('...and coach_on_pro is still true',
  pg_temp.as_user(:coachP, format('select public.coach_on_pro(%L)::text', :coachP)), 'true');

-- Elite Pro: no limit -------------------------------------------------------------------
reset role;
update public.subscriptions set tier = 'elite_pro' where coach_id = :coachP;
set role authenticated;

select pg_temp.expect('Elite Pro reads as elite_pro, no cap',
  pg_temp.plan_of(:coachP), 'elite_pro/none');
select pg_temp.expect('an Elite Pro coach adds past fifteen',
  pg_temp.add_range(:coachP, 16, 20), '5');
select pg_temp.expect('...coach_on_pro says so',
  pg_temp.as_user(:coachP, format('select public.coach_on_pro(%L)::text', :coachP)), 'true');

-- Lapsed and downgraded: nobody is removed, the next one is refused --------------------
reset role;
update public.subscriptions set renews_at = now() - interval '1 day' where coach_id = :coachP;
set role authenticated;

select pg_temp.expect('a lapsed Elite Pro is free',
  pg_temp.plan_of(:coachP), 'free/3');
select pg_temp.expect('...no new member',
  pg_temp.add(:coachP, 21), 'DENIED(53400)');
select pg_temp.expect('...but keeps the twenty already active',
  pg_temp.as_user(:coachP, format('select count(*)::text from public.clients where coach_id = %L and active', :coachP)), '20');

reset role;
update public.subscriptions set tier = 'pro', renews_at = null where coach_id = :coachP;
set role authenticated;

select pg_temp.expect('Elite Pro down to Pro Plus, above its cap',
  pg_temp.add(:coachP, 22), 'DENIED(53400)');
select pg_temp.expect('...editing a member still works',
  pg_temp.as_user(:coachP, format(
    'with u as (update public.clients set goal = ''Run a 10k'' where id = %L returning 1) select count(*)::text from u',
    '29292929-1111-0000-0000-000000000001')), '1');

reset role;
select pg_temp.expect('the coach cannot pick their own tier',
  (select has_table_privilege('authenticated', 'public.subscriptions', 'insert')
       or has_table_privilege('authenticated', 'public.subscriptions', 'update'))::text, 'false');
select pg_temp.expect('anon cannot ask another coach''s plan',
  has_function_privilege('anon', 'public.coach_plan(uuid)', 'execute')::text, 'false');
