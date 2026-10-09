-- 0025: a reminder before each session, to both sides.
--
-- LAUNCH-CHECKLIST §6's push table had one row with no event behind it:
-- "Session reminder, an hour before | both | Nothing yet: needs a scheduled
-- job." This is that job. Every five minutes, queue_session_reminders()
-- writes a `session-reminder` notifications row for each booked session
-- starting 45 to 60 minutes from now, one for the coach and one for the
-- member (a walk-in with no account gets none). The Database Webhook on
-- notifications insert hands each row to push-send (0023), which turns it
-- into "Your session with Hana starts soon" on their phones, in each phone's
-- language and time zone, unless the Sessions switch is off there.
--
-- Once per session per time: session_reminders remembers which (session,
-- scheduled_at) pairs were reminded, so the three runs that see a session
-- inside its window send one reminder, and a session moved to a new time is
-- reminded again at the new time. Skipped on purpose:
-- - a session already logged (attendance set: cancelled, attended, …);
-- - an archived relationship (clients.active false);
-- - a session booked less than an hour before it starts: whoever just
--   booked it doesn't need reminding.
-- If the job doesn't run for a while, a window it missed is not sent late:
-- "starts soon" twenty minutes after the start is worse than nothing.
--
-- Push-only: neither in-app feed reads this kind (the member's lists its
-- own kinds, src/lib/notificationData.ts; the coach's reads requests), and
-- Home and Your Pro already show the next session.
--
-- The schedule: pg_cron, if the project has it enabled when this runs.
-- Where it isn't (the live project, today), nothing is scheduled and
-- nothing fails: no reminders go out, and everything else works as before.
-- After enabling it (Dashboard → Database → Extensions → pg_cron), run
-- `select public.schedule_session_reminders();` once in the SQL editor;
-- supabase/functions/push-send's README has the step.

alter type public.notification_kind add value if not exists 'session-reminder';

create table public.session_reminders (
  session_id   uuid        not null references public.sessions (id) on delete cascade,
  scheduled_at timestamptz not null,
  sent_at      timestamptz not null default now(),
  primary key (session_id, scheduled_at)
);

alter table public.session_reminders enable row level security;
-- No policies and no grants: only queue_session_reminders() writes it.
revoke all on public.session_reminders from public, anon, authenticated;

-- `p_now` is for the schema tests; the job calls it with no argument.
-- Returns how many sessions it reminded.
create or replace function public.queue_session_reminders(p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    with due as (
      insert into public.session_reminders (session_id, scheduled_at)
      select s.id, s.scheduled_at
      from public.sessions s
      join public.clients c on c.id = s.client_id
      where s.attendance is null
        and c.active
        and s.scheduled_at >  p_now + interval '45 minutes'
        and s.scheduled_at <= p_now + interval '60 minutes'
        and s.created_at   <= s.scheduled_at - interval '60 minutes'
      on conflict do nothing
      returning session_id, scheduled_at
    )
    select due.session_id, due.scheduled_at, c.id as client_id, c.coach_id, c.member_id
    from due
    join public.sessions s on s.id = due.session_id
    join public.clients c on c.id = s.client_id
  loop
    perform public.push_notification(r.coach_id, 'session-reminder', r.client_id,
      jsonb_build_object('session_id', r.session_id, 'scheduled_at', r.scheduled_at));
    perform public.push_notification(r.member_id, 'session-reminder', r.client_id,
      jsonb_build_object('session_id', r.session_id, 'scheduled_at', r.scheduled_at));
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.queue_session_reminders(timestamptz) from public, anon, authenticated;

-- Every five minutes, where pg_cron is enabled; true if it scheduled the
-- job, false if pg_cron isn't there. It looks for pg_cron's own
-- cron.schedule() rather than the extension's name, so it is safe to run
-- either way. cron.schedule with an existing job name replaces that job,
-- so running it again is harmless. Not for the app: it runs as whoever
-- calls it, here the migration, later Ahmed in the SQL editor.
create or replace function public.schedule_session_reminders()
returns boolean
language plpgsql
set search_path = public
as $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is null then
    return false;
  end if;
  perform cron.schedule('session-reminders', '*/5 * * * *', 'select public.queue_session_reminders()');
  return true;
end;
$$;

revoke execute on function public.schedule_session_reminders() from public, anon, authenticated;

do $$
begin
  perform public.schedule_session_reminders();
end;
$$;
