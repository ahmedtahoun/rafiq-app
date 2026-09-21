-- Dev seed — the same six demo members mockStore.ts ships as DEFAULT_CLIENTS,
-- so a connected database shows the screens the same data they show today on
-- localStorage. Handy for eyeballing a ported screen against the prototype.
--
-- Attaches them to the first coach in the database, and does nothing if that
-- coach already has a roster, so it is safe to re-run. Sign up as a coach
-- first, then:  psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Never run this against production.

do $$
declare
  v_coach uuid;
  v_client uuid;
begin
  select profile_id into v_coach from public.coach_profiles order by created_at limit 1;

  if v_coach is null then
    raise notice 'No coach profile found — sign up as a coach first. Nothing seeded.';
    return;
  end if;

  if exists (select 1 from public.clients where coach_id = v_coach) then
    raise notice 'Coach % already has clients — nothing seeded.', v_coach;
    return;
  end if;

  -- next_session_at is a real timestamp here; mockStore's 'Next: Today, 10:00 AM'
  -- was display text, and the three rows whose text was 'No upcoming session' or
  -- 'Program completed' are simply null.
  insert into public.clients
    (coach_id, full_name, program, plan, initials, avatar_bg, active, progress, needs_checkin, next_session_at, payment_status)
  values
    (v_coach, 'Sara Ahmed',     'Life coaching · Basic',       'Basic',       'SA', '#B75C3D', true,   63, false, current_date + interval '10 hours',          'overdue'),
    (v_coach, 'Omar Fathy',     'Nutrition · Full Access',     'Full Access', 'OF', '#3E6FB0', true,   40, false, current_date + interval '13 hours 30 min',   'due'),
    (v_coach, 'Mona Reda',      'Yoga coaching · Basic',       'Basic',       'MR', '#3F7D58', true,   78, false, current_date + interval '3 days 10 hours',   'paid'),
    (v_coach, 'Khaled Ibrahim', 'Meditation coaching · Basic', 'Basic',       'KI', '#96472D', true,   22, true,  null,                                        'overdue'),
    (v_coach, 'Laila Youssef',  'Breakup coaching · Basic',    'Basic',       'LY', '#B98900', true,   55, true,  null,                                        'due'),
    (v_coach, 'Nour Hassan',    'Life coaching · Completed',   'Basic',       'NH', '#7A7166', false, 100, false, null,                                        'paid');

  -- A package each, mirroring mockStore's 8-session default (Full Access: 12).
  insert into public.packages (client_id, total, used, expires_at)
  select id, case when plan = 'Full Access' then 12 else 8 end, 2, now() + interval '30 days'
  from public.clients where coach_id = v_coach;

  -- Three tasks for Sara, same titles as DEFAULT_TASKS.
  select id into v_client from public.clients where coach_id = v_coach and full_name = 'Sara Ahmed';
  insert into public.tasks (client_id, title, due_at, done) values
    (v_client, 'Log post-session mood rating', current_date + interval '18 hours', true),
    (v_client, 'Write one gratitude note',     current_date + interval '1 day',    false),
    (v_client, '10-minute evening walk',       current_date + interval '4 days',   false);

  raise notice 'Seeded 6 demo members for coach %.', v_coach;
end $$;
