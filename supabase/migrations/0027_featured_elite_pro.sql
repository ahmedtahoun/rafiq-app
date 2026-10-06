-- 0027: Rafiq Elite Pro's featured placement in Discover.
--
-- A coach on an active Elite Pro plan is featured: Discover lists featured
-- coaches first and labels them (src/lib/directory.ts, Discover.tsx), as it
-- already does for `featured` (0005, set by hand in the Dashboard). The
-- directory's `featured` is now either one.
--
-- "Active" is 0024's rule: tier 'elite_pro', renews_at null or still to
-- come. A lapsed plan stops featuring the coach as soon as it lapses, with
-- nothing to run.
--
-- The check has to be the directory's own. coach_plan() (0024) reads as the
-- caller, and subscriptions_select_own shows a coach only their own row, so
-- from a member's session it would answer 'free' for every coach. The view
-- runs as its owner (0018), so the subquery below sees the plan, and all it
-- passes on is the one boolean: no tier, no renewal date, nothing else
-- about anyone's subscription. Subscriptions themselves stay unreadable to
-- everyone but their coach.
--
-- Nobody is on Elite Pro yet, and nothing charges for it: until billing
-- ships, a tier is granted by hand (supabase/admin/README.md), and the
-- Elite Pro card keeps its "Coming soon" tag on this feature.
--
-- Same columns, same order: `create or replace` keeps 0022's body and the
-- view's grants, and changes only how `featured` is worked out.

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
  (cp.featured or exists (
    select 1 from public.subscriptions s
    where s.coach_id = cp.profile_id
      and s.tier::text = 'elite_pro'
      and (s.renews_at is null or s.renews_at > now())
  ))                                     as featured,
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
