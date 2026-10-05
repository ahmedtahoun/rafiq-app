-- 0026: a coach's public page, if they want one.
--
-- LAUNCH-CHECKLIST §6, "A public coach page, then Share again": a page on
-- the open web a coach can send people to, at rafiqpro.com/c/<code>
-- (site/functions/c/[code].js renders it). Decided (2026-10-05):
-- - Opt in. Off by default; the coach turns it on in the app. Nobody is put
--   on the open web without choosing it.
-- - A short random code per coach, made the first time they turn it on and
--   kept after: it never clashes, works for Arabic names, and doesn't change
--   when they rename or turn the page off and on again.
--
-- What the page may show is what public_coach_page() returns, and nothing
-- else: the coach's name, title, bio, languages, experience, how they meet,
-- credentials, whether they are verified, their lowest price and their
-- rating. Never an email, a phone number, a member or a review's text.
-- No photo: the avatars bucket is signed-in only (0003), and opening it to
-- the web is its own decision.
--
-- The page answers the same way for a code that never existed, a page
-- turned off, an unlisted coach (0022), an account that isn't active and a
-- coach who hasn't finished signing up: not available. So the page never
-- says which.
--
-- public_page and public_code are not in 0004's column grants: the app
-- changes them only through set_public_page(), as the coach themselves.

alter table public.coach_profiles
  add column public_page boolean not null default false,
  add column public_code text unique
    check (public_code ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{6}$');

-- Six characters with no 0/o, 1/l/i: about 887 million codes, read aloud
-- or typed from a printed card without guessing.
create or replace function public.new_public_code() returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + get_byte(b, i) % 31, 1), '' order by i)
  from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') as b) x,
       generate_series(0, 5) i;
$$;

revoke execute on function public.new_public_code() from public, anon, authenticated;

-- The coach turns their page on or off. Returns their code (made on first
-- use, kept after), so the app can show the link right away.
create or replace function public.set_public_page(p_on boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.coach_profiles where profile_id = v_uid) then
    raise exception 'not a coach' using errcode = '42501';
  end if;
  if p_on then
    -- A clash with another coach's code is one in hundreds of millions;
    -- try again rather than fail.
    for attempt in 1..5 loop
      begin
        update public.coach_profiles
           set public_code = coalesce(public_code, public.new_public_code())
         where profile_id = v_uid;
        exit;
      exception when unique_violation then
        if attempt = 5 then raise; end if;
      end;
    end loop;
  end if;
  update public.coach_profiles
     set public_page = coalesce(p_on, false)
   where profile_id = v_uid
  returning public_code into v_code;
  return v_code;
end;
$$;

revoke execute on function public.set_public_page(boolean) from public, anon;
grant execute on function public.set_public_page(boolean) to authenticated;

-- What rafiqpro.com/c/<code> shows, for anyone: null unless the page is on
-- and the coach is one the directory would list.
create or replace function public.public_coach_page(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'coach_id',         cp.profile_id,
    'full_name',        p.full_name,
    'title',            cp.title,
    'bio',              cp.bio,
    'languages',        to_jsonb(cp.languages),
    'session_mode',     cp.session_mode,
    'experience_years', cp.experience_years,
    'certifications',   to_jsonb(cp.certifications),
    'verified',         cp.verification_status = 'verified',
    'from_price',       o.price,
    'currency',         o.currency,
    'rating_count',     r.rating_count,
    'rating_avg',       r.rating_avg
  )
  from public.coach_profiles cp
  join public.profiles p on p.id = cp.profile_id
  left join lateral (
    select x.price, x.currency from public.offerings x
    where x.coach_id = cp.profile_id and x.active and x.price > 0
    order by x.price limit 1
  ) o on true
  left join lateral (
    select count(*)::int as rating_count, round(avg(x.rating)::numeric, 2) as rating_avg
    from public.ratings x where x.coach_id = cp.profile_id
  ) r on true
  where cp.public_code = lower(trim(p_code))
    and cp.public_page
    and not cp.unlisted
    and p.account_status = 'active'
    and cp.signup_completed_at is not null;
$$;

revoke execute on function public.public_coach_page(text) from public;
grant execute on function public.public_coach_page(text) to anon, authenticated;
