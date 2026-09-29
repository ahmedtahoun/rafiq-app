-- 0012: carrying out an account deletion request.
--
-- 0005 made deletion a queue (account_deletion_requests), not a cascade.
-- This is the step that works it, as promised on the public deletion page
-- (site/public/delete-account/):
--
--   deleted  the account, the profile and personal details (name, contact
--            details, photos) and, for a coach, the saved payout details;
--   kept     sessions and payments, for the other side, without the deleted
--            person's details; and a coach's payout records.
--
-- process_account_deletion(request) does the database half and returns what
-- is left for the admin-only `account-deletion` Edge Function, which can
-- reach Storage and the Auth admin API: the photo paths to remove, and
-- whether the login can be deleted outright ('delete') or has to be locked
-- and scrubbed instead ('lock').
--
-- A member is always 'delete'. Their coaches' roster rows lose member_id
-- (0001: on delete set null) and are scrubbed here first, so a coach keeps
-- the sessions and payments without the name or contact details.
--
-- A coach is 'lock' whenever anything must outlive them: a roster row (a
-- member's own record of sessions and payments lives on it) or a payout
-- (0007 restricts deletion). Deleting that login would cascade through
-- profiles into both. So the profile is scrubbed and marked 'deleted' (which
-- takes it out of coach_directory), and the Edge Function bans the login and
-- replaces its email. A coach with neither is 'delete'.
--
-- It refuses, changing nothing, while something is still open — the page
-- says these are settled first:
--   * a request that doesn't exist or isn't pending           P0002 / 55000
--   * an upcoming session, or an open dispute                  55006
--   * unused session credits (member)                          55006
--   * a payout not yet settled (coach)                         55006
--
-- Only service_role may call it. The request is not marked completed here:
-- the Edge Function does that once the login is gone too, so a failure
-- halfway leaves the request pending and safe to run again.

create or replace function public.process_account_deletion(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req      public.account_deletion_requests%rowtype;
  who      public.profiles%rowtype;
  v_uid    uuid;
  v_open   text[] := '{}';
  v_paths  text[] := '{}';
  v_mode   text;
begin
  select * into req from public.account_deletion_requests where id = p_request for update;
  if not found or req.profile_id is null then
    raise exception 'no such request' using errcode = 'P0002';
  end if;
  if req.status <> 'pending' then
    raise exception 'this request is not pending' using errcode = '55000';
  end if;
  v_uid := req.profile_id;
  select * into who from public.profiles where id = v_uid for update;

  -- What has to be settled first, on either side of a relationship.
  if exists (
    select 1 from public.sessions s join public.clients c on c.id = s.client_id
    where (c.member_id = v_uid or c.coach_id = v_uid)
      and s.scheduled_at > now() and s.attendance is null
  ) then
    v_open := array_append(v_open, 'upcoming_session');
  end if;
  if exists (
    select 1 from public.sessions s join public.clients c on c.id = s.client_id
    where (c.member_id = v_uid or c.coach_id = v_uid) and s.attendance = 'disputed'
  ) then
    v_open := array_append(v_open, 'open_dispute');
  end if;
  if who.role = 'client' and exists (
    select 1 from public.packages p join public.clients c on c.id = p.client_id
    where c.member_id = v_uid and p.total > p.used and p.expires_at > now()
  ) then
    v_open := array_append(v_open, 'unused_credits');
  end if;
  if exists (
    select 1 from public.payouts where coach_id = v_uid
      and status in ('requested', 'processing', 'pending', 'unknown')
  ) then
    v_open := array_append(v_open, 'unsettled_payout');
  end if;
  if cardinality(v_open) > 0 then
    raise exception 'still open: %', array_to_string(v_open, ', ') using errcode = '55006';
  end if;

  v_paths := array_remove(array[who.avatar_photo_url], null);

  -- As a member: what their coaches hold about them.
  update public.clients
  set full_name = '', initials = '', age = null, phone = null, email = null,
      city = null, country_code = null
  where member_id = v_uid;
  delete from public.mood_checkins m using public.clients c
  where c.id = m.client_id and c.member_id = v_uid;
  -- A review's text is theirs; the star rating stays in the coach's average.
  update public.ratings x set comment = null
  from public.clients c where c.id = x.client_id and c.member_id = v_uid;

  -- Either side: what they wrote in conversations. The other side's own
  -- messages stay with them.
  delete from public.messages where sender_id = v_uid;

  if who.role = 'coach' then
    select v_paths || array_remove(array[cp.cover_photo_url], null) into v_paths
    from public.coach_profiles cp where cp.profile_id = v_uid;

    delete from public.coach_payout_accounts where coach_id = v_uid;

    if exists (select 1 from public.clients where coach_id = v_uid)
       or exists (select 1 from public.payouts where coach_id = v_uid) then
      v_mode := 'lock';
      update public.profiles
      set full_name = '', email = null, phone = null, city = null, country = null,
          country_code = null, country_flag = null, avatar_photo_url = null,
          account_status = 'deleted'
      where id = v_uid;
      update public.coach_profiles
      set bio = '', cert = '', certifications = '{}', title = '', cover_photo_url = null,
          featured = false
      where profile_id = v_uid;
      update public.offerings set active = false where coach_id = v_uid;
      update public.session_requests set status = 'declined', responded_at = now()
      where coach_id = v_uid and status = 'pending';
      delete from public.weekly_availability where coach_id = v_uid;
      delete from public.time_blocks where coach_id = v_uid and starts_at > now();
    else
      v_mode := 'delete';
    end if;
  else
    v_mode := 'delete';
  end if;

  return jsonb_build_object('profile_id', v_uid, 'role', who.role, 'auth', v_mode, 'photo_paths', to_jsonb(v_paths));
end;
$$;

revoke execute on function public.process_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.process_account_deletion(uuid) to service_role;
