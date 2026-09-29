-- 0014: messaging on the live database (SUPABASE-MIGRATION-PLAN.md step 5)
-- — blocking, who may send, and live delivery.
--
-- Blocking. Either side of a relationship can block the other; Apple
-- requires it wherever users message each other (guideline 1.2), and until
-- now the app only *read* a block status nothing could set. Each side's
-- block is its own column, so neither can lift the other's: a coach who
-- could clear blocked_by_member_at would make a member's block meaningless.
-- Only set_relationship_block() writes them — a trigger refuses both columns
-- to direct writes from the app, the same way 0013 guards invite codes.
--
-- Who may send. messages_insert (0001) checked only that the sender is who
-- they say they are. It now also requires relationship_can_message(): no
-- block from either side, and both accounts active — a suspended or deleted
-- coach (0012), or a suspended member, can't be written to or write.
--
-- Live delivery. messages joins the supabase_realtime publication, so an
-- open thread receives the other side's messages as they're sent. Realtime
-- applies messages_select to every subscriber, so no one hears a thread
-- they can't read. (Guarded: the local test database has no publication.)

alter table public.clients
  add column blocked_by_member_at timestamptz,
  add column blocked_by_coach_at  timestamptz;

create or replace function public.clients_block_columns_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.blocked_by_member_at is not null or new.blocked_by_coach_at is not null then
      raise exception 'blocks are set by set_relationship_block()' using errcode = '42501';
    end if;
  elsif (new.blocked_by_member_at, new.blocked_by_coach_at)
        is distinct from (old.blocked_by_member_at, old.blocked_by_coach_at) then
    raise exception 'blocks are set by set_relationship_block()' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger clients_block_columns_guard
  before insert or update on public.clients
  for each row execute function public.clients_block_columns_guard();

-- The caller's own side of the block, on or off. Returns both sides, so the
-- screen can say who blocked whom.
create or replace function public.set_relationship_block(p_client uuid, p_blocked boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clients%rowtype;
begin
  select * into c from public.clients where id = p_client for update;
  if not found or auth.uid() is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if c.coach_id = auth.uid() then
    update public.clients
    set blocked_by_coach_at = case when p_blocked then coalesce(blocked_by_coach_at, now()) end
    where id = c.id
    returning * into c;
  elsif c.member_id = auth.uid() then
    update public.clients
    set blocked_by_member_at = case when p_blocked then coalesce(blocked_by_member_at, now()) end
    where id = c.id
    returning * into c;
  else
    return jsonb_build_object('error', 'not_found');
  end if;
  return jsonb_build_object(
    'blocked_by_member', c.blocked_by_member_at is not null,
    'blocked_by_coach',  c.blocked_by_coach_at is not null
  );
end;
$$;

create or replace function public.relationship_can_message(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    join public.profiles coach on coach.id = c.coach_id and coach.account_status = 'active'
    left join public.profiles member on member.id = c.member_id
    where c.id = p_client
      and c.blocked_by_member_at is null
      and c.blocked_by_coach_at is null
      and (c.member_id is null or member.account_status = 'active')
  );
$$;

drop policy messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and (
      (sender_role = 'coach'  and public.is_coach_of(client_id)) or
      (sender_role = 'client' and public.is_member_of(client_id))
    )
    and public.relationship_can_message(client_id)
  );

create index if not exists messages_client_created_idx on public.messages (client_id, created_at);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

revoke execute on function public.set_relationship_block(uuid, boolean) from public, anon;
revoke execute on function public.relationship_can_message(uuid) from public, anon;
grant execute on function public.set_relationship_block(uuid, boolean) to authenticated;
grant execute on function public.relationship_can_message(uuid) to authenticated;
