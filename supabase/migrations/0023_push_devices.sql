-- 0023: phones that get push notifications, and the one event that had no
-- notification row.
--
-- Every event worth a banner already writes a `notifications` row (0002,
-- 0011, 0021), so push is delivery, not new logic: the `push-send` Edge
-- Function, called by a Database Webhook on notifications insert, turns a
-- row into a banner on the recipient's phones (supabase/functions/push-send).
-- This migration is what it needs from the database.
--
-- device_tokens: one row per phone, keyed by the token Apple or Google gave
-- it. The banner is written server-side, so the row carries what the
-- function can't know: the app's language on that phone, its time zone (for
-- "Tue 10:00 AM"), and the kinds the person switched off there. Nobody
-- reads or writes the table directly: the app calls register_device() and
-- unregister_device(), which only ever act as the caller, and the function
-- reads it with the service role. A token is the phone's, not the
-- account's: signing in as someone else on the same phone moves the row to
-- them, so a phone never shows the last account's banners. At most
-- MAX_DEVICES per person; registering another drops the one seen longest
-- ago.
--
-- request-received: a member asking a coach for a session, or to move one
-- (0017), wrote no notification — the coach saw requests by reading
-- session_requests. It is now a row like the others, so it can be pushed
-- ("Hana asked for Tue 10:00 AM"). Nothing in the app reads this kind yet:
-- the coach's Notifications screen still lists requests from
-- session_requests, and the member's reads only its own kinds.

alter type public.notification_kind add value if not exists 'request-received';

create table public.device_tokens (
  token       text        primary key check (length(token) between 1 and 4096),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  platform    text        not null check (platform in ('ios', 'android')),
  lang        text        not null check (lang in ('en', 'ar')),
  time_zone   text        not null,
  -- Kinds of banner switched off on this phone, by category.
  muted       text[]      not null default '{}'
              check (muted <@ array['sessions', 'messages', 'tasks']::text[]),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index device_tokens_user_idx on public.device_tokens (user_id, updated_at desc);

alter table public.device_tokens enable row level security;
-- No policies and no grants: only the two functions below (as the caller)
-- and the service role (push-send) touch it.
revoke all on public.device_tokens from public, anon, authenticated;

-- Register this phone for the signed-in person, or update it: called after
-- sign-in, and again whenever the language, time zone or switches change.
create or replace function public.register_device(
  p_token     text,
  p_platform  text,
  p_lang      text,
  p_time_zone text,
  p_muted     text[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  max_devices constant int := 10;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_time_zone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;

  -- clock_timestamp, not now(): "seen longest ago" must order registrations
  -- even within one transaction.
  insert into public.device_tokens (token, user_id, platform, lang, time_zone, muted, created_at, updated_at)
  values (p_token, v_uid, p_platform, p_lang, p_time_zone, coalesce(p_muted, '{}'), clock_timestamp(), clock_timestamp())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang,
        time_zone = excluded.time_zone, muted = excluded.muted, updated_at = clock_timestamp();

  delete from public.device_tokens d
  where d.user_id = v_uid
    and d.token not in (
      select k.token from public.device_tokens k
      where k.user_id = v_uid
      order by k.updated_at desc
      limit max_devices
    );
end;
$$;

-- Stop this phone's banners for the signed-in person (sign-out, or the
-- master switch off). Another person's row for the same token is left alone.
create or replace function public.unregister_device(p_token text)
returns void
language sql security definer set search_path = public as $$
  delete from public.device_tokens where token = p_token and user_id = auth.uid();
$$;

revoke execute on function public.register_device(text, text, text, text, text[]) from public, anon;
revoke execute on function public.unregister_device(text) from public, anon;
grant execute on function public.register_device(text, text, text, text, text[]) to authenticated;
grant execute on function public.unregister_device(text) to authenticated;

-- A new request tells its coach. client_id is the roster row when the two
-- already have one (a returning member, or a move), so opening it lands on
-- that relationship; a stranger's first request has none. member_name is the
-- name the coach already sees on the request.
create or replace function public.on_session_request_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_client uuid;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select full_name into v_name from public.profiles where id = new.member_id;
  select c.id into v_client from public.clients c
  where c.coach_id = new.coach_id and c.member_id = new.member_id
  order by c.active desc, c.created_at desc
  limit 1;
  perform public.push_notification(
    new.coach_id,
    'request-received',
    v_client,
    jsonb_build_object(
      'request_id', new.id,
      'member_name', coalesce(v_name, ''),
      'requested_start', new.requested_start,
      'move', new.reschedule_of is not null
    )
  );
  return new;
end;
$$;

revoke execute on function public.on_session_request_created() from public, anon, authenticated;

create trigger session_requests_notify_new
  after insert on public.session_requests
  for each row execute function public.on_session_request_created();
