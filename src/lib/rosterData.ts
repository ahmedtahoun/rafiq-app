/**
 * The signed-in coach's roster on Supabase (SUPABASE-MIGRATION-PLAN.md
 * step 3): `clients` and the coach-only `client_private` (notes, favourite
 * star), each member's `tasks`, and what ClientDetail shows about one
 * relationship — its `sessions` (with recaps), its `packages` row and its
 * `payments` ledger.
 *
 * Rows come back in mockStore's shapes (Client, Task, RawPackage), so the
 * screens keep one rendering path. Timestamps are converted to wall-clock
 * ms at this edge (src/lib/wallClock.ts): a screen showing these compares
 * them with wallTodayMs(), not TODAY_MS.
 *
 * RLS already limits every table to the coach's own relationships; the
 * queries filter as well rather than relying on that alone. Nothing here
 * sets clients.member_id: linking a member account happens when a session
 * request is accepted (0008), not from the roster screens.
 *
 * Same result shape as auth.ts, adminQueues.ts and profileData.ts.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { fromWallMs, toWallMs } from './wallClock';
import type { Client, NewClientFields, PaymentStatus, RawPackage, Task } from './mockStore';
import type { Database, Tables, TablesUpdate } from './database.types';

export type RosterErrorCode = 'not_configured' | 'not_signed_in' | 'unknown';
export type RosterResult<T> = { ok: true; data: T } | { ok: false; code: RosterErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const NOT_SIGNED_IN = { ok: false, code: 'not_signed_in', message: 'No signed-in user.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;
const ok = <T,>(data: T) => ({ ok: true, data }) as const;

const DAY_MS = 86400000;
const AVATAR_PALETTE = ['#B75C3D', '#3E6FB0', '#3F7D58', '#7A6BAE', '#A65D6E', '#1F7A8C', '#96472D', '#26547C'];

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const CLIENT_COLUMNS =
  'id, full_name, age, phone, country_code, email, city, program, specialty, plan, initials, avatar_bg, active, progress, needs_checkin, next_session_at, next_session_type, program_completed, payment_status, goal, focus, signup_completed_at';
type ClientRow = Pick<
  Tables<'clients'>,
  | 'id' | 'full_name' | 'age' | 'phone' | 'country_code' | 'email' | 'city' | 'program' | 'specialty' | 'plan' | 'initials'
  | 'avatar_bg' | 'active' | 'progress' | 'needs_checkin' | 'next_session_at' | 'next_session_type' | 'program_completed'
  | 'payment_status' | 'goal' | 'focus' | 'signup_completed_at'
>;

function toClient(r: ClientRow, notes: string): Client {
  return {
    id: r.id,
    name: r.full_name,
    age: r.age,
    phone: r.phone ?? '',
    countryCode: r.country_code ?? '',
    program: r.program,
    specialty: r.specialty,
    plan: r.plan,
    initials: r.initials,
    avatarBg: r.avatar_bg,
    active: r.active,
    progress: r.progress,
    needsCheckin: r.needs_checkin,
    nextSessionAtMs: r.next_session_at ? toWallMs(r.next_session_at) : null,
    programCompleted: r.program_completed,
    nextSessionType: r.next_session_type ?? undefined,
    paymentStatus: r.payment_status,
    goal: r.goal,
    notes,
    focus: r.focus,
    email: r.email ?? '',
    city: r.city ?? '',
    signupCompletedAtMs: r.signup_completed_at ? toWallMs(r.signup_completed_at) : null,
  };
}

const TASK_COLUMNS = 'id, client_id, title, description, due_at, due_has_time, recurring, done, created_at';
type TaskRow = Pick<Tables<'tasks'>, 'id' | 'client_id' | 'title' | 'description' | 'due_at' | 'due_has_time' | 'recurring' | 'done' | 'created_at'>;

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    // The app always sets a due date; a task without one (written some
    // other way) sorts and reads as due the day it was made.
    dueAtMs: toWallMs(r.due_at ?? r.created_at),
    dueHasTime: r.due_has_time,
    recurring: r.recurring,
    done: r.done,
  };
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// The roster: every client, their private notes/star, and their tasks
// ---------------------------------------------------------------------------

export interface Roster {
  clients: Client[];
  favourites: Record<string, boolean>;
  tasks: Record<string, Task[]>;
}

export async function fetchRoster(): Promise<RosterResult<Roster>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;
  const supabase = getSupabase();

  const clients = await supabase.from('clients').select(CLIENT_COLUMNS).eq('coach_id', uid).order('created_at', { ascending: true });
  if (clients.error) return unknown(clients.error);
  const ids = clients.data.map((c) => c.id);
  if (ids.length === 0) return ok({ clients: [], favourites: {}, tasks: {} });

  const [priv, tasks] = await Promise.all([
    supabase.from('client_private').select('client_id, notes, is_favourite').in('client_id', ids),
    supabase.from('tasks').select(TASK_COLUMNS).in('client_id', ids).order('due_at', { ascending: true }),
  ]);
  if (priv.error) return unknown(priv.error);
  if (tasks.error) return unknown(tasks.error);

  const privateOf = new Map(priv.data.map((p) => [p.client_id, p]));
  const byClient: Record<string, Task[]> = {};
  for (const id of ids) byClient[id] = [];
  for (const row of tasks.data) byClient[row.client_id]?.push(toTask(row));

  return ok({
    clients: clients.data.map((c) => toClient(c, privateOf.get(c.id)?.notes ?? '')),
    favourites: Object.fromEntries(priv.data.filter((p) => p.is_favourite).map((p) => [p.client_id, true])),
    tasks: byClient,
  });
}

/** client_private has no insert-or-update the app can use in one call
    (an upsert names the key in its SET list), so: update, and insert the
    row the first time. */
