-- 0030 — The consent every new account gives at signup (LEGAL-DRAFTS.md
-- clause 11, approved by counsel 2026-10-13).
--
-- Rafiq Pro's data lives on Supabase's servers in Ireland, so every account
-- is a transfer of personal data out of Egypt. Law 151/2020 art. 14 and its
-- regulations ask for the person's consent to that, on top of the Centre's
-- permit; "by using Rafiq Pro you agree" was the weakest form of it. The
-- terms also require members and pros to be 18 or over (clause 2), which
-- nothing asked until now.
--
-- One row per account, written once, on the last step of onboarding, with
-- both boxes ticked — the checks make an unticked row impossible. The time
-- is the database's (agreed_at is not in the insert grant), and `version`
-- names the wording shown, as an agreement signature does (0028). Nobody
-- changes or deletes a row from the app: withdrawing this consent means
-- closing the account, which keeps the profile row (anonymised, 0012) and
-- so the record of what was agreed.

create table public.signup_consents (
  profile_id       uuid        primary key references public.profiles (id) on delete cascade,
  version          text        not null check (version <> ''),
  transfer_abroad  boolean     not null check (transfer_abroad),
  age_18_plus      boolean     not null check (age_18_plus),
  agreed_at        timestamptz not null default now()
);

alter table public.signup_consents enable row level security;

create policy signup_consents_select_own on public.signup_consents
  for select to authenticated using (profile_id = auth.uid());
create policy signup_consents_insert_own on public.signup_consents
  for insert to authenticated with check (profile_id = auth.uid());

grant select on public.signup_consents to authenticated;
grant insert (profile_id, version, transfer_abroad, age_18_plus) on public.signup_consents to authenticated;
