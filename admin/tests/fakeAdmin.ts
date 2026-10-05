import type { Page, Route } from '@playwright/test';

/**
 * A signed-in session, written straight into the client's storage.
 *
 * `storageKey` in src/supabase.ts is explicit for exactly this reason:
 * the key does not depend on the project URL, so a test can seed a
 * session without guessing one. `expires_at` is far future, so
 * supabase-js returns it without trying to refresh over the network.
 */
export const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

export async function signInAs(page: Page, email = 'admin@rafiqpro.com') {
  await page.addInitScript(
    ([key, session]) => localStorage.setItem(key as string, session as string),
    [
      'rafiq-admin-auth',
      JSON.stringify({
        access_token: 'fake-admin-jwt',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
        refresh_token: 'fake-refresh',
        user: {
          id: ADMIN_ID,
          aud: 'authenticated',
          email,
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
        },
      }),
    ],
  );
}

export type Posted = { op: string } & Record<string, unknown>;

/**
 * Stands in for the Edge Function. `replies` maps an op to what it
 * returns; anything not listed returns 200 `{}`, which is enough for the
 * refresh that follows an action.
 *
 * Every POST is recorded, so a test can assert the app asked for the
 * named operation with the right input — the browser half of the
 * function's own "each action changes only what it should".
 */
export async function fakeFunction(
  page: Page,
  replies: Record<string, { status?: number; body: unknown } | ((posted: Posted) => { status?: number; body: unknown })>,
) {
  const posted: Posted[] = [];

  await page.route('**/functions/v1/admin', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Posted;
    posted.push(body);
    const entry = replies[body.op];
    const reply = typeof entry === 'function' ? entry(body) : entry;
    await route.fulfill({
      status: reply?.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(reply?.body ?? {}),
    });
  });

  return posted;
}

export const aReport = (over: Record<string, unknown> = {}) => ({
  id: '44444444-4444-4444-8444-444444444444',
  reason: 'no_show',
  details: 'Missed two sessions without telling me.',
  created_at: '2026-10-01T22:30:00.000Z',
  reporter: { id: '22222222-2222-4222-8222-222222222222', full_name: 'Nour Adham', email: 'nour@example.com' },
  coach: { id: '33333333-3333-4333-8333-333333333333', full_name: 'Laila Hafez', email: 'laila@example.com', account_status: 'active' },
  ...over,
});

/**
 * A payout as the function returns it: the coach nested through
 * `coach_profiles`, and the destination already masked. There is no
 * unmasked shape here because there is none in the app — the server
 * masks before replying (`maskDestination`), so a fixture carrying a
 * full account number would be testing something that cannot happen.
 */
export const aPayout = (over: Record<string, unknown> = {}) => ({
  id: '66666666-6666-4666-8666-666666666666',
  amount: 1500,
  currency: 'EGP',
  issuer: 'wallet',
  status: 'requested',
  comment: 'September sessions',
  destination: { msisdn: '••••1234', bank_code: null, account_number: null, full_name: 'Laila Hafez' },
  paymob_transaction_id: null,
  status_description: null,
  created_at: '2026-10-01T22:30:00.000Z',
  sent_at: null,
  settled_at: null,
  coach: { profile: { id: '33333333-3333-4333-8333-333333333333', full_name: 'Laila Hafez', email: 'laila@example.com' } },
  ...over,
});
