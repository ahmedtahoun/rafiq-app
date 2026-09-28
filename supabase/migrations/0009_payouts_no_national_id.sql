-- 0009: a payout record never keeps the recipient's national ID.
--
-- payouts is a financial record kept after an account is deleted, and the
-- public account-deletion page promises a coach's national ID is deleted
-- with their account. 0007's payouts function copied it into each payout's
-- destination snapshot, which would have broken that promise. The function
-- now reads it from coach_payout_accounts at send time instead; this makes
-- the database refuse it on the ledger too, so it can't creep back in.
--
-- No existing rows to fix: no payout had been created when this was written.

alter table public.payouts
  add constraint payouts_destination_no_national_id
  check (not (destination ? 'national_id'));
