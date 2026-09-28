/**
 * Paymob Payouts ("Instant Cashin") client.
 *
 * Contract from https://payouts.paymobsolutions.com/docs/ — token, disburse,
 * inquiry by reference, budget. `baseUrl` is the `{ENV}` those pages use:
 * https://stagingpayouts.paymobsolutions.com/api/secure for staging. Confirm
 * against the Swagger page in the Paymob dashboard before going live.
 *
 * No Deno or npm imports on purpose: `fetch` is passed in, so this runs and
 * is tested anywhere, and the Edge Function is the only place that knows
 * about secrets or the database.
 */

export type Issuer = 'vodafone' | 'etisalat' | 'orange' | 'bank_wallet' | 'instant_bank';

export const WALLET_ISSUERS: readonly Issuer[] = ['vodafone', 'etisalat', 'orange', 'bank_wallet'];

/** Paymob's documented floor for instant bank transfers. */
export const INSTANT_BANK_MIN_AMOUNT = 112;

export interface PayoutsConfig {
  baseUrl: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
}

export interface Destination {
  msisdn?: string | null;
  bank_code?: string | null;
  account_number?: string | null;
  full_name: string;
  national_id: string;
}

/**
 * What a payout record keeps: where the money went, not who the person is.
 * The ledger outlives an account deletion (it's a financial record), and the
 * deletion page promises the national ID goes with the account — so it is
 * read from coach_payout_accounts at send time and never stored here.
 */
export type DestinationSnapshot = Omit<Destination, 'national_id'>;

export function destinationSnapshot(d: Destination): DestinationSnapshot {
  return {
    msisdn: d.msisdn ?? null,
    bank_code: d.bank_code ?? null,
    account_number: d.account_number ?? null,
    full_name: d.full_name,
  };
}

export interface PayoutRequest {
  /** Our payout id — sent as Paymob's client reference for timeout recovery. */
  id: string;
  amount: number;
  issuer: Issuer;
  destination: Destination;
  comment?: string | null;
}

/** What a send or an inquiry means for our ledger. */
export type OutcomeStatus = 'success' | 'pending' | 'failed' | 'unknown';

export interface Outcome {
  status: OutcomeStatus;
  transactionId: string | null;
  statusCode: string | null;
  statusDescription: string | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function url(cfg: PayoutsConfig, path: string): string {
  return `${cfg.baseUrl.replace(/\/+$/, '')}/${path}`;
}

/** Validates before anything is sent — a rejected payout costs nothing. */
export function validatePayout(p: PayoutRequest): string | null {
  if (!Number.isFinite(p.amount) || p.amount <= 0) return 'amount must be positive';
  // Tolerance, not equality: 19.99 * 100 is 1998.9999999999998 in binary floating point.
  if (Math.abs(p.amount * 100 - Math.round(p.amount * 100)) > 1e-6) return 'amount has more than 2 decimals';
  if (!/^[0-9]{14}$/.test(p.destination.national_id)) return 'national_id must be 14 digits';
  if (!p.destination.full_name?.trim()) return 'full_name is required';
  if (WALLET_ISSUERS.includes(p.issuer)) {
    if (!/^01[0-9]{9}$/.test(p.destination.msisdn ?? '')) return 'msisdn must be an 11-digit mobile number';
  } else if (p.issuer === 'instant_bank') {
    if (p.amount < INSTANT_BANK_MIN_AMOUNT) return `instant_bank minimum is ${INSTANT_BANK_MIN_AMOUNT} EGP`;
    if (!p.destination.bank_code) return 'bank_code is required';
    if (!/^([0-9]{6,20}|EG[0-9]{27})$/.test(p.destination.account_number ?? '')) {
      return 'account_number must be 6–20 digits or an EG IBAN';
    }
  } else {
    return `unsupported issuer ${String(p.issuer)}`;
  }
  return null;
}

/** The body for `POST {ENV}/disburse/`. */
export function buildDisburseBody(p: PayoutRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    issuer: p.issuer,
    amount: Number(p.amount.toFixed(2)),
    national_id: p.destination.national_id,
    full_name: p.destination.full_name.trim(),
    client_reference_id: p.id,
    client_reference: p.id,
    customer_bears_fees: false,
  };
  if (WALLET_ISSUERS.includes(p.issuer)) {
    body.msisdn = p.destination.msisdn;
  } else {
    body.bank_card_number = p.destination.account_number;
    body.bank_code = p.destination.bank_code;
  }
  if (p.comment?.trim()) body.comment = p.comment.trim();
  return body;
}

