/**
 * Joining a 1:1 session's video call (Daily). The logic behind
 * `../session-video/index.ts`, kept here so `sessionVideo_test.ts` can drive
 * it with a fake database, a fake Daily and a fixed clock.
 *
 * What it guarantees, in the order it checks:
 *
 * 1. Only the two people in the session get in: the coach of the session's
 *    relationship (clients.coach_id) or its member (clients.member_id).
 *    Anyone else gets the same 404 as a session that does not exist, so a
 *    guessed id tells them nothing.
 * 2. Only while the relationship is usable: active, unblocked from either
 *    side (0014), and both accounts active, the same rule messaging uses.
 * 3. Only around the session's own time: from JOIN_EARLY_MIN before it
 *    starts until JOIN_LATE_MIN after it ends. A cancelled session never.
 * 4. Never recorded. Google Play exempts a 1:1 online session from Play
 *    Billing only if it is not recorded or replayable
 *    (research/payments-rules.md). Daily rooms only record when
 *    `enable_recording` is set, so the room never sets it, and nobody is
 *    an owner (owners can start recordings). The Daily domain could still
 *    turn recording on for every room, so the domain's own config is read
 *    first and a domain that records is refused outright rather than
 *    trusted.
 *
 * Rooms are named after the session (`rafiq-<session id>`), so there is
 * nothing to store: asking twice reuses the room, and a session moved to a
 * new time updates the room's window. Each person gets their own
 * short-lived meeting token for that one room.
 */

export type Row = Record<string, unknown>;
export type Result<T> = { data: T | null; error: { message: string } | null };

export interface Query extends PromiseLike<Result<Row[]>> {
  eq(column: string, value: unknown): Query;
  select(columns?: string): Query;
  maybeSingle(): PromiseLike<Result<Row>>;
}

export interface Db {
  auth: { getUser(jwt: string): Promise<{ data: { user: { id: string } | null } }> };
  from(table: string): { select(columns?: string): Query };
}

/** One call to Daily's REST API. Injected so tests never reach the network. */
export type DailyFetch = (path: string, init: { method: 'GET' | 'POST'; body?: Row }) => Promise<{ status: number; body: Row }>;

export interface Deps {
  db: Db;
  daily: DailyFetch | null;
  /** Now, in ms. Injected so the join window can be tested exactly. */
  now(): number;
}

export type Reply = { status: number; body: Row };

/** How early the room opens, and how long after the end it stays open. */
export const JOIN_EARLY_MIN = 10;
export const JOIN_LATE_MIN = 30;
/** A session with no time block (an old row) is assumed this long. */
export const DEFAULT_LENGTH_MIN = 50;

const MIN = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function roomNameFor(sessionId: string): string {
  return `rafiq-${sessionId.toLowerCase()}`;
}

/** The window a session can be joined in, as epoch ms. */
export function joinWindow(startMs: number, endMs: number): { opensAt: number; closesAt: number } {
  return { opensAt: startMs - JOIN_EARLY_MIN * MIN, closesAt: endMs + JOIN_LATE_MIN * MIN };
}

/**
 * The room's settings. Recording is left out on purpose: Daily records only
 * when `enable_recording` is set. Two people, no chat (messaging is the
 * app's own, with its blocking and reporting), and everyone is ejected when
 * the window closes so a session cannot quietly run on.
 */
export function roomProperties(opensAt: number, closesAt: number): Row {
  return {
    nbf: Math.floor(opensAt / 1000),
    exp: Math.floor(closesAt / 1000),
    eject_at_room_exp: true,
    max_participants: 2,
    enable_chat: false,
    enable_knocking: false,
    enable_prejoin_ui: false,
    enable_screenshare: true,
  };
}

/**
 * A token for one person in one room. Not an owner: an owner can start a
 * recording. The token ends with the window, and ejects its holder then.
 */
export function tokenProperties(room: string, userId: string, userName: string, closesAt: number): Row {
  return {
    room_name: room,
    user_id: userId,
    user_name: userName,
    is_owner: false,
    exp: Math.floor(closesAt / 1000),
    eject_at_token_exp: true,
    start_cloud_recording: false,
    enable_recording_ui: false,
  };
}

async function one(q: PromiseLike<Result<Row>>): Promise<Row | null | 'error'> {
  const { data, error } = await q;
  if (error) return 'error';
  return data;
}

const NOT_FOUND: Reply = { status: 404, body: { error: 'not_found' } };
const failed = (step: string): Reply => ({ status: 502, body: { error: 'video_unavailable', step } });

