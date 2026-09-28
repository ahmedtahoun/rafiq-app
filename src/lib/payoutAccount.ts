/**
 * The coach's payout account form: what they type, turned into the row
 * coach_payout_accounts will accept.
 *
 * validatePayoutAccount() checks exactly what the database checks (the
 * constraints on coach_payout_accounts in 0007_payouts.sql), no more and no
 * less, so the form never says yes to something the insert then refuses,
 * nor no to something it would take. supabase/tests/09_payout_account_app.sql
 * runs the same cases against the real constraints.
 *
 * The only thing done before checking is normalizing how people type
 * numbers: Arabic-Indic digits, spaces and dashes, a +20 country code, a
 * lower-case IBAN. That changes the text, never what it means.
 */
import type { MessageKey } from './i18n';
import type { Database } from './database.types';

export type PayoutIssuer = Database['public']['Enums']['payout_issuer'];
export type WalletIssuer = Exclude<PayoutIssuer, 'instant_bank'>;
export type PayoutMethod = 'wallet' | 'bank';

export const WALLET_ISSUERS: readonly WalletIssuer[] = ['vodafone', 'etisalat', 'orange', 'bank_wallet'];

export interface PayoutAccountForm {
  method: PayoutMethod;
  walletIssuer: WalletIssuer;
  msisdn: string;
  bankCode: string;
  accountNumber: string;
  fullName: string;
  nationalId: string;
}

/** The columns the app writes — coach_id is added by payoutData.ts. Both
    destination kinds are always present, the unused one null, so switching
    from wallet to bank clears the old number instead of leaving it behind. */
export interface PayoutAccountRow {
  issuer: PayoutIssuer;
  msisdn: string | null;
  bank_code: string | null;
  account_number: string | null;
  full_name: string;
  national_id: string;
}

export type PayoutField = 'msisdn' | 'bankCode' | 'accountNumber' | 'fullName' | 'nationalId';
export type PayoutErrors = Partial<Record<PayoutField, MessageKey>>;

export type PayoutValidation = { ok: true; row: PayoutAccountRow } | { ok: false; errors: PayoutErrors };

// The regexes from 0007's check constraints, verbatim.
const MSISDN = /^01[0-9]{9}$/;
const BANK_CODE = /^[A-Z]{2,10}$/;
const ACCOUNT_NUMBER = /^([0-9]{6,20}|EG[0-9]{27})$/;
const NATIONAL_ID = /^[0-9]{14}$/;

/** ٠-٩ (Arabic-Indic) and ۰-۹ (Extended, Persian/Urdu keyboards) → 0-9. */
function asciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Drops the separators people type inside numbers: spaces (incl. no-break
    and the bidi marks a paste from an RTL field can carry), dashes, dots. */
function stripSeparators(s: string): string {
  return s.replace(/[\s‎‏⁦-⁩\-–.()]/g, '');
}

export function normalizeMsisdn(raw: string): string {
  const s = stripSeparators(asciiDigits(raw));
  // +20 10… / 0020 10… are the same number as 010…
  if (s.startsWith('+20')) return `0${s.slice(3)}`;
  if (s.startsWith('0020')) return `0${s.slice(4)}`;
  return s;
}

export function normalizeAccountNumber(raw: string): string {
  return stripSeparators(asciiDigits(raw)).toUpperCase();
}

export function normalizeNationalId(raw: string): string {
  return stripSeparators(asciiDigits(raw));
}

export function validatePayoutAccount(form: PayoutAccountForm): PayoutValidation {
  const errors: PayoutErrors = {};

  const fullName = form.fullName.trim();
  if (fullName.length === 0) errors.fullName = 'payoutErrFullName';

  const nationalId = normalizeNationalId(form.nationalId);
  if (!NATIONAL_ID.test(nationalId)) errors.nationalId = 'payoutErrNationalId';

  let row: PayoutAccountRow;
  if (form.method === 'wallet') {
    const msisdn = normalizeMsisdn(form.msisdn);
    if (!MSISDN.test(msisdn)) errors.msisdn = 'payoutErrMsisdn';
    row = { issuer: form.walletIssuer, msisdn, bank_code: null, account_number: null, full_name: fullName, national_id: nationalId };
  } else {
    const bankCode = form.bankCode;
    const accountNumber = normalizeAccountNumber(form.accountNumber);
    if (!BANK_CODE.test(bankCode)) errors.bankCode = 'payoutErrBankCode';
    if (!ACCOUNT_NUMBER.test(accountNumber)) errors.accountNumber = 'payoutErrAccountNumber';
    row = { issuer: 'instant_bank', msisdn: null, bank_code: bankCode, account_number: accountNumber, full_name: fullName, national_id: nationalId };
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, row };
}

/** The last four characters — all the screen ever shows of a national ID or
    an account/wallet number once it is saved. */
export function last4(value: string): string {
  return value.slice(-4);
}
