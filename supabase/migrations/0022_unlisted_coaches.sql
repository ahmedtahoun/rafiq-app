-- 0022: a coach the directory doesn't list.
--
-- coach_directory (0005) lists every active coach who finished onboarding,
-- so the App Review coach (supabase/admin/review-accounts.sql) would show up
-- in every real member's Discover, with its seeded review, and could be
-- booked or reported by them. `unlisted` takes a coach out of the directory
-- for everyone except the coach themselves and their own members (anyone
-- on their roster, archived included): those still need the coach's name
-- and page, which read the same view. coach_reviews follows the same rule,
-- so an unlisted coach's reviews don't surface among Discover's recent
-- ones either.
--
-- Dashboard-only, like `featured` (0005): it is not in 0004's column grants,
-- so a coach can't set or clear it from the app. Set it from the SQL Editor
-- (supabase/admin/README.md, "Review accounts").
--
-- The views keep their columns, so `create or replace` keeps their grants.

alter table public.coach_profiles add column unlisted boolean not null default false;

create or replace view public.coach_directory with (security_barrier) as
select
  cp.profile_id                          as coach_id,
  p.full_name,
  p.avatar_photo_url,
  p.country,
  p.country_flag,
  cp.title,
  cp.bio,
  cp.languages,
  cp.session_mode,
  cp.experience_years,
  cp.certifications,
  cp.cover_photo_url,
  cp.verification_status = 'verified'    as verified,
  cp.featured,
  (select min(o.price) from public.offerings o
    where o.coach_id = cp.profile_id and o.active and o.price > 0) as from_price,
  r.rating_count,
  r.rating_avg
from public.coach_profiles cp
join public.profiles p on p.id = cp.profile_id
left join lateral (
  select count(*)::int as rating_count, round(avg(x.rating)::numeric, 2) as rating_avg
  from public.ratings x where x.coach_id = cp.profile_id
) r on true
where p.account_status = 'active'
  and cp.signup_completed_at is not null
  and (not cp.unlisted
       or cp.profile_id = auth.uid()
       or exists (select 1 from public.clients c where c.coach_id = cp.profile_id and c.member_id = auth.uid()));

create or replace view public.coach_reviews with (security_barrier) as
select
  x.id,
  x.coach_id,
  x.rating,
  x.comment,
  x.created_at,
  split_part(trim(c.full_name), ' ', 1)
    || coalesce(' ' || nullif(left(split_part(trim(c.full_name), ' ', 2), 1), '') || '.', '') as reviewer_name,
  c.avatar_bg
from public.ratings x
join public.clients c on c.id = x.client_id
join public.coach_profiles cp on cp.profile_id = x.coach_id
where coalesce(trim(x.comment), '') <> ''
  and (not cp.unlisted
       or cp.profile_id = auth.uid()
       or exists (select 1 from public.clients m where m.coach_id = cp.profile_id and m.member_id = auth.uid()));
