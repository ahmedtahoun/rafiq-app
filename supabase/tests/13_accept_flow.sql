-- 0010's accept_session_request(), and the member side of asking: sending a
-- request, replacing it, withdrawing it. Run as the authenticated role, so
-- the function meets the same policies the app's direct writes do. Members P
-- and Q are new here and ask coach C, who has no roster row for either.
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
\set memberP '''88888888-8888-8888-8888-888888888888'''
\set memberQ '''99999999-9999-9999-9999-999999999999'''
\set offering '''eeeeeeee-0000-0000-0000-000000000013'''

-- As the owner: two members, and one priced offering of coach C's.
insert into auth.users (id, email, raw_user_meta_data) values
  (:memberP, 'memberP@x.com', '{"role":"client","full_name":"Member Pia"}'),
  (:memberQ, 'memberQ@x.com', '{"role":"client","full_name":"Member Q"}');
update public.profiles set phone = '1001234567', country_code = '+20' where id = :memberP;
insert into public.offerings (id, coach_id, name, price) values (:offering, :coachC, 'Career session', 600);
-- Coach C on Pro, as the fixtures' coaches are: this file and the race
-- after it accept more members than the free plan holds (0020).
insert into public.subscriptions (coach_id, tier) values (:coachC, 'pro');

-- Times a whole day apart, far enough ahead that "has it passed" never flips
-- mid-run, and fixed so the overlap checks below can name them.
select date_trunc('hour', now()) + interval '3 days' as t1 \gset
select date_trunc('hour', now()) + interval '3 days 10 minutes' as t1_overlap \gset
select date_trunc('hour', now()) + interval '4 days' as t2 \gset
select date_trunc('hour', now()) + interval '5 days' as t3 \gset

set role authenticated;

-- Asking ------------------------------------------------------------------------
select pg_temp.expect('member asks a coach for a free intro',
  pg_temp.as_user(:memberP, format('with i as (insert into public.session_requests (member_id, coach_id, requested_start, price) values (%L, %L, %L, 0) returning 1) select count(*)::text from i', :memberP, :coachC, :'t1')), '1');
select pg_temp.expect('...only one open request per coach',
  pg_temp.as_user(:memberP, format('insert into public.session_requests (member_id, coach_id, requested_start, price) values (%L, %L, %L, 0) returning 1', :memberP, :coachC, :'t2')), 'DENIED(23505)');
select pg_temp.expect('...another coach''s offering is refused',
  pg_temp.as_user(:memberQ, format('insert into public.session_requests (member_id, coach_id, offering_id, requested_start, price) values (%L, %L, %L, %L, 600) returning 1', :memberQ, :coachA, :offering, :'t1')), 'DENIED(42501)');
select pg_temp.expect('member Q asks for the same slot, paid',
  pg_temp.as_user(:memberQ, format('with i as (insert into public.session_requests (member_id, coach_id, offering_id, requested_start, price) values (%L, %L, %L, %L, 600) returning 1) select count(*)::text from i', :memberQ, :coachC, :offering, :'t1_overlap')), '1');
select pg_temp.expect('coach C sees both requests',
  pg_temp.as_user(:coachC, format('select count(*)::text from public.session_requests where coach_id = %L and status = ''pending'' and member_id in (%L, %L)', :coachC, :memberP, :memberQ)), '2');
select pg_temp.expect('...and who is asking',
  pg_temp.as_user(:coachC, format('select full_name from public.profiles where id = %L', :memberP)), 'Member Pia');
select pg_temp.expect('coach A sees neither',
  pg_temp.as_user(:coachA, format('select count(*)::text from public.session_requests where member_id in (%L, %L)', :memberP, :memberQ)), '0');

reset role;
select id as req_p from public.session_requests where member_id = :memberP and status = 'pending' \gset
select id as req_q from public.session_requests where member_id = :memberQ and status = 'pending' \gset
set role authenticated;

-- Who may accept ----------------------------------------------------------------
select pg_temp.expect('another coach cannot accept it',
  pg_temp.as_user(:coachA, format('select public.accept_session_request(%L)::text', :'req_p')), 'DENIED(P0002)');
select pg_temp.expect('the member cannot accept their own',
  pg_temp.as_user(:memberP, format('select public.accept_session_request(%L)::text', :'req_p')), 'DENIED(P0002)');
select pg_temp.expect('signed out cannot call it at all',
  has_function_privilege('anon', 'public.accept_session_request(uuid)', 'execute')::text, 'false');

-- Accepting ---------------------------------------------------------------------
select pg_temp.expect('coach C accepts: a roster row comes back',
  pg_temp.as_user(:coachC, format('select (public.accept_session_request(%L) is not null)::text', :'req_p')), 'true');

reset role;
select id as client_p from public.clients where coach_id = :coachC and member_id = :memberP \gset
select pg_temp.expect('request marked accepted, with when',
  (select status || ':' || (responded_at is not null) from public.session_requests where id = :'req_p'), 'accepted:true');
select pg_temp.expect('roster row: name, initials, contact',
  (select full_name || '|' || initials || '|' || phone || '|' || country_code || '|' || email || '|' || active
   from public.clients where id = :'client_p'), 'Member Pia|MP|1001234567|+20|memberP@x.com|true');
