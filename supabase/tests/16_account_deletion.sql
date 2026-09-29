-- 0012's process_account_deletion(): what a deletion removes, what it keeps,
-- and what it refuses while something is still open. Own fixtures, so it
-- depends on nothing earlier files leave behind: member D and coach E (a
-- linked relationship with history), coach F (a walk-in and a paid-out
-- payout: locked, not deleted), coach G (a payout still in flight) and
-- coach H (nothing: deleted outright).
\set QUIET on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.try(q text) returns text
language plpgsql as $$
declare r text;
begin
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

\set memberD '''16161616-0000-0000-0000-00000000000d'''
\set coachE  '''16161616-0000-0000-0000-00000000000e'''
\set coachF  '''16161616-0000-0000-0000-00000000000f'''
\set coachG  '''16161616-0000-0000-0000-000000000001'''
\set coachH  '''16161616-0000-0000-0000-000000000002'''
\set clientD '''16161616-1111-0000-0000-00000000000d'''
\set walkF   '''16161616-1111-0000-0000-00000000000f'''
\set sessPast '''16161616-2222-0000-0000-000000000001'''
\set sessNext '''16161616-2222-0000-0000-000000000002'''
\set reqD '''16161616-3333-0000-0000-00000000000d'''
\set reqF '''16161616-3333-0000-0000-00000000000f'''
\set reqG '''16161616-3333-0000-0000-000000000001'''
\set reqH '''16161616-3333-0000-0000-000000000002'''

-- As the owner ------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (:memberD, 'memberD@x.com', '{"role":"client","full_name":"Dina Mostafa"}'),
  (:coachE,  'coachE@x.com',  '{"role":"coach","full_name":"Coach E"}'),
  (:coachF,  'coachF@x.com',  '{"role":"coach","full_name":"Coach F"}'),
  (:coachG,  'coachG@x.com',  '{"role":"coach","full_name":"Coach G"}'),
  (:coachH,  'coachH@x.com',  '{"role":"coach","full_name":"Coach H"}');
update public.profiles set phone = '1001234567', avatar_photo_url = :memberD || '/avatar.jpg' where id = :memberD;
update public.profiles set avatar_photo_url = :coachF || '/avatar.jpg' where id = :coachF;
insert into public.coach_profiles (profile_id, title, bio, cover_photo_url) values
  (:coachE, 'Life coaching', 'Bio E', null),
  (:coachF, 'Career', 'Bio F', :coachF || '/cover.jpg'),
  (:coachG, 'Nutrition', '', null),
  (:coachH, 'Fitness', '', null);

insert into public.clients (id, coach_id, member_id, full_name, initials, phone, email, age) values
  (:clientD, :coachE, :memberD, 'Dina Mostafa', 'DM', '1001234567', 'memberD@x.com', 31),
  (:walkF,   :coachF, null,     'Walk-in F',    'WF', '1009999999', null, null);
insert into public.sessions (id, client_id, scheduled_at, attendance) values
  (:sessPast, :clientD, now() - interval '3 days', 'attended'),
  (:sessNext, :clientD, now() + interval '2 days', null);
insert into public.payments (client_id, amount) values (:clientD, 600);
insert into public.mood_checkins (client_id, mood) select :clientD, (enum_range(null::mood))[1];
insert into public.ratings (client_id, coach_id, session_id, rating, comment) values (:clientD, :coachE, :sessPast, 5, 'Dina here: great coach');
insert into public.messages (client_id, sender_role, sender_id, body) values
  (:clientD, 'client', :memberD, 'from D'),
  (:clientD, 'coach',  :coachE,  'from E');

insert into public.coach_payout_accounts (coach_id, issuer, msisdn, full_name, national_id) values
  (:coachF, 'vodafone', '01012345678', 'Coach F', '29005270102927');
insert into public.payouts (coach_id, amount, issuer, destination, status) values
  (:coachF, 500, 'vodafone', '{}', 'success'),
  (:coachG, 500, 'vodafone', '{}', 'processing');
insert into public.offerings (coach_id, name, price) values (:coachF, 'Career session', 600);

insert into public.account_deletion_requests (id, profile_id) values
  (:reqD, :memberD), (:reqF, :coachF), (:reqG, :coachG), (:reqH, :coachH);

-- Who may run it ----------------------------------------------------------------------
set role authenticated;
select pg_temp.expect('a signed-in user cannot run it',
  pg_temp.try(format('select public.process_account_deletion(%L)::text', :reqD)), 'DENIED(42501)');
set role anon;
select pg_temp.expect('...nor signed out',
  pg_temp.try(format('select public.process_account_deletion(%L)::text', :reqD)), 'DENIED(42501)');
set role service_role;

