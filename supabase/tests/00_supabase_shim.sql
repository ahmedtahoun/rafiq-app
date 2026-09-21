-- Minimal stand-in for what a real Supabase project already provides: the
-- auth schema, the auth.uid() a policy reads, and the three roles PostgREST
-- connects as. Nothing here is part of the app's own schema.
--
-- Re-runnable: it resets public and auth first, so the suite can be pointed
-- at the same database (a CI service container) over and over.

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- A real project reads this from the request's JWT; here the test sets the
-- same setting directly to act as a given user.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
