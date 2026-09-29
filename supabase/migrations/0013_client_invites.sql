-- 0013: inviting a client who has no account (SUPABASE-MIGRATION-PLAN.md,
-- "Step 3, the gap"). A coach's walk-in roster row (member_id null) gets a
-- one-time code; the member who types it links themselves to that row.
--
-- 0008 stops a coach setting member_id on anyone who hasn't asked them for a
-- session, because user ids aren't secret. An invite turns that around: the
-- coach hands over a bearer code and the *member* claims it, so no one is
-- linked without holding the code.
--
-- The code: 10 characters of Crockford base32 (no I, L, O, U), 50 random
-- bits, shown as XXXXX-XXXXX. It lives on the roster row — an invite
-- belongs to exactly one row and dies with it — and is single use: a claim
-- clears it. Valid 14 days. Generating again replaces it.
--
-- Only the functions below touch the invite columns. Coaches can otherwise
-- update their own roster rows freely, so a trigger refuses the invite
-- columns to direct writes from the app — a coach can't set a weak code by
-- hand.
--
-- peek and claim are guessing oracles for a bearer token, so failures are
-- rate limited: 10 per account per hour. They *return* failures as
-- {"error": "..."} instead of raising, because a raised error would roll
-- back the attempt being counted. Errors, for the app to map to copy:
--   not_signed_in, not_a_member, rate_limited, not_found, expired,
--   already_used, own_invite, already_linked                  (peek/claim)
--   not_found, already_linked, archived                       (create/revoke)

alter table public.clients
  add column invite_code       text,
  add column invite_expires_at timestamptz,
  add column invite_created_at timestamptz;

create unique index clients_invite_code_uniq on public.clients (invite_code) where invite_code is not null;

create or replace function public.clients_invite_columns_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.invite_code is not null or new.invite_expires_at is not null or new.invite_created_at is not null then
      raise exception 'invite codes are issued by create_client_invite()' using errcode = '42501';
    end if;
  elsif (new.invite_code, new.invite_expires_at, new.invite_created_at)
        is distinct from (old.invite_code, old.invite_expires_at, old.invite_created_at) then
    raise exception 'invite codes are issued by create_client_invite()' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger clients_invite_columns_guard
  before insert or update on public.clients
  for each row execute function public.clients_invite_columns_guard();

-- Failed peeks and claims, for the rate limit. Nobody reads it but the
-- functions; rows older than a day are cleared as they go.
create table public.client_invite_attempts (
  profile_id uuid        not null references public.profiles (id) on delete cascade,
  at         timestamptz not null default now()
);
create index client_invite_attempts_idx on public.client_invite_attempts (profile_id, at);
alter table public.client_invite_attempts enable row level security;

-- 50 random bits as Crockford base32. Bytes 0–5 and 10–13 of a v4 uuid are
-- fully random (6 and 8 carry the version and variant); 256 is a multiple
-- of 32, so each character is uniform.
create or replace function public.new_invite_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  raw  bytea := uuid_send(gen_random_uuid());
  idx  int[] := array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13];
  out  text := '';
  i    int;
begin
  foreach i in array idx loop
    out := out || substr(alphabet, 1 + get_byte(raw, i) % 32, 1);
  end loop;
  return out;
end;
$$;

-- What a person typed → the stored form: case, dashes and spaces ignored,
-- and the letters Crockford reads as digits (O → 0, I and L → 1).
create or replace function public.normalize_invite_code(p_code text)
returns text language sql immutable set search_path = public as $$
  select translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011');
$$;

