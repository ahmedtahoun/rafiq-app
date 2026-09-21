-- Notification rows, written by the database itself.
--
-- 0001 created the notifications table and said rows were "expected to come
-- from triggers or server-side jobs, which aren't written yet". This is that:
-- four triggers, one per event the app already models.
--
-- They are security definer because notifications grants the client no INSERT
-- and has no insert policy — a notification you can write yourself is not a
-- notification, it is a message you sent yourself. The database decides who
-- gets told what.
--
-- The rule throughout: notify the OTHER side of the relationship, never the
-- person who performed the action. mockStore derived the coach's notification
-- list by re-scanning payment history on every read, which works in a
-- single-user prototype where the only "user" is the coach; with two real
-- accounts a notification needs an actual recipient.

-- ---------------------------------------------------------------------------
-- Who is on the other side of this relationship from `p_actor`?
--
-- Returns null for a walk-in client with no linked account, or when the actor
-- is neither party — every caller below treats null as "nobody to tell".
-- ---------------------------------------------------------------------------

create or replace function public.client_counterparty(p_client uuid, p_actor uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case
           when c.coach_id  = p_actor then c.member_id
           when c.member_id = p_actor then c.coach_id
           else null
         end
  from public.clients c
  where c.id = p_client;
$$;

revoke execute on function public.client_counterparty(uuid, uuid) from public;

create or replace function public.push_notification(
  p_recipient uuid,
  p_kind      notification_kind,
  p_client    uuid,
  p_payload   jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null then
    return;  -- unlinked walk-in, or an actor outside the relationship
  end if;
  insert into public.notifications (recipient_id, kind, client_id, payload)
  values (p_recipient, p_kind, p_client, p_payload);
end;
$$;

revoke execute on function public.push_notification(uuid, notification_kind, uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- A message notifies whoever did not send it.
--
-- Keyed off sender_id rather than auth.uid() so a message written by a job or
-- by service_role still addresses the right person.
-- ---------------------------------------------------------------------------

create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notification(
    public.client_counterparty(new.client_id, new.sender_id),
    'message',
    new.client_id,
    jsonb_build_object('message_id', new.id, 'preview', left(new.body, 140))
  );
  return new;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function public.on_message_insert();

-- ---------------------------------------------------------------------------
-- A task being completed notifies the other side. Fires only on the
-- false -> true edge, so re-saving a done task stays quiet.
-- ---------------------------------------------------------------------------

create or replace function public.on_task_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and not old.done then
    perform public.push_notification(
      public.client_counterparty(new.client_id, auth.uid()),
      'task-completed',
      new.client_id,
      jsonb_build_object('task_id', new.id, 'title', new.title)
    );
  end if;
  return new;
end;
$$;

create trigger tasks_notify_completed
  after update of done on public.tasks
  for each row execute function public.on_task_completed();

-- ---------------------------------------------------------------------------
-- A recorded charge notifies the member it was recorded against — their
-- receipt. Refund rows notify too, carrying the kind so the UI can word it.
--
-- Naming worth a second opinion: the enum value is 'payment-received', which
-- reads from the business's side, but under 0001's policies only the coach can
-- insert a payment, so the member is the only person left to tell. If
-- member-initiated payments ever land, this should flip to notifying the coach
-- and the enum probably wants a 'payment-recorded' sibling.
-- ---------------------------------------------------------------------------

create or replace function public.on_payment_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
begin
  select member_id into v_member from public.clients where id = new.client_id;
  perform public.push_notification(
    v_member,
    'payment-received',
    new.client_id,
    jsonb_build_object('payment_id', new.id, 'kind', new.kind, 'amount', new.amount, 'currency', new.currency)
  );
  return new;
end;
$$;

create trigger payments_notify
  after insert on public.payments
  for each row execute function public.on_payment_insert();

-- ---------------------------------------------------------------------------
-- A member requesting a slot notifies the coach. The recipient is the block's
-- own coach_id, not a counterparty lookup — a pending block is a request
-- pointed at one coach by definition.
-- ---------------------------------------------------------------------------

create or replace function public.on_time_block_requested()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'pending' then
    perform public.push_notification(
      new.coach_id,
      'session-request',
      new.client_id,
      jsonb_build_object('time_block_id', new.id, 'starts_at', new.starts_at, 'ends_at', new.ends_at)
    );
  end if;
  return new;
end;
$$;

create trigger time_blocks_notify_request
  after insert on public.time_blocks
  for each row execute function public.on_time_block_requested();
