-- 0018: the advisor findings stay fixed, and the triggers still fire after
-- losing their EXECUTE grants. The catalogue checks are general on purpose —
-- a trigger function, SECURITY DEFINER function or foreign key added by a
-- later migration is held to the same rule. Own fixtures: coach T, walk-in W.
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

\set coachT '''22222222-0000-0000-0000-000000000001'''
\set walkW  '''22222222-1111-0000-0000-000000000001'''

-- The catalogue ---------------------------------------------------------------------------
select pg_temp.expect('no trigger function callable signed in',
  (select coalesce(string_agg(p.proname, ','), 'none') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'execute')), 'none');
select pg_temp.expect('...nor signed out',
  (select coalesce(string_agg(p.proname, ','), 'none') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute')), 'none');
select pg_temp.expect('every definer function pins search_path',
  (select coalesce(string_agg(p.proname, ','), 'none') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 'none');
select pg_temp.expect('set_updated_at pins search_path',
  (select coalesce(array_to_string(proconfig, ','), 'none') from pg_proc where oid = 'public.set_updated_at()'::regprocedure), 'search_path=""');
select pg_temp.expect('signed out reads no table or view',
  (select coalesce(string_agg(c.relname, ','), 'none') from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') and has_table_privilege('anon', c.oid, 'select')), 'none');
-- A foreign key is covered when some index starts with exactly its columns.
select pg_temp.expect('every foreign key has an index',
  (select coalesce(string_agg(k.conname, ','), 'none')
     from pg_constraint k join pg_namespace n on n.oid = k.connamespace
    where n.nspname = 'public' and k.contype = 'f'
      and not exists (
        select 1 from pg_index i
         where i.indrelid = k.conrelid
           and (i.indkey::int2[])[0:array_length(k.conkey, 1) - 1] @> k.conkey
           and (i.indkey::int2[])[0:array_length(k.conkey, 1) - 1] <@ k.conkey)), 'none');

-- The triggers still fire -----------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (:coachT, 'coachT@x.com', '{"role":"coach","full_name":"Coach T"}');
insert into public.coach_profiles (profile_id, title) values (:coachT, 'Life coaching');
insert into public.clients (id, coach_id, full_name) values (:walkW, :coachT, 'Walk-in W');
update public.profiles set updated_at = '2000-01-01' where id = :coachT;

set role authenticated;
select pg_temp.expect('updated_at still stamps',
  pg_temp.as_user(:coachT, format('with u as (update public.profiles set city = ''Giza'' where id = %L returning updated_at) select (updated_at > ''2001-01-01'')::text from u', :coachT)), 'true');
select pg_temp.expect('the invite guard still refuses',
  pg_temp.as_user(:coachT, format('update public.clients set invite_code = ''AAAAAAAAAA'' where id = %L returning 1', :walkW)), 'DENIED(42501)');
select pg_temp.expect('the block guard still refuses',
  pg_temp.as_user(:coachT, format('update public.clients set blocked_by_coach_at = now() where id = %L returning 1', :walkW)), 'DENIED(42501)');
select pg_temp.expect('the trigger cannot be called as an RPC',
  pg_temp.as_user(:coachT, 'select public.sync_verification_status()::text'), 'DENIED(42501)');
reset role;
