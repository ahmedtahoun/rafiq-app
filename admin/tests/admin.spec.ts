import { expect, test } from '@playwright/test';
import { aPayout, aReport, fakeFunction, signInAs } from './fakeAdmin';

test('signed out: nothing but a sign-in button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  // No queue is rendered, and nothing is asked of the function.
  await expect(page.getByRole('button', { name: 'Reports' })).toHaveCount(0);
});

test('a signed-in non-admin sees the refusal, not a blank screen', async ({ page }) => {
  // Signing in is open to anyone with a Google account; the function
  // decides whether they may act. A 403 has to read as a refusal.
  await signInAs(page, 'someone@example.com');
  await fakeFunction(page, { listReports: { status: 403, body: { error: 'not_admin' } } });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('not_admin');
});

test('reports: the queue renders, and actioning posts the note', async ({ page }) => {
  await signInAs(page);
  const posted = await fakeFunction(page, {
    listReports: { body: { reports: [aReport()] } },
    actionReport: { body: { report: { id: aReport().id, status: 'actioned' } } },
  });
  await page.goto('/');

  await expect(page.getByText('no show')).toBeVisible();
  await expect(page.getByText('Missed two sessions without telling me.')).toBeVisible();
  await expect(page.getByText('Laila Hafez (laila@example.com)')).toBeVisible();
  // A real instant, in the reader's zone: 22:30 UTC is 01:30 the next day
  // in Cairo, and an admin must see their own clock.
  await expect(page.locator('time')).toHaveText('2 Oct 2026, 01:30');

  await page.getByRole('textbox', { name: /Note/ }).fill('Spoke to the coach.');
  await page.getByRole('button', { name: 'Actioned' }).click();

  await expect.poll(() => posted.filter((p) => p.op === 'actionReport')).toHaveLength(1);
  expect(posted.find((p) => p.op === 'actionReport')).toEqual({
    op: 'actionReport',
    report_id: aReport().id,
    note: 'Spoke to the coach.',
  });
  // The queue is re-read after an action, so a resolved report leaves it.
  await expect.poll(() => posted.filter((p) => p.op === 'listReports').length).toBeGreaterThan(1);
});

