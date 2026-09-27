import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * Profile.tsx's and ClientProfile.tsx's verification/account-deletion
 * flows, now that they call lib/adminQueues.ts for real when Supabase is
 * configured (LAUNCH-CHECKLIST.md §2's first slice). Nothing exercised
 * these screens before.
 *
 * CI always sets VITE_SUPABASE_URL/ANON_KEY (placeholders —
 * .github/workflows/ci.yml, tests/README.md), so isSupabaseConfigured()
 * is true on every CI run: these screens always take the real branch
 * there, never mockStore's fallback. So — same as tests/native-oauth.spec.js
 * and tests/admin-queues.spec.js — every test here replaces the client's
 * own methods with recorders before exercising the screen, rather than
 * asserting on the (CI-unreachable) unconfigured branch.
 */

async function open(browser, { screen, role = 'coach', params = null, seed = null } = {}) {
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
  await page.evaluate(async ([s, p]) => {
    const m = await import('/src/store/appStore.ts');
    m.useAppStore.getState().nav(p ? { screen: s, params: p } : s);
  }, [screen, params]);
  await page.waitForTimeout(400);
  return { page, ctx, errs };
}

// Both delete-confirm tests need the "nothing outstanding" branch of the
// confirm sheet (Cancel/Delete buttons), not the blocked one (a "Got it"
// dead end) — the demo seed has real credits and upcoming sessions on
// purpose (obligations tests want that), so this is cleared deliberately
// rather than picked around.
const CLEAR_PRO_OBLIGATIONS = `(m) => { for (const c of m.getClients()) m.updateClient(c.id, { active: false }); }`;
const CLEAR_SARA_OBLIGATIONS = `(m) => {
  m.updateClient('sara', { nextSessionAtMs: null });
  localStorage.setItem('rafiq_package_sara', JSON.stringify({ total: 0, used: 0, expiresAtMs: Date.now() + 30 * 86400000 }));
}`;

// Same technique tests/admin-queues.spec.js and tests/native-oauth.spec.js
// use: replace the client's own methods so nothing ever reaches a network.
const installSpy = (page, { insertError = null } = {}) => page.evaluate(async (insertError) => {
  const { getSupabase } = await import('/src/lib/supabase.ts');
  const real = getSupabase();
  window.__calls = [];
  real.auth.getUser = async () => ({ data: { user: { id: 'user-123' } } });
  real.auth.signOut = async () => {
    window.__calls.push(['auth.signOut']);
    return { error: null };
  };
  real.from = (table) => ({
    insert: async (payload) => {
      window.__calls.push([table, payload]);
      return { error: insertError };
    },
  });
}, insertError);

const calls = (page) => page.evaluate(() => window.__calls);

// ---------------------------------------------------------------------------

test('Profile: requesting verification files a real row and toasts', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile' });
  await installSpy(page);

  await page.locator('.profile-row', { hasText: 'Verification' }).click();
  await page.waitForTimeout(300);

  const c = await calls(page);
  expect.soft(c.length, 'exactly one insert').toBe(1);
  expect.soft(c[0][0]).toBe('verification_requests');
  expect.soft(c[0][1]).toEqual({ coach_id: 'user-123', note: '' });
  expect.soft(await page.locator('.profile-toast').count(), 'a toast confirms the request').toBe(1);
  // The badge is still mockStore's local mirror (LAUNCH-CHECKLIST.md's
  // "profile and onboarding" step is what converts the read side) — kept
  // in sync so the UI reads the same as a successful request always has.
  const badge = (await page.locator('.profile-row-badge').nth(1).innerText()).trim();
  expect.soft(badge).not.toBe('Unverified');

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Profile: a failed verification request toasts an error and leaves the row usable', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile' });
  await installSpy(page, { insertError: { message: 'network down', code: '08006' } });

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
  const { page, ctx, errs } = await open(browser, { screen: 'profile', seed: CLEAR_PRO_OBLIGATIONS });
  await installSpy(page);

  await page.locator('button', { hasText: 'Delete Account' }).click();
  await page.waitForTimeout(200);
  await page.locator('.profile-modal-btn-danger').click();
  await page.waitForTimeout(300);

  const c = await calls(page);
  expect.soft(c[0]).toEqual(['account_deletion_requests', { profile_id: 'user-123' }]);
  expect.soft(c.some((x) => x[0] === 'auth.signOut'), 'signed out after a successful request').toBe(true);
  expect.soft(await page.locator('.profile-modal-backdrop').count(), 'confirm sheet closed').toBe(0);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('Profile: a failed deletion request keeps the sheet open with an error, and never signs out', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'profile', seed: CLEAR_PRO_OBLIGATIONS });
  await installSpy(page, { insertError: { message: 'network down', code: '08006' } });

  await page.locator('button', { hasText: 'Delete Account' }).click();
  await page.waitForTimeout(200);
  await page.locator('.profile-modal-btn-danger').click();
  await page.waitForTimeout(300);

  const c = await calls(page);
  expect.soft(c.some((x) => x[0] === 'auth.signOut'), 'never reached sign-out').toBe(false);
  expect.soft(await page.locator('.profile-toast-text').innerText(), 'error toast shown').toContain('Something went wrong');
  expect.soft(await page.locator('.profile-modal-backdrop').count(), 'sheet stayed open for a retry').toBe(1);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('ClientProfile: confirming account deletion files a real row and signs out', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientProfile', role: 'client', seed: CLEAR_SARA_OBLIGATIONS });
  await installSpy(page);

  await page.locator('button', { hasText: 'Delete Account' }).click();
  await page.waitForTimeout(200);
  await page.locator('.client-profile-modal-btn-danger').click();
  await page.waitForTimeout(300);

  const c = await calls(page);
  expect.soft(c[0]).toEqual(['account_deletion_requests', { profile_id: 'user-123' }]);
  expect.soft(c.some((x) => x[0] === 'auth.signOut'), 'signed out after a successful request').toBe(true);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});

test('ClientProfile: a failed deletion request shows an inline error and keeps the sheet open', async ({ browser }) => {
  const { page, ctx, errs } = await open(browser, { screen: 'clientProfile', role: 'client', seed: CLEAR_SARA_OBLIGATIONS });
  await installSpy(page, { insertError: { message: 'network down', code: '08006' } });

  await page.locator('button', { hasText: 'Delete Account' }).click();
  await page.waitForTimeout(200);
  await page.locator('.client-profile-modal-btn-danger').click();
  await page.waitForTimeout(300);

  expect.soft(await page.locator('.client-profile-modal-error').count(), 'inline error shown').toBe(1);
  expect.soft(await page.locator('.client-profile-modal-backdrop').count(), 'sheet stayed open').toBe(1);
  const c = await calls(page);
  expect.soft(c.some((x) => x[0] === 'auth.signOut'), 'never reached sign-out').toBe(false);

  await ctx.close();
  expect.soft(errs, 'no page errors').toEqual([]);
});
