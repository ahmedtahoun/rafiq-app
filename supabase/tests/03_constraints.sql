-- Constraint, trigger and cascade assertions. Runs as the table owner, so RLS
-- is out of the picture here on purpose — this file is about what the schema
-- itself refuses, regardless of who is asking.
\set QUIET on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.try(q text) returns text
language plpgsql as $$
begin
  execute q;
  return 'ALLOWED';
exception when others then
  return 'REJECTED(' || sqlstate || ')';
end;
$$;

create or replace function pg_temp.expect(label text, actual text, expected text) returns text
language sql immutable as $$
  select case when actual = expected then 'PASS  ' else 'FAIL  ' end
      || rpad(label, 44)
      || ' expected=' || rpad(expected, 17) || ' actual=' || actual;
$$;

\set clientM '''aaaaaaaa-0000-0000-0000-000000000001'''
\set coachA '''11111111-1111-1111-1111-111111111111'''
\set coachB '''22222222-2222-2222-2222-222222222222'''
\set memberM '''33333333-3333-3333-3333-333333333333'''

-- Payments ledger: a refund names the charge it reverses, exactly once.
select pg_temp.expect('refund without a charge',
  pg_temp.try('insert into public.payments (client_id, kind, amount) values (' || quote_literal(:clientM) || ', ''refund'', 50)'), 'REJECTED(23514)');
select pg_temp.expect('charge pointing at a charge',
  pg_temp.try('insert into public.payments (client_id, kind, amount, refund_of) values (' || quote_literal(:clientM) || ', ''charge'', 50, (select id from public.payments where kind = ''charge'' limit 1))'), 'REJECTED(23514)');
select pg_temp.expect('valid refund',
  pg_temp.try('insert into public.payments (client_id, kind, amount, refund_of) values (' || quote_literal(:clientM) || ', ''refund'', 50, (select id from public.payments where kind = ''charge'' order by amount limit 1))'), 'ALLOWED');
select pg_temp.expect('double refund of one charge',
  pg_temp.try('insert into public.payments (client_id, kind, amount, refund_of) values (' || quote_literal(:clientM) || ', ''refund'', 10, (select id from public.payments where kind = ''charge'' order by amount limit 1))'), 'REJECTED(23505)');
select pg_temp.expect('negative payment amount',
  pg_temp.try('insert into public.payments (client_id, amount) values (' || quote_literal(:clientM) || ', -5)'), 'REJECTED(23514)');
select pg_temp.expect('deleting a refunded charge',
  pg_temp.try('delete from public.payments where kind = ''charge'' and amount = 9'), 'REJECTED(23503)');

-- Packages: credits used can never exceed the credits bought.
select pg_temp.expect('package used > total',
  pg_temp.try('insert into public.packages (client_id, total, used, expires_at) values (' || quote_literal(:clientM) || ', 8, 9, now())'), 'REJECTED(23514)');
select pg_temp.expect('package used <= total',
  pg_temp.try('insert into public.packages (client_id, total, used, expires_at) values (' || quote_literal(:clientM) || ', 8, 6, now() + interval ''30 days'')'), 'ALLOWED');
select pg_temp.expect('renewal 6/8 -> 6/12',
  pg_temp.try('update public.packages set total = 12 where client_id = ' || quote_literal(:clientM)), 'ALLOWED');

-- Range checks.
select pg_temp.expect('progress above 100',
  pg_temp.try('update public.clients set progress = 101 where id = ' || quote_literal(:clientM)), 'REJECTED(23514)');
select pg_temp.expect('rating of 6 stars',
  pg_temp.try('update public.ratings set rating = 6 where client_id = ' || quote_literal(:clientM)), 'REJECTED(23514)');
select pg_temp.expect('time block ending before it starts',
  pg_temp.try('insert into public.time_blocks (coach_id, kind, starts_at, ends_at) values (' || quote_literal(:coachA) || ', ''busy'', now(), now() - interval ''1 hour'')'), 'REJECTED(23514)');
select pg_temp.expect('empty message body',
  pg_temp.try('insert into public.messages (client_id, sender_role, sender_id, body) values (' || quote_literal(:clientM) || ', ''coach'', ' || quote_literal(:coachA) || ', '''')'), 'REJECTED(23514)');

-- Roster identity: one link per member per coach, unlimited unlinked walk-ins.
select pg_temp.expect('same member twice on one roster',
  pg_temp.try('insert into public.clients (coach_id, member_id, full_name) values (' || quote_literal(:coachA) || ', ' || quote_literal(:memberM) || ', ''Dup M'')'), 'REJECTED(23505)');
select pg_temp.expect('a second unlinked walk-in',
  pg_temp.try('insert into public.clients (coach_id, member_id, full_name) values (' || quote_literal(:coachA) || ', null, ''Walk-in 2'')'), 'ALLOWED');

-- Triggers and cascades.
select pg_temp.expect('updated_at trigger fires',
  pg_temp.try('update public.clients set full_name = ''Renamed'' where id = ' || quote_literal(:clientM)), 'ALLOWED');
select pg_temp.expect('  ...and moved updated_at past created_at',
  (select (updated_at > created_at)::text from public.clients where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'true');
select pg_temp.expect('signup trigger created 4 profiles',
  (select count(*)::text from public.profiles), '4');
select pg_temp.expect('deleting an auth user',
  pg_temp.try('delete from auth.users where id = ' || quote_literal(:coachB)), 'ALLOWED');
select pg_temp.expect('  ...cascaded their roster away',
  (select count(*)::text from public.clients where coach_id = '22222222-2222-2222-2222-222222222222'), '0');
