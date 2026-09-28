-- Rafiq — coach payouts through Paymob Payouts
--
-- Money leaving Rafiq's Paymob balance for a coach's wallet or bank account.
-- The app never moves money: it only lets a coach say where they want to be
-- paid, and read their own payout history. Creating and sending a payout is
-- the `payouts` Edge Function's job, running as service_role, and it only
-- acts for someone listed in admin_users.
--
-- Scope for now (see supabase/functions/payouts/README.md):
--   * issuers: the mobile wallets and instant_bank. bank_card is left out —
--     it takes card numbers (PCI scope) and settles in ~2 working days.
--   * payouts are created and sent by an admin, one at a time. There is no
--     earnings balance to pay from until collection (Paymob Accept) exists.

create type payout_issuer as enum ('vodafone', 'etisalat', 'orange', 'bank_wallet', 'instant_bank');

-- requested  → created, not yet sent to Paymob
-- processing → claimed by one send; nothing else may send it
-- pending    → Paymob accepted it, final status not known yet (bank transfers)
-- success / failed → final
-- unknown    → the send may or may not have reached Paymob (timeout, 5xx).
--              Never re-sent automatically; `sync` asks Paymob by reference.
create type payout_status as enum ('requested', 'processing', 'pending', 'success', 'failed', 'unknown');

-- ---------------------------------------------------------------------------
-- admin_users — who may act for Rafiq. No policies and no grants: only
-- service_role (the Edge Function, the dashboard) can read or change it.
-- ---------------------------------------------------------------------------

create table public.admin_users (
  profile_id uuid        primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- ---------------------------------------------------------------------------
-- coach_payout_accounts — where a coach wants to be paid
--
-- Paymob requires the recipient's national ID on every disbursement, so it is
-- stored here, readable only by the coach themselves and service_role.
-- ---------------------------------------------------------------------------

create table public.coach_payout_accounts (
  coach_id       uuid          primary key references public.coach_profiles (profile_id) on delete cascade,
  issuer         payout_issuer not null,
  msisdn         text,
  bank_code      text,
  account_number text,
  full_name      text          not null check (length(trim(full_name)) > 0),
  national_id    text          not null check (national_id ~ '^[0-9]{14}$'),
  updated_at     timestamptz   not null default now(),
  -- A wallet needs an 11-digit Egyptian mobile number and nothing else; an
  -- instant bank transfer needs a bank code and an account number or IBAN.
  constraint coach_payout_accounts_destination check (
    (issuer in ('vodafone', 'etisalat', 'orange', 'bank_wallet')
      and msisdn ~ '^01[0-9]{9}$'
      and bank_code is null and account_number is null)
    or
    (issuer = 'instant_bank'
      and msisdn is null
      and bank_code ~ '^[A-Z]{2,10}$'
      and account_number ~ '^([0-9]{6,20}|EG[0-9]{27})$')
  )
);

create trigger coach_payout_accounts_set_updated_at
  before update on public.coach_payout_accounts
  for each row execute function public.set_updated_at();

alter table public.coach_payout_accounts enable row level security;
create policy coach_payout_accounts_own on public.coach_payout_accounts
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

grant select, insert, update, delete on public.coach_payout_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- payouts — the ledger of money sent to coaches
--
-- `id` doubles as Paymob's client reference, so a send that timed out can be
-- looked up without risking a second transfer. `destination` is a snapshot of
-- the account at creation: changing your payout account later doesn't rewrite
-- where an earlier payout went. Append-only from the app's side (no write
-- grants at all), and coach_id RESTRICTS like payments: money that left must
-- stay on the record.
-- ---------------------------------------------------------------------------

create table public.payouts (
  id                    uuid          primary key default gen_random_uuid(),
  coach_id              uuid          not null references public.coach_profiles (profile_id) on delete restrict,
  amount                numeric(12,2) not null check (amount > 0),
  currency              char(3)       not null default 'EGP',
  issuer                payout_issuer not null,
  destination           jsonb         not null,
  status                payout_status not null default 'requested',
  comment               text,
  paymob_transaction_id text,
  status_code           text,
  status_description    text,
  requested_by          uuid          references public.profiles (id) on delete set null,
  created_at            timestamptz   not null default now(),
  sent_at               timestamptz,
  settled_at            timestamptz,
  updated_at            timestamptz   not null default now()
);

create index payouts_coach_idx on public.payouts (coach_id, created_at desc);
create index payouts_open_idx on public.payouts (created_at) where status in ('processing', 'pending', 'unknown');

create trigger payouts_set_updated_at
  before update on public.payouts
  for each row execute function public.set_updated_at();

alter table public.payouts enable row level security;
create policy payouts_select_own on public.payouts
  for select using (coach_id = auth.uid());

grant select on public.payouts to authenticated;
