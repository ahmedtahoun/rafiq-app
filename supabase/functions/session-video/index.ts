// Joining a 1:1 session's video call. Either person in the session, around
// the session's own time, never recorded; see ../_shared/sessionVideo.ts.
//
// POST { session_id } → { url, token, role, other_name, closes_at }
//
// Needs the DAILY_API_KEY secret (supabase secrets set). Without it every
// request answers 503 video_not_configured; the app says so rather than
// failing silently. The key never leaves this function.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { dailyClient, handleSessionVideoRequest, type Db, type Row } from '../_shared/sessionVideo.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let body: Row;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'invalid_json' });
  }

  const out = await handleSessionVideoRequest(
    {
      // The real client's types are far wider than the slice used; Db is
      // that slice, so the tests can fake it.
      db: db as unknown as Db,
      daily: dailyClient(Deno.env.get('DAILY_API_KEY')),
      now: () => Date.now(),
    },
    { jwt: req.headers.get('Authorization') ?? '', body },
  );
  return reply(out.status, out.body);
});