export async function handleSessionVideoRequest(deps: Deps, req: { jwt: string; body: Row }): Promise<Reply> {
  const jwt = req.jwt.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return { status: 401, body: { error: 'not_signed_in' } };
  const { data: auth } = await deps.db.auth.getUser(jwt);
  if (!auth.user) return { status: 401, body: { error: 'not_signed_in' } };
  const uid = auth.user.id;

  const sessionId = req.body.session_id;
  if (typeof sessionId !== 'string' || !UUID.test(sessionId)) {
    return { status: 422, body: { error: 'invalid_input', detail: 'session_id must be a uuid' } };
  }

  // ---- Who: one of the two people in it, or nobody -----------------------
  const session = await one(
    deps.db.from('sessions').select('id, client_id, scheduled_at, attendance, time_block_id').eq('id', sessionId).maybeSingle(),
  );
  if (session === 'error') return { status: 500, body: { error: 'read_failed' } };
  if (!session) return NOT_FOUND;

  const client = await one(
    deps.db
      .from('clients')
      .select('id, coach_id, member_id, full_name, active, blocked_by_member_at, blocked_by_coach_at')
      .eq('id', session.client_id)
      .maybeSingle(),
  );
  if (client === 'error') return { status: 500, body: { error: 'read_failed' } };
  if (!client) return NOT_FOUND;
  const isCoach = client.coach_id === uid;
  const isMember = client.member_id != null && client.member_id === uid;
  if (!isCoach && !isMember) return NOT_FOUND;

  // ---- Whether the relationship can meet at all --------------------------
  if (!client.active || !client.member_id) return { status: 409, body: { error: 'relationship_inactive' } };
  if (client.blocked_by_member_at || client.blocked_by_coach_at) return { status: 409, body: { error: 'blocked' } };
  const coach = await one(deps.db.from('profiles').select('id, full_name, account_status').eq('id', client.coach_id).maybeSingle());
  const member = await one(deps.db.from('profiles').select('id, full_name, account_status').eq('id', client.member_id).maybeSingle());
  if (coach === 'error' || member === 'error') return { status: 500, body: { error: 'read_failed' } };
  if (coach?.account_status !== 'active' || member?.account_status !== 'active') {
    return { status: 409, body: { error: 'relationship_inactive' } };
  }

  // ---- When ----------------------------------------------------------------
  if (session.attendance === 'cancelled') return { status: 409, body: { error: 'cancelled' } };
  let startMs = Date.parse(String(session.scheduled_at));
  let endMs = startMs + DEFAULT_LENGTH_MIN * MIN;
  if (session.time_block_id) {
    const block = await one(deps.db.from('time_blocks').select('starts_at, ends_at').eq('id', session.time_block_id).maybeSingle());
    if (block === 'error') return { status: 500, body: { error: 'read_failed' } };
    if (block) {
      startMs = Date.parse(String(block.starts_at));
      endMs = Date.parse(String(block.ends_at));
    }
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return { status: 500, body: { error: 'bad_session_time' } };
  const { opensAt, closesAt } = joinWindow(startMs, endMs);
  const now = deps.now();
  if (now < opensAt) return { status: 409, body: { error: 'too_early', opens_at: new Date(opensAt).toISOString() } };
  if (now >= closesAt) return { status: 409, body: { error: 'ended' } };

  // ---- Daily ---------------------------------------------------------------
  if (!deps.daily) return { status: 503, body: { error: 'video_not_configured' } };

  // A domain that records every room would make the no-recording promise
  // false whatever the room says. Refuse rather than trust it.
  const domain = await deps.daily('/', { method: 'GET' });
  if (domain.status !== 200) return failed('domain');
  const domainConfig = (domain.body.config ?? {}) as Row;
  if (domainConfig.enable_recording) return { status: 503, body: { error: 'recording_enabled_on_domain' } };

  const name = roomNameFor(sessionId);
  const properties = roomProperties(opensAt, closesAt);
  let room = await deps.daily('/rooms', { method: 'POST', body: { name, privacy: 'private', properties } });
  if (room.status !== 200) {
    // Already made by the other person, or on an earlier try: bring its
    // window up to date (the session may have moved) rather than fail.
    const existing = await deps.daily(`/rooms/${name}`, { method: 'GET' });
    if (existing.status !== 200) return failed('room');
    room = await deps.daily(`/rooms/${name}`, { method: 'POST', body: { privacy: 'private', properties } });
    if (room.status !== 200) return failed('room');
  }
  const config = (room.body.config ?? {}) as Row;
  if (config.enable_recording) return { status: 503, body: { error: 'recording_enabled_on_room' } };
  const url = String(room.body.url ?? '');
  if (!url) return failed('room');

  const self = isCoach ? coach : member;
  const userName = String(self?.full_name ?? '').trim() || (isCoach ? 'Coach' : 'Member');
  const token = await deps.daily('/meeting-tokens', { method: 'POST', body: { properties: tokenProperties(name, uid, userName, closesAt) } });
  if (token.status !== 200 || typeof token.body.token !== 'string') return failed('token');

  return {
    status: 200,
    body: {
      url,
      token: token.body.token,
      role: isCoach ? 'coach' : 'member',
      // Who they are meeting: for the coach, the name on their own roster;
      // for the member, the coach's own.
      other_name: String((isCoach ? client.full_name : coach?.full_name) ?? '').trim(),
      closes_at: new Date(closesAt).toISOString(),
    },
  };
}

/** The real Daily client: the API key stays here, on the server. */
export function dailyClient(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): DailyFetch | null {
  if (!apiKey) return null;
  return async (path, init) => {
    const res = await fetchImpl(`https://api.daily.co/v1${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    let body: Row = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    return { status: res.status, body };
  };
}