-- Refusals -----------------------------------------------------------------------------
select pg_temp.expect('no such request',
  pg_temp.try('select public.process_account_deletion(gen_random_uuid())::text'), 'DENIED(P0002)');
select pg_temp.expect('member with an upcoming session: refused',
  pg_temp.try(format('select public.process_account_deletion(%L)::text', :reqD)), 'DENIED(55006)');
select pg_temp.expect('...and nothing was scrubbed',
  pg_temp.try(format('select full_name from public.clients where id = %L', :clientD)), 'Dina Mostafa');
select pg_temp.expect('coach with a payout in flight: refused',
  pg_temp.try(format('select public.process_account_deletion(%L)::text', :reqG)), 'DENIED(55006)');

reset role;
update public.sessions set attendance = 'cancelled' where id = :sessNext;
insert into public.packages (client_id, total, used, expires_at) values (:clientD, 8, 3, now() + interval '20 days');
set role service_role;
select pg_temp.expect('member with unused credits: refused',
  pg_temp.try(format('select public.process_account_deletion(%L)::text', :reqD)), 'DENIED(55006)');
reset role;
update public.packages set used = 8 where client_id = :clientD;
set role service_role;

-- A member ------------------------------------------------------------------------------
select pg_temp.expect('member: the login is deleted outright',
  pg_temp.try(format('select public.process_account_deletion(%L) ->> ''auth''', :reqD)), 'delete');
select pg_temp.expect('...and their photo is returned for Storage',
  pg_temp.try(format('select (public.process_account_deletion(%L) -> ''photo_paths'')::text', :reqD)), format('["%s/avatar.jpg"]', :memberD));
reset role;
select pg_temp.expect('coach E''s roster row loses name and contact',
  (select full_name || '|' || coalesce(phone, '-') || '|' || coalesce(email, '-') || '|' || coalesce(age::text, '-') from public.clients where id = :clientD), '|-|-|-');
select pg_temp.expect('...but keeps the session history',
  (select count(*)::text from public.sessions where client_id = :clientD), '2');
select pg_temp.expect('...and the payment',
  (select count(*)::text from public.payments where client_id = :clientD), '1');
select pg_temp.expect('mood check-ins are gone',
  (select count(*)::text from public.mood_checkins where client_id = :clientD), '0');
select pg_temp.expect('the rating stays, its text does not',
  (select rating || '|' || coalesce(comment, '-') from public.ratings where client_id = :clientD), '5|-');
select pg_temp.expect('...so it leaves the public reviews',
  (select count(*)::text from public.coach_reviews where coach_id = :coachE), '0');
select pg_temp.expect('D''s messages are gone, E''s stay',
  (select string_agg(body, ',') from public.messages where client_id = :clientD), 'from E');
select pg_temp.expect('the request stays pending for the function',
  (select status::text from public.account_deletion_requests where id = :reqD), 'pending');
-- What the Edge Function does next: delete the login.
delete from auth.users where id = :memberD;
select pg_temp.expect('deleting the login keeps coach E''s record',
  (select count(*)::text from public.clients where id = :clientD and member_id is null), '1');

-- A coach with history -------------------------------------------------------------------
set role service_role;
select pg_temp.expect('coach with a roster and payouts: locked',
  pg_temp.try(format('select public.process_account_deletion(%L) ->> ''auth''', :reqF)), 'lock');
reset role;
select pg_temp.expect('profile scrubbed and marked deleted',
  (select full_name || '|' || coalesce(email, '-') || '|' || coalesce(avatar_photo_url, '-') || '|' || account_status from public.profiles where id = :coachF), '|-|-|deleted');
select pg_temp.expect('coach profile scrubbed',
  (select bio || '|' || title || '|' || coalesce(cover_photo_url, '-') from public.coach_profiles where profile_id = :coachF), '||-');
select pg_temp.expect('payout details deleted',
  (select count(*)::text from public.coach_payout_accounts where coach_id = :coachF), '0');
select pg_temp.expect('payout record kept',
  (select count(*)::text from public.payouts where coach_id = :coachF), '1');
select pg_temp.expect('offerings switched off',
  (select count(*)::text from public.offerings where coach_id = :coachF and active), '0');
select pg_temp.expect('gone from the directory',
  (select count(*)::text from public.coach_directory where coach_id = :coachF), '0');

-- A coach with nothing --------------------------------------------------------------------
set role service_role;
select pg_temp.expect('coach with no roster or payouts: deleted',
  pg_temp.try(format('select public.process_account_deletion(%L) ->> ''auth''', :reqH)), 'delete');
reset role;
delete from auth.users where id = :coachH;
select pg_temp.expect('...and the login deletes cleanly',
  (select count(*)::text from public.profiles where id = :coachH), '0');

reset role;
