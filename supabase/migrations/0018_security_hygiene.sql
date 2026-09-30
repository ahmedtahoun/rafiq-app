-- 0018: what Supabase's security and performance advisors found on the live
-- project (2026-09-30) that is worth changing. Nothing here changes who can
-- read or write what; the schema tests before and after are the same.
--
-- Trigger functions. Eight of them could be "executed" by anon and
-- authenticated through /rest/v1/rpc — two of them SECURITY DEFINER. Postgres
-- refuses to run a trigger function outside a trigger, so nothing was
-- reachable, but a grant that is harmless only because of how Postgres
-- happens to behave is not one to keep. Revoking EXECUTE does not stop the
-- triggers: the privilege is checked when a trigger is created, not each
-- time it fires.
--
-- set_updated_at() is the only function without a fixed search_path. It
-- calls nothing but now(), which always resolves to pg_catalog, so this is
-- hygiene too.
--
-- Foreign keys without an index. Deleting the referenced row (an account
-- deletion, a withdrawn offering, a cancelled booking) scans the whole
-- referencing table for each row it removes, and the RLS joins that follow
-- these keys do the same. Fourteen of them; every other foreign key already
-- has one.
--
-- Not changed, on purpose:
--  - coach_directory and coach_reviews are views that run as their owner
--    (the advisor's "security definer view" error). That is their design:
--    they show a fixed set of safe columns from rows RLS would hide —
--    a coach's public profile, a review signed with a first name and last
--    initial — and are granted to authenticated only.
--  - admin_users and client_invite_attempts have RLS on and no policies:
--    only service_role and SECURITY DEFINER functions touch them.
--  - The SECURITY DEFINER functions authenticated may call (the RLS helpers,
--    invites, blocking, a member cancelling) each check the caller
--    themselves and are covered by the schema tests.
--  - Policies calling auth.uid() per row (auth_rls_initplan). A performance
--    matter at a scale the app does not have yet; rewriting 37 policies is
--    its own change, with the schema tests as its safety net.

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

alter function public.set_updated_at() set search_path = '';

create index if not exists cancellations_cancelled_by_idx          on public.cancellations (cancelled_by);
create index if not exists cancellations_time_block_id_idx         on public.cancellations (time_block_id);
create index if not exists enrollments_offering_id_idx             on public.enrollments (offering_id);
create index if not exists favourite_coaches_coach_id_idx          on public.favourite_coaches (coach_id);
create index if not exists messages_sender_id_idx                  on public.messages (sender_id);
create index if not exists notifications_client_id_idx             on public.notifications (client_id);
create index if not exists payouts_requested_by_idx                on public.payouts (requested_by);
create index if not exists pro_reports_client_id_idx               on public.pro_reports (client_id);
create index if not exists pro_reports_coach_id_idx                on public.pro_reports (coach_id);
create index if not exists pro_reports_reporter_id_idx             on public.pro_reports (reporter_id);
create index if not exists ratings_offering_id_idx                 on public.ratings (offering_id);
create index if not exists session_requests_offering_id_idx        on public.session_requests (offering_id);
create index if not exists subscription_cancel_feedback_coach_id_idx on public.subscription_cancel_feedback (coach_id);
create index if not exists time_blocks_client_id_idx               on public.time_blocks (client_id);
