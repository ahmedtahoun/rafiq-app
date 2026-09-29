-- 0014: blocking and who may send a message. Own fixtures: coach P with
-- member Q on roster row R, and a stranger, member Z.
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

\set coachP  '''18181818-0000-0000-0000-000000000001'''
\set memberQ '''18181818-0000-0000-0000-000000000002'''
\set memberZ '''18181818-0000-0000-0000-000000000003'''
\set relR    '''18181818-1111-0000-0000-000000000001'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachP,  'coachP@x.com',  '{"role":"coach","full_name":"Coach P"}'),
  (:memberQ, 'memberQ@x.com', '{"role":"client","full_name":"Member Q"}'),
  (:memberZ, 'memberZ@x.com', '{"role":"client","full_name":"Member Z"}');
insert into public.coach_profiles (profile_id, title) values (:coachP, 'Life coaching');
insert into public.clients (id, coach_id, member_id, full_name) values (:relR, :coachP, :memberQ, 'Member Q');

create or replace function pg_temp.send(who text, role text) returns text language sql as $$
  select format('with i as (insert into public.messages (client_id, sender_role, sender_id, body) values (%L, %L, %L, ''hi'') returning 1) select count(*)::text from i',
    '18181818-1111-0000-0000-000000000001', role, who);
$$;
create or replace function pg_temp.block(on_off boolean) returns text language sql as $$
  select format('select public.set_relationship_block(%L, %L)::text', '18181818-1111-0000-0000-000000000001', on_off);
$$;

set role authenticated;

select pg_temp.expect('coach writes to their member',  pg_temp.as_user(:coachP,  pg_temp.send(:coachP, 'coach')),   '1');
select pg_temp.expect('member writes back',            pg_temp.as_user(:memberQ, pg_temp.send(:memberQ, 'client')), '1');
select pg_temp.expect('a stranger cannot write in',    pg_temp.as_user(:memberZ, pg_temp.send(:memberZ, 'client')), 'DENIED(42501)');

-- Blocks: only through the function, and each side only their own ---------------------
select pg_temp.expect('a stranger cannot block',
  pg_temp.as_user(:memberZ, pg_temp.block(true)), '{"error": "not_found"}');
select pg_temp.expect('the coach cannot set a block by hand',
  pg_temp.as_user(:coachP, format('update public.clients set blocked_by_coach_at = now() where id = %L returning 1', :relR)), 'DENIED(42501)');
select pg_temp.expect('member blocks the coach',
  pg_temp.as_user(:memberQ, pg_temp.block(true)), '{"blocked_by_coach": false, "blocked_by_member": true}');
select pg_temp.expect('now the coach cannot write',    pg_temp.as_user(:coachP,  pg_temp.send(:coachP, 'coach')),   'DENIED(42501)');
select pg_temp.expect('...nor the member',             pg_temp.as_user(:memberQ, pg_temp.send(:memberQ, 'client')), 'DENIED(42501)');
select pg_temp.expect('the coach cannot lift it by hand',
  pg_temp.as_user(:coachP, format('update public.clients set blocked_by_member_at = null where id = %L returning 1', :relR)), 'DENIED(42501)');
select pg_temp.expect('...and unblocking lifts only their own',
  pg_temp.as_user(:coachP, pg_temp.block(false)), '{"blocked_by_coach": false, "blocked_by_member": true}');
select pg_temp.expect('both sides can see the block',
  pg_temp.as_user(:coachP, format('select (blocked_by_member_at is not null)::text from public.clients where id = %L', :relR)), 'true');
select pg_temp.expect('coach blocks too',
  pg_temp.as_user(:coachP, pg_temp.block(true)), '{"blocked_by_coach": true, "blocked_by_member": true}');
select pg_temp.expect('member lifts theirs',
  pg_temp.as_user(:memberQ, pg_temp.block(false)), '{"blocked_by_coach": true, "blocked_by_member": false}');
select pg_temp.expect('still blocked by the coach',     pg_temp.as_user(:memberQ, pg_temp.send(:memberQ, 'client')), 'DENIED(42501)');
select pg_temp.expect('coach lifts theirs',
  pg_temp.as_user(:coachP, pg_temp.block(false)), '{"blocked_by_coach": false, "blocked_by_member": false}');
select pg_temp.expect('messages flow again',           pg_temp.as_user(:memberQ, pg_temp.send(:memberQ, 'client')), '1');

-- Suspended accounts ----------------------------------------------------------------------
reset role;
update public.profiles set account_status = 'suspended' where id = :coachP;
set role authenticated;
select pg_temp.expect('no one writes to a suspended coach', pg_temp.as_user(:memberQ, pg_temp.send(:memberQ, 'client')), 'DENIED(42501)');
reset role;
update public.profiles set account_status = 'active' where id = :coachP;
update public.profiles set account_status = 'suspended' where id = :memberQ;
set role authenticated;
select pg_temp.expect('...nor to a suspended member',   pg_temp.as_user(:coachP, pg_temp.send(:coachP, 'coach')), 'DENIED(42501)');
reset role;
update public.profiles set account_status = 'active' where id = :memberQ;

set role anon;
select pg_temp.expect('signed out cannot block',
  pg_temp.as_user(:memberQ, pg_temp.block(true)), 'DENIED(42501)');
reset role;