select pg_temp.expect('a booked 20-minute intro on the calendar',
  (select kind || ':' || session_type || ':' || extract(epoch from ends_at - starts_at)::int / 60
   from public.time_blocks where client_id = :'client_p'), 'booked:intro:20');
select pg_temp.expect('a session tied to that block',
  (select count(*)::text from public.sessions s join public.time_blocks b on b.id = s.time_block_id
   where s.client_id = :'client_p' and s.scheduled_at = :'t1'), '1');
select pg_temp.expect('the roster row''s next session is it',
  (select (next_session_at = :'t1')::text || ':' || next_session_type from public.clients where id = :'client_p'), 'true:intro');
set role authenticated;

select pg_temp.expect('member P now reads the relationship',
  pg_temp.as_user(:memberP, format('select count(*)::text from public.sessions where client_id = %L', :'client_p')), '1');
select pg_temp.expect('accepting twice is refused',
  pg_temp.as_user(:coachC, format('select public.accept_session_request(%L)::text', :'req_p')), 'DENIED(55000)');

-- Refusals change nothing -------------------------------------------------------
select pg_temp.expect('an overlapping time is refused',
  pg_temp.as_user(:coachC, format('select public.accept_session_request(%L)::text', :'req_q')), 'DENIED(23P01)');
reset role;
select pg_temp.expect('...Q''s request still pending, no roster row',
  (select status from public.session_requests where id = :'req_q')
    || ':' || (select count(*) from public.clients where member_id = :memberQ), 'pending:0');
set role authenticated;

select pg_temp.expect('member Q withdraws',
  pg_temp.as_user(:memberQ, format('with u as (update public.session_requests set status = ''withdrawn'' where id = %L returning 1) select count(*)::text from u', :'req_q')), '1');
select pg_temp.expect('a withdrawn request cannot be accepted',
  pg_temp.as_user(:coachC, format('select public.accept_session_request(%L)::text', :'req_q')), 'DENIED(55000)');
select pg_temp.expect('...nor can a member un-withdraw it',
  pg_temp.as_user(:memberQ, format('with u as (update public.session_requests set status = ''pending'' where id = %L returning 1) select count(*)::text from u', :'req_q')), 'DENIED(42501)');

-- A request whose time has gone by (the app never sends one; a stale screen could).
select pg_temp.expect('Q asks again, for an hour ago',
  pg_temp.as_user(:memberQ, format('with i as (insert into public.session_requests (member_id, coach_id, requested_start, price) values (%L, %L, now() - interval ''1 hour'', 0) returning 1) select count(*)::text from i', :memberQ, :coachC)), '1');
reset role;
select id as req_q_past from public.session_requests where member_id = :memberQ and status = 'pending' \gset
set role authenticated;
select pg_temp.expect('a time already passed is refused',
  pg_temp.as_user(:coachC, format('select public.accept_session_request(%L)::text', :'req_q_past')), 'DENIED(22023)');
select pg_temp.expect('the coach declines it instead',
  pg_temp.as_user(:coachC, format('with u as (update public.session_requests set status = ''declined'', responded_at = now() where id = %L returning 1) select count(*)::text from u', :'req_q_past')), '1');

-- A paid session: 50 minutes, and the offering names the program.
select pg_temp.expect('Q asks for a paid session',
  pg_temp.as_user(:memberQ, format('with i as (insert into public.session_requests (member_id, coach_id, offering_id, requested_start, price) values (%L, %L, %L, %L, 600) returning 1) select count(*)::text from i', :memberQ, :coachC, :offering, :'t2')), '1');
reset role;
select id as req_q2 from public.session_requests where member_id = :memberQ and status = 'pending' \gset
set role authenticated;
select pg_temp.expect('coach C accepts it',
  pg_temp.as_user(:coachC, format('select (public.accept_session_request(%L) is not null)::text', :'req_q2')), 'true');
reset role;
select pg_temp.expect('...a standard 50 minutes, program named',
  (select b.session_type || ':' || extract(epoch from b.ends_at - b.starts_at)::int / 60 || ':' || c.program
   from public.time_blocks b join public.clients c on c.id = b.client_id where c.member_id = :memberQ), 'standard:50:Career session');

-- An archived member coming back keeps their row and history.
update public.clients set active = false where id = :'client_p';
set role authenticated;
select pg_temp.expect('P asks again after being archived',
  pg_temp.as_user(:memberP, format('with i as (insert into public.session_requests (member_id, coach_id, requested_start, price) values (%L, %L, %L, 0) returning 1) select count(*)::text from i', :memberP, :coachC, :'t3')), '1');
reset role;
select id as req_p2 from public.session_requests where member_id = :memberP and status = 'pending' \gset
set role authenticated;
select pg_temp.expect('accepting returns the same roster row',
  pg_temp.as_user(:coachC, format('select (public.accept_session_request(%L) = %L::uuid)::text', :'req_p2', :'client_p')), 'true');
reset role;
select pg_temp.expect('...active again, both sessions on it',
  (select active::text from public.clients where id = :'client_p')
    || ':' || (select count(*) from public.sessions where client_id = :'client_p'), 'true:2');
select pg_temp.expect('...next session still the earlier one',
  (select (next_session_at = :'t1')::text from public.clients where id = :'client_p'), 'true');
select pg_temp.expect('still one roster row per member',
  (select count(*)::text from public.clients where coach_id = :coachC and member_id = :memberP), '1');