test('reports: dismissing is a different operation, not a flag', async ({ page }) => {
  await signInAs(page);
  const posted = await fakeFunction(page, { listReports: { body: { reports: [aReport()] } } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect.poll(() => posted.map((p) => p.op)).toContain('dismissReport');
  expect(posted.map((p) => p.op)).not.toContain('actionReport');
});

test('reports: suspending a coach is offered only while they are active', async ({ page }) => {
  await signInAs(page);
  const suspended = aReport({
    coach: { id: '33333333-3333-4333-8333-333333333333', full_name: 'Laila Hafez', email: 'laila@example.com', account_status: 'suspended' },
  });
  const posted = await fakeFunction(page, { listReports: { body: { reports: [suspended] } } });
  await page.goto('/');

  await expect(page.getByText('suspended')).toBeVisible();
  // `exact`, because getByRole matches the accessible name as a substring
  // by default and 'Unsuspend coach' contains 'Suspend coach'.
  await expect(page.getByRole('button', { name: 'Suspend coach', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Unsuspend coach', exact: true }).click();
  await expect.poll(() => posted.map((p) => p.op)).toContain('unsuspend');
});

test('a 409 from someone else getting there first is shown as what it is', async ({ page }) => {
  await signInAs(page);
  await fakeFunction(page, {
    listReports: { body: { reports: [aReport()] } },
    actionReport: { status: 409, body: { error: 'not_in_expected_state', expected: 'open' } },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Actioned' }).click();
  await expect(page.getByRole('alert')).toContainText('not_in_expected_state');
});

test('verification: approving sends the note and says the badge follows', async ({ page }) => {
  await signInAs(page);
  const posted = await fakeFunction(page, {
    listReports: { body: { reports: [] } },
    listVerifications: {
      body: {
        requests: [{
          id: '55555555-5555-4555-8555-555555555555',
          note: 'ICF ACC, 2024',
          submitted_at: '2026-09-30T09:00:00.000Z',
          // Nested exactly as the function returns it: the embed goes
          // through coach_profiles, because verification_requests.coach_id
          // references coach_profiles(profile_id), not profiles.
          coach: { profile: { id: '33333333-3333-4333-8333-333333333333', full_name: 'Laila Hafez', email: 'laila@example.com' } },
        }],
      },
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Verification' }).click();

  // The coach arrives nested (coach.profile), because the embed goes
  // through coach_profiles. Asserting the name renders is what catches a
  // flatten that silently yields undefined.
  await expect(page.getByText('Laila Hafez (laila@example.com)')).toBeVisible();
  await expect(page.getByText('ICF ACC, 2024')).toBeVisible();
  // The trigger owns coach_profiles.verification_status, and the screen
  // says so rather than implying this app sets the badge.
  await expect(page.getByText("The coach's verified badge follows from this automatically.")).toBeVisible();

  await page.getByRole('textbox', { name: 'Reviewer note' }).fill('Checked the register.');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect.poll(() => posted.find((p) => p.op === 'approveVerification')).toEqual({
    op: 'approveVerification',
    request_id: '55555555-5555-4555-8555-555555555555',
    note: 'Checked the register.',
  });
});

test('deletions: it asks before an irreversible one, and relays a refusal', async ({ page }) => {
  await signInAs(page);
  const posted = await fakeFunction(page, {
    listReports: { body: { reports: [] } },
    listDeletions: {
      body: {
        requests: [{
          id: '66666666-6666-4666-8666-666666666666',
          profile_id: '22222222-2222-4222-8222-222222222222',
          requested_at: '2026-09-28T12:00:00.000Z',
          note: 'Not using it any more.',
          profiles: { full_name: 'Nour Adham', email: 'nour@example.com', role: 'client' },
        }],
      },
    },
    processDeletion: { status: 409, body: { error: 'not_processed', code: '55006', detail: 'an unsettled payout remains' } },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Deletions' }).click();
  await expect(page.getByText('Nour Adham (nour@example.com)')).toBeVisible();

  // Dismissing the confirm must not delete anything.
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Process deletion' }).click();
  await expect.poll(() => posted.map((p) => p.op)).not.toContain('processDeletion');

  // Accepting it does, and the function's own reason reaches the screen.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Process deletion' }).click();
  await expect(page.getByRole('alert')).toContainText('an unsettled payout remains');
});

test('lookup: searches by term, and will not search on one character', async ({ page }) => {
  await signInAs(page);
  const posted = await fakeFunction(page, {
    listReports: { body: { reports: [] } },
    lookupUser: {
      body: {
        profiles: [{
          id: '33333333-3333-4333-8333-333333333333',
          full_name: 'Laila Hafez',
          email: 'laila@example.com',
          role: 'coach',
          account_status: 'active',
          created_at: '2026-05-04T08:00:00.000Z',
        }],
      },
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'User lookup' }).click();

  // The button stays disabled below the function's own minimum, so a
  // request that could only come back 422 is never sent.
  await page.getByRole('textbox', { name: 'Email or name' }).fill('l');
  await expect(page.getByRole('button', { name: 'Search' })).toBeDisabled();

  await page.getByRole('textbox', { name: 'Email or name' }).fill('laila');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('laila@example.com · coach · joined 4 May 2026, 11:00')).toBeVisible();
  expect(posted.find((p) => p.op === 'lookupUser')).toEqual({ op: 'lookupUser', query: 'laila' });

  await page.getByRole('button', { name: 'Suspend', exact: true }).click();
  await expect.poll(() => posted.map((p) => p.op)).toContain('suspend');
  await expect(page.getByText('suspended')).toBeVisible();
});

test('a deleted account offers no way back', async ({ page }) => {
  await signInAs(page);
  await fakeFunction(page, {
    listReports: { body: { reports: [] } },
    lookupUser: {
      body: {
        profiles: [{
          id: '22222222-2222-4222-8222-222222222222',
          full_name: '',
          email: null,
          role: 'client',
          account_status: 'deleted',
          created_at: '2026-05-04T08:00:00.000Z',
        }],
      },
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'User lookup' }).click();
  await page.getByRole('textbox', { name: 'Email or name' }).fill('nour');
  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page.getByText('deleted')).toBeVisible();
  // Someone who asked to be gone is not brought back by a stray click.
  await expect(page.getByRole('button', { name: /suspend/i })).toHaveCount(0);
});

test('payouts: the queue renders a masked destination and offers Send only while requested', async ({ page }) => {
  await signInAs(page);
  await fakeFunction(page, {
    listReports: { body: { reports: [] } },
    listPayouts: {
      body: {
        payouts: [
          aPayout(),
          aPayout({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'processing', sent_at: '2026-10-02T08:00:00.000Z' }),
          aPayout({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'success', settled_at: '2026-10-02T09:00:00.000Z' }),
        ],
      },
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Payouts' }).click();

  await expect(page.getByText('1500 EGP · wallet ·')).toHaveCount(3);
  // The only form of the number this app ever receives.
  await expect(page.getByText('••••1234').first()).toBeVisible();

  // Send belongs to a payout still in 'requested'; Sync to one in flight.
  // A settled one offers neither.
  await expect(page.getByRole('button', { name: 'Send' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Sync' })).toHaveCount(1);
});

test('payouts: creating one sends the coach and amount, and never a destination', async ({ page }) => {
  await signInAs(page);
  const posted = await fakeFunction(page, {
    listReports: { body: { reports: [] } },
    listPayouts: { body: { payouts: [] } },
    createPayout: { status: 201, body: { payout: { id: aPayout().id } } },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Payouts' }).click();

  await page.getByRole('textbox', { name: 'Coach id' }).fill('33333333-3333-4333-8333-333333333333');
  await page.getByRole('textbox', { name: 'Amount' }).fill('1500');
  await page.getByRole('textbox', { name: 'Comment' }).fill('September sessions');
  await page.getByRole('button', { name: 'Create payout' }).click();

  await expect.poll(() => posted.filter((p) => p.op === 'createPayout')).toHaveLength(1);
  expect(posted.find((p) => p.op === 'createPayout')).toEqual({
    op: 'createPayout',
    coach_id: '33333333-3333-4333-8333-333333333333',
    amount: 1500,
    comment: 'September sessions',
  });
  // Where the money goes comes from the coach's saved payout account on
  // the server. Nothing in this app can name a destination, so nothing in
  // this app can send money to one someone typed in.
  const sent = posted.find((p) => p.op === 'createPayout') as Record<string, unknown>;
  expect(Object.keys(sent)).not.toContain('destination');
});

test('payouts: a refusal from the payouts function is shown as what it is', async ({ page }) => {
  await signInAs(page);
  await fakeFunction(page, {
    listReports: { body: { reports: [] } },
    listPayouts: { body: { payouts: [aPayout()] } },
    sendPayout: { status: 409, body: { error: 'not_in_requested_state' } },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Payouts' }).click();
  await page.getByRole('button', { name: 'Send' }).click();

  // Someone else already sent it. That is a different problem from a
  // missing Paymob key, and the admin needs to be able to tell.
  await expect(page.getByRole('alert')).toContainText('not_in_requested_state');
});
