import { test, expect } from '@playwright/test';
import { IGNORED_CONSOLE } from './helpers.js';

/**
 * Crash reporting (LAUNCH-CHECKLIST §10).
 *
 * Two things are being checked, and they are the two the task turns on:
 *
 *  1. With no `VITE_SENTRY_DSN`, Sentry is **not loaded at all** — not
 *     loaded-and-disabled. Nothing is fetched, no global is installed, no
 *     request is made.
 *  2. When it is on, a personal detail cannot reach Sentry. The last test
 *     drives a real crash through a real Sentry client pointed at a fake
 *     DSN on this machine, and reads what it tried to send.
 *
 * The fake DSN's host is 127.0.0.1:5173 — the dev server — so even if the
 * route interception failed, nothing would leave the machine.
 */

const FAKE_DSN = 'http://publickey@127.0.0.1:5173/999';
const ENVELOPE = '**/api/999/envelope/**';

async function openApp(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text() + m.location().url)) errs.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  return { ctx, page, errs };
}

test('with no DSN, Sentry is never loaded and nothing is sent', async ({ browser }) => {
  const { ctx, page, errs } = await openApp(browser);

  // Anything at all that looks like it is going to Sentry.
  const attempted = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (/sentry|envelope/i.test(url)) attempted.push(url);
    return route.continue();
  });

  const state = await page.evaluate(async () => {
    const m = await import('/src/lib/crashReporting.ts');
    return {
      enabled: m.crashReportingEnabled(),
      started: await m.initCrashReporting(),
      // The SDK installs this the moment it initialises.
      globalInstalled: typeof window.__SENTRY__ !== 'undefined',
      // And it would have to have been fetched to install anything.
      fetchedSdk: performance.getEntriesByType('resource').some((r) => /sentry/i.test(r.name)),
    };
  });

  expect(state.enabled, 'no DSN in this environment').toBe(false);
  expect(state.started, 'init refuses to start').toBe(false);
  expect(state.globalInstalled, 'no Sentry global').toBe(false);
  expect(state.fetchedSdk, 'the SDK was never even fetched').toBe(false);
  expect(attempted, 'no request that looks like Sentry').toEqual([]);
  expect(errs).toEqual([]);
  await ctx.close();
});

test('a crash still shows the fallback when reporting is off', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);

  // reportCrash is what ErrorBoundary calls. Off, it must do nothing at
  // all — including not throwing, which would turn one broken screen into
  // a broken app.
  const threw = await page.evaluate(async () => {
    const m = await import('/src/lib/crashReporting.ts');
    try {
      m.reportCrash(new Error('boom'), 'at ClientHome');
      return false;
    } catch {
      return true;
    }
  });
  expect(threw, 'reportCrash is a safe no-op when off').toBe(false);
  await ctx.close();
});

