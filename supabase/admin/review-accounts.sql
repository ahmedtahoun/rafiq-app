-- The two App Review accounts' data: create it, or put it back.
--
-- Apple's and Google's reviewers sign in with two Google accounts made for
-- review (store/review-notes.md §1): one coach, one member. Signed in, every
-- screen reads that account's own rows, so an empty account shows a reviewer
-- empty screens. This gives the pair a realistic relationship that every
-- screen has something to show for: the coach's profile, hours and two
-- offerings; the member on the coach's roster with a goal; two past sessions
-- with recaps (one rated), one coming up in three days, a package, a
-- program in progress, tasks (one done), a short message thread, a payment
-- and mood check-ins. Times are relative to today in Cairo, so a reset
-- before each submission keeps "upcoming" upcoming.
--
-- Run it again to reset: it deletes everything between the two accounts and
-- rebuilds it, so whatever a reviewer did (blocked, reported, archived,
-- deleted tasks, asked for deletion) is undone. It touches only these two
-- accounts, and refuses to run if:
--   - either email lacks "review", or names no account;
--   - the coach account isn't a coach that finished onboarding, or the
--     member account isn't a member;
--   - anyone but the review member is linked on the review coach's roster
--     (a real member booked them: deleting would erase that member's
--     sessions — see "Discover" in supabase/admin/README.md).
-- Everything happens in one transaction: a refusal changes nothing.
--
-- How: both accounts sign in once in the app first (the coach chooses
-- "I'm a Pro" and finishes onboarding, the member chooses "I'm a Member").
-- Then SQL Editor → New query → paste this whole file → put the two
-- emails in the LAST statement → Run. Save it as "Reset review accounts".

create or replace function pg_temp.reset_review_accounts(p_coach_email text, p_member_email text)
returns text language plpgsql as $$
declare
  v_coach   uuid;
  v_member  uuid;
  v_name    text;
  v_client  uuid;
  v_session_off uuid;
  v_program_off uuid;
  v_past1   uuid;
  v_past2   uuid;
  v_block   uuid;
  v_today   date := (now() at time zone 'Africa/Cairo')::date;
  v_goal    text := 'Build a calmer morning routine and stick to it';
