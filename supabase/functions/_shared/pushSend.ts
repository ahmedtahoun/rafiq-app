/**
 * Phone notifications: one `notifications` row (0002, 0011, 0021, 0023) in,
 * a banner on each of the recipient's phones out. The logic behind
 * `../push-send/index.ts`, kept here so `pushSend_test.ts` can drive it with
 * a fake database, fake Apple and Google endpoints and a fixed clock.
 *
 * A Database Webhook on notifications insert calls the function. What it
 * guarantees, in order:
 *
 * 1. Only the webhook gets in: the request must carry the shared secret
 *    (PUSH_WEBHOOK_SECRET), compared in constant time. The function is
 *    deployed without JWT checks, so this is the only gate.
 * 2. Nothing in the request is trusted beyond the row's id: the row is read
 *    back from the database, so a replayed or edited body can only re-send
 *    a banner that was due anyway.
 * 3. Only the kinds below are pushed, and 'task-completed' only to a coach.
 *    'payment-received' is not: until
 *    Paymob collects session fees it fires when a coach records a payment
 *    by hand (LAUNCH-CHECKLIST §4), which is not news to push.
 * 4. Only to an active account, and only to its phones that haven't
 *    switched that kind off (device_tokens.muted, 0023).
 * 5. The banner is written here, in each phone's own language and time
 *    zone. Names and task titles are someone's own text, so they are
 *    wrapped in Unicode isolates, as the app's isolate() does. A message
 *    banner never carries the message itself: lock screens are public.
 * 6. A phone Apple or Google says is gone is removed from device_tokens,
 *    so it isn't tried again. Any other failure is reported, not retried:
 *    the in-app notification is still there.
 *
 * The keys (APNs .p8 key, Firebase service account) live only in this
 * function's secrets. The app never sees them.
 */

export type Row = Record<string, unknown>;
export type Result<T> = { data: T | null; error: { message: string } | null };

export interface Query extends PromiseLike<Result<Row[]>> {
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  maybeSingle(): PromiseLike<Result<Row>>;
}

export interface Db {
  from(table: string): {
    select(columns?: string): Query;
    delete(): { in(column: string, values: unknown[]): PromiseLike<{ error: { message: string } | null }> };
  };
}

export type Platform = 'ios' | 'android';
export type Lang = 'en' | 'ar';
export type Category = 'sessions' | 'messages' | 'tasks';

export interface Banner {
  title: string;
  body: string;
  /** What the app opens when the banner is tapped. Strings only (FCM). */
  data: Record<string, string>;
}

/** What a send to one phone came to. 'gone': the phone is no longer registered. */
export type SendOutcome = 'sent' | 'gone' | 'failed';
export type Sender = (token: string, banner: Banner) => Promise<SendOutcome>;

export interface Deps {
  db: Db;
  /** null when that platform's keys aren't set: its phones are skipped. */
  senders: { ios: Sender | null; android: Sender | null };
  secret: string | undefined;
}

export type Reply = { status: number; body: Row };

/** The kinds that become a banner, and the switch each one answers to. */
export const PUSHED: Record<string, Category> = {
  'request-received': 'sessions',
  'request-accepted': 'sessions',
  'request-declined': 'sessions',
  'session-moved': 'sessions',
  'session-cancelled': 'sessions',
  'session-reminder': 'sessions',
  message: 'messages',
  'task-completed': 'tasks',
};

const LOCALE: Record<Lang, string> = { en: 'en-US', ar: 'ar-EG-u-nu-latn' };
const FSI = '⁨';
const PDI = '⁩';
const isolate = (s: string) => `${FSI}${s}${PDI}`;

