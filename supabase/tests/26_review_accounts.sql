-- supabase/admin/review-accounts.sql: the App Review accounts' data, made
-- and reset, seen through the real policies, and the refusals that keep it
-- off anyone else's data.
\set QUIET on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.as_user(uid text, q text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute q into r;
  return coalesce(r, 'NULL');
exception when others then
  return 'DENIED(' || sqlstate || ')';
end;
$$;

create or replace function pg_temp.expect(label text, actual text, expected text) returns text
language sql immutable as $$
  select case when actual is not distinct from expected then 'PASS  ' else 'FAIL  ' end
      || rpad(label, 44)
      || ' expected=' || rpad(expected, 14) || ' actual=' || coalesce(actual, 'NULL');
$$;

-- 'ok', or 'refused' when the statement raises.
create or replace function pg_temp.attempt(q text) returns text
language plpgsql as $$
begin
  execute q;
  return 'ok';
exception when others then
  return 'refused';
end;
$$;

\set coachR  '''26262626-0000-0000-0000-00000000000c'''
\set memberR '''26262626-0000-0000-0000-00000000000a'''
\set realM   '''26262626-0000-0000-0000-00000000000b'''
\set realC   '''26262626-0000-0000-0000-00000000000d'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:coachR,  'rafiq.review.coach@x.com',  '{"role":"coach","full_name":"Review Coach"}'),
  (:memberR, 'rafiq.review.member@x.com', '{"role":"client","full_name":"Review Member"}'),
  (:realM,   'someone@x.com',             '{"role":"client","full_name":"Real Member"}'),
  (:realC,   'coach@x.com',               '{"role":"coach","full_name":"Real Coach"}');
insert into public.coach_profiles (profile_id, title) values (:coachR, 'Life coaching');
insert into public.coach_profiles (profile_id, title, signup_completed_at) values (:realC, 'Career coaching', now());

set rafiq.review_coach_email = 'rafiq.review.coach@x.com';
set rafiq.review_member_email = 'rafiq.review.member@x.com';

-- What the reset leaves, as one line to compare before and after.
create or replace function pg_temp.shape() returns text
language sql as $$
  select concat_ws(' ',
    (select count(*) from public.clients c where c.coach_id = '26262626-0000-0000-0000-00000000000c'),
    (select count(*) from public.sessions s join public.clients c on c.id = s.client_id where c.coach_id = '26262626-0000-0000-0000-00000000000c'),
    (select count(*) from public.tasks t join public.clients c on c.id = t.client_id where c.coach_id = '26262626-0000-0000-0000-00000000000c'),
    (select count(*) from public.messages m join public.clients c on c.id = m.client_id where c.coach_id = '26262626-0000-0000-0000-00000000000c'),
    (select count(*) from public.offerings where coach_id = '26262626-0000-0000-0000-00000000000c'),
    (select count(*) from public.weekly_availability where coach_id = '26262626-0000-0000-0000-00000000000c'),
    (select count(*) from public.ratings where coach_id = '26262626-0000-0000-0000-00000000000c'));
$$;

-- Run as pasted, before the coach has onboarded: the file's last statement
-- is refused (its error goes to stderr), and nothing is written.
\set ON_ERROR_STOP 0
\ir ../admin/review-accounts.sql
\set ON_ERROR_STOP 1
select pg_temp.expect('refused while the coach hasn''t onboarded',
  pg_temp.attempt('select pg_temp.reset_review_accounts(''rafiq.review.coach@x.com'', ''rafiq.review.member@x.com'')'), 'refused');
select pg_temp.expect('...and nothing written',
  (select count(*)::text from public.clients where coach_id = :coachR), '0');
update public.coach_profiles set signup_completed_at = now() where profile_id = :coachR;

-- The first run ------------------------------------------------------------------------------
\ir ../admin/review-accounts.sql

select pg_temp.expect('one roster row, the review member',
  (select count(*)::text || ':' || bool_and(member_id = :memberR and active)::text from public.clients where coach_id = :coachR), '1:true');
select pg_temp.expect('roster, sessions, tasks, messages, offers, hours, ratings',
  pg_temp.shape(), '1 3 3 3 2 5 1');
select pg_temp.expect('two attended in the past, one ahead',
  (select string_agg(coalesce(s.attendance::text, 'ahead') || ':' || (s.scheduled_at > now())::text, ',' order by s.scheduled_at)
   from public.sessions s join public.clients c on c.id = s.client_id where c.coach_id = :coachR),
  'attended:false,attended:false,ahead:true');
select pg_temp.expect('...at 17:00 in Cairo, on the roster row',
  (select to_char(c.next_session_at at time zone 'Africa/Cairo', 'HH24:MI') from public.clients c where c.coach_id = :coachR), '17:00');
select pg_temp.expect('one task done, two open',
  (select count(*) filter (where done)::text || '/' || count(*) filter (where not done)::text
   from public.tasks t join public.clients c on c.id = t.client_id where c.coach_id = :coachR), '1/2');
select pg_temp.expect('package, program, payment, moods',
  (select concat_ws(' ', p.used || '/' || p.total, e.sessions_completed, (select count(*) from public.payments where client_id = c.id),
                    (select count(*) from public.mood_checkins where client_id = c.id))
   from public.clients c join public.packages p on p.client_id = c.id join public.enrollments e on e.client_id = c.id
   where c.coach_id = :coachR), '2/4 2 1 3');
select pg_temp.expect('the thread notified each side',
  (select count(*) filter (where recipient_id = :memberR)::text || '/' || count(*) filter (where recipient_id = :coachR)::text
   from public.notifications where kind = 'message' and recipient_id in (:coachR, :memberR)), '2/1');

set role authenticated;
select pg_temp.expect('the member reads it through the policies',
  pg_temp.as_user(:memberR, 'select concat_ws('' '', (select count(*) from public.sessions), (select count(*) from public.tasks), (select count(*) from public.messages), (select goal from public.member_profiles))'),
  '3 3 3 Build a calmer morning routine and stick to it');
select pg_temp.expect('the coach reads their roster',
  pg_temp.as_user(:coachR, 'select count(*)::text from public.clients'), '1');
select pg_temp.expect('the coach is listed, with the rating',
  pg_temp.as_user(:memberR, format('select rating_count::text from public.coach_directory where coach_id = %L', :coachR)), '1');

-- A reviewer changes things -----------------------------------------------------------------
select pg_temp.expect('the member blocks the coach',
  pg_temp.as_user(:memberR, format('select (public.set_relationship_block(%L, true) is not null)::text',
    (select id from public.clients where coach_id = :coachR))), 'true');
reset role;
insert into public.pro_reports (reporter_id, coach_id, reason) values (:memberR, :coachR, 'other');
insert into public.account_deletion_requests (profile_id) values (:memberR);
update public.clients set active = false where coach_id = :coachR;
-- A notice with no roster row (0021's "declined" from a stranger): the
-- roster row's cascade doesn't reach it.
insert into public.notifications (recipient_id, kind, client_id, payload) values (:memberR, 'message', null, '{}');
delete from public.tasks where client_id in (select id from public.clients where coach_id = :coachR) and done;

-- ...and the reset puts it back ------------------------------------------------------------------
select pg_temp.reset_review_accounts('rafiq.review.coach@x.com', 'rafiq.review.member@x.com') is not null as reset \gset
select pg_temp.expect('reset: the same data again',
  pg_temp.shape(), '1 3 3 3 2 5 1');
select pg_temp.expect('...active, unblocked',
  (select (active and blocked_by_member_at is null and blocked_by_coach_at is null)::text from public.clients where coach_id = :coachR), 'true');
select pg_temp.expect('...no report, no deletion request',
  (select count(*)::text from public.pro_reports where reporter_id = :memberR) || '/' ||
  (select count(*)::text from public.account_deletion_requests where profile_id = :memberR and status = 'pending'), '0/0');
-- Replaced, not added to: the first run's are gone.
select pg_temp.expect('...and only this run''s notifications',
  (select string_agg(kind || ':' || n, ' ' order by kind) from (
     select kind::text, count(*) as n from public.notifications where recipient_id in (:coachR, :memberR) group by kind) k),
  'message:3 payment-received:1');

-- Refusals: nothing changes ---------------------------------------------------------------------
-- A real coach and a real member, neither on anyone's roster: only the
-- "review" rule stands between them and a reset.
select pg_temp.expect('refused: emails without "review"',
  pg_temp.attempt('select pg_temp.reset_review_accounts(''coach@x.com'', ''someone@x.com'')'), 'refused');
select pg_temp.expect('...and the real coach untouched',
  (select count(*)::text from public.clients where coach_id = :realC) || '/' ||
  (select count(*)::text from public.offerings where coach_id = :realC), '0/0');
select pg_temp.expect('refused: one email without "review"',
  pg_temp.attempt('select pg_temp.reset_review_accounts(''rafiq.review.coach@x.com'', ''someone@x.com'')'), 'refused');
select pg_temp.expect('refused: an email that names nobody',
  pg_temp.attempt('select pg_temp.reset_review_accounts(''rafiq.review.coach@x.com'', ''nobody.review@x.com'')'), 'refused');
select pg_temp.expect('refused: the coach as the member',
  pg_temp.attempt('select pg_temp.reset_review_accounts(''rafiq.review.coach@x.com'', ''rafiq.review.coach@x.com'')'), 'refused');

-- A real member booked the review coach (it is listed): the reset must not
-- erase their sessions.
insert into public.clients (id, coach_id, member_id, full_name) values ('26262626-1111-0000-0000-000000000001', :coachR, :realM, 'Real Member');
insert into public.sessions (client_id, scheduled_at) values ('26262626-1111-0000-0000-000000000001', now() + interval '5 days');
select pg_temp.expect('refused: a real member on the roster',
  pg_temp.attempt('select pg_temp.reset_review_accounts(''rafiq.review.coach@x.com'', ''rafiq.review.member@x.com'')'), 'refused');
select pg_temp.expect('...whose session is still there',
  (select count(*)::text from public.sessions where client_id = '26262626-1111-0000-0000-000000000001'), '1');
select pg_temp.expect('...and the review data untouched',
  (select count(*)::text from public.clients where coach_id = :coachR), '2');
