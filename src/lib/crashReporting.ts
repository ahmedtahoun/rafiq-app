/**
 * Crash reporting, off by default and deaf to personal data when on.
 *
 * Checklist §10. Two constraints shaped everything here:
 *
 *  1. **Completely off without a DSN.** `VITE_SENTRY_DSN` unset means the
 *     SDK is never even imported — `initCrashReporting()` returns before
 *     the dynamic `import()`, so no Sentry code is parsed, no global hooks
 *     are installed and no request can be made. Off is not "configured
 *     with a sample rate of zero"; it is absent.
 *
 *  2. **A crash report is not a data export.** Sentry's defaults collect a
 *     great deal that is fine for a typical web app and not fine here:
 *     breadcrumbs record the text of every element a user taps (a member's
 *     name), every console line (a message body while debugging) and every
 *     request URL (`clients?member_id=eq.<uuid>`). All of it is turned off,
 *     and what is left goes through `scrubEvent` on the way out.
 *
 * What survives to Sentry, and what does not, is tabulated in
 * `store/privacy-inventory.md` §10 — the input to the App Privacy and
 * Data safety forms (§8). Change what is sent here, change it there.
 */

/** Set in `.env.local` / the CI secret. Empty means off. */
const DSN: string = import.meta.env.VITE_SENTRY_DSN ?? '';

export function crashReportingEnabled(dsn: string = DSN): boolean {
  return dsn.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Patterns for the things that have a shape. Order matters: a national ID
 * is fourteen digits and would otherwise be swallowed by the phone pattern
 * and mislabelled, and a JWT contains dots and dashes that the others would
 * chew through first.
 *
 * A person's *name* has no shape, so no pattern can find one. Names are
 * kept out structurally instead — see `sentryOptions` below.
 */
const PATTERNS: [RegExp, string][] = [
  // Supabase access tokens and anon keys, which are JWTs.
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+/g, '[token]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // Every id in the schema is a uuid: profiles, clients, sessions, messages.
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[uuid]'],
  // An Egyptian national ID, which coach_payout_accounts checks is 14 digits.
  [/\b\d{14}\b/g, '[id]'],
  // Anything else that reads as a phone number. Deliberately greedy: over-
  // redacting a timestamp costs nothing, under-redacting a number costs a
  // member's phone number.
  [/(?:\+|00)?\d[\d\s().-]{6,}\d/g, '[phone]'],
];

export function redact(value: string): string {
  let out = value;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * Keys whose subtree is left alone. Stack frames are the entire point of a
 * crash report and contain file paths and line numbers, which the phone
 * pattern would happily turn into `[phone]`.
 */
const KEEP_INTACT = new Set(['stacktrace', 'frames', 'modules', 'sdk', 'debug_meta']);

/** Keys deleted outright, wherever they appear. */
const DROP = new Set([
  'user',          // never identify anyone, not even by id
  'breadcrumbs',   // belt and braces with beforeBreadcrumb
  'headers',       // authorization, cookies
  'cookies',
  'query_string',
  'data',          // a request body
  'server_name',
]);

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[deep]';
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP.has(key)) continue;
      out[key] = KEEP_INTACT.has(key) ? v : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * The last thing that runs before an event leaves the device. Exported so a
 * test can hand it a hostile event rather than having to provoke a real
 * crash that happens to contain a phone number.
 */
export function scrubEvent<T extends Record<string, unknown>>(event: T): T {
  const scrubbed = scrubValue(event) as Record<string, unknown>;
  // A device's name is its owner's: "Ahmed's iPhone". The model and OS are
  // what makes a crash report useful, so they stay.
  const contexts = scrubbed.contexts as Record<string, Record<string, unknown>> | undefined;
  if (contexts?.device) delete contexts.device.name;
  return scrubbed as T;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Everything that has to be switched off, in one place so it can be read in
 * one go — and so the test can assert on the same object the SDK is given.
 *
 * `beforeBreadcrumb` returning null is the single most important line here.
 * Sentry's breadcrumbs are where a member's name (the text of the button
 * that was tapped), a message body (a console line) and a row id (a request
 * URL) would otherwise reach a third party.
 */
export function sentryOptions(dsn: string): Record<string, unknown> {
  return {
    dsn,
    // No performance tracing and no session replay: both stream what is on
    // screen, and what is on screen here is somebody's coaching record.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    enableCaptureFailedRequests: false,
    enableAutoSessionTracking: false,
    attachStacktrace: true,
    beforeBreadcrumb: () => null,
    beforeSend: (event: Record<string, unknown>) => scrubEvent(event),
  };
}

/**
 * One place that names the SDK, so `init` and `reportCrash` get the same
 * module instance and there is a single spelling of the dynamic import to
 * keep out of the startup path. Exported because a test needs the same
 * instance to put a breadcrumb into the client it is inspecting.
 */
export function loadSentry(): Promise<typeof import('@sentry/capacitor')> {
  return import('@sentry/capacitor');
}

let started = false;

/**
 * Starts Sentry if there is a DSN. Resolves to whether it is now running,
 * and never throws: a crash reporter that breaks startup is worse than no
 * crash reporter.
 */
export async function initCrashReporting(dsn: string = DSN): Promise<boolean> {
  if (started) return true;
  if (!crashReportingEnabled(dsn)) return false;
  try {
    // Dynamic, so that with no DSN the SDK is not in the startup path at
    // all — not merely inert.
    const Sentry = await loadSentry();
    Sentry.init(sentryOptions(dsn));
    started = true;
    return true;
  } catch (e) {
    console.error('[crash] Sentry failed to start; carrying on without it', e);
    return false;
  }
}

/** Test seam: forget that init ran, so a spec can start a fresh client. */
export function resetCrashReportingForTests(): void {
  started = false;
}

/**
 * Reports a render-time crash. A no-op when reporting is off, which is the
 * normal case today — nobody has created the Sentry project yet.
 *
 * The component stack is the useful part: it names the screen that threw.
 * It carries component names, never their props, so nothing about a person
 * is in it.
 */
export function reportCrash(error: unknown, componentStack?: string | null): void {
  if (!started) return;
  void loadSentry()
    .then((Sentry) => {
      Sentry.captureException(error, {
        contexts: componentStack ? { react: { componentStack } } : undefined,
      });
    })
    .catch(() => {
      // Reporting a crash must never cause one.
    });
}