test('scrubEvent removes every kind of personal detail it can recognise', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);

  const out = await page.evaluate(async () => {
    const { scrubEvent } = await import('/src/lib/crashReporting.ts');
    return scrubEvent({
      message: 'failed for sara@example.com on +20 10 1234 5678',
      exception: {
        values: [{
          type: 'TypeError',
          value: 'no row 3f2a1b4c-5d6e-7f80-91a2-b3c4d5e6f708 for national id 29801011234567',
          // A stack is the point of a crash report and must survive intact.
          stacktrace: { frames: [{ filename: 'ClientHome.tsx', lineno: 12345678, colno: 9 }] },
        }],
      },
      user: { id: 'b1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6', email: 'sara@example.com', username: 'Sara Ahmed' },
      breadcrumbs: [{ category: 'ui.click', message: 'Sara Ahmed' }],
      request: {
        url: 'http://localhost/',
        headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc' },
        cookies: 'sb-access-token=x',
        query_string: 'email=sara@example.com',
        data: { body: 'see you at 6' },
      },
      contexts: { device: { name: "Ahmed's iPhone", model: 'iPhone15,2', family: 'iPhone' } },
      server_name: 'somebody-macbook',
      extra: { note: 'called 01012345678', token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyIn0.def' },
    });
  });

  const flat = JSON.stringify(out);

  // Nothing identifying survives.
  for (const secret of ['sara@example.com', '3f2a1b4c-5d6e-7f80-91a2-b3c4d5e6f708', '29801011234567',
    '01012345678', '+20 10 1234 5678', 'eyJhbGciOiJIUzI1NiJ9', "Ahmed's iPhone", 'Sara Ahmed',
    'see you at 6', 'somebody-macbook', 'sb-access-token']) {
    expect(flat, `"${secret}" must not survive scrubbing`).not.toContain(secret);
  }

  // The keys that are dropped outright are gone, not emptied.
  expect(out.user, 'user').toBeUndefined();
  expect(out.breadcrumbs, 'breadcrumbs').toBeUndefined();
  expect(out.server_name, 'server_name').toBeUndefined();
  expect(out.request.headers, 'request headers').toBeUndefined();
  expect(out.request.cookies, 'cookies').toBeUndefined();
  expect(out.request.query_string, 'query string').toBeUndefined();
  expect(out.request.data, 'request body').toBeUndefined();
  expect(out.contexts.device.name, 'device name').toBeUndefined();

  // And what makes a crash report worth having is untouched.
  expect(out.contexts.device.model, 'the device model is still useful and not personal').toBe('iPhone15,2');
  expect(out.exception.values[0].type).toBe('TypeError');
  expect(out.exception.values[0].stacktrace.frames[0], 'the stack survives intact').toEqual({
    filename: 'ClientHome.tsx', lineno: 12345678, colno: 9,
  });
  // The shape of the message is kept, so the crash is still recognisable.
  expect(out.message).toBe('failed for [email] on [phone]');

  await ctx.close();
});

/**
 * The real thing: a real Sentry client, a real crash, and what it actually
 * tried to put on the wire.
 */
test('a real crash reaches the transport with the personal details gone', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);

  const bodies = [];
  await page.route(ENVELOPE, async (route) => {
    bodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  const started = await page.evaluate(async (dsn) => {
    const m = await import('/src/lib/crashReporting.ts');
    m.resetCrashReportingForTests();
    return m.initCrashReporting(dsn);
  }, FAKE_DSN);
  expect(started, 'the fake DSN starts a real client').toBe(true);

  await page.evaluate(async () => {
    const m = await import('/src/lib/crashReporting.ts');
    // Through the app's own loader: a bare specifier does not resolve
    // inside page.evaluate, and this is the same module instance the
    // running client was built from.
    const Sentry = await m.loadSentry();
    // The two things breadcrumbs are dangerous for: the text of a tapped
    // element (a member's name) and a console line (a message body).
    Sentry.addBreadcrumb({ category: 'ui.click', message: 'Sara Ahmed' });
    Sentry.addBreadcrumb({ category: 'console', message: 'sending "see you at 6" to sara@example.com' });
    m.reportCrash(new Error('could not load sara@example.com on +20 10 1234 5678'), 'at ClientHome');
    await Sentry.flush(3000);
  });

  await expect.poll(() => bodies.length, { timeout: 7000 }).toBeGreaterThan(0);
  const sent = bodies.join('\n');

  // What the task asked for, checked against the bytes that would have left
  // the device.
  expect(sent, 'an email').not.toContain('sara@example.com');
  expect(sent, 'a phone number').not.toContain('+20 10 1234 5678');
  expect(sent, "a member's name, from a breadcrumb").not.toContain('Sara Ahmed');
  expect(sent, 'a message body, from a breadcrumb').not.toContain('see you at 6');
  expect(sent, 'breadcrumbs at all').not.toContain('"breadcrumbs"');

  // And it is still a usable report: the crash is identifiable and names
  // the screen it came from.
  expect(sent, 'the redacted message').toContain('[email]');
  expect(sent, 'the failing screen').toContain('ClientHome');

  await ctx.close();
});
