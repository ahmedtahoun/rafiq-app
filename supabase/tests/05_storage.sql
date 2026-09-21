-- Storage policy assertions (0003). The folder-per-uid convention is the whole
-- access control story for photos, so these check it holds from both sides.
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

-- The shim's foldername must drop the filename like Supabase's does, or every
-- policy below would be testing something laxer than production.
select pg_temp.expect('foldername drops the filename',
  (select array_to_string(storage.foldername('abc/avatar.png'), ',')), 'abc');
select pg_temp.expect('foldername of a bare filename is empty',
  (select coalesce(array_to_string(storage.foldername('avatar.png'), ','), '')), '');

select pg_temp.expect('both buckets exist and are private',
  (select count(*)::text from storage.buckets where id in ('avatars', 'covers') and not public), '2');

set role authenticated;

select pg_temp.expect('coach writes into own folder',
  pg_temp.as_user(:coachA, 'with i as (insert into storage.objects (bucket_id, name, owner) values (''avatars'', ' || quote_literal('11111111-1111-1111-1111-111111111111/avatar.png') || ', ' || quote_literal(:coachA) || ') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach writes a cover too',
  pg_temp.as_user(:coachA, 'with i as (insert into storage.objects (bucket_id, name, owner) values (''covers'', ' || quote_literal('11111111-1111-1111-1111-111111111111/cover.jpg') || ', ' || quote_literal(:coachA) || ') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach cannot write in members folder',
  pg_temp.as_user(:coachA, 'with i as (insert into storage.objects (bucket_id, name, owner) values (''avatars'', ' || quote_literal('33333333-3333-3333-3333-333333333333/avatar.png') || ', ' || quote_literal(:coachA) || ') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('a path with no folder is refused',
  pg_temp.as_user(:coachA, 'with i as (insert into storage.objects (bucket_id, name, owner) values (''avatars'', ''avatar.png'', ' || quote_literal(:coachA) || ') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('an unknown bucket is refused',
  pg_temp.as_user(:coachA, 'with i as (insert into storage.objects (bucket_id, name, owner) values (''documents'', ' || quote_literal('11111111-1111-1111-1111-111111111111/cv.pdf') || ', ' || quote_literal(:coachA) || ') returning 1) select count(*)::text from i'), 'DENIED(42501)');

-- Photos are readable by anyone signed in: Discover shows coach photos to
-- members who have no other relationship to that coach.
select pg_temp.expect('member can read a coach photo',
  pg_temp.as_user(:memberM, 'select count(*)::text from storage.objects where bucket_id = ''avatars'''), '1');
-- Signed out means the anon ROLE, not authenticated-with-no-uid: these
-- policies are granted `to authenticated`, so only a role switch actually
-- exercises them. anon holds the same table grants as in production, so a 0
-- here is the policy refusing, not a missing privilege.
reset role;
set role anon;
select pg_temp.expect('signed-out reads nothing',
  (select count(*)::text from storage.objects), '0');
select pg_temp.expect('signed-out cannot upload',
  pg_temp.as_user('', 'with i as (insert into storage.objects (bucket_id, name) values (''avatars'', ''x/y.png'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
reset role;
set role authenticated;

select pg_temp.expect('member cannot delete a coach photo',
  pg_temp.as_user(:memberM, 'with d as (delete from storage.objects where bucket_id = ''avatars'' returning 1) select count(*)::text from d'), '0');
select pg_temp.expect('member cannot rename into own folder',
  pg_temp.as_user(:memberM, 'with u as (update storage.objects set name = ' || quote_literal('33333333-3333-3333-3333-333333333333/stolen.png') || ' where bucket_id = ''avatars'' returning 1) select count(*)::text from u'), '0');
select pg_temp.expect('coach replaces own photo',
  pg_temp.as_user(:coachA, 'with u as (update storage.objects set name = ' || quote_literal('11111111-1111-1111-1111-111111111111/avatar2.png') || ' where bucket_id = ''avatars'' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('coach deletes own photo',
  pg_temp.as_user(:coachA, 'with d as (delete from storage.objects where bucket_id = ''avatars'' returning 1) select count(*)::text from d'), '1');

reset role;
