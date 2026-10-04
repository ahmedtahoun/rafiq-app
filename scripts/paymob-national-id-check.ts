/**
 * Does Paymob actually require `national_id` on a disbursement?
 *
 * This is the one open question that makes the whole privacy story
 * harder: LAUNCH-CHECKLIST §3, and questions 5, 6 and 12 in
 * store/privacy-inventory.md all hang off it. A 14-digit government ID
 * is the most sensitive row in the database — it forces a check
 * constraint (0009) to keep it off the payouts ledger, it has no
 * sensible home on Apple's privacy form, and it is the single reason
 * Paymob counts as "shared" rather than "processed". If Paymob does not
 * need it, all of that goes away.
 *
 * `_shared/paymobPayouts.ts:84` enforces 14 digits, but that encodes a
 * BELIEF about Paymob's API, not evidence from it. Only Paymob can
 * settle it.
 *
 * ---------------------------------------------------------------------
 * HOW TO RUN IT  (Ahmed — this needs credentials, so only you can)
 * ---------------------------------------------------------------------
 *
 *   export PAYMOB_PAYOUTS_BASE_URL=...      # the STAGING base URL
 *   export PAYMOB_PAYOUTS_USERNAME=...
 *   export PAYMOB_PAYOUTS_PASSWORD=...
 *   export PAYMOB_PAYOUTS_CLIENT_ID=...
 *   export PAYMOB_PAYOUTS_CLIENT_SECRET=...
 *   export PAYMOB_TEST_MSISDN=01000000000   # a staging wallet number
 *   export PAYMOB_TEST_NATIONAL_ID=...      # any valid 14-digit test ID
 *   export PAYMOB_STAGING_CONFIRM=yes       # deliberate, so it cannot run by accident
 *
 *   npx --yes deno run --allow-net --allow-env scripts/paymob-national-id-check.ts
 *
 * It sends TWO disbursements of 1.00 EGP, identical except that the
 * first omits `national_id`. Two, not one, on purpose: a single failed
 * call proves nothing — it could fail for any reason. The pair is the
 * control.
 *
 * Nothing is written to the database and no credential, national ID or
 * account number is printed; the ID is shown as its last two digits.
 * Run it against STAGING. It prints the base URL before doing anything
 * so you can see where it is pointed.
 */

import { buildDisburseBody, getAccessToken, type PayoutsConfig, type PayoutRequest } from '../supabase/functions/_shared/paymobPayouts.ts';

const need = (k: string): string => {
  const v = Deno.env.get(k);
  if (!v) {
    console.error(`missing ${k} — see the comment at the top of this file`);
    Deno.exit(2);
  }
  return v;
};

if (Deno.env.get('PAYMOB_STAGING_CONFIRM') !== 'yes') {
  console.error('Refusing to run: set PAYMOB_STAGING_CONFIRM=yes once you have checked the base URL is staging.');
  Deno.exit(2);
}

const cfg: PayoutsConfig = {
  baseUrl: need('PAYMOB_PAYOUTS_BASE_URL'),
  username: need('PAYMOB_PAYOUTS_USERNAME'),
  password: need('PAYMOB_PAYOUTS_PASSWORD'),
  clientId: need('PAYMOB_PAYOUTS_CLIENT_ID'),
  clientSecret: need('PAYMOB_PAYOUTS_CLIENT_SECRET'),
};

const nationalId = need('PAYMOB_TEST_NATIONAL_ID');
const msisdn = need('PAYMOB_TEST_MSISDN');

/** Last two digits only — this is the value the whole question is about. */
const mask = (v: string) => `••••••••••••${v.slice(-2)}`;

const base = cfg.baseUrl.replace(/\/+$/, '');
console.log(`base URL: ${base}`);
console.log(`national ID under test: ${mask(nationalId)}`);
console.log('');

const token = await getAccessToken(cfg, fetch);

/** One disbursement, built exactly as production builds it. */
async function attempt(label: string, omitNationalId: boolean) {
  const request: PayoutRequest = {
    id: crypto.randomUUID(),
    amount: 1,
    issuer: 'vodafone',
    destination: { msisdn, full_name: 'Staging Check', national_id: nationalId },
  };
  const body = buildDisburseBody(request);
  // The only difference between the two attempts.
  if (omitNationalId) delete body.national_id;

  const res = await fetch(`${base}/disburse/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`── ${label}`);
  console.log(`   HTTP ${res.status}`);
  console.log(`   ${text.slice(0, 600)}`);
  console.log('');
  return { ok: res.status < 400, status: res.status, text };
}

const without = await attempt('WITHOUT national_id', true);
const with_ = await attempt('WITH national_id (the control)', false);

console.log('─'.repeat(60));
if (without.ok) {
  console.log('VERDICT: Paymob accepted a disbursement with NO national_id.');
  console.log('         It is not required. Stop collecting it:');
  console.log('         - drop the column from coach_payout_accounts (a migration, Ahmed numbers it)');
  console.log('         - drop it from Destination and validatePayout in _shared/paymobPayouts.ts');
  console.log('         - 0009\'s check constraint becomes unnecessary');
  console.log('         - privacy questions 5 and 12 disappear, and the hardest');
  console.log('           row in store/privacy-inventory.md goes with them');
} else if (with_.ok) {
  console.log('VERDICT: rejected without it, accepted with it. Paymob requires national_id.');
  console.log('         Keep collecting it, and keep 0009\'s constraint. The answers');
  console.log('         to privacy questions 5 and 12 stand as written.');
} else {
  console.log('VERDICT: BOTH attempts failed, so this proves nothing about national_id.');
  console.log('         Something else is wrong — credentials, the base URL, the test');
  console.log('         wallet number, or staging being down. Read the two responses');
  console.log('         above before concluding anything.');
}
