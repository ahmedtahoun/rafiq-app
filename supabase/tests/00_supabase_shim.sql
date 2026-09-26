-- Minimal stand-in for what a real Supabase project already provides: the
-- auth schema, the auth.uid() a policy reads, and the three roles PostgREST
-- connects as. Nothing here is part of the app's own schema.
--
-- Re-runnable: it resets public and auth first, so the suite can be pointed
-- at the same database (a CI service container) over and over.

drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists storage cascade;
create schema public;
create schema auth;
create schema storage;

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

-- Storage. Supabase ships these; the shapes below are only as much as the
-- policies in 0003 actually touch (bucket_id, name, owner).
create table storage.buckets (
  id         text primary key,
  name       text        not null,
  public     boolean     not null default false,
  created_at timestamptz not null default now()
);

create table storage.objects (
  id         uuid        primary key default gen_random_uuid(),
  bucket_id  text        references storage.buckets (id),
  name       text        not null,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Faithful to Supabase's own: splits the path and drops the FILENAME, so
-- 'uid/avatar.png' yields {uid}. A shim that returned every segment would let
-- a policy checking [1] pass on paths the real one rejects.
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
-- Supabase grants anon the same DML on storage.objects and lets policies do
-- the refusing. Mirrored here so a signed-out test is denied by the policy,
-- the way production denies it, rather than by a grant this shim forgot.
grant select, insert, update, delete on storage.objects to anon;
grant select on storage.buckets to anon;

-- What a real Supabase project has before any migration runs: default
-- privileges handing anon and authenticated everything created in public.
-- Without this the suite tested a stricter database than production — a
-- migration's GRANTs looked like they narrowed access, when on Supabase they
-- were added on top of ALL.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