const COPY = {
  en: {
    requestReceived: (n: string) => `New session request from ${n}`,
    moveReceived: (n: string) => `${n} asked to move a session`,
    forWhen: (w: string) => `For ${w}`,
    requestAccepted: (n: string) => `Your session request to ${n} was accepted`,
    requestDeclined: (n: string) => `Your session request to ${n} wasn't accepted`,
    moveDeclined: (n: string) => `Your request to move your session with ${n} wasn't accepted`,
    askedFor: (w: string) => `You asked for ${w}`,
    sessionMoved: (n: string) => `Your session with ${n} was moved`,
    nowWhen: (w: string) => `Now ${w}`,
    sessionCancelled: (n: string) => `Your session with ${n} was cancelled`,
    sessionReminder: (n: string) => `Your session with ${n} starts soon`,
    message: (n: string) => `New message from ${n}`,
    taskDone: (n: string) => `${n} finished a task`,
    theCoach: 'the coach',
    aMember: 'a member',
  },
  ar: {
    requestReceived: (n: string) => `طلب جلسة جديد من ${n}`,
    moveReceived: (n: string) => `طلب نقل جلسة من ${n}`,
    forWhen: (w: string) => `الموعد: ${w}`,
    requestAccepted: (n: string) => `تم قبول طلب جلستك مع ${n}`,
    requestDeclined: (n: string) => `لم يتم قبول طلب جلستك مع ${n}`,
    moveDeclined: (n: string) => `لم يتم قبول طلب نقل جلستك مع ${n}`,
    askedFor: (w: string) => `الموعد الذي طلبته: ${w}`,
    sessionMoved: (n: string) => `تم نقل جلستك مع ${n}`,
    nowWhen: (w: string) => `الموعد الجديد: ${w}`,
    sessionCancelled: (n: string) => `تم إلغاء جلستك مع ${n}`,
    sessionReminder: (n: string) => `جلستك مع ${n} تبدأ قريبًا`,
    message: (n: string) => `رسالة جديدة من ${n}`,
    taskDone: (n: string) => `تم إنجاز مهمة من ${n}`,
    theCoach: 'المدرب',
    aMember: 'أحد الأعضاء',
  },
} as const;

/** "Tue, Oct 6, 10:00 AM" in the phone's own language and zone. */
export function formatWhen(iso: unknown, lang: Lang, timeZone: string): string {
  const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return '';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], { ...opts, timeZone }).format(ms);
  } catch {
    // A zone this runtime doesn't know (0023 checks against Postgres's list).
    return new Intl.DateTimeFormat(LOCALE[lang], { ...opts, timeZone: 'Africa/Cairo' }).format(ms);
  }
}

export interface BannerInput {
  kind: string;
  payload: Row;
  /** The other side's name: the member's for a coach, the coach's for a member. '' if unknown. */
  otherName: string;
  /** Whether the recipient is the relationship's coach. */
  recipientIsCoach: boolean;
  notificationId: string;
  clientId: string | null;
}

/** The banner for one phone, or null for a kind that isn't pushed. */
export function bannerFor(input: BannerInput, lang: Lang, timeZone: string): Banner | null {
  if (!(input.kind in PUSHED)) return null;
  const c = COPY[lang];
  const p = input.payload;
  const name = isolate(input.otherName.trim() || (input.recipientIsCoach ? c.aMember : c.theCoach));
  const when = (key: string) => formatWhen(p[key], lang, timeZone);
  const move = p.move === true;
  let title: string;
  let body = '';
  switch (input.kind) {
    case 'request-received':
      title = move ? c.moveReceived(name) : c.requestReceived(name);
      body = c.forWhen(when('requested_start'));
      break;
    case 'request-accepted':
      title = c.requestAccepted(name);
      body = c.askedFor(when('requested_start'));
      break;
    case 'request-declined':
      title = move ? c.moveDeclined(name) : c.requestDeclined(name);
      body = c.askedFor(when('requested_start'));
      break;
    case 'session-moved':
      title = c.sessionMoved(name);
      body = c.nowWhen(when('to'));
      break;
    case 'session-cancelled':
      title = c.sessionCancelled(name);
      body = when('scheduled_at');
      break;
    case 'session-reminder':
      // 0025, 45 to 60 minutes before: the time itself, not "in an hour".
      title = c.sessionReminder(name);
      body = when('scheduled_at');
      break;
    case 'message':
      title = c.message(name);
      break;
    case 'task-completed': {
      title = c.taskDone(name);
      const task = typeof p.title === 'string' ? p.title.trim() : '';
      body = task ? isolate(task) : '';
      break;
    }
    default:
      return null;
  }
  const data: Record<string, string> = { notification_id: input.notificationId, kind: input.kind };
  if (input.clientId) data.client_id = input.clientId;
  return { title, body, data };
}

