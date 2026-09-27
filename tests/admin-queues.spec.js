import { test, expect } from '@playwright/test';

/**
 * lib/adminQueues.ts — the first real Supabase writes in the app
 * (LAUNCH-CHECKLIST.md §2's first slice): pro_reports,
 * verification_requests, account_deletion_requests.
 *
 * Same approach tests/native-oauth.spec.js already uses for
 * Supabase-touching code: replace the client's own methods with
 * recorders, so no request ever leaves the browser (tests/README.md,
 * "Supabase configuration") — these assert on the exact table and
 * payload a real insert would send, and on the typed result each
 * function returns, not on a live database.
 *
 * Needs VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY set (placeholders are
 * fine) for isSupabaseConfigured() to be true — same requirement
 * native-oauth.spec.js documents, and the same reason: without them
 * every function here takes its `not_configured` early return before
 * ever reaching the client, which is a one-line guard identical to
 * auth.ts's own (also untested in isolation there).
 */

async function open(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);
  return { page, ctx };
}

// Replaces auth.getUser and from() with recorders. insertError lets a test
// simulate a failed insert (a network error, or the "one pending at a
// time" unique_violation Postgres reports as code 23505).
const installSpy = (page, { userId = 'user-123', insertError = null } = {}) => page.evaluate(({ userId, insertError }) => {
  window.__calls = [];
  const stub = {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: (table) => ({
      insert: async (payload) => {
        window.__calls.push([table, payload]);
        return { error: insertError };
      },
    }),
  };
  window.__installSupabaseStub = async () => {
    const { getSupabase } = await import('/src/lib/supabase.ts');
    const real = getSupabase();
    real.auth.getUser = stub.auth.getUser;
    real.from = stub.from;
  };
}, { userId, insertError }).then(() => page.evaluate(() => window.__installSupabaseStub()));

const calls = (page) => page.evaluate(() => window.__calls);

// ---------------------------------------------------------------------------

test('fileVerificationRequest inserts coach_id + note, and reports ok', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await installSpy(page);

  const result = await page.evaluate(async () => {
    const { fileVerificationRequest } = await import('/src/lib/adminQueues.ts');
    return fileVerificationRequest('Portfolio attached');
  });

  const c = await calls(page);
  expect.soft(c.length, 'exactly one insert').toBe(1);
  expect.soft(c[0][0], 'the right table').toBe('verification_requests');
  expect.soft(JSON.stringify(c[0][1]), 'coach_id from the real signed-in user, plus the note').toBe(
    JSON.stringify({ coach_id: 'user-123', note: 'Portfolio attached' }),
  );
  expect.soft(result, 'reports success').toEqual({ ok: true, data: null });

  await ctx.close();
});

test('fileVerificationRequest defaults note to an empty string', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await installSpy(page);

  await page.evaluate(async () => {
    const { fileVerificationRequest } = await import('/src/lib/adminQueues.ts');
    await fileVerificationRequest();
  });

  const c = await calls(page);
  expect.soft(JSON.stringify(c[0][1])).toBe(JSON.stringify({ coach_id: 'user-123', note: '' }));

  await ctx.close();
});

test('fileAccountDeletionRequest inserts only profile_id — no note column in its grants', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await installSpy(page, { userId: 'user-456' });

  const result = await page.evaluate(async () => {
    const { fileAccountDeletionRequest } = await import('/src/lib/adminQueues.ts');
    return fileAccountDeletionRequest();
  });

  const c = await calls(page);
  expect.soft(c[0][0]).toBe('account_deletion_requests');
  expect.soft(JSON.stringify(c[0][1]), 'only profile_id — matches grant insert (profile_id) in 0005').toBe(
    JSON.stringify({ profile_id: 'user-456' }),
  );
  expect.soft(result).toEqual({ ok: true, data: null });

  await ctx.close();
});

test('fileProReport inserts reporter_id, coach_id, client_id, reason, details', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await installSpy(page, { userId: 'member-1' });

  const result = await page.evaluate(async () => {
    const { fileProReport } = await import('/src/lib/adminQueues.ts');
    return fileProReport({ clientId: 'client-row-1', coachId: 'coach-row-1', reason: 'no_show', details: 'Missed twice' });
  });

  const c = await calls(page);
  expect.soft(c[0][0]).toBe('pro_reports');
  expect.soft(JSON.stringify(c[0][1])).toBe(JSON.stringify({
    reporter_id: 'member-1', coach_id: 'coach-row-1', client_id: 'client-row-1', reason: 'no_show', details: 'Missed twice',
  }));
  expect.soft(result).toEqual({ ok: true, data: null });

  await ctx.close();
});

test('fileProReport defaults details to an empty string', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await installSpy(page, { userId: 'member-1' });

  await page.evaluate(async () => {
    const { fileProReport } = await import('/src/lib/adminQueues.ts');
    await fileProReport({ clientId: 'client-row-1', coachId: 'coach-row-1', reason: 'other' });
  });

  const c = await calls(page);
  expect.soft(c[0][1].details).toBe('');

  await ctx.close();
});

test('not signed in: none of the three ever calls insert', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await installSpy(page, { userId: null });

  const results = await page.evaluate(async () => {
    const q = await import('/src/lib/adminQueues.ts');
    return {
      verification: await q.fileVerificationRequest('x'),
      deletion: await q.fileAccountDeletionRequest(),
      report: await q.fileProReport({ clientId: 'c', coachId: 'p', reason: 'other' }),
    };
  });

  for (const [name, r] of Object.entries(results)) {
    expect.soft(r.ok, `${name}: not ok`).toBe(false);
    expect.soft(r.code, `${name}: not_signed_in`).toBe('not_signed_in');
  }
  expect.soft((await calls(page)).length, 'no insert was attempted').toBe(0);

  await ctx.close();
});

test('a unique_violation (already has one pending) comes back as already_pending, not a generic failure', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await installSpy(page, { insertError: { message: 'duplicate key value violates unique constraint', code: '23505' } });

  const result = await page.evaluate(async () => {
    const { fileAccountDeletionRequest } = await import('/src/lib/adminQueues.ts');
    return fileAccountDeletionRequest();
  });

  expect.soft(result.ok).toBe(false);
  expect.soft(result.code).toBe('already_pending');

  await ctx.close();
});

test('any other database error comes back as unknown', async ({ browser }) => {
  const { page, ctx } = await open(browser);
  await installSpy(page, { insertError: { message: 'connection reset', code: '08006' } });

  const result = await page.evaluate(async () => {
    const { fileVerificationRequest } = await import('/src/lib/adminQueues.ts');
    return fileVerificationRequest();
  });

  expect.soft(result.ok).toBe(false);
  expect.soft(result.code).toBe('unknown');
  expect.soft(result.message).toBe('connection reset');

  await ctx.close();
});
