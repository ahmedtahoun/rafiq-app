-- 0024: three plans (Ahmed, 2026-10-05). Free holds 3 active members,
-- Rafiq Pro Plus 15, Rafiq Elite Pro has no limit.
--
-- 'pro' keeps its name and means Pro Plus. The app has called that tier
-- "Rafiq Pro Plus" since before this, and renaming an enum value would
-- break 0020's function bodies, the admin README's grant snippets and every
-- schema test that spells it. 'elite_pro' is new.
--
-- Which plan a coach is on, 0020's rule with a second paid tier:
--   * no subscriptions row                                  -> free
--   * tier 'pro' or 'elite_pro', renews_at null or future   -> that tier
--   * a paid tier whose renews_at has passed                -> free (lapsed)
--
-- coach_member_cap() turns that into a number (null: no limit), and the
-- trigger refuses the step that would make one more member active than
-- that, with 0020's 53400. As before, a coach already above their cap (a
-- lapsed or downgraded plan) keeps every member; only the next one is
-- refused. coach_on_pro() stays — the app and 24_free_tier.sql ask it — and
-- now means "on either paid tier".
--
-- The prices (Pro Plus 450 EGP a month or 4,500 a year, Elite Pro 900 or
-- 9,000) are store products, not rows: nothing here charges anyone. Until
-- In-App Purchase and Play Billing ship, a paid tier is granted by hand
-- (supabase/admin/README.md). The app holds the same caps in
-- src/lib/planData.ts to say so before the coach hits one.
--
-- Comparisons are on tier::text: a value added by `alter type` can't be
-- used as an enum literal in the transaction that adds it, and a SQL
-- function's body is parsed when it is created.

alter type public.subscription_tier add value if not exists 'elite_pro';

-- The caller's paid tier as text ('pro', 'elite_pro'), or 'free'.
create or replace function public.coach_plan(p_coach uuid)
returns text
language sql
stable
set search_path = ''
as $$
  -- Read as the caller: subscriptions_select_own shows a coach their own row.
  select coalesce((
    select s.tier::text from public.subscriptions s
    where s.coach_id = p_coach
      and s.tier::text in ('pro', 'elite_pro')
      and (s.renews_at is null or s.renews_at > now())), 'free');
$$;

-- Active members the plan holds; null is no limit.
create or replace function public.coach_member_cap(p_coach uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select case public.coach_plan(p_coach)
    when 'elite_pro' then null
    when 'pro' then 15
    else 3
  end;
$$;

create or replace function public.coach_on_pro(p_coach uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.coach_plan(p_coach) <> 'free';
$$;

create or replace function public.clients_member_cap()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_cap    int;
  v_active int;
begin
  if current_user <> 'authenticated' or not new.active then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.active and new.coach_id = old.coach_id then
    return new;
  end if;
  v_cap := public.coach_member_cap(new.coach_id);
  if v_cap is null then
    return new;
  end if;
  -- 0020's lock: two adds at once must not both count below the cap.
  perform pg_advisory_xact_lock(hashtextextended('member_cap:' || new.coach_id::text, 0));
  select count(*) into v_active
  from public.clients c
  where c.coach_id = new.coach_id and c.active and c.id <> new.id;
  if v_active >= v_cap then
    raise exception 'this plan holds % active members; archive one or upgrade', v_cap
      using errcode = '53400';
  end if;
  return new;
end;
$$;

revoke execute on function public.clients_member_cap() from public, anon, authenticated;
revoke execute on function public.coach_plan(uuid) from public, anon;
revoke execute on function public.coach_member_cap(uuid) from public, anon;
grant execute on function public.coach_plan(uuid) to authenticated;
grant execute on function public.coach_member_cap(uuid) to authenticated;
