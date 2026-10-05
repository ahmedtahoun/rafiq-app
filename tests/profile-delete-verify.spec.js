import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';
import { installFakeSupabase, signIn, dbRows, dbCalls } from './fakeSupabase.js';

/**
 * Profile.tsx's and ClientProfile.tsx's verification and account-deletion
 * flows on the real path — which, since profile step 2, is taken when
 * someone is signed in (lib/remoteSession.ts), not merely when Supabase is
 * configured. CI is configured (placeholder credentials) but never signed
 * in, so each test here signs in against tests/fakeSupabase.js first.
 */

async function open(browser, { screen, role = 'coach', seed = null, tables, fail } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate((r) => {
    localStorage.clear();
    localStorage.setItem('rafiq_role', JSON.stringify(r));
  }, role);
  await page.reload();
  if (seed) {
    await page.evaluate(async (src) => {
      const m = await import('/src/lib/mockStore.ts');
      await eval(src)(m);
    }, seed);
  }
  await installFakeSupabase(page, { tables, fail });
  await signIn(page);
  await page.evaluate(async (s) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(s);
  }, screen);
  await page.waitForTimeout(400);
  return { page, ctx, errs };
}

const COACH_TABLES = {
  profiles: [{ id: 'user-123', full_name: 'Rana Coach', phone: '', country_code: '+20', email: 'rana@x.com', country: 'Egypt', country_flag: '', city: 'Cairo', avatar_photo_url: null, account_status: 'active' }],
  coach_profiles: [{ profile_id: 'user-123', title: 'Life coaching', cert: '', bio: '', languages: [], session_mode: 'both', experience_years: null, certifications: [], cover_photo_url: null, verification_status: 'unverified', signup_completed_at: '2026-09-01T00:00:00Z' }],
};

// The delete confirm sheet shows its Cancel/Delete variant only when
// nothing is outstanding. A coach's open items are read from their own rows
// signed in (tests/profile-stats.spec.js), so CLEAR_PRO_OBLIGATIONS no longer
// changes what the coach's sheet shows; the member's are still mockStore's,
// and the demo seed has plenty, on purpose.
const CLEAR_PRO_OBLIGATIONS = `(m) => { for (const c of m.getClients()) m.updateClient(c.id, { active: false }); }`;
const CLEAR_SARA_OBLIGATIONS = `(m) => {
  m.updateClient('sara', { nextSessionAtMs: null });
  localStorage.setItem('rafiq_package_sara', JSON.stringify({ total: 0, used: 0, expiresAtMs: Date.now() + 30 * 86400000 }));
}`;

const inserts = async (page, table) => (await dbCalls(page)).filter((c) => c.table === table && c.op === 'insert');
const signedOut = async (page) => (await dbCalls(page)).some((c) => c.op === 'auth.signOut');

// ---------------------------------------------------------------------------

test('Profile: requesting verification files a real row, and the badge reads the column back', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile', tables: COACH_TABLES });

  const badge = page.locator('.profile-row', { hasText: 'Verification' }).locator('.profile-row-badge');
  expect.soft((await badge.innerText()).trim(), 'starts from the real column').toBe('Unverified');

  await page.locator('.profile-row', { hasText: 'Verification' }).click();
  await page.waitForTimeout(300);

  const filed = await inserts(page, 'verification_requests');
  expect.soft(filed.length, 'exactly one request').toBe(1);
  expect.soft(filed[0]?.values).toEqual({ coach_id: 'user-123', note: '' });
  expect.soft((await badge.innerText()).trim(), "pending, because the trigger flipped the column — re-read, not assumed").toBe('Pending');
  expect.soft(await page.locator('.profile-toast').count(), 'a toast confirms the request').toBe(1);
  // #38's workaround wrote a local mirror as well; there is no mirror now.
  const localStatus = await page.evaluate(async () => (await import('/src/lib/mockStore.ts')).getVerificationStatus());
  expect.soft(localStatus, 'mockStore untouched').toBe('unverified');

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Profile: a failed verification request toasts an error and leaves the row usable', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile', tables: COACH_TABLES, fail: ['verification_requests'] });

  await page.locator('.profile-row', { hasText: 'Verification' }).click();
  await page.waitForTimeout(300);

  expect.soft((await page.locator('.profile-toast-text').innerText()).trim(), 'the generic retry message, not raw Postgres text').toBe(
    'Something went wrong. Please try again.',
  );
  expect.soft(await page.locator('.profile-row', { hasText: 'Verification' }).isDisabled(), 're-enabled after the failure').toBe(false);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Profile: confirming account deletion files a real row and signs out', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile', tables: COACH_TABLES, seed: CLEAR_PRO_OBLIGATIONS });

  await page.locator('button', { hasText: 'Delete Account' }).click();
  await page.waitForTimeout(200);
  await page.locator('.profile-modal-btn-danger').click();
  await page.waitForTimeout(300);

  expect.soft(await dbRows(page, 'account_deletion_requests')).toEqual([{ profile_id: 'user-123', id: 'account_deletion_requests-1' }]);
  expect.soft(await signedOut(page), 'signed out after a successful request').toBe(true);
  expect.soft(await page.locator('.profile-modal-backdrop').count(), 'confirm sheet closed').toBe(0);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Profile: a failed deletion request keeps the sheet open with an error, and never signs out', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, {
    screen: 'profile', tables: COACH_TABLES, seed: CLEAR_PRO_OBLIGATIONS, fail: ['account_deletion_requests'],
  });

  await page.locator('button', { hasText: 'Delete Account' }).click();
  await page.waitForTimeout(200);
  await page.locator('.profile-modal-btn-danger').click();
  await page.waitForTimeout(300);

  expect.soft(await signedOut(page), 'never reached sign-out').toBe(false);
  expect.soft(await page.locator('.profile-toast-text').innerText(), 'error toast shown').toContain('Something went wrong');
  expect.soft(await page.locator('.profile-modal-backdrop').count(), 'sheet stayed open for a retry').toBe(1);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('ClientProfile: confirming account deletion files a real row and signs out', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientProfile', role: 'client', seed: CLEAR_SARA_OBLIGATIONS });

  await page.locator('button', { hasText: 'Delete Account' }).click();
  await page.waitForTimeout(200);
  await page.locator('.client-profile-modal-btn-danger').click();
  await page.waitForTimeout(300);

  expect.soft((await inserts(page, 'account_deletion_requests'))[0]?.values).toEqual({ profile_id: 'user-123' });
  expect.soft(await signedOut(page), 'signed out after a successful request').toBe(true);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('ClientProfile: a failed deletion request shows an inline error and keeps the sheet open', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, {
    screen: 'clientProfile', role: 'client', seed: CLEAR_SARA_OBLIGATIONS, fail: ['account_deletion_requests'],
  });

  await page.locator('button', { hasText: 'Delete Account' }).click();
  await page.waitForTimeout(200);
  await page.locator('.client-profile-modal-btn-danger').click();
  await page.waitForTimeout(300);

  expect.soft(await page.locator('.client-profile-modal-error').count(), 'inline error shown').toBe(1);
  expect.soft(await page.locator('.client-profile-modal-backdrop').count(), 'sheet stayed open').toBe(1);
  expect.soft(await signedOut(page), 'never reached sign-out').toBe(false);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});
