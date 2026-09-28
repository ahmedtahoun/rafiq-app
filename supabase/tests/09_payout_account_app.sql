-- The payout account screen's own writes (src/lib/payoutData.ts), against
-- 0007's real constraints. The validation cases are the ones
-- tests/payout-account.spec.js runs through the form's validator, written
-- here as the row the form would send — so the form and the table agree
-- on every one of them. Change one list, change the other.
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

-- The app's save: every column, the unused destination kind as null.
create or replace function pg_temp.save_sql(verb text, coach text, issuer text, msisdn text, bank_code text, account_number text, full_name text, national_id text) returns text
language sql immutable as $$
  select case verb
    when 'insert' then
      'with i as (insert into public.coach_payout_accounts (coach_id, issuer, msisdn, bank_code, account_number, full_name, national_id) values ('
        || quote_literal(coach) || ', ' || quote_literal(issuer) || ', ' || quote_nullable(msisdn) || ', ' || quote_nullable(bank_code) || ', '
        || quote_nullable(account_number) || ', ' || quote_literal(full_name) || ', ' || quote_literal(national_id) || ') returning 1) select count(*)::text from i'
    else
      'with u as (update public.coach_payout_accounts set issuer = ' || quote_literal(issuer) || ', msisdn = ' || quote_nullable(msisdn)
        || ', bank_code = ' || quote_nullable(bank_code) || ', account_number = ' || quote_nullable(account_number)
        || ', full_name = ' || quote_literal(full_name) || ', national_id = ' || quote_literal(national_id)
        || ' where coach_id = ' || quote_literal(coach) || ' returning 1) select count(*)::text from u'
  end;
$$;

-- Coach C (07_profiles) has a coach profile and, after 08, no payout account.
\set coachC '''55555555-5555-5555-5555-555555555555'''

set role authenticated;

-- Insert first, then update --------------------------------------------------------
select pg_temp.expect('app: first save inserts',
  pg_temp.as_user(:coachC, pg_temp.save_sql('insert', :coachC, 'etisalat', '01098765432', null, null, 'Rana Coach', '29912310104567')), '1');
select pg_temp.expect('app: second insert is a 23505 conflict',
  pg_temp.as_user(:coachC, pg_temp.save_sql('insert', :coachC, 'vodafone', '01098765432', null, null, 'Rana Coach', '29912310104567')), 'DENIED(23505)');
select pg_temp.expect('app: ...so it updates instead',
  pg_temp.as_user(:coachC, pg_temp.save_sql('update', :coachC, 'instant_bank', null, 'CIB', 'EG380019000500000000263180002', 'Rana Coach', '29912310104567')), '1');
select pg_temp.expect('app: switching kind cleared the wallet',
  pg_temp.as_user(:coachC, 'select coalesce(msisdn, ''null'') || '','' || bank_code from public.coach_payout_accounts'), 'null,CIB');
select pg_temp.expect('app: reads back only its own account',
  pg_temp.as_user(:coachC, 'select count(*)::text from public.coach_payout_accounts'), '1');

-- The form's validation cases ------------------------------------------------------
select pg_temp.expect('case: ' || label, pg_temp.as_user(:coachC, pg_temp.save_sql('update', :coachC, issuer, msisdn, bank, acct, name, nid)), expected)
from (values
  ('wallet, valid',               'vodafone',     '01098765432',  null,          null,                             'Rana Coach', '29912310104567', '1'),
  ('wallet, 10 digits',           'vodafone',     '0109876543',   null,          null,                             'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('wallet, 12 digits',           'vodafone',     '010987654321', null,          null,                             'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('wallet, not starting 01',     'vodafone',     '02098765432',  null,          null,                             'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('wallet, letters',             'vodafone',     '0109876543a',  null,          null,                             'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('bank, 6-digit account',       'instant_bank', null,           'CIB',         '123456',                         'Rana Coach', '29912310104567', '1'),
  ('bank, 20-digit account',      'instant_bank', null,           'NBE',         '12345678901234567890',           'Rana Coach', '29912310104567', '1'),
  ('bank, 5-digit account',       'instant_bank', null,           'NBE',         '12345',                          'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('bank, 21-digit account',      'instant_bank', null,           'NBE',         '123456789012345678901',          'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('bank, IBAN',                  'instant_bank', null,           'MISR',        'EG380019000500000000263180002',  'Rana Coach', '29912310104567', '1'),
  ('bank, IBAN one digit short',  'instant_bank', null,           'MISR',        'EG38001900050000000026318000',   'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('bank, non-Egyptian IBAN',     'instant_bank', null,           'MISR',        'GB380019000500000000263180002',  'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('bank, no bank chosen',        'instant_bank', null,           '',            '123456',                         'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('bank, lower-case code',       'instant_bank', null,           'cib',         '123456',                         'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('bank, 11-letter code',        'instant_bank', null,           'ABCDEFGHIJK', '123456',                         'Rana Coach', '29912310104567', 'DENIED(23514)'),
  ('name blank',                  'vodafone',     '01098765432',  null,          null,                             '',           '29912310104567', 'DENIED(23514)'),
  ('national id, 13 digits',      'vodafone',     '01098765432',  null,          null,                             'Rana Coach', '9912310104567',  'DENIED(23514)'),
  ('national id, 15 digits',      'vodafone',     '01098765432',  null,          null,                             'Rana Coach', '299123101045671', 'DENIED(23514)'),
  ('everything missing',          'vodafone',     '',             null,          null,                             '',           '',               'DENIED(23514)')
) as c(label, issuer, msisdn, bank, acct, name, nid, expected);

reset role;