-- Coach: issue (or replace) the invite on one of their walk-in rows.
create or replace function public.create_client_invite(p_client uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c      public.clients%rowtype;
  v_code text;
begin
  select * into c from public.clients where id = p_client and coach_id = auth.uid() for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if c.member_id is not null then return jsonb_build_object('error', 'already_linked'); end if;
  if not c.active then return jsonb_build_object('error', 'archived'); end if;

  loop
    v_code := public.new_invite_code();
    exit when not exists (select 1 from public.clients where invite_code = v_code);
  end loop;

  update public.clients
  set invite_code = v_code, invite_created_at = now(), invite_expires_at = now() + interval '14 days'
  where id = c.id;
  return jsonb_build_object('code', v_code, 'expires_at', now() + interval '14 days');
end;
$$;

-- Coach: withdraw it. Idempotent.
create or replace function public.revoke_client_invite(p_client uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
  set invite_code = null, invite_created_at = null, invite_expires_at = null
  where id = p_client and coach_id = auth.uid();
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Shared by peek and claim: every check, in order, and the rate limit.
-- Returns the row when the code is good for this caller, or the error.
create or replace function public.check_client_invite(p_code text, out c public.clients, out err text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := public.normalize_invite_code(p_code);
begin
  if v_uid is null then err := 'not_signed_in'; return; end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'client') then
    err := 'not_a_member'; return;
  end if;

  delete from public.client_invite_attempts where profile_id = v_uid and at < now() - interval '1 day';
  if (select count(*) from public.client_invite_attempts where profile_id = v_uid and at > now() - interval '1 hour') >= 10 then
    err := 'rate_limited'; return;
  end if;

  select cl.* into c from public.clients cl
  join public.profiles coach on coach.id = cl.coach_id and coach.account_status = 'active'
  where cl.invite_code = v_code and length(v_code) = 10;
  if not found then
    err := 'not_found';
  elsif c.invite_expires_at <= now() then
    err := 'expired';
  elsif c.member_id is not null then
    err := 'already_used';
  elsif c.coach_id = v_uid then
    err := 'own_invite';
  elsif exists (select 1 from public.clients where coach_id = c.coach_id and member_id = v_uid) then
    err := 'already_linked';
  end if;

  -- Only a wrong or dead code counts toward the limit.
  if err in ('not_found', 'expired', 'already_used') then
    insert into public.client_invite_attempts (profile_id) values (v_uid);
    c := null;
  end if;
end;
$$;

-- Member: who the code belongs to, before committing. Nothing identifying
-- comes back for a code that doesn't check out.
create or replace function public.peek_client_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  chk record;
  d   record;
begin
  select * into chk from public.check_client_invite(p_code);
  if chk.err is not null and chk.err <> 'already_linked' then
    return jsonb_build_object('error', chk.err);
  end if;
  -- From the profile, not coach_directory: a coach can invite before their
  -- public listing is finished, and the check already requires them active.
  select p.full_name, cp.title, p.avatar_photo_url into d
  from public.profiles p left join public.coach_profiles cp on cp.profile_id = p.id
  where p.id = (chk.c).coach_id;
  return jsonb_build_object(
    'error', chk.err,
    'coach_id', (chk.c).coach_id,
    'coach_name', d.full_name,
    'coach_title', d.title,
    'coach_photo', d.avatar_photo_url,
    'client_name', (chk.c).full_name
  );
end;
$$;

-- Member: link themselves to the row, and spend the code.
create or replace function public.claim_client_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  chk record;
begin
  -- One claim at a time per code: a second claimer waits, then sees it spent.
  perform pg_advisory_xact_lock(hashtextextended('claim_client_invite:' || public.normalize_invite_code(p_code), 0));
  select * into chk from public.check_client_invite(p_code);
  if chk.err is not null then
    return jsonb_build_object('error', chk.err);
  end if;

  update public.clients
  set member_id = auth.uid(), invite_code = null, invite_created_at = null, invite_expires_at = null
  where id = (chk.c).id and member_id is null;

  return jsonb_build_object('client_id', (chk.c).id, 'coach_id', (chk.c).coach_id);
end;
$$;

revoke execute on function public.new_invite_code() from public, anon, authenticated;
revoke execute on function public.normalize_invite_code(text) from public, anon, authenticated;
revoke execute on function public.check_client_invite(text) from public, anon, authenticated;
revoke execute on function public.create_client_invite(uuid) from public, anon;
revoke execute on function public.revoke_client_invite(uuid) from public, anon;
revoke execute on function public.peek_client_invite(text) from public, anon;
revoke execute on function public.claim_client_invite(text) from public, anon;
grant execute on function public.create_client_invite(uuid) to authenticated;
grant execute on function public.revoke_client_invite(uuid) to authenticated;
grant execute on function public.peek_client_invite(text) to authenticated;
grant execute on function public.claim_client_invite(text) to authenticated;
