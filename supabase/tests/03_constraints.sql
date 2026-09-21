\set QUIET on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.try(q text) returns text
language plpgsql as $$
begin execute q; return 'ALLOWED';
exception when others then return 'REJECTED(' || sqlstate || ')'; end;
$$;

select 'refund without refund_of (expect REJECTED)   : ' || pg_temp.try($$insert into public.payments (client_id, kind, amount) values ('aaaaaaaa-0000-0000-0000-000000000001','refund',50)$$);
select 'charge with refund_of (expect REJECTED)      : ' || pg_temp.try($$insert into public.payments (client_id, kind, amount, refund_of) values ('aaaaaaaa-0000-0000-0000-000000000001','charge',50,(select id from public.payments where kind='charge' limit 1))$$);
select 'valid refund (expect ALLOWED)                : ' || pg_temp.try($$insert into public.payments (client_id, kind, amount, refund_of) values ('aaaaaaaa-0000-0000-0000-000000000001','refund',50,(select id from public.payments where kind='charge' order by amount limit 1))$$);
select 'second refund of same charge (expect REJECT) : ' || pg_temp.try($$insert into public.payments (client_id, kind, amount, refund_of) values ('aaaaaaaa-0000-0000-0000-000000000001','refund',10,(select id from public.payments where kind='charge' order by amount limit 1))$$);
select 'negative payment amount (expect REJECTED)    : ' || pg_temp.try($$insert into public.payments (client_id, amount) values ('aaaaaaaa-0000-0000-0000-000000000001',-5)$$);
select 'deleting a refunded charge (expect REJECTED) : ' || pg_temp.try($$delete from public.payments where kind='charge' and amount=9$$);
select 'package used > total (expect REJECTED)       : ' || pg_temp.try($$insert into public.packages (client_id,total,used,expires_at) values ('aaaaaaaa-0000-0000-0000-000000000001',8,9,now())$$);
select 'package used <= total (expect ALLOWED)       : ' || pg_temp.try($$insert into public.packages (client_id,total,used,expires_at) values ('aaaaaaaa-0000-0000-0000-000000000001',8,6,now()+interval '30 days')$$);
select 'renew: 6/8 -> 10/12 (expect ALLOWED)         : ' || pg_temp.try($$update public.packages set total=12 where client_id='aaaaaaaa-0000-0000-0000-000000000001'$$);
select 'progress 101 (expect REJECTED)               : ' || pg_temp.try($$update public.clients set progress=101 where id='aaaaaaaa-0000-0000-0000-000000000001'$$);
select 'rating 6 stars (expect REJECTED)             : ' || pg_temp.try($$update public.ratings set rating=6 where client_id='aaaaaaaa-0000-0000-0000-000000000001'$$);
select 'time block ends before starts (expect REJECT): ' || pg_temp.try($$insert into public.time_blocks (coach_id,kind,starts_at,ends_at) values ('11111111-1111-1111-1111-111111111111','busy',now(),now()-interval '1 hour')$$);
select 'empty message body (expect REJECTED)         : ' || pg_temp.try($$insert into public.messages (client_id,sender_role,sender_id,body) values ('aaaaaaaa-0000-0000-0000-000000000001','coach','11111111-1111-1111-1111-111111111111','')$$);
select 'same member twice on one roster (expect REJ) : ' || pg_temp.try($$insert into public.clients (coach_id,member_id,full_name) values ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','Dup M')$$);
select 'two unlinked walk-ins (expect ALLOWED)       : ' || pg_temp.try($$insert into public.clients (coach_id,member_id,full_name) values ('11111111-1111-1111-1111-111111111111',null,'Walk-in 2')$$);
select 'updated_at trigger fires (expect changed)    : ' || pg_temp.try($$update public.clients set full_name='Renamed' where id='aaaaaaaa-0000-0000-0000-000000000001'$$);
select '  -> updated_at > created_at                 : ' || (select (updated_at > created_at)::text from public.clients where id='aaaaaaaa-0000-0000-0000-000000000001');
select 'deleting coach cascades roster (expect 0)    : ' || pg_temp.try($$delete from auth.users where id='22222222-2222-2222-2222-222222222222'$$);
select '  -> coachB rows remaining                   : ' || (select count(*)::text from public.clients where coach_id='22222222-2222-2222-2222-222222222222');