async function writePrivate(clientId: string, values: TablesUpdate<'client_private'>): Promise<{ message: string } | null> {
  const supabase = getSupabase();
  const updated = await supabase.from('client_private').update(values).eq('client_id', clientId).select('client_id');
  if (updated.error) return updated.error;
  if (updated.data.length > 0) return null;
  const inserted = await supabase.from('client_private').insert({ ...values, client_id: clientId });
  return inserted.error;
}

export async function addRosterClient(fields: NewClientFields): Promise<RosterResult<Client>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const uid = await currentUserId();
  if (!uid) return NOT_SIGNED_IN;

  const name = fields.name.trim();
  const inserted = await getSupabase()
    .from('clients')
    .insert({
      coach_id: uid,
      full_name: name,
      age: fields.age,
      phone: fields.phone.trim(),
      country_code: fields.countryCode,
      specialty: fields.specialty,
      plan: fields.plan,
      program: `${fields.specialty} · ${fields.plan}`,
      initials: initialsOf(name),
      avatar_bg: AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)],
      goal: fields.goal.trim(),
      active: true,
      progress: 0,
      needs_checkin: false,
      payment_status: 'due',
    })
    .select(CLIENT_COLUMNS)
    .single();
  if (inserted.error) return unknown(inserted.error);

  const notes = fields.notes.trim();
  if (notes) {
    const error = await writePrivate(inserted.data.id, { notes });
    if (error) return unknown(error);
  }
  return ok(toClient(inserted.data, notes));
}

/** The Client fields the coach's screens edit, and the columns they live in. */
export type ClientPatch = Partial<Pick<Client, 'name' | 'age' | 'phone' | 'countryCode' | 'specialty' | 'plan' | 'program' | 'goal' | 'notes' | 'active' | 'needsCheckin' | 'paymentStatus'>>;

export async function updateRosterClient(clientId: string, patch: ClientPatch): Promise<RosterResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const values: TablesUpdate<'clients'> = {};
  if (patch.name !== undefined) {
    values.full_name = patch.name;
    values.initials = initialsOf(patch.name);
  }
  if (patch.age !== undefined) values.age = patch.age;
  if (patch.phone !== undefined) values.phone = patch.phone;
  if (patch.countryCode !== undefined) values.country_code = patch.countryCode;
  if (patch.specialty !== undefined) values.specialty = patch.specialty;
  if (patch.plan !== undefined) values.plan = patch.plan;
  if (patch.program !== undefined) values.program = patch.program;
  if (patch.goal !== undefined) values.goal = patch.goal;
  if (patch.active !== undefined) values.active = patch.active;
  if (patch.needsCheckin !== undefined) values.needs_checkin = patch.needsCheckin;
  if (patch.paymentStatus !== undefined) values.payment_status = patch.paymentStatus;

  if (Object.keys(values).length > 0) {
    const { error } = await getSupabase().from('clients').update(values).eq('id', clientId);
    if (error) return unknown(error);
  }
  if (patch.notes !== undefined) {
    const error = await writePrivate(clientId, { notes: patch.notes });
    if (error) return unknown(error);
  }
  return ok(null);
}

export async function setRosterFavourite(clientId: string, favourite: boolean): Promise<RosterResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const error = await writePrivate(clientId, { is_favourite: favourite });
  return error ? unknown(error) : ok(null);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type NewTask = Omit<Task, 'id'>;

export async function addRosterTask(clientId: string, task: NewTask): Promise<RosterResult<Task>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase()
    .from('tasks')
    .insert({
      client_id: clientId,
      title: task.title,
      description: task.description ?? '',
      due_at: fromWallMs(task.dueAtMs),
      due_has_time: !!task.dueHasTime,
      recurring: !!task.recurring,
      done: task.done,
    })
    .select(TASK_COLUMNS)
    .single();
  return error ? unknown(error) : ok(toTask(data));
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'dueAtMs' | 'dueHasTime' | 'recurring' | 'done'>>;

