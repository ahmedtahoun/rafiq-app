-- 0021: a member is told when a coach accepts or declines their session
-- request, under the real functions and policies. Coach D (Pro) and coach
-- E (free, already at the limit) are new here, with members R, S and V.
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

-- Null-safe: a check whose query comes back null fails, rather than
-- printing nothing and dropping out of the count.
create or replace function pg_temp.expect(label text, actual text, expected text) returns text
language sql immutable as $$
  select case when actual is not distinct from expected then 'PASS  ' else 'FAIL  ' end
      || rpad(label, 44)
      || ' expected=' || rpad(expected, 14) || ' actual=' || coalesce(actual, 'NULL');
$$;

-- A member's request, as the app sends it; returns its id.
create or replace function pg_temp.ask(member text, coach text, start_at timestamptz, moves text default null) returns text
language sql as $$
  select pg_temp.as_user(member, format(
    'insert into public.session_requests (member_id, coach_id, requested_start, price, status, reschedule_of)'
    || ' values (%L, %L, %L, 0, ''pending'', %L) returning id::text',
    member, coach, start_at, moves));
$$;

-- What member `who` was told about requests, oldest first (kind:move), read
-- as that member: what their own Notifications screen can see.
create or replace function pg_temp.told(who text) returns text
language sql as $$
  select pg_temp.as_user(who,
    'select coalesce(string_agg(kind || '':'' || (payload->>''move''), '','' order by created_at, id), '''')'
    || ' from public.notifications where recipient_id = auth.uid() and kind in (''request-accepted'', ''request-declined'')');
$$;

\set coachD  '''25252525-0000-0000-0000-00000000000d'''
\set coachE  '''25252525-0000-0000-0000-00000000000e'''
\set memberR '''25252525-0000-0000-0000-000000000001'''
\set memberS '''25252525-0000-0000-0000-000000000002'''
\set memberV '''25252525-0000-0000-0000-000000000003'''

-- Whole hours, on days no other test books.
select date_trunc('hour', now()) + interval '70 days' as t1 \gset
select date_trunc('hour', now()) + interval '71 days' as t2 \gset
select date_trunc('hour', now()) + interval '72 days' as t3 \gset
select date_trunc('hour', now()) + interval '73 days' as t4 \gset

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachD,  'coachD@x.com',  '{"role":"coach","full_name":"Coach Dalia"}'),
  (:coachE,  'coachE@x.com',  '{"role":"coach","full_name":"Coach Essam"}'),
  (:memberR, 'memberR@x.com', '{"role":"client","full_name":"Member Rana"}'),
  (:memberS, 'memberS@x.com', '{"role":"client","full_name":"Member Sami"}'),
  (:memberV, 'memberV@x.com', '{"role":"client","full_name":"Member Vera"}');
insert into public.coach_profiles (profile_id, title) values (:coachD, 'Life coaching'), (:coachE, 'Sleep coaching');
insert into public.subscriptions (coach_id, tier) values (:coachD, 'pro');
-- Coach E is on the free plan with its three members already active (0020).
insert into public.clients (coach_id, full_name) values (:coachE, 'Walk-in 1'), (:coachE, 'Walk-in 2'), (:coachE, 'Walk-in 3');

set role authenticated;

-- Accepted ---------------------------------------------------------------------------
select pg_temp.ask(:memberR, :coachD, :'t1') as req_r1 \gset
select pg_temp.expect('nothing told while the request is open',
  pg_temp.told(:memberR), '');
select pg_temp.expect('coach D accepts R''s request',
  pg_temp.as_user(:coachD, format('select (public.accept_session_request(%L) is not null)::text', :'req_r1')), 'true');
select pg_temp.expect('R is told it was accepted, once',
  pg_temp.told(:memberR), 'request-accepted:false');

reset role;
select id as client_r from public.clients where coach_id = :coachD and member_id = :memberR \gset
select id as block_r from public.time_blocks where client_id = :'client_r' and kind = 'booked' \gset
select pg_temp.expect('...pointing at the new roster row',
  (select (client_id = :'client_r')::text from public.notifications where recipient_id = :memberR and kind = 'request-accepted'), 'true');
select pg_temp.expect('...naming the coach and the time',
  (select (payload->>'coach_name') || '|' || ((payload->>'requested_start')::timestamptz = :'t1')::text || '|' || (payload->>'coach_id')
   from public.notifications where recipient_id = :memberR and kind = 'request-accepted'),
  'Coach Dalia|true|' || :coachD);
select pg_temp.expect('the coach is told nothing about their own answer',
  (select count(*)::text from public.notifications where recipient_id = :coachD and kind in ('request-accepted', 'request-declined')), '0');
set role authenticated;

-- Declined -----------------------------------------------------------------------------
select pg_temp.ask(:memberS, :coachD, :'t2') as req_s1 \gset
select pg_temp.expect('coach D declines S''s request',
  pg_temp.as_user(:coachD, format('with u as (update public.session_requests set status = ''declined'', responded_at = now() where id = %L returning 1) select count(*)::text from u', :'req_s1')), '1');
select pg_temp.expect('S is told it was declined',
  pg_temp.told(:memberS), 'request-declined:false');
reset role;
select pg_temp.expect('...with no roster row: S is a stranger to D',
  (select coalesce(client_id::text, 'none') from public.notifications where recipient_id = :memberS and kind = 'request-declined'), 'none');
set role authenticated;

-- Withdrawn --------------------------------------------------------------------------------
select pg_temp.ask(:memberS, :coachD, :'t3') as req_s2 \gset
select pg_temp.expect('S withdraws their next request',
  pg_temp.as_user(:memberS, format('with u as (update public.session_requests set status = ''withdrawn'' where id = %L returning 1) select count(*)::text from u', :'req_s2')), '1');
select pg_temp.expect('...and nobody is told',
  pg_temp.told(:memberS) || '/' || (select count(*)::text from public.notifications where recipient_id = :coachD and kind in ('request-accepted', 'request-declined')),
  'request-declined:false/0');

-- Moves -------------------------------------------------------------------------------------
select pg_temp.ask(:memberR, :coachD, :'t3', :'block_r') as req_r_move1 \gset
select pg_temp.expect('coach D declines R''s move',
  pg_temp.as_user(:coachD, format('with u as (update public.session_requests set status = ''declined'', responded_at = now() where id = %L returning 1) select count(*)::text from u', :'req_r_move1')), '1');
select pg_temp.expect('R is told the move was declined',
  pg_temp.told(:memberR), 'request-accepted:false,request-declined:true');

select pg_temp.ask(:memberR, :coachD, :'t4', :'block_r') as req_r_move2 \gset
select pg_temp.expect('coach D accepts R''s next move',
  pg_temp.as_user(:coachD, format('select (public.accept_session_request(%L) is not null)::text', :'req_r_move2')), 'true');
select pg_temp.expect('...no request notice for it',
  pg_temp.told(:memberR), 'request-accepted:false,request-declined:true');
reset role;
select pg_temp.expect('...0011 tells R it moved, once',
  (select count(*)::text from public.notifications where recipient_id = :memberR and kind = 'session-moved'), '1');
set role authenticated;

-- A refused accept tells nobody ------------------------------------------------------------
-- The free plan's limit refuses the roster row after the request was marked
-- accepted (0020); the whole accept rolls back, the notice with it.
select pg_temp.ask(:memberV, :coachE, :'t1') as req_v1 \gset
select pg_temp.expect('coach E at the free limit cannot accept V',
  pg_temp.as_user(:coachE, format('select public.accept_session_request(%L)::text', :'req_v1')), 'DENIED(53400)');
select pg_temp.expect('...and V is told nothing',
  pg_temp.told(:memberV), '');
select pg_temp.expect('...the request is still open',
  pg_temp.as_user(:memberV, format('select status::text from public.session_requests where id = %L', :'req_v1')), 'pending');

-- Who reads them ------------------------------------------------------------------------------
select pg_temp.expect('R reads their own notices',
  pg_temp.as_user(:memberR, 'select count(*)::text from public.notifications where kind in (''request-accepted'', ''request-declined'')'), '2');
select pg_temp.expect('coach D reads none of R''s',
  pg_temp.as_user(:coachD, format('select count(*)::text from public.notifications where recipient_id = %L', :memberR)), '0');
select pg_temp.expect('a member cannot write one themselves',
  pg_temp.as_user(:memberR, format('insert into public.notifications (recipient_id, kind) values (%L, ''request-accepted'') returning 1', :memberR)), 'DENIED(42501)');

reset role;
select pg_temp.expect('the trigger function is not an RPC',
  has_function_privilege('authenticated', 'public.on_session_request_answered()', 'execute')::text, 'false');
