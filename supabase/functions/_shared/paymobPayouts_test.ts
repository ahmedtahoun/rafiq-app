// deno test supabase/functions — no network: every Paymob call goes to a recorder.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  buildDisburseBody,
  destinationSnapshot,
  disburse,
  getAccessToken,
  inquireByReference,
  validatePayout,
  type PayoutRequest,
  type PayoutsConfig,
} from './paymobPayouts.ts';

const cfg: PayoutsConfig = {
  baseUrl: 'https://payouts.test/api/secure/',
  username: 'u',
  password: 'p',
  clientId: 'cid',
  clientSecret: 'csecret',
};

const wallet: PayoutRequest = {
  id: '6f1c2a3b-0000-4000-8000-000000000001',
  amount: 53.99,
  issuer: 'vodafone',
  destination: { msisdn: '01012345678', full_name: 'Yasmin Adel', national_id: '29005270102927' },
};

const bank: PayoutRequest = {
  id: '6f1c2a3b-0000-4000-8000-000000000002',
  amount: 750,
  issuer: 'instant_bank',
  destination: {
    bank_code: 'AAIB',
    account_number: 'EG187277769381221446527989011',
    full_name: 'Sara Hassan',
    national_id: '29005270102927',
  },
};

type Call = { url: string; init?: RequestInit };
function recorder(responses: Array<{ status: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const fetchImpl = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status }));
  };
  return { calls, fetchImpl };
}

Deno.test('validates amounts, including ones binary floating point cannot hold exactly', () => {
  assertEquals(validatePayout(wallet), null);
  // 19.99 * 100 is 1998.9999999999998 and 4.35 * 100 is 434.99999999999994 in
  // binary floating point; an exact-equality check rejects both.
  assertEquals(validatePayout({ ...wallet, amount: 19.99 }), null);
  assertEquals(validatePayout({ ...wallet, amount: 4.35 }), null);
  assertEquals(validatePayout({ ...wallet, amount: 10.005 }), 'amount has more than 2 decimals');
  assertEquals(validatePayout({ ...wallet, amount: 0 }), 'amount must be positive');
  assertEquals(validatePayout({ ...wallet, amount: Number.NaN }), 'amount must be positive');
});

Deno.test('validates the destination per issuer', () => {
  assertEquals(validatePayout({ ...wallet, destination: { ...wallet.destination, msisdn: '1012345678' } }),
    'msisdn must be an 11-digit mobile number');
  assertEquals(validatePayout({ ...wallet, destination: { ...wallet.destination, national_id: '123' } }),
    'national_id must be 14 digits');
  assertEquals(validatePayout(bank), null);
  assertEquals(validatePayout({ ...bank, amount: 100 }), 'instant_bank minimum is 112 EGP');
  assertEquals(validatePayout({ ...bank, destination: { ...bank.destination, account_number: 'EG12' } }),
    'account_number must be 6–20 digits or an EG IBAN');
});

Deno.test('the disburse body carries our id as the client reference, and only the issuer’s fields', () => {
  const w = buildDisburseBody(wallet);
  assertEquals(w.client_reference_id, wallet.id);
  assertEquals(w.client_reference, wallet.id);
  assertEquals(w.msisdn, '01012345678');
  assertEquals(w.national_id, '29005270102927');
  assertEquals(w.customer_bears_fees, false);
  assert(!('bank_card_number' in w));

  const b = buildDisburseBody(bank);
  assertEquals(b.bank_card_number, 'EG187277769381221446527989011');
  assertEquals(b.bank_code, 'AAIB');
  assert(!('msisdn' in b));
});

Deno.test('token: password grant, client credentials in Basic auth, never echoed on failure', async () => {
  const ok = recorder([{ status: 200, body: { access_token: 'tok', expires_in: 3600 } }]);
  assertEquals(await getAccessToken(cfg, ok.fetchImpl), 'tok');
  assertEquals(ok.calls[0].url, 'https://payouts.test/api/secure/o/token/');
  const headers = ok.calls[0].init!.headers as Record<string, string>;
  assertEquals(headers.Authorization, `Basic ${btoa('cid:csecret')}`);
  assertEquals(String(ok.calls[0].init!.body), 'grant_type=password&username=u&password=p');

  const bad = recorder([{ status: 400, body: { error: 'invalid_client' } }]);
  const err = await assertRejects(() => getAccessToken(cfg, bad.fetchImpl));
  assert(!String(err).includes('csecret') && !String(err).includes('password'));
});

Deno.test('disburse maps Paymob statuses', async () => {
  const cases: Array<[unknown, string]> = [
    [{ disbursement_status: 'success', transaction_id: 't1', status_code: '200' }, 'success'],
    [{ disbursement_status: 'pending', transaction_id: 't2', status_code: '8000' }, 'pending'],
    [{ disbursement_status: 'failed', status_code: '618' }, 'failed'],
  ];
  for (const [body, expected] of cases) {
    const r = recorder([{ status: 200, body }]);
    assertEquals((await disburse(cfg, 'tok', wallet, r.fetchImpl)).status, expected);
    assertEquals(r.calls[0].url, 'https://payouts.test/api/secure/disburse/');
  }
});

Deno.test('disburse never guesses: a timeout or 5xx is unknown, a 4xx refusal is failed', async () => {
  const net = recorder([new Error('connection reset')]);
  assertEquals((await disburse(cfg, 'tok', wallet, net.fetchImpl)).status, 'unknown');

  const five = recorder([{ status: 502, body: {} }]);
  assertEquals((await disburse(cfg, 'tok', wallet, five.fetchImpl)).status, 'unknown');

  const refused = recorder([{ status: 400, body: { detail: 'bad msisdn' } }]);
  const o = await disburse(cfg, 'tok', wallet, refused.fetchImpl);
  assertEquals(o.status, 'failed');
  assertEquals(o.statusCode, '400');
});

Deno.test('inquiry by reference: POSTs our ids, returns only the ones Paymob knows', async () => {
  const r = recorder([{
    status: 200,
    body: { count: 1, results: [{ reference: wallet.id, disbursement_status: 'success', transaction_id: 't9' }] },
  }]);
  const found = await inquireByReference(cfg, 'tok', [wallet.id, bank.id], r.fetchImpl);
  assertEquals(r.calls[0].url, 'https://payouts.test/api/secure/transaction/inquire/by-reference/');
  assertEquals(r.calls[0].init!.method, 'POST');
  assertEquals(JSON.parse(String(r.calls[0].init!.body)).references_list, [wallet.id, bank.id]);
  assertEquals(found.get(wallet.id)?.status, 'success');
  assertEquals(found.has(bank.id), false);
});

Deno.test('a payout record keeps where the money went, never the national ID', () => {
  const snap = destinationSnapshot(wallet.destination);
  assertEquals(snap, { msisdn: '01012345678', bank_code: null, account_number: null, full_name: 'Yasmin Adel' });
  assert(!('national_id' in snap));
  assert(!JSON.stringify(destinationSnapshot(bank.destination)).includes('29005270102927'));
});
