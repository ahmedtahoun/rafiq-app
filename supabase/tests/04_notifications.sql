-- Notification trigger assertions (0002).
--
-- Clears the table first: the files before this one send messages and record
-- payments, which now legitimately produce notifications. Starting from a
-- known-empty table keeps each count below about the action it names.
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
\set memberM '''33333333-3333-3333-3333-333333333333'''
\set clientM '''aaaaaaaa-0000-0000-0000-000000000001'''
\set walkin '''aaaaaaaa-0000-0000-0000-000000000002'''

delete from public.notifications;

-- A message tells the person who did not send it.
insert into public.messages (client_id, sender_role, sender_id, body)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'coach', '11111111-1111-1111-1111-111111111111', 'How did this week go?');
select pg_temp.expect('coach message notifies the member',
  (select count(*)::text from public.notifications where recipient_id = '33333333-3333-3333-3333-333333333333' and kind = 'message'), '1');
select pg_temp.expect('  ...and not the sender',
  (select count(*)::text from public.notifications where recipient_id = '11111111-1111-1111-1111-111111111111'), '0');

insert into public.messages (client_id, sender_role, sender_id, body)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'client', '33333333-3333-3333-3333-333333333333', 'Good, thanks!');
select pg_temp.expect('member message notifies the coach',
  (select count(*)::text from public.notifications where recipient_id = '11111111-1111-1111-1111-111111111111' and kind = 'message'), '1');

select pg_temp.expect('  ...carrying a body preview',
  (select (payload ->> 'preview') from public.notifications where kind = 'message' and recipient_id = '11111111-1111-1111-1111-111111111111'), 'Good, thanks!');

-- Completing a task tells the other side, once, on the false -> true edge.
delete from public.notifications;
insert into public.tasks (id, client_id, title, done)
values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Evening walk', false);

set role authenticated;
select pg_temp.expect('member completing a task notifies coach',
  pg_temp.as_user(:memberM, 'with u as (update public.tasks set done = true where id = ''cccccccc-0000-0000-0000-000000000001'' returning 1) select count(*)::text from u'), '1');
reset role;
select pg_temp.expect('  ...exactly one notification',
  (select count(*)::text from public.notifications where recipient_id = '11111111-1111-1111-1111-111111111111' and kind = 'task-completed'), '1');

set role authenticated;
select pg_temp.expect('re-saving a done task is quiet',
  pg_temp.as_user(:memberM, 'with u as (update public.tasks set done = true where id = ''cccccccc-0000-0000-0000-000000000001'' returning 1) select count(*)::text from u'), '1');
reset role;
select pg_temp.expect('  ...still exactly one',
  (select count(*)::text from public.notifications where kind = 'task-completed'), '1');

-- A recorded charge is the member's receipt.
delete from public.notifications;
insert into public.payments (client_id, amount) values ('aaaaaaaa-0000-0000-0000-000000000001', 250);
select pg_temp.expect('a charge notifies the member',
  (select count(*)::text from public.notifications where recipient_id = '33333333-3333-3333-3333-333333333333' and kind = 'payment-received'), '1');
select pg_temp.expect('  ...carrying the amount',
  (select (payload ->> 'amount') from public.notifications where kind = 'payment-received'), '250.00');

-- Nobody to tell: a walk-in has no account behind it.
delete from public.notifications;
insert into public.payments (client_id, amount) values ('aaaaaaaa-0000-0000-0000-000000000002', 99);
select pg_temp.expect('a walk-in charge notifies nobody',
  (select count(*)::text from public.notifications), '0');

-- A requested slot tells the coach.
delete from public.notifications;
insert into public.time_blocks (coach_id, client_id, kind, starts_at, ends_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'pending', now() + interval '1 day', now() + interval '1 day 1 hour');
select pg_temp.expect('a pending block notifies the coach',
  (select count(*)::text from public.notifications where recipient_id = '11111111-1111-1111-1111-111111111111' and kind = 'session-request'), '1');

insert into public.time_blocks (coach_id, kind, starts_at, ends_at)
values ('11111111-1111-1111-1111-111111111111', 'busy', now() + interval '2 days', now() + interval '2 days 1 hour');
select pg_temp.expect('an ordinary block notifies nobody',
  (select count(*)::text from public.notifications where kind = 'session-request'), '1');

-- The client side can read and mark read, and nothing else.
set role authenticated;
select pg_temp.expect('coach sees own notification',
  pg_temp.as_user(:coachA, 'select count(*)::text from public.notifications'), '1');
select pg_temp.expect('member cannot see it',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.notifications'), '0');
select pg_temp.expect('coach can mark it read',
  pg_temp.as_user(:coachA, 'with u as (update public.notifications set read_at = now() returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('nobody can forge a notification',
  pg_temp.as_user(:coachA, 'with i as (insert into public.notifications (recipient_id, kind) values (' || quote_literal(:coachA) || ', ''message'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('nobody can delete a notification',
  pg_temp.as_user(:coachA, 'with d as (delete from public.notifications returning 1) select count(*)::text from d'), 'DENIED(42501)');
reset role;