/** Constant-time string comparison, so the secret can't be guessed byte by byte. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handlePushRequest(deps: Deps, req: { secretHeader: string; body: Row }): Promise<Reply> {
  if (!deps.secret) return { status: 503, body: { error: 'push_not_configured' } };
  if (!sameSecret(req.secretHeader, deps.secret)) return { status: 401, body: { error: 'unauthorized' } };

  const record = (req.body.record ?? null) as Row | null;
  const id = record && typeof record.id === 'string' ? record.id : '';
  if (!UUID.test(id)) return { status: 422, body: { error: 'invalid_record' } };

  const note = await deps.db.from('notifications').select('id, recipient_id, kind, client_id, payload').eq('id', id).maybeSingle();
  if (note.error) return { status: 500, body: { error: 'read_failed' } };
  if (!note.data) return { status: 200, body: { skipped: 'no_such_notification' } };
  const kind = String(note.data.kind);
  const category = PUSHED[kind];
  if (!category) return { status: 200, body: { skipped: 'kind_not_pushed' } };
  const recipient = String(note.data.recipient_id);
  const clientId = typeof note.data.client_id === 'string' ? note.data.client_id : null;
  const payload = (note.data.payload ?? {}) as Row;

  const profile = await deps.db.from('profiles').select('account_status').eq('id', recipient).maybeSingle();
  if (profile.error) return { status: 500, body: { error: 'read_failed' } };
  if (profile.data?.account_status !== 'active') return { status: 200, body: { skipped: 'account_not_active' } };

  const devices = await deps.db.from('device_tokens').select('token, platform, lang, time_zone, muted').eq('user_id', recipient);
  if (devices.error) return { status: 500, body: { error: 'read_failed' } };
  const listening = (devices.data ?? []).filter((d) => !((d.muted as string[] | null) ?? []).includes(category));
  if (listening.length === 0) return { status: 200, body: { skipped: 'no_devices' } };

  // Who the banner names, and from whose side.
  let otherName = '';
  let recipientIsCoach = kind === 'request-received';
  if (kind === 'request-received') {
    otherName = String(payload.member_name ?? '');
  } else if (kind === 'request-accepted' || kind === 'request-declined') {
    otherName = String(payload.coach_name ?? '');
  } else if (clientId) {
    const client = await deps.db.from('clients').select('coach_id, full_name').eq('id', clientId).maybeSingle();
    if (client.error) return { status: 500, body: { error: 'read_failed' } };
    recipientIsCoach = client.data?.coach_id === recipient;
    if (recipientIsCoach) {
      // The coach's own name for the member: their roster row.
      otherName = String(client.data?.full_name ?? '');
    } else if (client.data?.coach_id) {
      const coach = await deps.db.from('profiles').select('full_name').eq('id', client.data.coach_id).maybeSingle();
      if (coach.error) return { status: 500, body: { error: 'read_failed' } };
      otherName = String(coach.data?.full_name ?? '');
    }
  }

  // "Hana finished a task" is news to her coach. A coach ticking a task off
  // tells the member in the app (0002), but a banner saying the coach
  // "finished a task" would be wrong, so that one isn't pushed.
  if (kind === 'task-completed' && !recipientIsCoach) return { status: 200, body: { skipped: 'kind_not_pushed' } };

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const gone: string[] = [];
  for (const d of listening) {
    const platform = d.platform as Platform;
    const sender = deps.senders[platform];
    const lang: Lang = d.lang === 'ar' ? 'ar' : 'en';
    const banner = bannerFor({ kind, payload, otherName, recipientIsCoach, notificationId: id, clientId }, lang, String(d.time_zone));
    if (!sender || !banner) {
      skipped++;
      continue;
    }
    const outcome = await sender(String(d.token), banner).catch((): SendOutcome => 'failed');
    if (outcome === 'sent') sent++;
    else if (outcome === 'gone') gone.push(String(d.token));
    else failed++;
  }
  if (gone.length > 0) {
    const { error } = await deps.db.from('device_tokens').delete().in('token', gone);
    if (error) failed += gone.length;
  }
  return { status: 200, body: { sent, removed: gone.length, failed, skipped } };
}

// ---------------------------------------------------------------------------
// Apple (APNs, token-based auth) and Google (FCM HTTP v1)
// ---------------------------------------------------------------------------

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

/**
 * The DER bytes of a PEM key (.p8, or a service account's private_key).
 * A key pasted into a one-line .env has literal "\n"s for its line breaks;
 * both forms read the same.
 */