begin
  if p_coach_email !~* 'review' or p_member_email !~* 'review' then
    raise exception 'both emails must be review accounts (contain "review"): %, %', p_coach_email, p_member_email;
  end if;

  select id into v_coach from public.profiles where lower(email) = lower(p_coach_email) and role = 'coach';
  if v_coach is null then
    raise exception 'no coach account for %: sign in with it once and choose "I''m a Pro"', p_coach_email;
  end if;
  if not exists (select 1 from public.coach_profiles where profile_id = v_coach and signup_completed_at is not null) then
    raise exception 'the coach % hasn''t finished onboarding in the app', p_coach_email;
  end if;
  select id, full_name into v_member, v_name from public.profiles where lower(email) = lower(p_member_email) and role = 'client';
  if v_member is null then
    raise exception 'no member account for %: sign in with it once and choose "I''m a Member"', p_member_email;
  end if;
  if exists (select 1 from public.clients where coach_id = v_coach and member_id is not null and member_id <> v_member) then
    raise exception 'a real member is on the review coach''s roster: not resetting (see supabase/admin/README.md, "Review accounts")';
  end if;
  v_name := coalesce(nullif(trim(v_name), ''), 'Review Member');

  -- Clear --------------------------------------------------------------------------
  -- Payments are a ledger the app can't delete (on delete restrict); these
  -- two accounts never move real money, so they go, refunds first.
  delete from public.payments where refund_of is not null and client_id in (select id from public.clients where coach_id = v_coach);
  delete from public.payments where client_id in (select id from public.clients where coach_id = v_coach);
  -- Tasks, sessions, packages, enrollments, messages, ratings, mood
  -- check-ins, notes and booked time go with the roster rows.
  delete from public.clients where coach_id = v_coach;
  delete from public.time_blocks where coach_id = v_coach;
  delete from public.offerings where coach_id = v_coach;
  delete from public.weekly_availability where coach_id = v_coach;
  delete from public.templates where coach_id = v_coach;
  delete from public.session_requests where coach_id = v_coach or member_id = v_member;
  delete from public.ratings where coach_id = v_coach;
  delete from public.favourite_coaches where member_id = v_member;
  delete from public.pro_reports where reporter_id = v_member or coach_id = v_coach;
  delete from public.account_deletion_requests where profile_id in (v_coach, v_member) and status = 'pending';
  delete from public.notifications where recipient_id in (v_coach, v_member);
  update public.profiles set account_status = 'active' where id in (v_coach, v_member);

  -- The coach --------------------------------------------------------------------------
  update public.coach_profiles set
    title = 'Life coaching · Career coaching',
    bio = 'I help people build routines they keep and make career moves with a plan. Sessions are online, in Arabic or English.',
    languages = array['Arabic', 'English'],
    session_mode = 'online',
    experience_years = 6
  where profile_id = v_coach;
  -- Sunday to Thursday, 10:00 to 18:00 (0 is Monday).
  insert into public.weekly_availability (coach_id, day_of_week, enabled, start_hour, end_hour)
  select v_coach, d, true, 10, 18 from unnest(array[6, 0, 1, 2, 3]) as d;
  insert into public.offerings (coach_id, type, name, description, duration, price, currency, format, session_count, active)
  values (v_coach, 'session', '1:1 coaching session', 'One focused session on what matters to you this week.', '50 min', 600, 'EGP', 'online', null, true)
  returning id into v_session_off;
  insert into public.offerings (coach_id, type, name, description, duration, price, currency, format, session_count, active)
  values (v_coach, 'program', '4-week reset', 'Four weekly sessions to build one routine that lasts.', '4 weeks', 2000, 'EGP', 'online', 4, true)
  returning id into v_program_off;

  -- The member ---------------------------------------------------------------------------
  insert into public.member_profiles (profile_id, goal, focus, signup_completed_at)
  values (v_member, v_goal, 'life', now())
  on conflict (profile_id) do update set goal = excluded.goal, focus = excluded.focus,
    signup_completed_at = coalesce(public.member_profiles.signup_completed_at, excluded.signup_completed_at);

  insert into public.clients (coach_id, member_id, full_name, initials, avatar_bg, program, specialty, plan, goal, focus,
                              active, progress, payment_status, origin, signup_completed_at)
  values (v_coach, v_member, v_name,
          upper(left(split_part(v_name, ' ', 1), 1) || left(split_part(v_name, ' ', 2), 1)),
          '#3E6FB0', '4-week reset', 'Life coaching', 'Basic', v_goal, 'life',
          true, 50, 'paid', 'marketplace', now())
  returning id into v_client;
  insert into public.client_private (client_id, notes)
  values (v_client, 'Prefers evening sessions. Working on mornings first, career questions after.');

  -- Two past sessions (attended, with recaps) and one in three days, at 17:00 Cairo.
  insert into public.time_blocks (coach_id, client_id, kind, label, session_type, starts_at, ends_at)
  values (v_coach, v_client, 'booked', 'Session · ' || v_name, 'standard',
          ((v_today - 14)::timestamp + interval '17 hours') at time zone 'Africa/Cairo',
          ((v_today - 14)::timestamp + interval '17 hours 50 minutes') at time zone 'Africa/Cairo')
  returning id into v_block;
  insert into public.sessions (client_id, scheduled_at, time_block_id, attendance, attendance_set_at, attendance_set_by, recap)
  values (v_client, ((v_today - 14)::timestamp + interval '17 hours') at time zone 'Africa/Cairo', v_block,
          'attended', now() - interval '14 days', 'coach', 'Mapped a typical morning. One change to try: phone stays out of the bedroom.')
  returning id into v_past1;

  insert into public.time_blocks (coach_id, client_id, kind, label, session_type, starts_at, ends_at)
  values (v_coach, v_client, 'booked', 'Session · ' || v_name, 'standard',
          ((v_today - 7)::timestamp + interval '17 hours') at time zone 'Africa/Cairo',
          ((v_today - 7)::timestamp + interval '17 hours 50 minutes') at time zone 'Africa/Cairo')
  returning id into v_block;
  insert into public.sessions (client_id, scheduled_at, time_block_id, attendance, attendance_set_at, attendance_set_by, recap)
  values (v_client, ((v_today - 7)::timestamp + interval '17 hours') at time zone 'Africa/Cairo', v_block,
          'attended', now() - interval '7 days', 'coach', 'Five mornings out of seven. Next: a ten-minute walk before work.')
  returning id into v_past2;

  insert into public.time_blocks (coach_id, client_id, kind, label, session_type, starts_at, ends_at)
  values (v_coach, v_client, 'booked', 'Session · ' || v_name, 'standard',
          ((v_today + 3)::timestamp + interval '17 hours') at time zone 'Africa/Cairo',
          ((v_today + 3)::timestamp + interval '17 hours 50 minutes') at time zone 'Africa/Cairo')
  returning id into v_block;
  insert into public.sessions (client_id, scheduled_at, time_block_id)
  values (v_client, ((v_today + 3)::timestamp + interval '17 hours') at time zone 'Africa/Cairo', v_block);
  update public.clients set
    next_session_at = ((v_today + 3)::timestamp + interval '17 hours') at time zone 'Africa/Cairo',
    next_session_type = 'standard'
  where id = v_client;

  insert into public.packages (client_id, total, used, expires_at) values (v_client, 4, 2, now() + interval '30 days');
  insert into public.enrollments (client_id, offering_id, sessions_completed, enrolled_at)
  values (v_client, v_program_off, 2, now() - interval '15 days');
  insert into public.payments (client_id, kind, amount, currency, state, method, note, paid_at)
  values (v_client, 'charge', 2000, 'EGP', 'completed', 'cash', '4-week reset', now() - interval '15 days');

  insert into public.tasks (client_id, title, description, due_at, done, done_at, created_at) values
    (v_client, 'Phone out of the bedroom', 'Charge it in the kitchen tonight.', now() - interval '6 days', true, now() - interval '6 days', now() - interval '13 days'),
    (v_client, 'Ten-minute walk before work', 'Any pace. Note how the morning felt.', now() + interval '1 day', false, null, now() - interval '6 days'),
    (v_client, 'Write three things that went well', 'Two minutes before bed.', now() + interval '2 days', false, null, now() - interval '6 days');

  insert into public.mood_checkins (client_id, mood, created_at) values
    (v_client, 'okay', now() - interval '5 days'),
    (v_client, 'good', now() - interval '3 days'),
    (v_client, 'great', now() - interval '1 day');

  insert into public.ratings (client_id, coach_id, session_id, rating, comment, created_at)
  values (v_client, v_coach, v_past2, 5, 'Practical and kind. I left with one clear thing to do.', now() - interval '6 days');

  insert into public.messages (client_id, sender_id, sender_role, body, created_at) values
    (v_client, v_coach, 'coach', 'How did the walks go this week?', now() - interval '2 days'),
    (v_client, v_member, 'client', 'Four out of five! The rainy day was hard.', now() - interval '2 days' + interval '40 minutes'),
    (v_client, v_coach, 'coach', 'Four is great. Let''s plan a rainy-day version on Thursday.', now() - interval '1 day');

  return format('Reset: coach %s and member %s, roster row %s, next session %s.',
                p_coach_email, p_member_email, v_client,
                to_char(((v_today + 3)::timestamp + interval '17 hours'), 'Dy DD Mon, HH24:MI "Cairo"'));
end;
$$;

-- Put the two review emails here, then run the whole file.
select pg_temp.reset_review_accounts(
  coalesce(nullif(current_setting('rafiq.review_coach_email', true), ''), 'rafiq.review.coach@gmail.com'),
  coalesce(nullif(current_setting('rafiq.review_member_email', true), ''), 'rafiq.review.member@gmail.com')
);
