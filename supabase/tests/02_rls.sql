-- RLS policy assertions. Every check runs as a real signed-in user by setting
-- the claim auth.uid() reads, then compares against an expected value — so a
-- policy that silently widens shows up as FAIL, not as a number nobody reads.
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- Runs `q` as the given uid. A permission error is a result, not a crash:
-- "the database refused this" is exactly what several checks assert.
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

set role authenticated;

\set coachA '''11111111-1111-1111-1111-111111111111'''
\set coachB '''22222222-2222-2222-2222-222222222222'''
\set memberM '''33333333-3333-3333-3333-333333333333'''
\set memberN '''44444444-4444-4444-4444-444444444444'''
\set clientM '''aaaaaaaa-0000-0000-0000-000000000001'''
\set walkin '''aaaaaaaa-0000-0000-0000-000000000002'''

-- Reads: each side sees its own relationship and nothing else.
select pg_temp.expect('coachA sees own clients',
  pg_temp.as_user(:coachA, 'select count(*)::text from public.clients'), '2');
select pg_temp.expect('coachA cannot see coachB roster',
  pg_temp.as_user(:coachA, 'select count(*)::text from public.clients where coach_id = ' || quote_literal(:coachB)), '0');
select pg_temp.expect('memberM sees own roster row',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.clients'), '1');
select pg_temp.expect('memberN cannot see coachA roster',
  pg_temp.as_user(:memberN, 'select count(*)::text from public.clients where coach_id = ' || quote_literal(:coachA)), '0');
select pg_temp.expect('memberM sees own tasks',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.tasks'), '1');
select pg_temp.expect('memberN cannot see M tasks',
  pg_temp.as_user(:memberN, 'select count(*)::text from public.tasks'), '0');
select pg_temp.expect('memberM sees own payments',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.payments'), '1');
select pg_temp.expect('a token with no subject sees nothing',
  pg_temp.as_user('', 'select count(*)::text from public.clients'), '0');
-- And a genuinely signed-out caller: 0004 revokes Supabase's default grants
-- to anon, so this is refused a step earlier, at the grant.
reset role;
set role anon;
select pg_temp.expect('signed-out is refused outright',
  pg_temp.as_user('', 'select count(*)::text from public.clients'), 'DENIED(42501)');
reset role;
set role authenticated;

-- Writes: only the side that owns the action may perform it.
select pg_temp.expect('member cannot record a payment',
  pg_temp.as_user(:memberM, 'with i as (insert into public.payments (client_id, amount) values (' || quote_literal(:clientM) || ', 9) returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('coach can record a payment',
  pg_temp.as_user(:coachA, 'with i as (insert into public.payments (client_id, amount) values (' || quote_literal(:clientM) || ', 9) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coachB cannot edit coachA client',
  pg_temp.as_user(:coachB, 'with u as (update public.clients set full_name = ''hacked'' where id = ' || quote_literal(:clientM) || ' returning 1) select count(*)::text from u'), '0');
select pg_temp.expect('member cannot post as their coach',
  pg_temp.as_user(:memberM, 'with i as (insert into public.messages (client_id, sender_role, sender_id, body) values (' || quote_literal(:clientM) || ', ''coach'', ' || quote_literal(:memberM) || ', ''fake'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('member can post as themselves',
  pg_temp.as_user(:memberM, 'with i as (insert into public.messages (client_id, sender_role, sender_id, body) values (' || quote_literal(:clientM) || ', ''client'', ' || quote_literal(:memberM) || ', ''hi'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('member can rate their coach',
  pg_temp.as_user(:memberM, 'with i as (insert into public.ratings (client_id, coach_id, rating) values (' || quote_literal(:clientM) || ', ' || quote_literal(:coachA) || ', 5) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach cannot rate themselves',
  pg_temp.as_user(:coachA, 'with i as (insert into public.ratings (client_id, coach_id, rating) values (' || quote_literal(:walkin) || ', ' || quote_literal(:coachA) || ', 5) returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('member cannot delete a roster row',
  pg_temp.as_user(:memberM, 'with d as (delete from public.clients where id = ' || quote_literal(:clientM) || ' returning 1) select count(*)::text from d'), '0');
select pg_temp.expect('member can tick own task done',
  pg_temp.as_user(:memberM, 'with u as (update public.tasks set done = true returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('nobody can edit a sent message',
  pg_temp.as_user(:coachA, 'with u as (update public.messages set body = ''edited'' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('nobody can delete a payment',
  pg_temp.as_user(:coachA, 'with d as (delete from public.payments returning 1) select count(*)::text from d'), 'DENIED(42501)');
select pg_temp.expect('coach cannot change own subscription tier',
  pg_temp.as_user(:coachA, 'with u as (update public.subscriptions set tier = ''pro'' returning 1) select count(*)::text from u'), 'DENIED(42501)');

-- 0004: holes found in the pre-launch review. Each denial below fails without
-- that migration; each allowed case beside it proves the fix is not a blanket ban.
select pg_temp.expect('coach cannot self-verify',
  pg_temp.as_user(:coachA, 'with u as (update public.coach_profiles set verification_status = ''verified'' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('coach can still edit own bio',
  pg_temp.as_user(:coachA, 'with u as (update public.coach_profiles set bio = ''hello'' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('member cannot rename own task',
  pg_temp.as_user(:memberM, 'with u as (update public.tasks set title = ''renamed'' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('coach can still rename a task',
  pg_temp.as_user(:coachA, 'with u as (update public.tasks set title = ''Journal daily'' where client_id = ' || quote_literal(:clientM) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('member cannot move rating to other coach',
  pg_temp.as_user(:memberM, 'with u as (update public.ratings set coach_id = ' || quote_literal(:coachB) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('member cannot rate a coach not theirs',
  pg_temp.as_user(:memberN, 'with i as (insert into public.ratings (client_id, coach_id, rating) values (''bbbbbbbb-0000-0000-0000-000000000001'', ' || quote_literal(:coachA) || ', 1) returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('member cannot request on other calendar',
  pg_temp.as_user(:memberM, 'with i as (insert into public.time_blocks (coach_id, client_id, kind, starts_at, ends_at) values (' || quote_literal(:coachB) || ', ' || quote_literal(:clientM) || ', ''pending'', now(), now() + interval ''1 hour'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('member can request with own coach',
  pg_temp.as_user(:memberM, 'with i as (insert into public.time_blocks (coach_id, client_id, kind, starts_at, ends_at) values (' || quote_literal(:coachA) || ', ' || quote_literal(:clientM) || ', ''pending'', now(), now() + interval ''1 hour'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach cannot block on other coach client',
  pg_temp.as_user(:coachB, 'with i as (insert into public.time_blocks (coach_id, client_id, kind, starts_at, ends_at) values (' || quote_literal(:coachB) || ', ' || quote_literal(:clientM) || ', ''busy'', now(), now() + interval ''1 hour'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('app cannot call push_notification',
  pg_temp.as_user(:memberM, 'select ''called'' from (select public.push_notification(' || quote_literal(:coachA) || '::uuid, ''message'', null, ''{}''::jsonb)) s'), 'DENIED(42501)');
