// deno test supabase/functions — no network: Daily is a recorder, the
// database is a few in-memory rows.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  DEFAULT_LENGTH_MIN,
  handleSessionVideoRequest,
  JOIN_EARLY_MIN,
  JOIN_LATE_MIN,
  roomNameFor,
  type DailyFetch,
  type Db,
  type Query,
  type Row,
} from './sessionVideo.ts';

const COACH = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const CLIENT = '44444444-4444-4444-8444-444444444444';
const SESSION = '55555555-5555-4555-8555-555555555555';
const BLOCK = '66666666-6666-4666-8666-666666666666';

const START = Date.parse('2026-10-05T15:00:00Z');
const END = Date.parse('2026-10-05T15:50:00Z');
const MIN = 60_000;

type Tables = Record<string, Row[]>;

function tables(over: { session?: Row; client?: Row; coach?: Row; member?: Row; block?: Row | null } = {}): Tables {
  return {
    sessions: [{ id: SESSION, client_id: CLIENT, scheduled_at: new Date(START).toISOString(), attendance: null, time_block_id: BLOCK, ...over.session }],
    clients: [{ id: CLIENT, coach_id: COACH, member_id: MEMBER, full_name: 'Salma Ragab', active: true, blocked_by_member_at: null, blocked_by_coach_at: null, ...over.client }],
    profiles: [
      { id: COACH, full_name: 'Laila Hafez', account_status: 'active', ...over.coach },
      { id: MEMBER, full_name: 'Salma Ragab', account_status: 'active', ...over.member },
    ],
    time_blocks: over.block === null ? [] : [{ id: BLOCK, starts_at: new Date(START).toISOString(), ends_at: new Date(END).toISOString(), ...over.block }],
  };
}

