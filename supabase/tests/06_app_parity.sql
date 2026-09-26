-- 0005 assertions: the tables and read paths added for parity with the app.
-- Every denial has an allowed case beside it, so a rule can't pass by
-- refusing everything. Runs after 02–05, so it sees their writes (the rating
-- memberM left on session 1, in particular).
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
  select case when actual = expected then 'PASS  ' else 'FAIL  ' end
      || rpad(label, 44)
      || ' expected=' || rpad(expected, 14) || ' actual=' || actual;
$$;

\set coachA '''11111111-1111-1111-1111-111111111111'''
\set coachB '''22222222-2222-2222-2222-222222222222'''
\set memberM '''33333333-3333-3333-3333-333333333333'''
\set memberN '''44444444-4444-4444-4444-444444444444'''
\set clientM '''aaaaaaaa-0000-0000-0000-000000000001'''
\set clientN '''bbbbbbbb-0000-0000-0000-000000000001'''
\set sessM '''dddddddd-0000-0000-0000-000000000001'''
\set sessN '''dddddddd-0000-0000-0000-000000000002'''
\set offA '''eeeeeeee-0000-0000-0000-000000000001'''

-- As service_role would: coach A finished signup (coach B did not), and the
-- roster name has a surname, for the reviewer-name check.
update public.coach_profiles set signup_completed_at = now() where profile_id = :coachA;
update public.clients set full_name = 'Sara Ahmed' where id = :clientM;

set role authenticated;

-- Marketplace read paths ------------------------------------------------------
select pg_temp.expect('non-client sees coach on Discover',
  pg_temp.as_user(:memberN, 'select full_name from public.coach_directory where coach_id = ' || quote_literal(:coachA)), 'Coach A');
select pg_temp.expect('unfinished signup is not listed',
  pg_temp.as_user(:memberN, 'select count(*)::text from public.coach_directory where coach_id = ' || quote_literal(:coachB)), '0');
select pg_temp.expect('directory does not open profile row',
  pg_temp.as_user(:memberN, 'select count(*)::text from public.profiles where id = ' || quote_literal(:coachA)), '0');
select pg_temp.expect('directory counts the coach ratings',
  pg_temp.as_user(:memberN, 'select rating_count::text from public.coach_directory where coach_id = ' || quote_literal(:coachA)), '1');
