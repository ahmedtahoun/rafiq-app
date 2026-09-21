-- two coaches, two members
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','coachA@x.com','{"role":"coach","full_name":"Coach A"}'),
  ('22222222-2222-2222-2222-222222222222','coachB@x.com','{"role":"coach","full_name":"Coach B"}'),
  ('33333333-3333-3333-3333-333333333333','memberM@x.com','{"role":"client","full_name":"Member M"}'),
  ('44444444-4444-4444-4444-444444444444','memberN@x.com','{"role":"client","full_name":"Member N"}');

insert into public.coach_profiles (profile_id, title) values
  ('11111111-1111-1111-1111-111111111111','Life coaching'),
  ('22222222-2222-2222-2222-222222222222','Nutrition');

insert into public.clients (id, coach_id, member_id, full_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','Member M'),
  ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111', null, 'Walk-in W'),
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444','Member N');

insert into public.tasks (client_id, title) values ('aaaaaaaa-0000-0000-0000-000000000001','Journal');
insert into public.payments (client_id, amount) values ('aaaaaaaa-0000-0000-0000-000000000001', 500);
