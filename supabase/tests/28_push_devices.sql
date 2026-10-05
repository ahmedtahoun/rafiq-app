-- 0023: the phones push-send writes to, and the coach being told about a
-- new request. Coach P (Pro) and members M, N are new here.
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
  select case when actual is not distinct from expected then 'PASS  ' else 'FAIL  ' end
      || rpad(label, 44)
      || ' expected=' || rpad(expected, 14) || ' actual=' || coalesce(actual, 'NULL');
$$;

-- register_device as `who`; returns 'ok' or the refusal.
create or replace function pg_temp.reg(who text, token text, platform text default 'android', lang text default 'en',
                                       tz text default 'Africa/Cairo', muted text default '{}') returns text
language sql as $$
  select pg_temp.as_user(who, format('select ''ok'' from (select public.register_device(%L, %L, %L, %L, %L::text[])) x',
                                     token, platform, lang, tz, muted));
$$;

-- A phone's row, as push-send reads it (no role: the service role's view).
create or replace function pg_temp.device(token text) returns text
language sql as $$
  select coalesce((select user_id::text || '|' || platform || '|' || lang || '|' || time_zone || '|' || array_to_string(muted, ',')
                    from public.device_tokens where device_tokens.token = device.token), 'none');
$$;

\set coachP  '''28282828-0000-0000-0000-00000000000c'''
\set memberM '''28282828-0000-0000-0000-000000000001'''
\set memberN '''28282828-0000-0000-0000-000000000002'''

select date_trunc('hour', now()) + interval '80 days' as t1 \gset
select date_trunc('hour', now()) + interval '81 days' as t2 \gset

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachP,  'coachP@x.com',  '{"role":"coach","full_name":"Coach Passant"}'),
  (:memberM, 'memberM@x.com', '{"role":"client","full_name":"Member Mai"}'),
  (:memberN, 'memberN@x.com', '{"role":"client","full_name":"Member Nader"}');
insert into public.coach_profiles (profile_id, title) values (:coachP, 'Life coaching');
insert into public.subscriptions (coach_id, tier) values (:coachP, 'pro');

-- Registering a phone ------------------------------------------------------------------
set role anon;
select pg_temp.expect('signed out, no phone is registered',
  pg_temp.reg(:memberM, 'tok-a'), 'DENIED(42501)');
reset role;
set role authenticated;
select pg_temp.expect('a member registers their phone',
  pg_temp.reg(:memberM, 'tok-a', 'ios', 'ar', 'Africa/Cairo', '{tasks}'), 'ok');
reset role;
select pg_temp.expect('...stored as theirs, with language, zone, switches',
  pg_temp.device('tok-a'), :memberM || '|ios|ar|Africa/Cairo|tasks');
