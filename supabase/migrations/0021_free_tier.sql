-- 0021: the free plan holds 3 active members; Rafiq Pro has no limit.
--
-- 0001's subscriptions table already held a coach's tier, written only by
-- service_role (the app has no write grant on it, by design: tier changes
-- come from billing). Nothing enforced what the tier meant. Now a coach on
-- the free plan can have at most 3 active roster rows, whether the coach
-- adds a walk-in, reactivates an archived member, or accepts a request
-- (accept_session_request() creates the roster row, or reactivates one).
--
-- Which plan a coach is on:
--   * no subscriptions row                         -> free
--   * tier 'pro' and renews_at null or in the future -> pro
--   * tier 'pro' and renews_at in the past           -> free (lapsed)
-- A Pro granted by hand (a founding coach who paid by link) is a row with
-- tier 'pro' and renews_at null, or the date they paid up to. See
-- supabase/admin/README.md.
--
-- Only the step that would make a 4th member active is refused, with
-- 53400 (configuration_limit_exceeded). A coach already above 3 (a lapsed
-- Pro) keeps every member: archiving, editing and recording sessions still
-- work. service_role and migrations are not limited.
--
-- The app reads the same rule (src/lib/planData.ts) to show the limit before
-- the coach hits it; this trigger is what makes it true.

create or replace function public.coach_on_pro(p_coach uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  -- Read as the caller: subscriptions_select_own shows a coach their own row.
  select exists (
    select 1 from public.subscriptions s
    where s.coach_id = p_coach
      and s.tier = 'pro'
      and (s.renews_at is null or s.renews_at > now()));
$$;

create or replace function public.clients_member_cap()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_active int;
begin
  if current_user <> 'authenticated' or not new.active then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.active and new.coach_id = old.coach_id then
    return new;
  end if;
  if public.coach_on_pro(new.coach_id) then
    return new;
  end if;
  -- Two adds at once (two tabs, a double tap) would both count 2 and both
  -- insert. One lock per coach, for the rest of the transaction, makes the
  -- second wait and count the first. accept_session_request() takes its own
  -- per-coach lock before inserting, so the order is always that one, then
  -- this one: no deadlock.
  perform pg_advisory_xact_lock(hashtextextended('member_cap:' || new.coach_id::text, 0));
  select count(*) into v_active
  from public.clients c
  where c.coach_id = new.coach_id and c.active and c.id <> new.id;
  if v_active >= 3 then
    raise exception 'the free plan holds 3 active members; archive one or upgrade to Rafiq Pro'
      using errcode = '53400';
  end if;
  return new;
end;
$$;

create trigger clients_member_cap
  before insert or update of active, coach_id on public.clients
  for each row execute function public.clients_member_cap();

-- 0018: trigger functions are not callable as RPCs. coach_on_pro() is: the
-- app may ask it about itself, and it reads only what the caller can see.
revoke execute on function public.clients_member_cap() from public, anon, authenticated;
revoke execute on function public.coach_on_pro(uuid) from public, anon;
grant execute on function public.coach_on_pro(uuid) to authenticated;
