import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  apnsSender,
  bannerFor,
  fcmSender,
  formatWhen,
  handlePushRequest,
  parseServiceAccount,
  pemToDer,
  sameSecret,
  type Banner,
  type Db,
  type Row,
  type Sender,
  type SendOutcome,
} from './pushSend.ts';

const SECRET = 'webhook-secret';
const COACH = '11111111-0000-0000-0000-00000000000c';
const MEMBER = '11111111-0000-0000-0000-000000000001';
const CLIENT = '11111111-1111-0000-0000-000000000001';
const NOTE = '11111111-2222-0000-0000-000000000001';
const FSI = '⁨';
const PDI = '⁩';

type Tables = Record<string, Row[]>;

function fakeDb(t: Tables) {
  const deleted: string[] = [];
  const reads: string[] = [];
  const db: Db = {
    from(table: string) {
      return {
        select() {
          reads.push(table);
          const filters: [string, unknown[]][] = [];
          const rows = () => (t[table] ?? []).filter((r) => filters.every(([c, vs]) => vs.includes(r[c])));
          const q = {
            eq(c: string, v: unknown) { filters.push([c, [v]]); return q; },
            in(c: string, vs: unknown[]) { filters.push([c, vs]); return q; },
            maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
            then: (ok: (r: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
          };
          return q;
        },
        delete() {
          return {
            in(_c: string, vs: unknown[]) {
              deleted.push(...(vs as string[]));
              t[table] = (t[table] ?? []).filter((r) => !vs.includes(r.token));
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as Db;
  return { db, deleted, reads };
}

function fakeSender(outcomes: Record<string, SendOutcome | 'throw'> = {}) {
  const calls: { token: string; banner: Banner }[] = [];
  const send: Sender = (token, banner) => {
    calls.push({ token, banner });
    const o = outcomes[token] ?? 'sent';
    return o === 'throw' ? Promise.reject(new Error('boom')) : Promise.resolve(o);
  };
  return { send, calls };
}

const device = (token: string, platform: string, lang: string, extra: Row = {}) =>
  ({ token, user_id: COACH, platform, lang, time_zone: 'Africa/Cairo', muted: [], ...extra });

function tables(over: { note?: Row; devices?: Row[]; status?: string } = {}): Tables {
  return {
    notifications: [{
      id: NOTE, recipient_id: COACH, kind: 'request-received', client_id: null,
      payload: { member_name: 'Hana Mostafa', requested_start: '2026-10-06T07:00:00Z', move: false, request_id: 'r1' },
      ...over.note,
    }],
    profiles: [
      { id: COACH, account_status: over.status ?? 'active', full_name: 'Rana Coach' },
      { id: MEMBER, account_status: 'active', full_name: 'Hana Mostafa' },
    ],
    clients: [{ id: CLIENT, coach_id: COACH, member_id: MEMBER, full_name: 'Hana M. (roster)' }],
    device_tokens: over.devices ?? [device('and-en', 'android', 'en'), device('ios-ar', 'ios', 'ar')],
  };
}

async function run(t: Tables, opts: { ios?: Sender | null; android?: Sender | null; secret?: string; header?: string; id?: string } = {}) {
  const { db, deleted, reads } = fakeDb(t);
  const out = await handlePushRequest(
    { db, senders: { ios: opts.ios === undefined ? null : opts.ios, android: opts.android === undefined ? null : opts.android }, secret: 'secret' in opts ? opts.secret : SECRET },
    { secretHeader: opts.header ?? SECRET, body: { type: 'INSERT', table: 'notifications', record: { id: opts.id ?? NOTE } } },
  );
  return { out, deleted, reads };
}

Deno.test('without the secret set it says so; a wrong secret or a bad record reads nothing', async () => {
  const s = fakeSender();
  assertEquals((await run(tables(), { android: s.send, secret: undefined })).out.status, 503);
  const wrong = await run(tables(), { android: s.send, header: 'guess' });
  assertEquals(wrong.out.status, 401);
  assertEquals(wrong.reads, []);
  assertEquals((await run(tables(), { android: s.send, id: 'not-a-uuid' })).out.status, 422);
  assertEquals(s.calls.length, 0);
});

Deno.test('a new request: each phone gets it in its own language, with names isolated and the time in its zone', async () => {
  const android = fakeSender();
  const ios = fakeSender();
  const { out } = await run(tables(), { android: android.send, ios: ios.send });
  assertEquals(out, { status: 200, body: { sent: 2, removed: 0, failed: 0, skipped: 0 } });
  assertEquals(android.calls[0].banner.title, `New session request from ${FSI}Hana Mostafa${PDI}`);
  // 07:00 UTC is 10:00 in Cairo (UTC+3).
  assertEquals(android.calls[0].banner.body, 'For Tue, Oct 6, 10:00 AM');
  assertEquals(ios.calls[0].banner.title, `طلب جلسة جديد من ${FSI}Hana Mostafa${PDI}`);
  assertStringIncludes(ios.calls[0].banner.body, '10:00');
  assertEquals(android.calls[0].banner.data, { notification_id: NOTE, kind: 'request-received' });
});

Deno.test('a move request says so', async () => {
  const android = fakeSender();
  await run(tables({ note: { payload: { member_name: 'Hana', requested_start: '2026-10-06T07:00:00Z', move: true } } }), { android: android.send });
  assertEquals(android.calls[0].banner.title, `${FSI}Hana${PDI} asked to move a session`);
});

Deno.test('a phone that switched sessions off gets nothing; one that switched off only messages still does', async () => {
  const android = fakeSender();
  const ios = fakeSender();
  const { out } = await run(
    tables({ devices: [device('and-en', 'android', 'en', { muted: ['sessions'] }), device('ios-ar', 'ios', 'ar', { muted: ['messages'] })] }),
    { android: android.send, ios: ios.send },
  );
  assertEquals(android.calls.length, 0);
  assertEquals(ios.calls.length, 1);
  assertEquals(out.body.sent, 1);
});

Deno.test('a recorded payment, and any kind not listed, is never pushed', async () => {
  for (const kind of ['payment-received', 'session-pending', 'feedback']) {
    const android = fakeSender();
    const { out } = await run(tables({ note: { kind, payload: {} } }), { android: android.send });
    assertEquals(out.body.skipped, 'kind_not_pushed', kind);
    assertEquals(android.calls.length, 0, kind);
  }
});

Deno.test('a suspended account, a gone notification, or no phones: nothing sent', async () => {
  const android = fakeSender();
  assertEquals((await run(tables({ status: 'suspended' }), { android: android.send })).out.body.skipped, 'account_not_active');
  assertEquals((await run(tables(), { android: android.send, id: '11111111-2222-0000-0000-000000000099' })).out.body.skipped, 'no_such_notification');
  assertEquals((await run(tables({ devices: [] }), { android: android.send })).out.body.skipped, 'no_devices');
  assertEquals(android.calls.length, 0);
});

Deno.test('a message names the sender and never carries the message itself', async () => {
  // To the member: the coach's own name.
  const toMember = fakeSender();
  await run(
    tables({
      note: { recipient_id: MEMBER, kind: 'message', client_id: CLIENT, payload: { preview: 'my private words' } },
      devices: [device('m-and', 'android', 'en', { user_id: MEMBER })],
    }),
    { android: toMember.send },
  );
  assertEquals(toMember.calls[0].banner.title, `New message from ${FSI}Rana Coach${PDI}`);
  assertEquals(toMember.calls[0].banner.body, '');
  assert(!JSON.stringify(toMember.calls[0].banner).includes('private'));
  assertEquals(toMember.calls[0].banner.data.client_id, CLIENT);

  // To the coach: the member as the coach named them on the roster.
  const toCoach = fakeSender();
  await run(tables({ note: { kind: 'message', client_id: CLIENT, payload: { preview: 'hi' } } }), { android: toCoach.send });
  assertEquals(toCoach.calls[0].banner.title, `New message from ${FSI}Hana M. (roster)${PDI}`);
});

Deno.test('a finished task tells the coach, and only the coach', async () => {
  const coach = fakeSender();
  await run(tables({ note: { kind: 'task-completed', client_id: CLIENT, payload: { title: 'Evening walk' } } }), { android: coach.send });
  assertEquals(coach.calls[0].banner.title, `${FSI}Hana M. (roster)${PDI} finished a task`);
  assertEquals(coach.calls[0].banner.body, `${FSI}Evening walk${PDI}`);

  const member = fakeSender();
  const { out } = await run(
    tables({
      note: { recipient_id: MEMBER, kind: 'task-completed', client_id: CLIENT, payload: { title: 'Evening walk' } },
      devices: [device('m-and', 'android', 'en', { user_id: MEMBER })],
    }),
    { android: member.send },
  );
  assertEquals(out.body.skipped, 'kind_not_pushed');
  assertEquals(member.calls.length, 0);
});

Deno.test('answers, moves and cancellations read like the app', async () => {
  const cases: [string, Row, string, string][] = [
    ['request-accepted', { coach_name: 'Rana Coach', requested_start: '2026-10-06T07:00:00Z' }, `Your session request to ${FSI}Rana Coach${PDI} was accepted`, 'You asked for Tue, Oct 6, 10:00 AM'],
    ['request-declined', { coach_name: '', requested_start: '2026-10-06T07:00:00Z', move: true }, `Your request to move your session with ${FSI}the coach${PDI} wasn't accepted`, 'You asked for Tue, Oct 6, 10:00 AM'],
    ['session-moved', { from: '2026-10-05T07:00:00Z', to: '2026-10-07T08:30:00Z' }, `Your session with ${FSI}Rana Coach${PDI} was moved`, 'Now Wed, Oct 7, 11:30 AM'],
    ['session-cancelled', { scheduled_at: '2026-10-06T07:00:00Z' }, `Your session with ${FSI}Rana Coach${PDI} was cancelled`, 'Tue, Oct 6, 10:00 AM'],
  ];
  for (const [kind, payload, title, body] of cases) {
    const s = fakeSender();
    await run(
      tables({ note: { recipient_id: MEMBER, kind, client_id: CLIENT, payload }, devices: [device('m', 'android', 'en', { user_id: MEMBER })] }),
      { android: s.send },
    );
    assertEquals([s.calls[0]?.banner.title, s.calls[0]?.banner.body], [title, body], kind);
  }
});

Deno.test('a session reminder: each side is told the other\'s name and the time, in its own language; off with Sessions', async () => {
  const reminder = (recipient: string, devices: Row[]) =>
    tables({ note: { recipient_id: recipient, kind: 'session-reminder', client_id: CLIENT, payload: { session_id: 's1', scheduled_at: '2026-10-06T07:00:00Z' } }, devices });

  const coach = fakeSender();
  const coachAr = fakeSender();
  await run(reminder(COACH, [device('c-en', 'android', 'en'), device('c-ar', 'ios', 'ar')]), { android: coach.send, ios: coachAr.send });
  // The coach's own name for the member: their roster row.
  assertEquals([coach.calls[0].banner.title, coach.calls[0].banner.body], [`Your session with ${FSI}Hana M. (roster)${PDI} starts soon`, 'Tue, Oct 6, 10:00 AM']);
  assertEquals(coachAr.calls[0].banner.title, `جلستك مع ${FSI}Hana M. (roster)${PDI} تبدأ قريبًا`);
  assertStringIncludes(coachAr.calls[0].banner.body, '10:00');
  assertEquals(coach.calls[0].banner.data, { notification_id: NOTE, kind: 'session-reminder', client_id: CLIENT });

  const member = fakeSender();
  await run(reminder(MEMBER, [device('m-en', 'android', 'en', { user_id: MEMBER })]), { android: member.send });
  assertEquals(member.calls[0].banner.title, `Your session with ${FSI}Rana Coach${PDI} starts soon`);

  const muted = fakeSender();
  const { out } = await run(reminder(MEMBER, [device('m-off', 'android', 'en', { user_id: MEMBER, muted: ['sessions'] })]), { android: muted.send });
  assertEquals([out.body.skipped, muted.calls.length], ['no_devices', 0]);
});

Deno.test('a phone that is gone is removed; a failure is counted and the phone kept; a platform without keys is skipped', async () => {
  const t = tables({
    devices: [device('gone', 'android', 'en'), device('flaky', 'android', 'en'), device('boom', 'android', 'en'), device('ok', 'android', 'en'), device('apple', 'ios', 'en')],
  });
  const android = fakeSender({ gone: 'gone', flaky: 'failed', boom: 'throw' });
  const { out, deleted } = await run(t, { android: android.send, ios: null });
  assertEquals(out.body, { sent: 1, removed: 1, failed: 2, skipped: 1 });
  assertEquals(deleted, ['gone']);
  assertEquals(t.device_tokens.map((d) => d.token), ['flaky', 'boom', 'ok', 'apple']);
});

Deno.test('the secret is compared whole', () => {
  assert(sameSecret('abc', 'abc'));
  assert(!sameSecret('abc', 'abd'));
  assert(!sameSecret('abc', 'abcd'));
  assert(!sameSecret('', 'abc'));
});

Deno.test('times are in the phone\'s zone, with Latin digits in Arabic; a bad zone falls back to Cairo', () => {
  assertEquals(formatWhen('2026-10-06T07:00:00Z', 'en', 'Europe/London'), 'Tue, Oct 6, 8:00 AM');
  const ar = formatWhen('2026-10-06T07:00:00Z', 'ar', 'Africa/Cairo');
  assert(/10:00/.test(ar), ar);
  assert(!/[٠-٩]/.test(ar), ar);
  assertEquals(formatWhen('2026-10-06T07:00:00Z', 'en', 'Not/AZone'), 'Tue, Oct 6, 10:00 AM');
  assertEquals(formatWhen(undefined, 'en', 'Africa/Cairo'), '');
  assertEquals(bannerFor({ kind: 'payment-received', payload: {}, otherName: '', recipientIsCoach: false, notificationId: NOTE, clientId: null }, 'en', 'UTC'), null);
});

// ---------------------------------------------------------------------------
// Apple and Google, against fake endpoints and real throwaway keys
// ---------------------------------------------------------------------------

const toPem = (der: ArrayBuffer, label: string) =>
  `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...new Uint8Array(der))).replace(/.{64}/g, '$&\n')}\n-----END ${label}-----\n`;
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const BANNER: Banner = { title: 'T', body: 'B', data: { notification_id: NOTE, kind: 'message' } };

type Call = { url: string; init: RequestInit };
function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = [];
  const f = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(respond(url, init));
  }) as unknown as typeof fetch;
  return { f, calls };
}

Deno.test('APNs: a signed ES256 token Apple can verify, the right host and headers, and the token reused', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const keyP8 = toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey), 'PRIVATE KEY');
  const { f, calls } = fakeFetch(() => new Response(null, { status: 200 }));
  let now = 1_000_000_000_000;
  const send = apnsSender({ keyP8, keyId: 'KEY123', teamId: 'TEAM45', topic: 'app.rafiqie.coach', sandbox: false }, f, () => now)!;

  assertEquals(await send('abc123', BANNER), 'sent');
  assertEquals(calls[0].url, 'https://api.push.apple.com/3/device/abc123');
  const h = calls[0].init.headers as Record<string, string>;
  assertEquals([h['apns-topic'], h['apns-push-type']], ['app.rafiqie.coach', 'alert']);
  assertEquals(JSON.parse(String(calls[0].init.body)), { aps: { alert: { title: 'T', body: 'B' }, sound: 'default' }, notification_id: NOTE, kind: 'message' });

  const [hdr, claims, sig] = h.authorization.replace('bearer ', '').split('.');
  assertEquals(JSON.parse(new TextDecoder().decode(fromB64url(hdr))), { alg: 'ES256', kid: 'KEY123' });
  assertEquals(JSON.parse(new TextDecoder().decode(fromB64url(claims))), { iss: 'TEAM45', iat: now / 1000 });
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64url(sig), new TextEncoder().encode(`${hdr}.${claims}`)));

  now += 30 * 60_000;
  await send('abc123', BANNER);
  assertEquals((calls[1].init.headers as Record<string, string>).authorization, h.authorization);
  now += 15 * 60_000;
  await send('abc123', BANNER);
  assert((calls[2].init.headers as Record<string, string>).authorization !== h.authorization, 'a fresh token after 40 minutes');
});