set role authenticated;
select pg_temp.expect('nobody reads the table directly',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.device_tokens'), 'DENIED(42501)');
select pg_temp.expect('...or writes it directly',
  pg_temp.as_user(:memberM, format('insert into public.device_tokens (token, user_id, platform, lang, time_zone) values (''tok-x'', %L, ''ios'', ''en'', ''UTC'') returning 1', :memberM)),
  'DENIED(42501)');
select pg_temp.expect('an unknown time zone is refused',
  pg_temp.reg(:memberM, 'tok-b', 'ios', 'en', 'Mars/Olympus'), 'DENIED(22023)');
select pg_temp.expect('...as is an unknown language',
  pg_temp.reg(:memberM, 'tok-b', 'ios', 'fr'), 'DENIED(23514)');
select pg_temp.expect('...an unknown platform',
  pg_temp.reg(:memberM, 'tok-b', 'web'), 'DENIED(23514)');
select pg_temp.expect('...and a switch that isn''t a category',
  pg_temp.reg(:memberM, 'tok-b', 'ios', 'en', 'UTC', '{payments}'), 'DENIED(23514)');
reset role;
select pg_temp.expect('...none of which left a row',
  pg_temp.device('tok-b') || '/' || pg_temp.device('tok-x'), 'none/none');
set role authenticated;

select pg_temp.expect('registering again updates the same row',
  pg_temp.reg(:memberM, 'tok-a', 'ios', 'en', 'Europe/London', '{}'), 'ok');
reset role;
select pg_temp.expect('...one row, now English, London, nothing muted',
  (select count(*)::text from public.device_tokens where token = 'tok-a') || '/' || pg_temp.device('tok-a'),
  '1/' || :memberM || '|ios|en|Europe/London|');
set role authenticated;

-- Someone else signs in on that phone ----------------------------------------------
select pg_temp.expect('member N registers the same phone',
  pg_temp.reg(:memberN, 'tok-a'), 'ok');
reset role;
select pg_temp.expect('...the phone is N''s now, not M''s too',
  pg_temp.device('tok-a') || '/' || (select count(*)::text from public.device_tokens where user_id = :memberM),
  :memberN || '|android|en|Africa/Cairo|/0');
set role authenticated;
select pg_temp.expect('M signing out can''t take it off N',
  pg_temp.as_user(:memberM, 'select ''ok'' from (select public.unregister_device(''tok-a'')) x'), 'ok');
reset role;
select pg_temp.expect('...it is still N''s',
  pg_temp.device('tok-a'), :memberN || '|android|en|Africa/Cairo|');
set role authenticated;
select pg_temp.expect('N signing out removes it',
  pg_temp.as_user(:memberN, 'select ''ok'' from (select public.unregister_device(''tok-a'')) x'), 'ok');
reset role;
select pg_temp.expect('...gone', pg_temp.device('tok-a'), 'none');
set role anon;
select pg_temp.expect('signed out, nothing is unregistered',
  pg_temp.as_user(:memberN, 'select ''ok'' from (select public.unregister_device(''tok-a'')) x'), 'DENIED(42501)');
reset role;

-- At most ten phones each -------------------------------------------------------------------
set role authenticated;
select pg_temp.expect('M registers eleven phones',
  (select string_agg(distinct pg_temp.reg(:memberM, 'cap-' || lpad(i::text, 2, '0')), ',') from generate_series(1, 11) i), 'ok');
reset role;
select pg_temp.expect('...ten are kept, the oldest dropped',
  (select count(*)::text from public.device_tokens where user_id = :memberM) || '/' || pg_temp.device('cap-01') || '/'
  || (pg_temp.device('cap-11') <> 'none')::text,
  '10/none/true');

-- A new request tells its coach ---------------------------------------------------------------
set role authenticated;
select pg_temp.as_user(:memberM, format(
  'insert into public.session_requests (member_id, coach_id, requested_start, price, status) values (%L, %L, %L, 0, ''pending'') returning id::text',
  :memberM, :coachP, :'t1')) as req1 \gset
reset role;
select pg_temp.expect('the coach is told about a stranger''s request',
  (select count(*)::text || '|' || max(payload->>'member_name') || '|' || max(payload->>'move') || '|' || coalesce(max(client_id::text), 'none')
          || '|' || bool_and((payload->>'requested_start')::timestamptz = :'t1')::text || '|' || bool_and(payload->>'request_id' = :'req1')::text
   from public.notifications where recipient_id = :coachP and kind = 'request-received'),
  '1|Member Mai|false|none|true|true');
select pg_temp.expect('...and the member about nothing',
  (select count(*)::text from public.notifications where recipient_id = :memberM and kind = 'request-received'), '0');
set role authenticated;
select pg_temp.expect('...which the coach can read',
  pg_temp.as_user(:coachP, 'select count(*)::text from public.notifications where kind = ''request-received'''), '1');
select pg_temp.expect('...and the member can''t',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.notifications where kind = ''request-received'''), '0');

-- Accepted, then a move asked for: that one points at the roster row.
select pg_temp.expect('the coach accepts it',
  pg_temp.as_user(:coachP, format('select (public.accept_session_request(%L) is not null)::text', :'req1')), 'true');
reset role;
select id as client_m from public.clients where coach_id = :coachP and member_id = :memberM \gset
select id as block_m from public.time_blocks where client_id = :'client_m' and kind = 'booked' \gset
set role authenticated;
select pg_temp.expect('M asks to move the booked session',
  pg_temp.as_user(:memberM, format(
    'insert into public.session_requests (member_id, coach_id, requested_start, price, status, reschedule_of) values (%L, %L, %L, 0, ''pending'', %L) returning ''ok''',
    :memberM, :coachP, :'t2', :'block_m')), 'ok');
reset role;
select pg_temp.expect('...the coach is told it is a move, on M''s row',
  (select (payload->>'move') || '|' || (client_id = :'client_m')::text from public.notifications
   where recipient_id = :coachP and kind = 'request-received' order by created_at desc, id desc limit 1),
  'true|true');

select pg_temp.expect('the trigger function isn''t callable by users',
  has_function_privilege('authenticated', 'public.on_session_request_created()', 'execute')::text
  || '/' || has_function_privilege('anon', 'public.register_device(text, text, text, text, text[])', 'execute')::text,
  'false/false');
