-- The coach roster's own writes (src/lib/rosterData.ts), against the real
-- policies, grants and constraints, as the authenticated role — each one the
-- shape the app sends. Runs after 02–10 and uses their fixtures: coach A's
-- roster row for member M (clientM) and walk-in W.
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
\set coachB '''22222222-2222-2222-2222-222222222222'''
\set memberM '''33333333-3333-3333-3333-333333333333'''
\set clientM '''aaaaaaaa-0000-0000-0000-000000000001'''
\set walkIn '''aaaaaaaa-0000-0000-0000-000000000002'''

set role authenticated;

-- clients ---------------------------------------------------------------------------
select pg_temp.expect('roster: add a member (addRosterClient)',
  pg_temp.as_user(:coachA, 'with i as (insert into public.clients (coach_id, full_name, age, phone, country_code, specialty, plan, program, initials, avatar_bg, goal, active, progress, needs_checkin, payment_status) values (' || quote_literal(:coachA) || ', ''Hana Mostafa'', 30, ''10 1234 5678'', ''+20'', ''Life coaching'', ''Basic'', ''Life coaching · Basic'', ''HM'', ''#3E6FB0'', ''Run 5k'', true, 0, false, ''due'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('roster: edit a member (updateRosterClient)',
  pg_temp.as_user(:coachA, 'with u as (update public.clients set full_name = ''Walk In'', initials = ''WI'', age = 40, phone = ''11'', country_code = ''+20'', specialty = ''Nutrition'', plan = ''Full Access'', program = ''Nutrition · Full Access'', goal = ''g'', active = true, needs_checkin = false, payment_status = ''paid'' where id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('roster: archive a member',
  pg_temp.as_user(:coachA, 'with u as (update public.clients set active = false, needs_checkin = false where id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('roster: another coach edits nothing',
  pg_temp.as_user(:coachB, 'with u as (update public.clients set goal = ''x'' where id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), '0');

-- client_private: update, then insert the first time --------------------------------
select pg_temp.expect('private: first update finds no row',
  pg_temp.as_user(:coachA, 'with u as (update public.client_private set is_favourite = true where client_id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), '0');
select pg_temp.expect('private: so it inserts',
  pg_temp.as_user(:coachA, 'with i as (insert into public.client_private (client_id, is_favourite) values (' || quote_literal(:walkIn) || ', true) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('private: then updates notes',
  pg_temp.as_user(:coachA, 'with u as (update public.client_private set notes = ''Knee'' where client_id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('private: a note on member M''s row',
  pg_temp.as_user(:coachA, 'with u as (update public.client_private set notes = ''Private'' where client_id = ' || quote_literal(:clientM) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('private: member M cannot read it',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.client_private'), '0');
select pg_temp.expect('private: nor write their own',
  pg_temp.as_user(:memberM, 'with u as (update public.client_private set notes = ''x'' returning 1) select count(*)::text from u'), '0');

-- tasks ---------------------------------------------------------------------------
select pg_temp.expect('tasks: add (addRosterTask)',
  pg_temp.as_user(:coachA, 'with i as (insert into public.tasks (client_id, title, description, due_at, due_has_time, recurring, done) values (' || quote_literal(:clientM) || ', ''Stretch'', '''', ''2026-09-28T21:00:00Z'', false, false, false) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('tasks: edit title, due, repeat',
  pg_temp.as_user(:coachA, 'with u as (update public.tasks set title = ''Stretch daily'', due_at = ''2026-09-29T21:00:00Z'', recurring = true where title = ''Stretch'' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('tasks: coach marks done',
  pg_temp.as_user(:coachA, 'with u as (update public.tasks set done = true, done_at = now() where title = ''Stretch daily'' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('tasks: member may untick it',
  pg_temp.as_user(:memberM, 'with u as (update public.tasks set done = false, done_at = null where title = ''Stretch daily'' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('tasks: member may not retitle it',
  pg_temp.as_user(:memberM, 'with u as (update public.tasks set title = ''Skip'' where title = ''Stretch daily'' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('tasks: delete',
  pg_temp.as_user(:coachA, 'with d as (delete from public.tasks where title = ''Stretch daily'' returning 1) select count(*)::text from d'), '1');

-- sessions, packages ----------------------------------------------------------------
select pg_temp.expect('sessions: coach writes a recap',
  pg_temp.as_user(:coachA, 'with u as (update public.sessions set recap = ''Good start'' where client_id = ' || quote_literal(:clientM) || ' returning 1) select (count(*) > 0)::text from u'), 'true');
select pg_temp.expect('packages: first renew inserts',
  pg_temp.as_user(:coachA, 'with i as (insert into public.packages (client_id, total, used, expires_at) values (' || quote_literal(:walkIn) || ', 8, 0, ''2026-10-27T21:00:00Z'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('packages: next renew updates',
  pg_temp.as_user(:coachA, 'with u as (update public.packages set total = 12, expires_at = ''2026-11-27T21:00:00Z'' where client_id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), '1');

-- payments: a ledger ------------------------------------------------------------------
select pg_temp.expect('payments: record a charge',
  pg_temp.as_user(:coachA, 'with i as (insert into public.payments (client_id, kind, amount, method, state) values (' || quote_literal(:walkIn) || ', ''charge'', 750, ''Card'', ''completed'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('payments: refund it',
  pg_temp.as_user(:coachA, 'with c as (select id from public.payments where client_id = ' || quote_literal(:walkIn) || ' and amount = 750), i as (insert into public.payments (client_id, kind, amount, method, state, refund_of, note) select ' || quote_literal(:walkIn) || ', ''refund'', 750, ''Card'', ''completed'', c.id, ''Cancelled'' from c returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('payments: never twice',
  pg_temp.as_user(:coachA, 'with c as (select id from public.payments where client_id = ' || quote_literal(:walkIn) || ' and kind = ''charge'' and amount = 750), i as (insert into public.payments (client_id, kind, amount, method, state, refund_of) select ' || quote_literal(:walkIn) || ', ''refund'', 1, ''Card'', ''completed'', c.id from c returning 1) select count(*)::text from i'), 'DENIED(23505)');
select pg_temp.expect('payments: a charge is never edited',
  pg_temp.as_user(:coachA, 'with u as (update public.payments set amount = 1 where client_id = ' || quote_literal(:walkIn) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');

reset role;