export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const base64 = pem.replace(/\\n/g, '\n').replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
}

async function signJwt(header: Row, claims: Row, key: CryptoKey, alg: EcdsaParams | AlgorithmIdentifier): Promise<string> {
  const unsigned = `${b64urlJson(header)}.${b64urlJson(claims)}`;
  const sig = new Uint8Array(await crypto.subtle.sign(alg, key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}

export interface ApnsConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
  /** The app's bundle id. */
  topic: string;
  /** Development builds get sandbox tokens. */
  sandbox: boolean;
}

/** Tokens Apple says no longer belong to the app. */
const APNS_GONE = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic']);

export function apnsSender(config: ApnsConfig | null, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Sender | null {
  if (!config) return null;
  let cached: { jwt: string; at: number } | null = null;
  let keyPromise: Promise<CryptoKey> | null = null;
  const host = config.sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

  async function auth(): Promise<string> {
    // Apple wants a token between 20 and 60 minutes old at most.
    if (cached && now() - cached.at < 40 * 60_000) return cached.jwt;
    keyPromise ??= crypto.subtle.importKey('pkcs8', pemToDer(config!.keyP8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const iat = Math.floor(now() / 1000);
    const jwt = await signJwt({ alg: 'ES256', kid: config!.keyId }, { iss: config!.teamId, iat }, await keyPromise, { name: 'ECDSA', hash: 'SHA-256' });
    cached = { jwt, at: now() };
    return jwt;
  }

  return async (token, banner) => {
    const res = await fetchImpl(`${host}/3/device/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${await auth()}`,
        'apns-topic': config.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ aps: { alert: { title: banner.title, ...(banner.body ? { body: banner.body } : {}) }, sound: 'default' }, ...banner.data }),
    });
    if (res.status === 200) return 'sent';
    let reason = '';
    try {
      reason = String(((await res.json()) as Row).reason ?? '');
    } catch {
      // No body.
    }
    return res.status === 410 || APNS_GONE.has(reason) ? 'gone' : 'failed';
  };
}

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** A Firebase service account's JSON (FCM_SERVICE_ACCOUNT), or null if it isn't one. */
export function parseServiceAccount(json: string | undefined): FcmConfig | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Row;
    if (typeof v.project_id === 'string' && typeof v.client_email === 'string' && typeof v.private_key === 'string') {
      return { projectId: v.project_id, clientEmail: v.client_email, privateKey: v.private_key };
    }
  } catch {
    // Not JSON.
  }
  return null;
}

export function fcmSender(config: FcmConfig | null, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Sender | null {
  if (!config) return null;
  let cached: { token: string; expiresAt: number } | null = null;
  let keyPromise: Promise<CryptoKey> | null = null;

  async function accessToken(): Promise<string> {
    if (cached && now() < cached.expiresAt - 60_000) return cached.token;
    keyPromise ??= crypto.subtle.importKey('pkcs8', pemToDer(config!.privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const iat = Math.floor(now() / 1000);
    const assertion = await signJwt(
      { alg: 'RS256', typ: 'JWT' },
      { iss: config!.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 },
      await keyPromise,
      { name: 'RSASSA-PKCS1-v1_5' },
    );
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`fcm auth ${res.status}`);
    const body = (await res.json()) as Row;
    cached = { token: String(body.access_token), expiresAt: now() + Number(body.expires_in ?? 3600) * 1000 };
    return cached.token;
  }

  return async (token, banner) => {
    const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: banner.title, ...(banner.body ? { body: banner.body } : {}) },
          data: banner.data,
          android: { priority: 'high' },
        },
      }),
    });
    if (res.ok) return 'sent';
    let errorCode = '';
    try {
      const err = ((await res.json()) as { error?: { details?: { errorCode?: string }[] } }).error;
      errorCode = err?.details?.find((d) => d.errorCode)?.errorCode ?? '';
    } catch {
      // No body.
    }
    // UNREGISTERED: the app was uninstalled or the token rotated. A 404 is
    // the same. INVALID_ARGUMENT could be the message, not the token, so it
    // is a failure, not a removal.
    return res.status === 404 || errorCode === 'UNREGISTERED' ? 'gone' : 'failed';
  };
}