function fakeDb(t: Tables, users: Record<string, string>): Db {
  return {
    auth: { getUser: (jwt) => Promise.resolve({ data: { user: users[jwt] ? { id: users[jwt] } : null } }) },
    from(table) {
      return {
        select() {
          const filters: [string, unknown][] = [];
          const q: Query = {
            eq(c, v) { filters.push([c, v]); return q; },
            select() { return q; },
            maybeSingle() {
              const row = (t[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
              return Promise.resolve({ data: row, error: null });
            },
            then(ok, bad) {
              const rows = (t[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
              return Promise.resolve({ data: rows, error: null }).then(ok, bad);
            },
          };
          return q;
        },
      };
    },
  };
}

/** Records every call; answers like Daily does. */
function fakeDaily(opts: { domainRecording?: string; roomExists?: boolean; roomRecording?: string; fail?: string } = {}) {
  const calls: { method: string; path: string; body?: Row }[] = [];
  const daily: DailyFetch = (path, init) => {
    calls.push({ method: init.method, path, body: init.body });
    if (opts.fail && path.startsWith(opts.fail)) return Promise.resolve({ status: 500, body: {} });
    if (path === '/') return Promise.resolve({ status: 200, body: { domain_name: 'rafiq', config: opts.domainRecording ? { enable_recording: opts.domainRecording } : {} } });
    if (path === '/rooms' && opts.roomExists) return Promise.resolve({ status: 400, body: { error: 'invalid-request-error', info: 'a room named that already exists' } });
    if (path.startsWith('/rooms')) {
      const name = (init.body?.name as string) ?? path.split('/')[2];
      return Promise.resolve({
        status: 200,
        body: { name, url: `https://rafiq.daily.co/${name}`, privacy: 'private', config: { ...(init.body?.properties as Row), ...(opts.roomRecording ? { enable_recording: opts.roomRecording } : {}) } },
      });
    }
    if (path === '/meeting-tokens') return Promise.resolve({ status: 200, body: { token: 'tok-' + String((init.body?.properties as Row | undefined)?.user_id) } });
    return Promise.resolve({ status: 404, body: {} });
  };
  return { daily, calls };
}

const USERS = { 'jwt-coach': COACH, 'jwt-member': MEMBER, 'jwt-stranger': STRANGER };

async function ask(o: { jwt?: string; at?: number; t?: Tables; d?: ReturnType<typeof fakeDaily>; noKey?: boolean; body?: Row } = {}) {
  const d = o.d ?? fakeDaily();
  const out = await handleSessionVideoRequest(
    { db: fakeDb(o.t ?? tables(), USERS), daily: o.noKey ? null : d.daily, now: () => o.at ?? START },
    { jwt: `Bearer ${o.jwt ?? 'jwt-coach'}`, body: o.body ?? { session_id: SESSION } },
  );
  return { ...out, calls: d.calls };
}

Deno.test('no session or a bad token is 401; a malformed id is 422', async () => {
  assertEquals((await ask({ jwt: '' })).status, 401);
  assertEquals((await ask({ jwt: 'jwt-nobody' })).status, 401);
  assertEquals((await ask({ body: { session_id: 'abc' } })).status, 422);
});

Deno.test('someone outside the session gets the same 404 as a session that does not exist, and Daily is never called', async () => {
  const stranger = await ask({ jwt: 'jwt-stranger' });
  const missing = await ask({ body: { session_id: '99999999-9999-4999-8999-999999999999' } });
  assertEquals([stranger.status, stranger.body], [404, { error: 'not_found' }]);
  assertEquals([missing.status, missing.body], [404, { error: 'not_found' }]);
  assertEquals(stranger.calls, []);
});

Deno.test('the coach gets a private two-person room that is never recorded, and a non-owner token that ends with it', async () => {
  const out = await ask({ jwt: 'jwt-coach' });
  assertEquals(out.status, 200);
  assertEquals(out.body.role, 'coach');
  assertEquals(out.body.other_name, 'Salma Ragab');
  assertEquals(out.body.token, 'tok-' + COACH);
  assertEquals(out.body.url, `https://rafiq.daily.co/${roomNameFor(SESSION)}`);

  const room = out.calls.find((c) => c.path === '/rooms')!;
  assertEquals(room.body!.name, roomNameFor(SESSION));
  assertEquals(room.body!.privacy, 'private');
  const props = room.body!.properties as Row;
  assert(!('enable_recording' in props), 'the room must not enable recording');
  assertEquals(props.max_participants, 2);
  assertEquals(props.enable_chat, false);
  assertEquals(props.eject_at_room_exp, true);
  assertEquals(props.nbf, (START - JOIN_EARLY_MIN * MIN) / 1000);
  assertEquals(props.exp, (END + JOIN_LATE_MIN * MIN) / 1000);

  const token = out.calls.find((c) => c.path === '/meeting-tokens')!.body!.properties as Row;
  assertEquals(token.room_name, roomNameFor(SESSION));
  assertEquals(token.is_owner, false);
  assertEquals(token.start_cloud_recording, false);
  assertEquals(token.user_name, 'Laila Hafez');
  assertEquals(token.exp, (END + JOIN_LATE_MIN * MIN) / 1000);
  assertEquals(token.eject_at_token_exp, true);
});

Deno.test('the member gets in to the same room under their own name', async () => {
  const out = await ask({ jwt: 'jwt-member' });
  assertEquals(out.status, 200);
  assertEquals(out.body.role, 'member');
  assertEquals(out.body.other_name, 'Laila Hafez');
  assertEquals((out.calls.find((c) => c.path === '/meeting-tokens')!.body!.properties as Row).user_name, 'Salma Ragab');
});

Deno.test('the window: 10 minutes early is in, 11 is too early; 30 minutes after the end is out', async () => {
  assertEquals((await ask({ at: START - JOIN_EARLY_MIN * MIN })).status, 200);
  const early = await ask({ at: START - (JOIN_EARLY_MIN + 1) * MIN });
  assertEquals([early.status, early.body.error], [409, 'too_early']);
  assertEquals(early.body.opens_at, new Date(START - JOIN_EARLY_MIN * MIN).toISOString());
  assertEquals(early.calls, []);
  assertEquals((await ask({ at: END + JOIN_LATE_MIN * MIN - 1 })).status, 200);
  assertEquals((await ask({ at: END + JOIN_LATE_MIN * MIN })).body.error, 'ended');
});

Deno.test('a session with no time block is taken as the default length', async () => {
  const t = tables({ block: null, session: { time_block_id: null } });
  assertEquals((await ask({ t, at: START + (DEFAULT_LENGTH_MIN + JOIN_LATE_MIN) * MIN - 1 })).status, 200);
  assertEquals((await ask({ t, at: START + (DEFAULT_LENGTH_MIN + JOIN_LATE_MIN) * MIN })).body.error, 'ended');
});

Deno.test('cancelled, blocked from either side, archived, a walk-in, or a suspended account: no call', async () => {
  const cases: [Tables, string, string][] = [
    [tables({ session: { attendance: 'cancelled' } }), 'jwt-member', 'cancelled'],
    [tables({ client: { blocked_by_member_at: '2026-10-01T00:00:00Z' } }), 'jwt-coach', 'blocked'],
    [tables({ client: { blocked_by_coach_at: '2026-10-01T00:00:00Z' } }), 'jwt-member', 'blocked'],
    [tables({ client: { active: false } }), 'jwt-coach', 'relationship_inactive'],
    [tables({ client: { member_id: null } }), 'jwt-coach', 'relationship_inactive'],
    [tables({ member: { account_status: 'suspended' } }), 'jwt-coach', 'relationship_inactive'],
    [tables({ coach: { account_status: 'suspended' } }), 'jwt-member', 'relationship_inactive'],
  ];
  for (const [t, jwt, error] of cases) {
    const out = await ask({ t, jwt });
    assertEquals([out.status, out.body.error], [409, error]);
    assertEquals(out.calls, [], `${error}: Daily must not be called`);
  }
});

Deno.test('without the Daily key it says so', async () => {
  const out = await ask({ noKey: true });
  assertEquals([out.status, out.body.error], [503, 'video_not_configured']);
});

Deno.test('a Daily domain that records every room is refused before any room is made', async () => {
  const d = fakeDaily({ domainRecording: 'cloud' });
  const out = await ask({ d });
  assertEquals([out.status, out.body.error], [503, 'recording_enabled_on_domain']);
  assertEquals(d.calls.map((c) => c.path), ['/']);
});

Deno.test('a room that comes back recording is refused, and no token is issued', async () => {
  const d = fakeDaily({ roomRecording: 'local' });
  const out = await ask({ d });
  assertEquals([out.status, out.body.error], [503, 'recording_enabled_on_room']);
  assert(!d.calls.some((c) => c.path === '/meeting-tokens'));
});

Deno.test('a room that already exists is reused, with its window brought up to date', async () => {
  const d = fakeDaily({ roomExists: true });
  const out = await ask({ d, jwt: 'jwt-member' });
  assertEquals(out.status, 200);
  const update = d.calls.find((c) => c.method === 'POST' && c.path === `/rooms/${roomNameFor(SESSION)}`)!;
  assertEquals((update.body!.properties as Row).exp, (END + JOIN_LATE_MIN * MIN) / 1000);
  assertEquals(update.body!.privacy, 'private');
});

Deno.test('Daily failing at any step is a 502 naming the step, never a half-made answer', async () => {
  for (const [fail, step] of [['/meeting-tokens', 'token'], ['/', 'domain']] as const) {
    const out = await ask({ d: fakeDaily({ fail }) });
    assertEquals([out.status, out.body.step], [502, step]);
    assert(!('token' in out.body));
  }
});
