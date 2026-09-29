-- 0013's client invites: a coach issues a code on a walk-in roster row, a
-- member peeks at it and claims it. Own fixtures: coach I (walk-ins W1–W4),
-- coach S (suspended, walk-in W5), members J and K.
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

\set coachI  '''17171717-0000-0000-0000-000000000001'''
\set coachS  '''17171717-0000-0000-0000-000000000002'''
\set memberJ '''17171717-0000-0000-0000-00000000000a'''
\set memberK '''17171717-0000-0000-0000-00000000000b'''
\set w1 '''17171717-1111-0000-0000-000000000001'''
\set w2 '''17171717-1111-0000-0000-000000000002'''
\set w3 '''17171717-1111-0000-0000-000000000003'''
\set w4 '''17171717-1111-0000-0000-000000000004'''
\set w5 '''17171717-1111-0000-0000-000000000005'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachI,  'coachI@x.com',  '{"role":"coach","full_name":"Coach Iman"}'),
  (:coachS,  'coachS@x.com',  '{"role":"coach","full_name":"Coach S"}'),
  (:memberJ, 'memberJ@x.com', '{"role":"client","full_name":"Member J"}'),
  (:memberK, 'memberK@x.com', '{"role":"client","full_name":"Member K"}');
insert into public.coach_profiles (profile_id, title) values (:coachI, 'Life coaching'), (:coachS, 'Career');
insert into public.clients (id, coach_id, full_name, active) values
  (:w1, :coachI, 'Walk-in One', true),
  (:w2, :coachI, 'Walk-in Two', true),
  (:w3, :coachI, 'Walk-in Three', true),
  (:w4, :coachI, 'Archived Four', false),
  (:w5, :coachS, 'Walk-in Five', true);

set role anon;
select pg_temp.expect('signed out cannot issue an invite',
  pg_temp.as_user(:coachI, format('select public.create_client_invite(%L)::text', :w1)), 'DENIED(42501)');
set role authenticated;

-- Only the functions write the code ---------------------------------------------------
select pg_temp.expect('a coach cannot set a code by hand',
  pg_temp.as_user(:coachI, format('update public.clients set invite_code = %L where id = %L returning 1', 'AAAAAAAAAA', :w1)), 'DENIED(42501)');
select pg_temp.expect('...nor insert a row with one',
  pg_temp.as_user(:coachI, format('insert into public.clients (coach_id, full_name, invite_code) values (%L, ''X'', ''BBBBBBBBBB'') returning 1', :coachI)), 'DENIED(42501)');
select pg_temp.expect('...but still edits the row otherwise',
  pg_temp.as_user(:coachI, format('with u as (update public.clients set goal = ''Run'' where id = %L returning 1) select count(*)::text from u', :w1)), '1');

-- Issuing -----------------------------------------------------------------------------------
select pg_temp.expect('another coach cannot issue on this row',
  pg_temp.as_user(:coachS, format('select public.create_client_invite(%L) ->> ''error''', :w1)), 'not_found');
select pg_temp.expect('an archived row gets no invite',
  pg_temp.as_user(:coachI, format('select public.create_client_invite(%L) ->> ''error''', :w4)), 'archived');
