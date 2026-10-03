// The admin queues — reports, coach verification, account deletions,
// suspensions, user lookup. Admin-only; see ../../../admin/README.md.
//
// POST { op: 'listReports' }                              → open reports, oldest first
// POST { op: 'actionReport'|'dismissReport', report_id, note? }
// POST { op: 'suspend'|'unsuspend', profile_id }          → profiles.account_status
// POST { op: 'listVerifications' }                        → pending requests, oldest first
// POST { op: 'approveVerification'|'rejectVerification', request_id, note? }
// POST { op: 'listDeletions' } / { op: 'processDeletion', request_id }
// POST { op: 'lookupUser', query }                        → by email or name
//
// This file is request plumbing only. Every decision — the admin check
// included — is in ../_shared/adminOps.ts, where the tests can reach it.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleAdminRequest, type Db, type Row } from '../_shared/adminOps.ts';

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

  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let body: Row;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'invalid_json' });
  }

  const out = await handleAdminRequest(
    {
      // The real client's types are much wider than what adminOps uses;
      // Db is that narrow slice, so the tests can fake it.
      db: db as unknown as Db,
      now: () => new Date().toISOString(),
      // Deletions are carried out by the existing account-deletion
      // function, called as the admin who asked — it verifies the same
      // JWT and checks admin_users itself.
      callFunction: async (name, payload, jwt) => {
        const res = await fetch(`${url}/functions/v1/${name}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        try {
          return { status: res.status, body: JSON.parse(text) };
        } catch {
          return { status: 502, body: { error: 'bad_response_from_' + name, detail: text.slice(0, 200) } };
        }
      },
    },
    { jwt: req.headers.get('Authorization') ?? '', body },
  );

  return reply(out.status, out.body);
});
