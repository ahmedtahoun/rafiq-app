# Coach payouts (Paymob Payouts)

Sends a coach's money from Rafiq's Paymob payout balance to their mobile
wallet or bank account. Paymob's API docs: https://payouts.paymobsolutions.com/docs/

- `supabase/migrations/0007_payouts.sql` — `coach_payout_accounts` (where a
  coach wants to be paid), `payouts` (the ledger), `admin_users` (who may
  send money).
- `supabase/functions/_shared/paymobPayouts.ts` — the Paymob client (token,
  disburse, inquiry by reference, budget). Pure TypeScript, unit-tested in
  `paymobPayouts_test.ts`.
- `supabase/functions/payouts/index.ts` — the Edge Function. **Admin only.**

## How it behaves

| Action | What it does |
|---|---|
| `create` `{ coach_id, amount, comment? }` | Validates against the coach's payout account and records a `requested` payout, with a snapshot of the destination (wallet or account number and name — never the national ID; `0009` enforces it) |
| `send` `{ payout_id }` | Claims the payout (`requested` → `processing`) so it can only ever be sent once, reads the national ID from the coach's current payout account, then calls Paymob and records `success`, `pending`, `failed` or `unknown` |
| `sync` | Asks Paymob about every `pending`/`unknown` payout (and any `processing` older than 2 minutes) by reference, and records what it says |
| `balance` | Rafiq's remaining Paymob payout balance |

**Money is never sent twice.** Our payout `id` goes to Paymob as the client
reference. If a send times out or Paymob answers with a 5xx, we can't know
whether it went through, so the payout becomes `unknown` and is **never
re-sent automatically** — `sync` looks it up by reference instead. If Paymob
has no record of it, an admin can create a new payout.

**Callbacks aren't used.** Paymob's callback carries no signature, so anyone
could fake one; statuses only come from Paymob's own inquiry API.

**Scope now:** mobile wallets (`vodafone`, `etisalat`, `orange`,
`bank_wallet`) and `instant_bank` (account number or IBAN). `bank_card` is
left out: it takes card numbers (PCI scope) and settles in ~2 working days.
Rafiq pays Paymob's fees (`customer_bears_fees: false`).

## Setup (Ahmed)

The credentials Paymob emailed live **only** as Supabase secrets. Never in
the app, never in git, never in chat.

1. Make yourself an admin — Supabase dashboard → SQL editor:
   ```sql
   insert into public.admin_users (profile_id)
   select id from public.profiles where email = 'you@example.com';
   ```
2. Put the staging credentials in `supabase/functions/.env` (gitignored by
   the root `.gitignore`'s `.env` rule):
   ```
   PAYMOB_PAYOUTS_BASE_URL=https://stagingpayouts.paymobsolutions.com/api/secure
   PAYMOB_PAYOUTS_USERNAME=...
   PAYMOB_PAYOUTS_PASSWORD=...
   PAYMOB_PAYOUTS_CLIENT_ID=...
   PAYMOB_PAYOUTS_CLIENT_SECRET=...
   ```
   The username and password are the **API user**'s, not the dashboard user's.
3. Upload them, then delete the file:
   ```bash
   npx supabase secrets set --env-file supabase/functions/.env
   ```
4. Deploy the function:
   ```bash
   npx supabase functions deploy payouts
   ```

## Testing on staging

The function needs a signed-in admin's access token. Sign in to the app on
`localhost:5173`, then in the browser console:

```js
JSON.parse(localStorage.getItem('sb-muikkxccdamtejvheepx-auth-token')).access_token
```

Put a test payout account on a coach (SQL editor, or the app once the
screen exists), then call the function — `balance` first, then `create`,
`send` and `sync`:

```bash
curl -X POST https://muikkxccdamtejvheepx.supabase.co/functions/v1/payouts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"balance"}'
```

Things to confirm on staging, because Paymob's public docs don't pin them down:
- The base URL above (`{ENV}` in the docs) — also in the dashboard's Swagger page.
- Client credentials in HTTP Basic auth (their curl example) are accepted.
- `national_id` really is required, as the docs' table says.
  `scripts/paymob-national-id-check.ts` answers this one on its own:
  two 1.00 EGP disbursements, identical except that the first omits the
  field. It is worth running first — if the field is not required, the
  most sensitive column in the database goes away, and with it `0009`'s
  constraint and two of the open privacy questions
  (`store/app-privacy.md` §8, q5 and q6).
- `inquire/by-reference` finds a payout by the `client_reference` we send.

## Not built yet

- **Screens:** a coach's "payout account" form and payout history (Earnings),
  and an admin screen to create, send and sync payouts.
- **Earnings balance:** what a coach is owed depends on collected session
  payments (Paymob Accept, not integrated yet) and Rafiq's commission. Until
  then an admin chooses the amount.
- **Payout account changes:** consider notifying the coach and holding
  payouts for a day after the destination changes — the classic way a
  hijacked account redirects money.