select pg_temp.as_user(:coachI, format('select public.create_client_invite(%L) ->> ''code''', :w1)) as code1 \gset
select pg_temp.expect('the code is 10 Crockford characters',
  (:'code1' ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$')::text, 'true');
select pg_temp.expect('it expires in 14 days',
  pg_temp.as_user(:coachI, format('select (invite_expires_at::date - now()::date)::text from public.clients where id = %L', :w1)), '14');

-- Peeking -----------------------------------------------------------------------------------
select pg_temp.expect('member peeks, typed loosely',
  pg_temp.as_user(:memberJ, format('select public.peek_client_invite(%L) ->> ''coach_name''',
    lower(left(:'code1', 5)) || ' - ' || lower(right(:'code1', 5)))), 'Coach Iman');
select pg_temp.expect('...and sees whose row it is',
  pg_temp.as_user(:memberJ, format('select public.peek_client_invite(%L) ->> ''client_name''', :'code1')), 'Walk-in One');
select pg_temp.expect('a wrong code says only not_found',
  pg_temp.as_user(:memberJ, 'select public.peek_client_invite(''ZZZZZZZZZZ'')::text'), '{"error": "not_found"}');
select pg_temp.expect('a coach cannot claim',
  pg_temp.as_user(:coachS, format('select public.claim_client_invite(%L) ->> ''error''', :'code1')), 'not_a_member');
select pg_temp.expect('the member cannot read the row before',
  pg_temp.as_user(:memberJ, format('select count(*)::text from public.clients where id = %L', :w1)), '0');

-- Claiming ----------------------------------------------------------------------------------
select pg_temp.expect('member J claims it',
  pg_temp.as_user(:memberJ, format('select public.claim_client_invite(%L) ->> ''client_id''', :'code1')), trim(both '''' from :'w1'));
select pg_temp.expect('...linked, and the code is spent',
  pg_temp.as_user(:memberJ, format('select member_id || ''|'' || coalesce(invite_code, ''-'') from public.clients where id = %L', :w1)), trim(both '''' from :'memberJ') || '|-');
select pg_temp.expect('a second claim finds nothing',
  pg_temp.as_user(:memberK, format('select public.claim_client_invite(%L) ->> ''error''', :'code1')), 'not_found');
select pg_temp.expect('no invite on a linked row',
  pg_temp.as_user(:coachI, format('select public.create_client_invite(%L) ->> ''error''', :w1)), 'already_linked');

select pg_temp.as_user(:coachI, format('select public.create_client_invite(%L) ->> ''code''', :w3)) as code3 \gset
select pg_temp.expect('J already works with coach I',
  pg_temp.as_user(:memberJ, format('select public.claim_client_invite(%L) ->> ''error''', :'code3')), 'already_linked');
select pg_temp.expect('...peek still names the coach',
  pg_temp.as_user(:memberJ, format('select public.peek_client_invite(%L) ->> ''coach_name''', :'code3')), 'Coach Iman');

-- Replacing, revoking, expiring ---------------------------------------------------------------
select pg_temp.as_user(:coachI, format('select public.create_client_invite(%L) ->> ''code''', :w2)) as code2a \gset
select pg_temp.as_user(:coachI, format('select public.create_client_invite(%L) ->> ''code''', :w2)) as code2b \gset
select pg_temp.expect('issuing again replaces the old code',
  pg_temp.as_user(:memberK, format('select public.peek_client_invite(%L) ->> ''error''', :'code2a')), 'not_found');
select pg_temp.expect('revoke',
  pg_temp.as_user(:coachI, format('select public.revoke_client_invite(%L) ->> ''ok''', :w2)), 'true');
select pg_temp.expect('...and the code is dead',
  pg_temp.as_user(:memberK, format('select public.peek_client_invite(%L) ->> ''error''', :'code2b')), 'not_found');
select pg_temp.as_user(:coachI, format('select public.create_client_invite(%L) ->> ''code''', :w2)) as code2c \gset
reset role;
update public.clients set invite_expires_at = now() - interval '1 minute' where id = :w2;
set role authenticated;
select pg_temp.expect('an expired code',
  pg_temp.as_user(:memberK, format('select public.claim_client_invite(%L) ->> ''error''', :'code2c')), 'expired');

select pg_temp.as_user(:coachS, format('select public.create_client_invite(%L) ->> ''code''', :w5)) as code5 \gset
reset role;
update public.profiles set account_status = 'suspended' where id = :coachS;
set role authenticated;
select pg_temp.expect('a suspended coach''s code is not_found',
  pg_temp.as_user(:memberK, format('select public.peek_client_invite(%L) ->> ''error''', :'code5')), 'not_found');

-- Rate limit: K has 5 failures so far (4 not_found, 1 expired); 5 more reach 10.
select pg_temp.expect('five more wrong guesses',
  pg_temp.as_user(:memberK, 'select count(*)::text from generate_series(1, 5) g where public.claim_client_invite(''WRONG'' || lpad(g::text, 5, ''0'')) ->> ''error'' = ''not_found'''), '5');
select pg_temp.as_user(:coachI, format('select public.revoke_client_invite(%L) ->> ''ok''', :w3)) as _r \gset
select pg_temp.as_user(:coachI, format('select public.create_client_invite(%L) ->> ''code''', :w3)) as code3b \gset
select pg_temp.expect('...then even a good code is refused',
  pg_temp.as_user(:memberK, format('select public.claim_client_invite(%L) ->> ''error''', :'code3b')), 'rate_limited');
select pg_temp.expect('...and the row stays unlinked',
  pg_temp.as_user(:coachI, format('select coalesce(member_id::text, ''null'') from public.clients where id = %L', :w3)), 'null');
select pg_temp.expect('another member is not limited',
  pg_temp.as_user(:memberJ, 'select public.peek_client_invite(''ZZZZZZZZZZ'') ->> ''error'''), 'not_found');
select pg_temp.expect('nobody reads the attempts table',
  pg_temp.as_user(:memberK, 'select count(*)::text from public.client_invite_attempts'), 'DENIED(42501)');

reset role;
