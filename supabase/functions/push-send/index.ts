// Phone notifications: a Database Webhook on notifications insert calls
// this with the new row, and it sends a banner to the recipient's phones.
// See ../_shared/pushSend.ts for what it guarantees, and README.md here for
// the keys and the webhook.
//
// Without PUSH_WEBHOOK_SECRET every request answers 503. Without one
// platform's keys, that platform's phones are skipped and the rest still
// get their banners.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { apnsSender, fcmSender, handlePushRequest, parseServiceAccount, type Db, type Row } from '../_shared/pushSend.ts';

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const env = (name: string) => Deno.env.get(name) || undefined;

const apnsKey = env('APNS_KEY_P8');
const apnsKeyId = env('APNS_KEY_ID');
const apnsTeamId = env('APNS_TEAM_ID');
const senders = {
  ios: apnsSender(
    apnsKey && apnsKeyId && apnsTeamId
      ? { keyP8: apnsKey, keyId: apnsKeyId, teamId: apnsTeamId, topic: env('APNS_TOPIC') ?? 'app.rafiqie.coach', sandbox: env('APNS_SANDBOX') === 'true' }
      : null,
  ),
  android: fcmSender(parseServiceAccount(env('FCM_SERVICE_ACCOUNT'))),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  let body: Row;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'invalid_json' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const out = await handlePushRequest(
    // The real client's types are far wider than the slice used; Db is that
    // slice, so the tests can fake it.
    { db: db as unknown as Db, senders, secret: env('PUSH_WEBHOOK_SECRET') },
    { secretHeader: req.headers.get('x-push-secret') ?? '', body },
  );
  return reply(out.status, out.body);
});