select pg_temp.expect('member can add a comment to own rating',
  pg_temp.as_user(:memberM, 'with u as (update public.ratings set comment = ''Changed my mornings'' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('review signed first name + initial',
  pg_temp.as_user(:memberN, 'select reviewer_name from public.coach_reviews where coach_id = ' || quote_literal(:coachA)), 'Sara A.');

-- Ratings: one subject, and it must be the member's own -----------------------
select pg_temp.expect('rating a session of another member',
  pg_temp.as_user(:memberM, 'with i as (insert into public.ratings (client_id, coach_id, session_id, rating) values (' || quote_literal(:clientM) || ', ' || quote_literal(:coachA) || ', ' || quote_literal(:sessN) || ', 4) returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('rating needs a session or a program',
  pg_temp.as_user(:memberM, 'with i as (insert into public.ratings (client_id, coach_id, rating) values (' || quote_literal(:clientM) || ', ' || quote_literal(:coachA) || ', 4) returning 1) select count(*)::text from i'), 'DENIED(23514)');

-- Coach-private notes -------------------------------------------------------------
select pg_temp.expect('coach writes private notes',
  pg_temp.as_user(:coachA, 'with i as (insert into public.client_private (client_id, notes) values (' || quote_literal(:clientM) || ', ''private'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('member cannot read coach notes',
  pg_temp.as_user(:memberM, 'select count(*)::text from public.client_private'), '0');

-- Agreements: coach sends, member signs, member changes nothing else ------------
select pg_temp.expect('coach sends an agreement',
  pg_temp.as_user(:coachA, 'with i as (insert into public.agreements (client_id) values (' || quote_literal(:clientM) || ') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('member signs the agreement',
  pg_temp.as_user(:memberM, 'with u as (update public.agreements set status = ''signed'', signed_at = now() returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('member cannot backdate sent_at',
  pg_temp.as_user(:memberM, 'with u as (update public.agreements set sent_at = now() - interval ''9 days'' returning 1) select count(*)::text from u'), 'DENIED(42501)');

-- Sessions: a member may dispute attendance and nothing more ----------------------
select pg_temp.expect('member disputes attendance',
  pg_temp.as_user(:memberM, 'with u as (update public.sessions set attendance = ''disputed'', attendance_set_by = ''client'', attendance_set_at = now() where id = ' || quote_literal(:sessM) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('member cannot write the recap',
  pg_temp.as_user(:memberM, 'with u as (update public.sessions set recap = ''x'' where id = ' || quote_literal(:sessM) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('member cannot mark self attended',
  pg_temp.as_user(:memberM, 'with u as (update public.sessions set attendance = ''attended'' where id = ' || quote_literal(:sessM) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');

-- Reports: filed by a member about their own coach, invisible to the coach -------
select pg_temp.expect('member reports own coach',
  pg_temp.as_user(:memberM, 'with i as (insert into public.pro_reports (reporter_id, coach_id, client_id, reason) values (' || quote_literal(:memberM) || ', ' || quote_literal(:coachA) || ', ' || quote_literal(:clientM) || ', ''no_show'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('member cannot report other coach',
  pg_temp.as_user(:memberM, 'with i as (insert into public.pro_reports (reporter_id, coach_id, client_id, reason) values (' || quote_literal(:memberM) || ', ' || quote_literal(:coachB) || ', ' || quote_literal(:clientM) || ', ''other'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('member cannot pre-resolve a report',
  pg_temp.as_user(:memberM, 'with i as (insert into public.pro_reports (reporter_id, coach_id, client_id, reason, status) values (' || quote_literal(:memberM) || ', ' || quote_literal(:coachA) || ', ' || quote_literal(:clientM) || ', ''other'', ''dismissed'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('coach cannot see reports about them',
  pg_temp.as_user(:coachA, 'select count(*)::text from public.pro_reports'), '0');

-- Verification: filing sets pending; only a review sets verified ------------------
select pg_temp.expect('coach files a verification request',
  pg_temp.as_user(:coachA, 'with i as (insert into public.verification_requests (coach_id) values (' || quote_literal(:coachA) || ') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('filing sets profile to pending',
  pg_temp.as_user(:coachA, 'select verification_status::text from public.coach_profiles where profile_id = ' || quote_literal(:coachA)), 'pending');
select pg_temp.expect('coach cannot approve own request',
  pg_temp.as_user(:coachA, 'with u as (update public.verification_requests set status = ''approved'' returning 1) select count(*)::text from u'), 'DENIED(42501)');
reset role;
update public.verification_requests set status = 'approved', reviewed_at = now() where coach_id = :coachA;
set role authenticated;
select pg_temp.expect('an approved review sets verified',
  pg_temp.as_user(:coachA, 'select verification_status::text from public.coach_profiles where profile_id = ' || quote_literal(:coachA)), 'verified');
select pg_temp.expect('coach cannot make themselves featured',
  pg_temp.as_user(:coachA, 'with u as (update public.coach_profiles set featured = true returning 1) select count(*)::text from u'), 'DENIED(42501)');

-- Session requests from the marketplace ------------------------------------------
select pg_temp.expect('member requests a new coach',
  pg_temp.as_user(:memberN, 'with i as (insert into public.session_requests (member_id, coach_id, requested_start, price) values (' || quote_literal(:memberN) || ', ' || quote_literal(:coachA) || ', now() + interval ''1 day'', 750) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach sees who is asking',
  pg_temp.as_user(:coachA, 'select full_name from public.profiles where id = ' || quote_literal(:memberN)), 'Member N');
select pg_temp.expect('member cannot accept own request',
  pg_temp.as_user(:memberN, 'with u as (update public.session_requests set status = ''accepted'' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('coach accepts the request',
  pg_temp.as_user(:coachA, 'with u as (update public.session_requests set status = ''accepted'', responded_at = now() returning 1) select count(*)::text from u'), '1');
-- Now accepted, so the status rule passes and only the scope trigger can refuse this.
select pg_temp.expect('coach cannot change the price',
  pg_temp.as_user(:coachA, 'with u as (update public.session_requests set price = 1 returning 1) select count(*)::text from u'), 'DENIED(42501)');

-- Availability is public; writing it is not -----------------------------------------
select pg_temp.expect('coach sets weekly availability',
  pg_temp.as_user(:coachA, 'with i as (insert into public.weekly_availability (coach_id, day_of_week, start_hour, end_hour) values (' || quote_literal(:coachA) || ', 0, 17, 20) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('any member can read availability',
  pg_temp.as_user(:memberN, 'select count(*)::text from public.weekly_availability where coach_id = ' || quote_literal(:coachA)), '1');
select pg_temp.expect('member cannot edit coach availability',
  pg_temp.as_user(:memberN, 'with i as (insert into public.weekly_availability (coach_id, day_of_week, start_hour, end_hour) values (' || quote_literal(:coachA) || ', 1, 9, 10) returning 1) select count(*)::text from i'), 'DENIED(42501)');

-- Enrollments: coach enrolls in own offerings; member only marks reviewed ------------
select pg_temp.expect('coach adds an offering',
  pg_temp.as_user(:coachA, 'with i as (insert into public.offerings (id, coach_id, name, price, type, session_count) values (' || quote_literal(:offA) || ', ' || quote_literal(:coachA) || ', ''8-Week Program'', 5400, ''program'', 8) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach enrolls own member',
  pg_temp.as_user(:coachA, 'with i as (insert into public.enrollments (client_id, offering_id) values (' || quote_literal(:clientM) || ', ' || quote_literal(:offA) || ') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach cannot use another coach offering',
  pg_temp.as_user(:coachB, 'with i as (insert into public.enrollments (client_id, offering_id) values (' || quote_literal(:clientN) || ', ' || quote_literal(:offA) || ') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('member marks program reviewed',
  pg_temp.as_user(:memberM, 'with u as (update public.enrollments set milestone_reviewed_at = now() returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('member cannot inflate own progress',
  pg_temp.as_user(:memberM, 'with u as (update public.enrollments set sessions_completed = 8 returning 1) select count(*)::text from u'), 'DENIED(42501)');

-- Member-owned records -------------------------------------------------------------
select pg_temp.expect('member logs a mood',
  pg_temp.as_user(:memberM, 'with i as (insert into public.mood_checkins (client_id, mood) values (' || quote_literal(:clientM) || ', ''good'') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach cannot log a mood for them',
  pg_temp.as_user(:coachA, 'with i as (insert into public.mood_checkins (client_id, mood) values (' || quote_literal(:clientM) || ', ''hard'') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('other member cannot see the mood',
  pg_temp.as_user(:memberN, 'select count(*)::text from public.mood_checkins'), '0');
select pg_temp.expect('member sets a standing slot',
  pg_temp.as_user(:memberM, 'with i as (insert into public.standing_slots (client_id, day_of_week, start_hour, end_hour) values (' || quote_literal(:clientM) || ', 2, 10, 11) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach sees the standing slot',
  pg_temp.as_user(:coachA, 'select count(*)::text from public.standing_slots'), '1');
select pg_temp.expect('member records own cancellation',
  pg_temp.as_user(:memberM, 'with i as (insert into public.cancellations (client_id, cancelled_by_role, cancelled_by) values (' || quote_literal(:clientM) || ', ''client'', ' || quote_literal(:memberM) || ') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('member cannot cancel as the coach',
  pg_temp.as_user(:memberM, 'with i as (insert into public.cancellations (client_id, cancelled_by_role, cancelled_by) values (' || quote_literal(:clientM) || ', ''coach'', ' || quote_literal(:memberM) || ') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('member saves a favourite coach',
  pg_temp.as_user(:memberN, 'with i as (insert into public.favourite_coaches (member_id, coach_id) values (' || quote_literal(:memberN) || ', ' || quote_literal(:coachA) || ') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('member cannot save for someone else',
  pg_temp.as_user(:memberN, 'with i as (insert into public.favourite_coaches (member_id, coach_id) values (' || quote_literal(:memberM) || ', ' || quote_literal(:coachA) || ') returning 1) select count(*)::text from i'), 'DENIED(42501)');

-- Account-level ---------------------------------------------------------------------
select pg_temp.expect('user requests account deletion',
  pg_temp.as_user(:memberM, 'with i as (insert into public.account_deletion_requests (profile_id) values (' || quote_literal(:memberM) || ') returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('cannot request deletion for another',
  pg_temp.as_user(:memberM, 'with i as (insert into public.account_deletion_requests (profile_id) values (' || quote_literal(:memberN) || ') returning 1) select count(*)::text from i'), 'DENIED(42501)');
select pg_temp.expect('user can edit own name',
  pg_temp.as_user(:memberM, 'with u as (update public.profiles set full_name = ''Member M'' where id = ' || quote_literal(:memberM) || ' returning 1) select count(*)::text from u'), '1');
select pg_temp.expect('user cannot set own account status',
  pg_temp.as_user(:memberM, 'with u as (update public.profiles set account_status = ''active'' where id = ' || quote_literal(:memberM) || ' returning 1) select count(*)::text from u'), 'DENIED(42501)');
select pg_temp.expect('user sets own notification prefs',
  pg_temp.as_user(:memberM, 'with i as (insert into public.notification_prefs (profile_id, tasks) values (' || quote_literal(:memberM) || ', false) returning 1) select count(*)::text from i'), '1');
select pg_temp.expect('coach keeps templates private',
  pg_temp.as_user(:coachA, 'with i as (insert into public.templates (coach_id, name) values (' || quote_literal(:coachA) || ', ''Life · Basic'') returning 1) select count(*)::text from i') || '/' ||
  pg_temp.as_user(:coachB, 'select count(*)::text from public.templates'), '1/0');
select pg_temp.expect('coach leaves downgrade feedback',
  pg_temp.as_user(:coachA, 'with i as (insert into public.subscription_cancel_feedback (coach_id, reason) values (' || quote_literal(:coachA) || ', ''too_expensive'') returning 1) select count(*)::text from i'), '1');

reset role;
set role anon;
select pg_temp.expect('signed-out cannot read the directory',
  pg_temp.as_user('', 'select count(*)::text from public.coach_directory'), 'DENIED(42501)');
reset role;