/** Maps Paymob's `disbursement_status` onto our ledger's statuses. */
export function toOutcome(json: Record<string, unknown>): Outcome {
  const raw = String(json.disbursement_status ?? '').toLowerCase();
  const status: OutcomeStatus = raw === 'success' || raw === 'successful'
    ? 'success'
    : raw === 'pending'
      ? 'pending'
      : raw === 'failed' || raw === 'failure'
        ? 'failed'
        : 'unknown';
  return {
    status,
    transactionId: json.transaction_id != null ? String(json.transaction_id) : null,
    statusCode: json.status_code != null ? String(json.status_code) : null,
    statusDescription: json.status_description != null ? String(json.status_description) : null,
  };
}

/** `POST {ENV}/o/token/` — OAuth password grant. Access tokens last an hour. */
export async function getAccessToken(cfg: PayoutsConfig, fetchImpl: FetchLike): Promise<string> {
  const res = await fetchImpl(url(cfg, 'o/token/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: cfg.username,
      password: cfg.password,
    }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== 'string') {
    // Never echo the request back: it carries the credentials.
    throw new Error(`Paymob token request failed (HTTP ${res.status})`);
  }
  return json.access_token;
}

/**
 * `POST {ENV}/disburse/`. Never throws: a network error or a 5xx means we
 * can't know whether Paymob acted, so it comes back as `unknown`, and the
 * caller must reconcile with `inquireByReference` instead of retrying.
 */
export async function disburse(
  cfg: PayoutsConfig,
  token: string,
  p: PayoutRequest,
  fetchImpl: FetchLike,
): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetchImpl(url(cfg, 'disburse/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(buildDisburseBody(p)),
    });
  } catch (e) {
    return { status: 'unknown', transactionId: null, statusCode: null, statusDescription: `network: ${(e as Error).message}` };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status >= 500 || res.status === 408 || res.status === 429) {
    return { status: 'unknown', transactionId: null, statusCode: String(res.status), statusDescription: 'no reliable answer from Paymob' };
  }
  const outcome = toOutcome(json);
  // A 4xx with no disbursement status is a refusal (bad input, auth): nothing was sent.
  if (outcome.status === 'unknown' && res.status >= 400) {
    return { ...outcome, status: 'failed', statusCode: outcome.statusCode ?? String(res.status) };
  }
  return outcome;
}

/**
 * `POST {ENV}/transaction/inquire/by-reference/` — up to 50 references a
 * call, 5 calls a minute. Returns outcomes keyed by our payout id; a
 * reference Paymob doesn't know is simply absent.
 */
export async function inquireByReference(
  cfg: PayoutsConfig,
  token: string,
  references: string[],
  fetchImpl: FetchLike,
): Promise<Map<string, Outcome>> {
  const found = new Map<string, Outcome>();
  if (references.length === 0) return found;
  const res = await fetchImpl(url(cfg, 'transaction/inquire/by-reference/'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ references_list: references.slice(0, 50) }),
  });
  if (!res.ok) throw new Error(`Paymob inquiry failed (HTTP ${res.status})`);
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  for (const row of json.results ?? []) {
    const ref = String(row.reference ?? row.client_reference ?? row.client_reference_id ?? '');
    if (ref && references.includes(ref)) found.set(ref, toOutcome(row));
  }
  return found;
}

/** `GET {ENV}/budget/inquire/` — Rafiq's remaining Paymob payout balance. */
export async function getBudget(cfg: PayoutsConfig, token: string, fetchImpl: FetchLike): Promise<string> {
  const res = await fetchImpl(url(cfg, 'budget/inquire/'), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Paymob budget inquiry failed (HTTP ${res.status})`);
  return String(json.current_budget ?? '');
}