export async function updateRosterTask(taskId: string, patch: TaskPatch): Promise<RosterResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const values: TablesUpdate<'tasks'> = {};
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.dueAtMs !== undefined) values.due_at = fromWallMs(patch.dueAtMs);
  if (patch.dueHasTime !== undefined) values.due_has_time = patch.dueHasTime;
  if (patch.recurring !== undefined) values.recurring = patch.recurring;
  if (patch.done !== undefined) {
    values.done = patch.done;
    values.done_at = patch.done ? new Date().toISOString() : null;
  }
  const { error } = await getSupabase().from('tasks').update(values).eq('id', taskId);
  return error ? unknown(error) : ok(null);
}

export async function deleteRosterTask(taskId: string): Promise<RosterResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().from('tasks').delete().eq('id', taskId);
  return error ? unknown(error) : ok(null);
}

// ---------------------------------------------------------------------------
// One relationship's record: sessions, package, payments (ClientDetail)
// ---------------------------------------------------------------------------

export type Attendance = Database['public']['Enums']['attendance'];

export interface SessionEntry {
  id: string;
  atMs: number;
  attendance: Attendance | null;
  recap: string;
}

/** A ledger row. Refunds are their own rows (kind 'refund'), shown with a
    negative amount the way mockStore's Payment does. */
export interface PaymentEntry {
  id: string;
  amount: number;
  method: string;
  paidAtMs: number;
  pending: boolean;
  refundOf: string | null;
  reason: string;
}

export interface ClientRecord {
  sessions: SessionEntry[];
  /** null until the coach sets one up. */
  package: RawPackage | null;
  payments: PaymentEntry[];
}

export async function fetchClientRecord(clientId: string): Promise<RosterResult<ClientRecord>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const [sessions, pkg, payments] = await Promise.all([
    supabase.from('sessions').select('id, scheduled_at, attendance, recap').eq('client_id', clientId).order('scheduled_at', { ascending: false }),
    supabase.from('packages').select('total, used, expires_at').eq('client_id', clientId).maybeSingle(),
    supabase.from('payments').select('id, kind, amount, method, state, note, refund_of, paid_at').eq('client_id', clientId).order('paid_at', { ascending: false }),
  ]);
  if (sessions.error) return unknown(sessions.error);
  if (pkg.error) return unknown(pkg.error);
  if (payments.error) return unknown(payments.error);

  return ok({
    sessions: sessions.data.map((s) => ({ id: s.id, atMs: toWallMs(s.scheduled_at), attendance: s.attendance, recap: s.recap ?? '' })),
    package: pkg.data ? { total: pkg.data.total, used: pkg.data.used, expiresAtMs: toWallMs(pkg.data.expires_at) } : null,
    payments: payments.data.map((p) => ({
      id: p.id,
      amount: p.kind === 'refund' ? -Number(p.amount) : Number(p.amount),
      method: p.method ?? '',
      paidAtMs: toWallMs(p.paid_at),
      pending: p.state === 'pending',
      refundOf: p.refund_of,
      reason: p.note ?? '',
    })),
  });
}

export async function setSessionRecap(sessionId: string, recap: string): Promise<RosterResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { error } = await getSupabase().from('sessions').update({ recap }).eq('id', sessionId);
  return error ? unknown(error) : ok(null);
}

/**
 * Adds sessions and starts a fresh 30 days from today, like mockStore's
 * renewPackage. With no package yet, this creates one of `addSessions`.
 */
export async function renewRosterPackage(clientId: string, current: RawPackage | null, addSessions: number, todayMs: number): Promise<RosterResult<RawPackage>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const expiresAtMs = todayMs + 30 * DAY_MS;
  const expires_at = fromWallMs(expiresAtMs);
  const supabase = getSupabase();
  if (current) {
    const total = current.total + addSessions;
    const { error } = await supabase.from('packages').update({ total, expires_at }).eq('client_id', clientId);
    return error ? unknown(error) : ok({ total, used: current.used, expiresAtMs });
  }
  const { error } = await supabase.from('packages').insert({ client_id: clientId, total: addSessions, used: 0, expires_at });
  return error ? unknown(error) : ok({ total: addSessions, used: 0, expiresAtMs });
}

/** A charge, then the member's payment status: a ledger row can't be
    edited, so the status is what moves. */
export async function recordRosterPayment(clientId: string, amount: number, method: string): Promise<RosterResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const charge = await supabase.from('payments').insert({ client_id: clientId, kind: 'charge', amount, method, state: 'completed' });
  if (charge.error) return unknown(charge.error);
  return setPaymentStatus(clientId, 'paid');
}

export async function refundRosterPayment(clientId: string, charge: PaymentEntry, amount: number, reason: string): Promise<RosterResult<null>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = getSupabase();
  const refund = await supabase
    .from('payments')
    .insert({ client_id: clientId, kind: 'refund', amount, method: charge.method || null, state: 'completed', refund_of: charge.id, note: reason || null });
  if (refund.error) return unknown(refund.error);
  return setPaymentStatus(clientId, 'due');
}

async function setPaymentStatus(clientId: string, status: PaymentStatus): Promise<RosterResult<null>> {
  const { error } = await getSupabase().from('clients').update({ payment_status: status }).eq('id', clientId);
  return error ? unknown(error) : ok(null);
}
