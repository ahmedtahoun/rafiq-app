// Coach payouts through Paymob Payouts. Admin-only; see README.md beside this file.
//
// POST { action: 'create', coach_id, amount, comment? }  → a 'requested' payout
// POST { action: 'send', payout_id }                      → sends it, once
// POST { action: 'sync' }                                 → settles pending/unknown ones
// POST { action: 'balance' }                              → Rafiq's Paymob payout balance

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  destinationSnapshot,
  disburse,
  getAccessToken,
  getBudget,
  inquireByReference,
  validatePayout,
  type Destination,
  type DestinationSnapshot,
  type Issuer,
  type Outcome,
  type PayoutsConfig,
} from '../_shared/paymobPayouts.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function config(): PayoutsConfig | null {
  const cfg = {
    baseUrl: Deno.env.get('PAYMOB_PAYOUTS_BASE_URL') ?? '',
    username: Deno.env.get('PAYMOB_PAYOUTS_USERNAME') ?? '',
    password: Deno.env.get('PAYMOB_PAYOUTS_PASSWORD') ?? '',
    clientId: Deno.env.get('PAYMOB_PAYOUTS_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('PAYMOB_PAYOUTS_CLIENT_SECRET') ?? '',
  };
  return Object.values(cfg).every(Boolean) ? cfg : null;
}

/** Last four characters only — responses go to a browser. */
function mask(d: DestinationSnapshot): Record<string, string | null> {
  const tail = (v?: string | null) => (v ? `••••${v.slice(-4)}` : null);
  return {
    msisdn: tail(d.msisdn),
    bank_code: d.bank_code ?? null,
    account_number: tail(d.account_number),
    full_name: d.full_name,
  };
}

const FINAL = new Set(['success', 'failed']);

async function record(db: SupabaseClient, id: string, o: Outcome) {
  await db.from('payouts').update({
    status: o.status,
    paymob_transaction_id: o.transactionId,
    status_code: o.statusCode,
    status_description: o.statusDescription,
    ...(FINAL.has(o.status) ? { settled_at: new Date().toISOString() } : {}),
  }).eq('id', id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Only someone in admin_users may move money.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth.user) return reply(401, { error: 'not_signed_in' });
  const { data: admin } = await db.from('admin_users').select('profile_id').eq('profile_id', auth.user.id).maybeSingle();
  if (!admin) return reply(403, { error: 'not_admin' });

  const cfg = config();
  if (!cfg) return reply(500, { error: 'paymob_not_configured' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'invalid_json' });
  }

  switch (body.action) {
    case 'create': {
      const coachId = String(body.coach_id ?? '');
      const amount = Number(body.amount);
      const { data: account } = await db.from('coach_payout_accounts').select('*').eq('coach_id', coachId).maybeSingle();
      if (!account) return reply(409, { error: 'coach_has_no_payout_account' });
      const destination: Destination = {
        msisdn: account.msisdn,
        bank_code: account.bank_code,
        account_number: account.account_number,
        full_name: account.full_name,
        national_id: account.national_id,
      };
      const invalid = validatePayout({ id: crypto.randomUUID(), amount, issuer: account.issuer as Issuer, destination });
      if (invalid) return reply(422, { error: 'invalid_payout', detail: invalid });
      const snapshot = destinationSnapshot(destination);
      const { data: row, error } = await db.from('payouts').insert({
        coach_id: coachId,
        amount,
        issuer: account.issuer,
        destination: snapshot,
        comment: typeof body.comment === 'string' ? body.comment : null,
        requested_by: auth.user.id,
      }).select('id, coach_id, amount, issuer, status, created_at').single();
      if (error) return reply(500, { error: 'insert_failed', detail: error.message });
      return reply(201, { payout: { ...row, destination: mask(snapshot) } });
    }

    case 'send': {
      const id = String(body.payout_id ?? '');
      // Claim it: only one caller can move a payout out of 'requested', so a
      // double click or a retry can never send the same money twice.
      const { data: claimed } = await db.from('payouts')
        .update({ status: 'processing', sent_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'requested')
        .select('*').maybeSingle();
      if (!claimed) return reply(409, { error: 'not_in_requested_state' });

      // The national ID isn't on the payout record (see destinationSnapshot);
      // Paymob needs it, so read it from the coach's current account.
      const { data: account } = await db.from('coach_payout_accounts')
        .select('national_id').eq('coach_id', claimed.coach_id).maybeSingle();
      if (!account) {
        await record(db, id, { status: 'failed', transactionId: null, statusCode: null, statusDescription: 'coach has no payout account' });
        return reply(409, { error: 'coach_has_no_payout_account' });
      }

      const payout = {
        id: claimed.id as string,
        amount: Number(claimed.amount),
        issuer: claimed.issuer as Issuer,
        destination: { ...(claimed.destination as DestinationSnapshot), national_id: account.national_id as string },
        comment: claimed.comment as string | null,
      };
      const invalid = validatePayout(payout);
      if (invalid) {
        await record(db, id, { status: 'failed', transactionId: null, statusCode: null, statusDescription: invalid });
        return reply(422, { error: 'invalid_payout', detail: invalid });
      }

      let token: string;
      try {
        token = await getAccessToken(cfg, fetch);
      } catch (e) {
        // Nothing reached the disburse endpoint, so it is safe to send again later.
        await db.from('payouts').update({ status: 'requested', sent_at: null }).eq('id', id);
        return reply(502, { error: 'paymob_auth_failed', detail: (e as Error).message });
      }

      const outcome = await disburse(cfg, token, payout, fetch);
      await record(db, id, outcome);
      return reply(200, { payout_id: id, ...outcome });
    }

    case 'sync': {
      // 'processing' older than two minutes means a send died mid-flight.
      const stale = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: open } = await db.from('payouts')
        .select('id, status, sent_at')
        .or(`status.in.(pending,unknown),and(status.eq.processing,sent_at.lt.${stale})`)
        .order('created_at').limit(50);
      const ids = (open ?? []).map((r) => r.id as string);
      if (ids.length === 0) return reply(200, { updated: [], not_found: [] });

      const token = await getAccessToken(cfg, fetch);
      const found = await inquireByReference(cfg, token, ids, fetch);
      for (const [id, outcome] of found) await record(db, id, outcome);
      // Not found at Paymob: never re-sent from here. A stuck 'processing'
      // becomes 'unknown' so it shows up as needing an admin's decision — a
      // payout that never arrived can be recreated; one that did must not be.
      const notFound = (open ?? []).filter((r) => !found.has(r.id as string));
      const stuck = notFound.filter((r) => r.status === 'processing').map((r) => r.id as string);
      if (stuck.length) await db.from('payouts').update({ status: 'unknown' }).in('id', stuck).eq('status', 'processing');
      return reply(200, { updated: [...found.keys()], not_found: notFound.map((r) => r.id as string) });
    }

    case 'balance': {
      const token = await getAccessToken(cfg, fetch);
      return reply(200, { current_budget: await getBudget(cfg, token, fetch) });
    }

    default:
      return reply(400, { error: 'unknown_action' });
  }
});
