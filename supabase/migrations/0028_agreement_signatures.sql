-- 0028: the coaching agreement, signed for real (issue #143).
--
-- 0005 made `agreements` (one row per relationship: the coach sends, the
-- member signs), but nothing in the app wrote it: the agreement card was
-- the signed-out demo's alone. This makes a signature evidence.
--
-- What a signature records. Proposed — the lawyer may add to this. The
-- lawyer brief (#140, "Is a tap adequate evidence of signature?") asks
-- counsel what the evidence must look like; this is what we propose, and
-- store/LEGAL-DRAFTS.md clause 14 describes it:
--   * category     which agreement: 'physical', 'emotional' or 'general',
--                  from the coach's specialty (src/lib/mockStore.ts);
--   * text_sha256  the SHA-256 of the exact title and body the member was
--                  shown (title, a blank line, body), so the text they
--                  agreed to can be proven later, word for word;
--   * lang         the language it was shown in, 'en' or 'ar';
--   * signed_by    the member's own account, auth.uid() at the time;
--   * signed_at    the database's clock, never the phone's;
--   * client_id    the relationship, already the row's key.
-- signed_by is a plain uuid, not a reference: the record should outlive
-- the account it names. How long it is kept after the relationship ends
-- is a question for the lawyer.
--
-- Who may do what, tighter than 0005:
--   * the coach sends (insert, as 'sent', with no signature) to a member
--     with an account, and can't change or delete the row after: 0005 let
--     the coach update it, which meant a coach could mark it signed;
--   * the member signs only through sign_agreement(), which fills every
--     field above at once, from the server's side where it can;
--   * once signed, nobody changes it from the app, and nobody deletes it
--     from the app either: agreements.client_id is ON DELETE CASCADE (0005),
--     so deleting the relationship would take the signature with it. A
--     coach's delete of a relationship with a signed agreement is refused
--     (clients_keep_signature, at the end).

alter table public.agreements
  add column category    text check (category in ('physical', 'emotional', 'general')),
  add column text_sha256 text check (text_sha256 ~ '^[0-9a-f]{64}$'),
  add column lang        text check (lang in ('en', 'ar')),
  add column signed_by   uuid;

-- NOT VALID: a row signed before this (there should be none: no app path
-- wrote one) isn't checked, and every write from now on is.
alter table public.agreements
  add constraint agreements_signed_evidence check (
    status <> 'signed'
    or (category is not null and text_sha256 is not null and lang is not null and signed_by is not null)
  ) not valid;

drop policy agreements_write_coach on public.agreements;
drop policy agreements_sign_member on public.agreements;

create policy agreements_send_coach on public.agreements
  for insert
  with check (
    public.is_coach_of(client_id)
    and status = 'sent' and signed_at is null
    and category is null and text_sha256 is null and lang is null and signed_by is null
    and exists (select 1 from public.clients c where c.id = client_id and c.member_id is not null)
  );

revoke update, delete on public.agreements from authenticated;

-- The member signs: the agreement their coach sent, once. Returns when.
create or replace function public.sign_agreement(
  p_client      uuid,
  p_category    text,
  p_text_sha256 text,
  p_lang        text
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null or not public.is_member_of(p_client) then
    raise exception 'not this member''s agreement' using errcode = '42501';
  end if;
  update public.agreements
     set status      = 'signed',
         signed_at   = now(),
         signed_by   = auth.uid(),
         category    = p_category,
         text_sha256 = lower(p_text_sha256),
         lang        = p_lang
   where client_id = p_client and status = 'sent'
  returning signed_at into v_at;
  if v_at is null then
    raise exception 'no agreement waiting to be signed' using errcode = 'P0002';
  end if;
  return v_at;
end;
$$;

revoke execute on function public.sign_agreement(uuid, text, text, text) from public, anon;
grant execute on function public.sign_agreement(uuid, text, text, text) to authenticated;

-- A signature outlives the coach's wish to remove the relationship. 0001's
-- clients_delete_own lets the coach delete a clients row, and 0005 cascades
-- that to its agreement, so without this a coach could destroy a member's
-- signature by deleting them. Refused for the app's role only: account
-- deletion (0012, security definer, which never deletes a clients row
-- anyway) and service_role run as other roles and still work. How long a
-- signature is kept once the relationship ends is the lawyer's question.
--
-- Not security definer, so current_user is the caller's role. The check on
-- agreements runs under RLS, and the coach the delete policy lets through
-- can see this relationship's agreement (agreements_select).
create or replace function public.clients_keep_signature()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated'
     and exists (select 1 from public.agreements a where a.client_id = old.id and a.status = 'signed') then
    raise exception 'this relationship has a signed agreement' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke execute on function public.clients_keep_signature() from public, anon, authenticated;

create trigger clients_keep_signature
  before delete on public.clients
  for each row execute function public.clients_keep_signature();
