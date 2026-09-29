// Working the account-deletion queue. Admin-only, like payouts; see
// migration 0012 for what is deleted and what is kept.
//
// POST { action: 'list' }                    → pending requests, oldest first
// POST { action: 'process', request_id }     → carries one out, start to end
//
// 'process' runs process_account_deletion() (the database half, which
// refuses while a session, credit, dispute or payout is still open), then
// removes the person's photos from Storage, then deletes the login — or,
// for a coach whose roster or payouts must outlive them, bans it and
// replaces its email. Only then is the request marked completed, so a
// failure at any step leaves it pending and safe to run again.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const PHOTO_BUCKETS = ['avatars', 'covers'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth.user) return reply(401, { error: 'not_signed_in' });
  const { data: admin } = await db.from('admin_users').select('profile_id').eq('profile_id', auth.user.id).maybeSingle();
  if (!admin) return reply(403, { error: 'not_admin' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'invalid_json' });
  }

  switch (body.action) {
    case 'list': {
      const { data, error } = await db.from('account_deletion_requests')
        .select('id, profile_id, requested_at, note, profiles(full_name, email, role)')
        .eq('status', 'pending')
        .order('requested_at');
      if (error) return reply(500, { error: 'list_failed', detail: error.message });
      return reply(200, { requests: data });
    }

    case 'process': {
      const requestId = String(body.request_id ?? '');
      const { data: plan, error } = await db.rpc('process_account_deletion', { p_request: requestId });
      if (error) {
        // 55006: something is still open — the message names what.
        const status = error.code === '55006' || error.code === '55000' ? 409 : error.code === 'P0002' ? 404 : 500;
        return reply(status, { error: 'not_processed', code: error.code, detail: error.message });
      }
      const { profile_id: uid, auth: mode } = plan as { profile_id: string; auth: 'delete' | 'lock' };

      // Everything under the person's own folder, not only the current
      // photo: an earlier upload the profile no longer points at is theirs too.
      for (const bucket of PHOTO_BUCKETS) {
        const { data: files, error: listError } = await db.storage.from(bucket).list(uid, { limit: 1000 });
        if (listError) return reply(502, { error: 'storage_failed', bucket, detail: listError.message });
        if (files?.length) {
          const { error: removeError } = await db.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`));
          if (removeError) return reply(502, { error: 'storage_failed', bucket, detail: removeError.message });
        }
      }

      if (mode === 'delete') {
        const { error: deleteError } = await db.auth.admin.deleteUser(uid);
        if (deleteError) return reply(502, { error: 'auth_failed', detail: deleteError.message });
      } else {
        const { error: lockError } = await db.auth.admin.updateUserById(uid, {
          email: `deleted-${uid}@deleted.invalid`,
          phone: '',
          user_metadata: {},
          ban_duration: '876000h',
        });
        if (lockError) return reply(502, { error: 'auth_failed', detail: lockError.message });
      }

      const { error: doneError } = await db.from('account_deletion_requests')
        .update({ status: 'completed', processed_at: new Date().toISOString() })
        .eq('id', requestId);
      if (doneError) return reply(500, { error: 'mark_failed', detail: doneError.message });
      return reply(200, { request_id: requestId, profile_id: uid, auth: mode });
    }

    default:
      return reply(400, { error: 'unknown_action' });
  }
});
