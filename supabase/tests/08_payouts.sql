-- 0007 assertions: coach payout accounts, the payouts ledger, admin_users.
-- The app may only manage its own payout account and read its own payouts;
-- creating, sending and settling a payout is service_role's alone.
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

-- For the checks that run as the owner (standing in for service_role).
create or replace function pg_temp.try(q text) returns text
language plpgsql as $$
begin
  execute q;
  return 'OK';
exception when others then
  return 'REJECTED(' || sqlstate || ')';
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

-- A payout for coach A, as the Edge Function (service_role) would create it.
insert into public.payouts (id, coach_id, amount, issuer, destination) values
  ('ffffffff-0000-4000-8000-000000000001', :coachA, 500, 'vodafone',
   '{"msisdn":"01012345678","full_name":"Coach A","national_id":"29005270102927"}'),
  -- Coach B has no payments, so only this payout can block erasing them.
  ('ffffffff-0000-4000-8000-000000000002', :coachB, 200, 'orange',
   '{"msisdn":"01212345678","full_name":"Coach B","national_id":"29005270102927"}');

set role authenticated;

-- Payout accounts --------------------------------------------------------------
select pg_temp.expect('coach saves own wallet account',
  pg_temp.as_user(:coachA, 'with i as (insert into public.coach_payout_accounts (coach_id, issuer, msisdn, full_name, national_id) values (' || quote_literal(:coachA) || ', ''vodafone'', ''01012345678'', ''Coach A'', ''29005270102927'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach cannot set another coach account',
  pg_temp.as_user(:coachA, 'with i as (insert into public.coach_payout_accounts (coach_id, issuer, msisdn, full_name, national_id) values (' || quote_literal(:coachB) || ', ''vodafone'', ''01099999999'', ''Thief'', ''29005270102927'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('wallet needs an 11-digit mobile',
  pg_temp.as_user(:coachA, 'with u as (update public.coach_payout_accounts set msisdn = ''1012345678'' returning 1) select count(*)::text from u'), 'DENIED(23514)');
select pg_temp.expect('wallet account cannot carry bank fields',
  pg_temp.as_user(:coachA, 'with u as (update public.coach_payout_accounts set bank_code = ''CIB'', account_number = ''1234567890'' returning 1) select count(*)::text from u'), 'DENIED(23514)');
select pg_temp.expect('national id must be 14 digits',
  pg_temp.as_user(:coachA, 'with u as (update public.coach_payout_accounts set national_id = ''123'' returning 1) select count(*)::text from u'), 'DENIED(23514)');
select pg_temp.expect('coach switches to an instant bank IBAN',
  pg_temp.as_user(:coachA, 'with u as (update public.coach_payout_accounts set issuer = ''instant_bank'', msisdn = null, bank_code = ''AAIB'', account_number = ''EG187277769381221446527989011'' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('other coach cannot read the account',
  pg_temp.as_user(:coachB, 'select count(*)::text from public.coach_payout_accounts'), '0');
select pg_temp.expect('member cannot read payout accounts',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.coach_payout_accounts'), '0');

-- The payouts ledger ------------------------------------------------------------
select pg_temp.expect('coach reads own payouts',
  pg_temp.as_user(:coachA, 'select count(*)::text from public.payouts'), '1');
select pg_temp.expect('other coach cannot read them',
  pg_temp.as_user(:coachB, 'select count(*)::text from public.payouts where coach_id = ' || quote_literal(:coachA)), '0');
select pg_temp.expect('app cannot create a payout',
  pg_temp.as_user(:coachA, 'with i as (insert into public.payouts (coach_id, amount, issuer, destination) values (' || quote_literal(:coachA) || ', 99999, ''vodafone'', ''{}'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('coach cannot mark own payout paid',
  pg_temp.as_user(:coachA, 'with u as (update public.payouts set status = ''success'' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('coach cannot delete a payout',
  pg_temp.as_user(:coachA, 'with d as (delete from public.payouts returning 1) select count(*)::text from d'), 'DENIED(42501)');

-- Admins ---------------------------------------------------------------------------
select pg_temp.expect('app cannot read admin_users',
  pg_temp.as_user(:coachA, 'select count(*)::text from public.admin_users'), 'DENIED(42501)');
select pg_temp.expect('app cannot make itself an admin',
  pg_temp.as_user(:coachA, 'with i as (insert into public.admin_users (profile_id) values (' || quote_literal(:coachA) || ') returning 1) select count(*)::text from i'), 'DENIED(42501)');

reset role;
set role anon;
select pg_temp.expect('signed-out cannot read payouts',
  pg_temp.as_user('', 'select count(*)::text from public.payouts'), 'DENIED(42501)');
reset role;

-- As the owner: the ledger keeps its history ---------------------------------------
select pg_temp.expect('a payout must be positive',
  pg_temp.try('insert into public.payouts (coach_id, amount, issuer, destination) values (' || quote_literal(:coachA) || ', 0, ''vodafone'', ''{}'')'), 'REJECTED(23514)');
select pg_temp.expect('a paid coach cannot be erased',
  pg_temp.try('delete from public.coach_profiles where profile_id = ' || quote_literal(:coachB)), 'REJECTED(23503)');