Deno.test('APNs: gone tokens are gone, anything else is a failure; sandbox for development builds', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const keyP8 = toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey), 'PRIVATE KEY');
  const replies: Record<string, Response> = {
    a: new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 410 }),
    b: new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 }),
    c: new Response(JSON.stringify({ reason: 'TooManyRequests' }), { status: 429 }),
    d: new Response(JSON.stringify({ reason: 'InvalidProviderToken' }), { status: 403 }),
    // 410 is "no longer active for the topic" whatever the reason says.
    e: new Response(JSON.stringify({ reason: 'ExpiredToken' }), { status: 410 }),
  };
  const { f, calls } = fakeFetch((url) => replies[url.split('/').pop()!]);
  const send = apnsSender({ keyP8, keyId: 'K', teamId: 'T', topic: 'app.rafiqie.coach', sandbox: true }, f)!;
  assertEquals(
    [await send('a', BANNER), await send('b', BANNER), await send('c', BANNER), await send('d', BANNER), await send('e', BANNER)],
    ['gone', 'gone', 'failed', 'failed', 'gone'],
  );
  assert(calls[0].url.startsWith('https://api.sandbox.push.apple.com/'));
  assertEquals(apnsSender(null), null);
});

Deno.test('FCM: a signed RS256 grant for an access token, reused, then the v1 send; UNREGISTERED is gone', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'],
  ) as CryptoKeyPair;
  const account = parseServiceAccount(JSON.stringify({
    project_id: 'rafiq-test', client_email: 'push@rafiq-test.iam.gserviceaccount.com',
    private_key: toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey), 'PRIVATE KEY'),
  }))!;
  let tokenCalls = 0;
  const { f, calls } = fakeFetch((url, init) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenCalls++;
      return new Response(JSON.stringify({ access_token: 'ya29.fake', expires_in: 3600 }), { status: 200 });
    }
    const token = JSON.parse(String(init.body)).message.token;
    if (token === 'gone') return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 });
    if (token === 'bad') return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', details: [{ errorCode: 'INVALID_ARGUMENT' }] } }), { status: 400 });
    return new Response('{}', { status: 200 });
  });
  const send = fcmSender(account, f)!;

  assertEquals(await send('ok', BANNER), 'sent');
  const grant = new URLSearchParams(String(calls[0].init.body));
  assertEquals(grant.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const [hdr, claims, sig] = grant.get('assertion')!.split('.');
  const c = JSON.parse(new TextDecoder().decode(fromB64url(claims)));
  assertEquals([c.iss, c.scope, c.aud], ['push@rafiq-test.iam.gserviceaccount.com', 'https://www.googleapis.com/auth/firebase.messaging', 'https://oauth2.googleapis.com/token']);
  assert(await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, pair.publicKey, fromB64url(sig), new TextEncoder().encode(`${hdr}.${claims}`)));

  assertEquals(calls[1].url, 'https://fcm.googleapis.com/v1/projects/rafiq-test/messages:send');
  assertEquals((calls[1].init.headers as Record<string, string>).authorization, 'Bearer ya29.fake');
  assertEquals(JSON.parse(String(calls[1].init.body)).message, {
    token: 'ok', notification: { title: 'T', body: 'B' }, data: { notification_id: NOTE, kind: 'message' }, android: { priority: 'high' },
  });

  assertEquals([await send('gone', BANNER), await send('bad', BANNER)], ['gone', 'failed']);
  assertEquals(tokenCalls, 1);
});

Deno.test('a key pasted on one line, with literal \\n line breaks, reads the same as the file', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const pem = toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey), 'PRIVATE KEY');
  assertEquals(pemToDer(pem.replace(/\n/g, '\\n')), pemToDer(pem));
});

Deno.test('a service account that isn\'t one is no sender', () => {
  assertEquals(parseServiceAccount(undefined), null);
  assertEquals(parseServiceAccount('not json'), null);
  assertEquals(parseServiceAccount('{"project_id":"x"}'), null);
  assertEquals(fcmSender(null), null);
});
