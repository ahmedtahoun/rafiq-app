import type { Screen, ScreenParams } from '../store/appStore';
import { COUNTRIES } from './countries';

/**
 * Mock data layer for the coach ("Pro") home dashboard — a scoped, 1:1
 * port of the pieces of the Claude Artifact design prototype's store.js
 * that Main.tsx and QuickActions.tsx actually read. Backed by
 * localStorage under the same `rafiq_` prefix as useAppStore, matching
 * the prototype's own mock data layer, and ready to swap for
 * Supabase-backed reads once auth lands (every function here is a
 * drop-in seam, not scattered ad hoc localStorage reads).
 *
 * Deliberately scoped: store.js also models a full multi-pro
 * "relationship" system (its Phase 3B — a client roster row split across
 * per-(client, pro) overlays, so more than one coach can share a client)
 * plus offerings, availability, reschedule, milestones, cancellations,
 * agreements, and more. None of that is used by Main/QuickActions, this
 * app has no second Pro identity anywhere yet, and those belong to other
 * screens' future ports — so every function here behaves exactly like
 * store.js's own single-current-pro code path (no relationship overlay
 * ever saved), the only path this app can currently exercise.
 */

const PREFIX = 'rafiq_';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, quota, etc.) — no-op, same
    // fallback store.js and appStore.ts both use.
  }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export type PaymentStatus = 'paid' | 'due' | 'overdue';

export interface Client {
  id: string;
  name: string;
  age: number | null;
  phone: string;
  countryCode: string;
  program: string;
  /** Raw specialty (e.g. "Life coaching"), kept alongside `program` (its
      composed "{specialty} · {plan}" display string) because EditClient.tsx
      hydrates its specialty picker from this field directly, the same way
      EditClient.dc.html reads `client.specialty` rather than re-parsing
      `program`. */
  specialty: string;
  /** 'Basic' | 'Full Access' — also needed internally by getPackageStatus's
      default package size. */
  plan: string;
  initials: string;
  avatarBg: string;
  active: boolean;
  progress: number;
  needsCheckin: boolean;
  nextSession: string;
  paymentStatus: PaymentStatus;
  goal: string;
  notes: string;
  /** The member's own self-reported focus area from ClientOnboarding.dc.html
      (its 12-item focus list) — a separate field from `specialty` above,
      which is the coach's assigned program area for this relationship. The
      design keeps these two distinct on purpose (a member's stated interest
      vs. what they're actually enrolled in), so this is never derived from
      `specialty`. */
  focus: string;
  email: string;
  city: string;
  /** Set once ClientOnboarding.dc.html's own signup form is completed —
      same role store.js's field of the same name plays for a coach's
      completeCoachSignup, and null before then, same as DEFAULT_COACH_PROFILE. */
  signupCompletedAtMs: number | null;
}

// Same 6 seed clients as store.js's DEFAULT_CLIENTS. age/phone/countryCode/
// goal/notes/focus/email are demo values in the same spirit as the existing
// seed's avatarBg/initials — store.js's own seed record carries the same
// fields, this file just doesn't have that source file to port them from
// verbatim. signupCompletedAtMs is null for all of them, same as a fresh
// install (RoleSelect always routes to the onboarding screen regardless of
// prior completion, same as the coach side, so this is read but never
// gates navigation).
const DEFAULT_CLIENTS: Client[] = [
  { id: 'sara', name: 'Sara Ahmed', age: 29, phone: '10 234 5678', countryCode: '+20', email: 'sara.ahmed@example.com', city: 'Cairo', program: 'Life coaching · Basic', specialty: 'Life coaching', focus: 'Life coaching', plan: 'Basic', initials: 'SA', avatarBg: '#B75C3D', active: true, progress: 63, needsCheckin: false, nextSession: 'Next: Today, 10:00 AM', paymentStatus: 'overdue', goal: 'Build a consistent morning routine', notes: '', signupCompletedAtMs: null },
  { id: 'omar', name: 'Omar Fathy', age: 34, phone: '11 345 6789', countryCode: '+20', email: 'omar.fathy@example.com', city: 'Giza', program: 'Nutrition · Full Access', specialty: 'Nutrition coaching', focus: 'Nutrition', plan: 'Full Access', initials: 'OF', avatarBg: '#3E6FB0', active: true, progress: 40, needsCheckin: false, nextSession: 'Next: Today, 1:30 PM', paymentStatus: 'due', goal: 'Improve energy levels through better nutrition', notes: '', signupCompletedAtMs: null },
  { id: 'mona', name: 'Mona Reda', age: 26, phone: '12 456 7890', countryCode: '+20', email: 'mona.reda@example.com', city: 'Alexandria', program: 'Yoga coaching · Basic', specialty: 'Yoga coaching', focus: 'Yoga', plan: 'Basic', initials: 'MR', avatarBg: '#3F7D58', active: true, progress: 78, needsCheckin: false, nextSession: 'Next: Thu, 10:00 AM', paymentStatus: 'paid', goal: 'Increase flexibility and reduce back pain', notes: '', signupCompletedAtMs: null },
  { id: 'khaled', name: 'Khaled Ibrahim', age: 41, phone: '10 567 8901', countryCode: '+20', email: 'khaled.ibrahim@example.com', city: 'Cairo', program: 'Meditation coaching · Basic', specialty: 'Meditation coaching', focus: 'Meditation', plan: 'Basic', initials: 'KI', avatarBg: '#96472D', active: true, progress: 22, needsCheckin: true, nextSession: 'No upcoming session', paymentStatus: 'overdue', goal: 'Manage work stress through daily meditation', notes: 'Prefers evening sessions', signupCompletedAtMs: null },
  { id: 'laila', name: 'Laila Youssef', age: 24, phone: '11 678 9012', countryCode: '+20', email: 'laila.youssef@example.com', city: 'Mansoura', program: 'Breakup coaching · Basic', specialty: 'Breakup coaching', focus: 'Relationships', plan: 'Basic', initials: 'LY', avatarBg: '#B98900', active: true, progress: 55, needsCheckin: true, nextSession: 'No upcoming session', paymentStatus: 'due', goal: 'Rebuild confidence after a difficult breakup', notes: '', signupCompletedAtMs: null },
  { id: 'nour', name: 'Nour Hassan', age: 31, phone: '12 789 0123', countryCode: '+20', email: 'nour.hassan@example.com', city: 'Cairo', program: 'Life coaching · Completed', specialty: 'Life coaching', focus: 'Life coaching', plan: 'Basic', initials: 'NH', avatarBg: '#7A7166', active: false, progress: 100, needsCheckin: false, nextSession: 'Program completed', paymentStatus: 'paid', goal: 'Transitioned into a new role', notes: '', signupCompletedAtMs: null },
];

export function getClients(): Client[] {
  return readLocal('clients', DEFAULT_CLIENTS);
}

export function getClient(clientId: string): Client | undefined {
  return getClients().find((c) => c.id === clientId);
}

export function updateClient(clientId: string, patch: Partial<Client>): Client[] {
  const list = getClients().map((c) => (c.id === clientId ? { ...c, ...patch } : c));
  writeLocal('clients', list);
  return list;
}

const AVATAR_PALETTE = ['#B75C3D', '#3E6FB0', '#3F7D58', '#7A6BAE', '#A65D6E', '#1F7A8C', '#96472D', '#26547C'];

export interface NewClientFields {
  name: string;
  age: number | null;
  phone: string;
  countryCode: string;
  specialty: string;
  plan: string;
  goal: string;
  notes: string;
}

// 1:1 port of store.js's addClient / AddClient.dc.html's save() — starter
// tasks aren't seeded here (that's Templates.dc.html/#7's job, not ported
// yet), so a new member starts with an empty to-do list rather than a
// fabricated one.
export function addClient(fields: NewClientFields): Client {
  const id = `${fields.name.trim().toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36).slice(-4)}`;
  const initials = fields.name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarBg = AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)];
  const client: Client = {
    id,
    name: fields.name.trim(),
    age: fields.age,
    phone: fields.phone.trim(),
    countryCode: fields.countryCode,
    program: `${fields.specialty} · ${fields.plan}`,
    specialty: fields.specialty,
    plan: fields.plan,
    initials,
    avatarBg,
    active: true,
    progress: 0,
    needsCheckin: false,
    nextSession: 'No upcoming session',
    paymentStatus: 'due',
    goal: fields.goal.trim(),
    notes: fields.notes.trim(),
    // A coach adding a member (AddClient.dc.html) doesn't collect these —
    // they're filled in later by the member's own ClientOnboarding.dc.html
    // signup, same as a fresh install's DEFAULT_CLIENTS-adjacent record
    // before that flow has run.
    focus: '',
    email: '',
    city: '',
    signupCompletedAtMs: null,
  };
  writeLocal('clients', [...getClients(), client]);
  return client;
}

// ---------------------------------------------------------------------------
// Favorites (Clients.dc.html's star toggle)
// ---------------------------------------------------------------------------

export function getFavorites(): Record<string, boolean> {
  return readLocal('fav_clients', {});
}

export function toggleFavorite(clientId: string): Record<string, boolean> {
  const favs = { ...getFavorites(), [clientId]: !getFavorites()[clientId] };
  writeLocal('fav_clients', favs);
  return favs;
}

// Free-tier active-member cap (Clients.dc.html's upgrade banner) — same
// value store.js's FREE_MEMBER_CAP uses.
export const FREE_MEMBER_CAP = 5;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  title: string;
  due: string;
  done: boolean;
  recurring?: boolean;
}

// Same as store.js's DEFAULT_TASKS.
const DEFAULT_TASKS: Record<string, Task[]> = {
  sara: [
    { id: 't1', title: 'Log post-session mood rating', due: 'Due today, 6:00 PM', done: true },
    { id: 't2', title: 'Write one gratitude note', due: 'Due tomorrow', done: false },
    { id: 't3', title: '10-minute evening walk', due: 'Due Fri, Oct 24', done: false },
  ],
  omar: [
    { id: 't1', title: 'Food log', due: 'Due today, 8:00 PM', done: true },
    { id: 't2', title: 'Water intake check-in', due: 'Due tomorrow', done: false },
    { id: 't3', title: 'Meal prep plan', due: 'Due Sun, Oct 26', done: false },
  ],
  mona: [
    { id: 't1', title: 'Morning stretch routine', due: 'Due today, 7:00 AM', done: true },
    { id: 't2', title: 'Posture check-in', due: 'Due tomorrow', done: false },
    { id: 't3', title: 'Flexibility log', due: 'Due Thu, Oct 23', done: false },
  ],
  khaled: [
    { id: 't1', title: '10-minute guided meditation', due: 'Due today, 9:00 PM', done: false },
    { id: 't2', title: 'Breathing exercise', due: 'Due tomorrow', done: false },
    { id: 't3', title: 'Sleep log', due: 'Due Fri, Oct 24', done: false },
  ],
  laila: [
    { id: 't1', title: 'Journal entry', due: 'Due today, 6:00 PM', done: false },
    { id: 't2', title: 'Self-care activity', due: 'Due tomorrow', done: false },
    { id: 't3', title: 'Weekly reflection', due: 'Due Sun, Oct 26', done: false },
  ],
  nour: [
    { id: 't1', title: 'Log post-session mood rating', due: 'Completed', done: true },
    { id: 't2', title: 'Write one gratitude note', due: 'Completed', done: true },
    { id: 't3', title: '10-minute evening walk', due: 'Completed', done: true },
  ],
};

export function getTasks(clientId: string): Task[] {
  return readLocal(`tasks_${clientId}`, DEFAULT_TASKS[clientId] ?? []);
}

export function addTask(clientId: string, task: Task): Task[] {
  const list = [...getTasks(clientId), task];
  writeLocal(`tasks_${clientId}`, list);
  return list;
}

export function updateTask(clientId: string, taskId: string, patch: Partial<Task>): Task[] {
  const list = getTasks(clientId).map((t) => (t.id === taskId ? { ...t, ...patch } : t));
  writeLocal(`tasks_${clientId}`, list);
  return list;
}

export function deleteTask(clientId: string, taskId: string): Task[] {
  const list = getTasks(clientId).filter((t) => t.id !== taskId);
  writeLocal(`tasks_${clientId}`, list);
  return list;
}

export function toggleTask(clientId: string, taskId: string): Task[] {
  const list = getTasks(clientId).map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
  writeLocal(`tasks_${clientId}`, list);
  return list;
}

// Exact rule from store.js: not done, and its human-readable `due` string
// mentions "today" (case-insensitive) — a substring check on the same
// display string the UI renders, not a real date comparison.
export function isTaskOverdue(task: Task): boolean {
  return !task.done && /today/i.test(task.due || '');
}

// ---------------------------------------------------------------------------
// Session packages / credits
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;
// Short display date matching the format literal session/payment entries
// already use elsewhere in this file (e.g. "Oct 18, 2025").
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
// store.js's fixed "now" anchor for every calendar/expiry calculation in
// the prototype (its own comment: "this prototype's fixed now for all
// calendar math"), not the real wall clock — ported as-is so a freshly
// seeded client's package (no renewPackage/useCredit override yet) always
// reads as a deterministic "30 days to expiry", matching the prototype's
// own demo data exactly rather than drifting with the real date.
const TODAY_MS = Date.UTC(2025, 9, 22);
const PACKAGE_DEFAULT_TOTAL: Record<string, number> = { Basic: 8, 'Full Access': 12 };
const PACKAGE_DEFAULT_USED = 2;

interface RawPackage {
  total: number;
  used: number;
  expiresAtMs: number;
}

export interface PackageStatus {
  total: number;
  used: number;
  remaining: number;
  expiresAtMs: number;
  daysToExpiry: number;
  isExpired: boolean;
  isOutOfSessions: boolean;
  isExpiringSoon: boolean;
  needsAttention: boolean;
}

function getPackage(clientId: string): RawPackage {
  const client = getClients().find((c) => c.id === clientId);
  const fallbackTotal = (client && PACKAGE_DEFAULT_TOTAL[client.plan]) || 8;
  const fallback: RawPackage = { total: fallbackTotal, used: PACKAGE_DEFAULT_USED, expiresAtMs: TODAY_MS + 30 * DAY_MS };
  return readLocal(`package_${clientId}`, fallback);
}

// 1:1 port of store.js's getPackageStatus.
export function getPackageStatus(clientId: string): PackageStatus {
  const pkg = getPackage(clientId);
  const remaining = Math.max(0, pkg.total - pkg.used);
  const daysToExpiry = Math.ceil((pkg.expiresAtMs - TODAY_MS) / DAY_MS);
  const isExpired = daysToExpiry < 0;
  const isOutOfSessions = remaining === 0;
  const isExpiringSoon = !isExpired && daysToExpiry <= 7;
  return {
    total: pkg.total,
    used: pkg.used,
    remaining,
    expiresAtMs: pkg.expiresAtMs,
    daysToExpiry,
    isExpired,
    isOutOfSessions,
    isExpiringSoon,
    needsAttention: isExpired || isOutOfSessions || isExpiringSoon,
  };
}

// 1:1 port of store.js's renewPackage — adds sessions to the existing
// total and pushes the expiry out a fresh 30 days, same as
// ClientDetail.dc.html's renew-package sheet.
export function renewPackage(clientId: string, addSessions: number): PackageStatus {
  const current = getPackage(clientId);
  const next: RawPackage = { total: current.total + addSessions, used: current.used, expiresAtMs: TODAY_MS + 30 * DAY_MS };
  writeLocal(`package_${clientId}`, next);
  return getPackageStatus(clientId);
}

export function previewRenewExpiry(): string {
  return formatDate(TODAY_MS + 30 * DAY_MS);
}

// The app's fixed demo "today", formatted — used to date a payment
// recorded/refunded right now, consistent with the same fixed clock every
// other package/expiry calculation in this file already anchors to.
export function formatToday(): string {
  return formatDate(TODAY_MS);
}

// ---------------------------------------------------------------------------
// Session logs
// ---------------------------------------------------------------------------

export interface SessionLog {
  id: string;
  atMs: number;
  attendance: string;
  followedUp?: boolean;
}

// No seed data — store.js itself defaults this to `[]` (a log only grows
// once a session is actually logged, a feature not ported yet).
export function getSessionLogs(clientId: string): SessionLog[] {
  return readLocal(`session_logs_${clientId}`, []);
}

export function markSessionFollowedUp(clientId: string, sessionId: string): SessionLog[] {
  const logs = getSessionLogs(clientId).map((s) => (s.id === sessionId ? { ...s, followedUp: true } : s));
  writeLocal(`session_logs_${clientId}`, logs);
  return logs;
}

// ---------------------------------------------------------------------------
// Pro notifications (Main only needs the unread-dot check)
// ---------------------------------------------------------------------------

interface CustomBlock {
  id: string;
  kind: string;
  label?: string;
  range?: string;
}

export interface Payment {
  id: string;
  /** Negative = a refund entry (see refundPayment), never a real charge. */
  amount: number;
  method: 'Cash' | 'Card' | 'Transfer';
  date: string;
  status?: 'pending' | 'paid';
  /** Set on a refund entry: the id of the payment it refunds. */
  refundOf?: string;
  reason?: string;
}

export interface ProNotification {
  id: string;
  kind: 'session-request' | 'payment-received';
  unread: boolean;
}

// getCustomBlocks has no seed data — store.js itself defaults it to `[]`
// (scheduling isn't ported yet) — so this reads back empty until a real
// feature writes to it, matching a fresh install of the prototype exactly.
function getCustomBlocks(): CustomBlock[] {
  return readLocal('custom_blocks', []);
}
function getReadNotifications(): Record<string, boolean> {
  return readLocal('notif_read', {});
}

// ---------------------------------------------------------------------------
// Payments (ClientDetail.dc.html's record/history/refund flow)
// ---------------------------------------------------------------------------

export function getPaymentHistory(clientId: string): Payment[] {
  return readLocal(`payments_${clientId}`, []);
}

export function addPayment(clientId: string, payment: Payment): Payment[] {
  const list = [payment, ...getPaymentHistory(clientId)];
  writeLocal(`payments_${clientId}`, list);
  return list;
}

// A refund is its own ledger row (negative amount, `refundOf` pointing at
// the original) rather than mutating the original payment in place — same
// rule the design prototype's own refundPayment() enforces, so a refunded
// payment's original record (amount, method, date) stays exactly as it was.
export function refundPayment(clientId: string, paymentId: string, amount: number, reason?: string | null): Payment[] {
  const original = getPaymentHistory(clientId).find((p) => p.id === paymentId);
  const entry: Payment = {
    id: `refund-${Date.now().toString(36)}`,
    amount: -Math.abs(amount),
    method: original?.method ?? 'Cash',
    date: formatDate(TODAY_MS),
    refundOf: paymentId,
    reason: reason ?? undefined,
  };
  return addPayment(clientId, entry);
}

export function isPaymentRefunded(clientId: string, paymentId: string): boolean {
  return getPaymentHistory(clientId).some((p) => p.refundOf === paymentId);
}

// ---------------------------------------------------------------------------
// Session recaps (ClientDetail.dc.html's session-history notes)
// ---------------------------------------------------------------------------

export function getRecaps(clientId: string): Record<string, string> {
  return readLocal(`recaps_${clientId}`, {});
}

export function setRecap(clientId: string, sessionId: string, text: string): Record<string, string> {
  const recaps = { ...getRecaps(clientId), [sessionId]: text };
  writeLocal(`recaps_${clientId}`, recaps);
  return recaps;
}

// 1:1 port of store.js's getProNotifications, minus the fields
// (`data`/`href`) Main.tsx's unread-dot check doesn't read.
export function getProNotifications(): ProNotification[] {
  const readMap = getReadNotifications();
  const clients = getClients();
  const list: ProNotification[] = [];

  getCustomBlocks()
    .filter((b) => b.kind === 'pending')
    .forEach((b) => {
      const clientName = (b.label || '').replace(' · Requested', '');
      const client = clients.find((c) => c.name === clientName);
      if (!client) return;
      list.push({ id: `pro-request-${b.id}`, kind: 'session-request', unread: false });
    });

  clients.forEach((c) => {
    const lastPayment = getPaymentHistory(c.id)[0];
    if (lastPayment && lastPayment.amount > 0) {
      list.push({ id: `pro-payment-${c.id}-${lastPayment.id}`, kind: 'payment-received', unread: false });
    }
  });

  return list.map((n) => ({ ...n, unread: !readMap[n.id] }));
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export interface EarningsSummary {
  totalReceived: number;
  pendingTotal: number;
  paidCount: number;
  dueCount: number;
  pendingCount: number;
  totalClients: number;
}

// 1:1 port of store.js's getEarningsSummary (minus the per-client
// `byClient` breakdown, which Main.tsx's earnings preview card doesn't
// read — that belongs to Earnings.dc.html's own future port).
export function getEarningsSummary(): EarningsSummary {
  const clients = getClients();
  let totalReceived = 0;
  let pendingTotal = 0;
  let pendingCount = 0;
  clients.forEach((c) => {
    const payments = getPaymentHistory(c.id);
    const clientTotal = payments.reduce((sum, p) => sum + (p.status === 'pending' ? 0 : p.amount || 0), 0);
    const clientPending = payments.reduce((sum, p) => sum + (p.status === 'pending' ? p.amount : 0), 0);
    totalReceived += clientTotal;
    pendingTotal += clientPending;
    if (clientPending > 0) pendingCount += 1;
  });
  const paidCount = clients.filter((c) => c.paymentStatus === 'paid').length;
  const dueCount = clients.filter((c) => c.paymentStatus === 'due' || c.paymentStatus === 'overdue').length;
  return { totalReceived, pendingTotal, paidCount, dueCount, pendingCount, totalClients: clients.length };
}

// ---------------------------------------------------------------------------
// Nudge tracking
// ---------------------------------------------------------------------------

export function getNudged(): Record<string, boolean> {
  return readLocal('nudged', {});
}

export function markNudged(key: string): Record<string, boolean> {
  const nudged = { ...getNudged(), [key]: true };
  writeLocal('nudged', nudged);
  return nudged;
}

// ---------------------------------------------------------------------------
// Message drafts
// ---------------------------------------------------------------------------

// How a Remind/Nudge action hands prefilled text to the (not yet ported)
// message thread — same role store.js's draftMessage plays for its own
// Messages.dc.html.
export function draftMessage(clientId: string, text: string): void {
  writeLocal(`message_draft_${clientId}`, text);
}

// ---------------------------------------------------------------------------
// Coach ("Pro") profile — 1:1 port of store.js's coach_profile record and
// the handful of related reads Profile/EditProfile/AccountDetails need
// (subscription tier, credential verification, aggregate rating, and the
// active-obligations check that gates account deletion).
// ---------------------------------------------------------------------------

export type SessionMode = 'online' | 'in_person' | 'both';

export interface CoachProfile {
  id: string;
  name: string;
  countryCode: string;
  phone: string;
  email: string;
  city: string;
  country: string;
  countryFlag: string;
  title: string;
  cert: string;
  bio: string;
  languages: string[];
  sessionMode: SessionMode;
  experienceYears: number | '';
  certifications: string[];
  avatarPhotoUrl: string;
  coverPhotoUrl: string;
  signupCompletedAtMs: number | null;
}

const DEFAULT_PRO_ID = 'pro-yasmin';

// Same seed values as store.js's DEFAULT_COACH_PROFILE, minus the two
// avatar/cover fields it seeds with a demo-only artifact blob URL that
// doesn't resolve outside that environment — unset (empty string) here so
// the UI falls back to the initials square / plain gradient header, same
// as any other fresh install would show once a real photo host exists.
const DEFAULT_COACH_PROFILE: CoachProfile = {
  id: DEFAULT_PRO_ID,
  name: 'Yasmin El-Sayed',
  countryCode: '+20',
  phone: '10 123 4567',
  email: 'yasmin.elsayed@example.com',
  city: 'Cairo',
  country: 'Egypt',
  countryFlag: '🇪🇬',
  title: 'Life coaching',
  cert: 'ICF Certified',
  bio: '',
  languages: ['Arabic', 'English'],
  sessionMode: 'both',
  experienceYears: 6,
  certifications: ['ICF Certified'],
  avatarPhotoUrl: '',
  coverPhotoUrl: '',
  signupCompletedAtMs: null,
};

// Merges over the default (not a bare read) so a profile saved before a
// field like `languages`/`sessionMode` existed still comes back with a
// usable value for it, instead of undefined.
export function getCoachProfile(): CoachProfile {
  return { ...DEFAULT_COACH_PROFILE, ...readLocal('coach_profile', {}) };
}

export function updateCoachProfile(patch: Partial<CoachProfile>): CoachProfile {
  const profile = { ...getCoachProfile(), ...patch };
  writeLocal('coach_profile', profile);
  return profile;
}

export interface CoachSignupFields {
  name: string;
  phone: string;
  countryDial: string;
  email: string;
  city: string;
  country: string;
  specialties: string[];
  experience: string;
}

// 1:1 port of store.js's completeCoachSignup — the single write Onboarding
// makes once its form validates, joining the chosen specialties into the
// same `title` string every other screen (Profile's hero chips, the
// completeness check) already reads.
export function completeCoachSignup(fields: CoachSignupFields): CoachProfile {
  const countryDef = COUNTRIES.find((c) => c.name === fields.country) ?? COUNTRIES[0];
  return updateCoachProfile({
    name: fields.name.trim(),
    phone: fields.phone.trim(),
    countryCode: fields.countryDial,
    email: fields.email.trim(),
    city: fields.city.trim(),
    country: countryDef.name,
    countryFlag: countryDef.flag,
    title: fields.specialties.join(' · '),
    signupCompletedAtMs: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Subscription tier (Rafiq Pro) — Subscription.dc.html itself isn't ported
// yet, but EditProfile/Profile both gate features on it, so the read side
// exists now. Defaults to 'pro' — same as store.js's own default — so the
// seeded demo Pro shows the full unlocked experience out of the box.
// ---------------------------------------------------------------------------

export interface Subscription {
  tier: 'free' | 'pro';
  renewsAtMs: number | null;
}

export function getSubscription(): Subscription {
  return readLocal('subscription', { tier: 'pro', renewsAtMs: TODAY_MS + 30 * DAY_MS });
}

export function isVerified(): boolean {
  return getSubscription().tier === 'pro';
}

// ---------------------------------------------------------------------------
// Credential verification — deliberately separate from isVerified()/
// subscription above (a Pro can be subscribed without their credentials
// having been reviewed, and vice versa).
// ---------------------------------------------------------------------------

export type VerificationStatus = 'unverified' | 'pending' | 'verified';

export function getVerificationStatus(): VerificationStatus {
  return readLocal('verification_status', 'unverified');
}

export function requestVerification(): VerificationStatus {
  writeLocal('verification_status', 'pending');
  return 'pending';
}

export function isCredentialVerified(): boolean {
  return getVerificationStatus() === 'verified';
}

// ---------------------------------------------------------------------------
// Aggregate rating — RateCoach.dc.html isn't ported yet, so this always
// reads back empty (0 ratings) until a real rating gets written, matching
// a fresh install of the design prototype exactly.
// ---------------------------------------------------------------------------

export interface AggregateRating {
  count: number;
  average: number;
  hasEnoughReviews: boolean;
}

const MIN_REVIEWS_FOR_RATING = 3;

function getRatings(clientId: string): Record<string, { rating: number }> {
  return readLocal(`ratings_${clientId}`, {});
}

export function getProAggregateRating(): AggregateRating {
  const values: number[] = [];
  getClients().forEach((c) => {
    Object.values(getRatings(c.id)).forEach((r) => values.push(r.rating));
  });
  const count = values.length;
  const average = count > 0 ? values.reduce((a, b) => a + b, 0) / count : 0;
  return { count, average, hasEnoughReviews: count >= MIN_REVIEWS_FOR_RATING };
}

// ---------------------------------------------------------------------------
// Unread messages — Messages.dc.html/MessagesInbox.dc.html aren't ported
// yet, so this always reads back 0 until a real thread gets written,
// same "empty until a real feature writes to it" rule as everything else
// in this file that fronts a not-yet-built screen.
// ---------------------------------------------------------------------------

interface StoredMessage {
  senderRole: 'pro' | 'client';
  atMs: number;
}

function getMessages(clientId: string): StoredMessage[] {
  return readLocal(`messages_${clientId}`, []);
}

export function getUnreadMessageCount(clientId: string, forRole: 'pro' | 'client'): number {
  const lastRead = readLocal(`messages_read_${forRole}_${clientId}`, 0);
  return getMessages(clientId).filter((m) => m.senderRole !== forRole && m.atMs > lastRead).length;
}

// ---------------------------------------------------------------------------
// Account deletion — a Pro's deletion is blocked while any active member
// still has unused session credits, an upcoming session, or an open
// dispute, exactly like the Member-side equivalent obligations check.
// ---------------------------------------------------------------------------

export interface ActiveObligations {
  hasUnusedCredits: boolean;
  remainingCredits: number;
  hasUpcomingSession: boolean;
  openDisputesCount: number;
  blocked: boolean;
}

function getActiveObligations(clientId: string): ActiveObligations {
  const client = getClients().find((c) => c.id === clientId);
  const pkgStatus = getPackageStatus(clientId);
  const hasUnusedCredits = pkgStatus.remaining > 0;
  const nextSessionRaw = client?.nextSession || '';
  const hasConfirmedUpcoming = !!nextSessionRaw && nextSessionRaw !== 'No upcoming session' && nextSessionRaw !== 'Program completed';
  const hasPendingRequest = client
    ? getCustomBlocks()
        .filter((b) => b.kind === 'pending')
        .some((b) => (b.label || '').indexOf(client.name) !== -1)
    : false;
  const hasUpcomingSession = hasConfirmedUpcoming || hasPendingRequest;
  const openDisputesCount = getSessionLogs(clientId).filter((s) => s.attendance === 'disputed').length;
  return {
    hasUnusedCredits,
    remainingCredits: pkgStatus.remaining,
    hasUpcomingSession,
    openDisputesCount,
    blocked: hasUnusedCredits || hasUpcomingSession || openDisputesCount > 0,
  };
}

export interface ProObligations {
  affectedClientCount: number;
  totalUnusedCredits: number;
  clientsWithUpcomingSessions: number;
  openDisputesCount: number;
  blocked: boolean;
}

export function getProActiveObligations(): ProObligations {
  const clients = getClients().filter((c) => c.active);
  let totalUnusedCredits = 0;
  let clientsWithUpcomingSessions = 0;
  let openDisputesCount = 0;
  clients.forEach((c) => {
    const ob = getActiveObligations(c.id);
    if (ob.hasUnusedCredits) totalUnusedCredits += ob.remainingCredits;
    if (ob.hasUpcomingSession) clientsWithUpcomingSessions++;
    openDisputesCount += ob.openDisputesCount;
  });
  return {
    affectedClientCount: clients.length,
    totalUnusedCredits,
    clientsWithUpcomingSessions,
    openDisputesCount,
    blocked: totalUnusedCredits > 0 || clientsWithUpcomingSessions > 0 || openDisputesCount > 0,
  };
}

// Anonymizes the Pro's own identity but leaves every client's own
// session/payment history exactly as it is — that history is the member's
// own record of the relationship, not the Pro's to erase.
export function requestProAccountDeletion(): { allowed: boolean; obligations: ProObligations } {
  const obligations = getProActiveObligations();
  if (obligations.blocked) return { allowed: false, obligations };
  updateCoachProfile({ name: 'Deleted Pro', phone: '', countryCode: '', bio: '' });
  return { allowed: true, obligations };
}

// ---------------------------------------------------------------------------
// Client-side ("Member") signup and home-screen support — ClientOnboarding
// and ClientHome are the same 'sara' Client record every coach-side screen
// already reads (this prototype's one demo Member/Pro pair), viewed from
// the member's own side rather than the coach's roster.
// ---------------------------------------------------------------------------

export interface ClientSignupFields {
  goal: string;
  phone: string;
  countryCode: string;
  email: string;
  city: string;
  focus: string;
}

// 1:1 port of store.js's completeClientSignup — validity is gated by the
// caller (ClientOnboarding.tsx), same as completeCoachSignup/Onboarding.tsx.
export function completeClientSignup(clientId: string, fields: ClientSignupFields): Client[] {
  return updateClient(clientId, {
    phone: fields.phone.trim(),
    countryCode: fields.countryCode,
    email: fields.email.trim(),
    city: fields.city.trim(),
    goal: fields.goal.trim(),
    focus: fields.focus,
    signupCompletedAtMs: Date.now(),
  });
}

// A recap the pro writes for a session is shown to the member by default
// ('shared') — ClientDetail.tsx (the pro's own screen) doesn't yet expose a
// way to mark one private, so this always resolves to the same text
// getRecaps itself holds. Routed through its own function rather than every
// member-facing screen indexing getRecaps() directly, so adding that privacy
// toggle later is a one-line change here instead of an audit of every caller.
export function getRecapForMember(clientId: string, sessionId: string): string {
  return getRecaps(clientId)[sessionId] || '';
}

// Same string convention every other screen's `nextSession` field already
// uses ("Next: Today, 10:00 AM" vs "Next: Thu, 10:00 AM" etc.).
export function isSessionToday(nextSessionRaw: string): boolean {
  return /^Next:\s*Today,/.test(nextSessionRaw || '');
}

export interface ActiveSessionState {
  active: boolean;
  startedAtMs: number | null;
}

// Whether a confirmed session is live right now — a single relationship-
// scoped flag both the member's and the coach's screens (and the shared
// SessionRoom, not ported yet) would read/write. Nothing calls
// startActiveSession yet (that belongs to SessionRoom), so this always
// reads back inactive until that screen exists.
export function getActiveSession(clientId: string): ActiveSessionState {
  return readLocal(`active_session_${clientId}`, { active: false, startedAtMs: null });
}

// ---------------------------------------------------------------------------
// Milestone-triggered review prompts — genuinely depends on the Offerings/
// MyPrograms program-progress model (an enrollment's sessionsCompleted vs.
// its offering's sessionsTotal), and neither is ported yet. Always empty
// until that lands, matching this file's "empty until a real feature writes
// to it" rule for everything else that fronts a not-yet-built screen.
// ---------------------------------------------------------------------------

export interface UnreviewedMilestone {
  offeringId: string;
  offering: { name: string };
}

export function getUnreviewedMilestones(_clientId: string): UnreviewedMilestone[] {
  return [];
}

export function markMilestoneReviewed(clientId: string, offeringId: string): void {
  writeLocal(`milestone_reviewed_${clientId}_${offeringId}`, true);
}

export function setSelectedOfferingId(id: string): void {
  writeLocal('selected_offering_id', id);
}

// ---------------------------------------------------------------------------
// Client-side notifications — 1:1 port of store.js's getNotifications,
// minus the `data`/`href` fields ClientHome.tsx's unread-dot check doesn't
// read (same trim rule getProNotifications above already applies), and
// minus the 'checkin'/mood-based kind and notification-preferences filter,
// neither of which is modeled anywhere in this app yet.
// ---------------------------------------------------------------------------

export interface ClientNotification {
  id: string;
  kind: 'session-pending' | 'session-confirmed' | 'task-overdue' | 'feedback' | 'payment-overdue' | 'payment-due' | 'payment-received' | 'package-expired' | 'package-out' | 'package-soon';
  unread: boolean;
}

export function getClientNotifications(clientId: string): ClientNotification[] {
  const readMap = getReadNotifications();
  const client = getClients().find((c) => c.id === clientId);
  const clientName = client?.name || '';
  const list: { id: string; kind: ClientNotification['kind'] }[] = [];

  const nextSessionRaw = client?.nextSession || '';
  const hasConfirmed = !!nextSessionRaw && nextSessionRaw !== 'No upcoming session' && nextSessionRaw !== 'Program completed';
  const pendingBlock = getCustomBlocks().find((b) => b.kind === 'pending' && (b.label || '').indexOf(clientName) !== -1);
  if (pendingBlock) {
    list.push({ id: `session-pending-${pendingBlock.id}`, kind: 'session-pending' });
  } else if (hasConfirmed) {
    list.push({ id: 'session-confirmed', kind: 'session-confirmed' });
  }

  const overdueTasks = getTasks(clientId).filter((t) => isTaskOverdue(t));
  if (overdueTasks.length) {
    list.push({ id: 'task-overdue', kind: 'task-overdue' });
  }

  const fallbackSessions = [{ id: 'sess1' }, { id: 'sess2' }];
  const allSessions = [...getSessionLogs(clientId), ...fallbackSessions];
  const recapSession = allSessions.find((s) => getRecapForMember(clientId, s.id).trim());
  if (recapSession) {
    list.push({ id: `feedback-${recapSession.id}`, kind: 'feedback' });
  }

  if (client?.paymentStatus === 'overdue') {
    list.push({ id: 'payment-overdue', kind: 'payment-overdue' });
  } else if (client?.paymentStatus === 'due') {
    list.push({ id: 'payment-due', kind: 'payment-due' });
  } else {
    const lastPayment = getPaymentHistory(clientId)[0];
    if (lastPayment && lastPayment.amount > 0) {
      list.push({ id: `payment-received-${lastPayment.id}`, kind: 'payment-received' });
    }
  }

  const pkgStatus = getPackageStatus(clientId);
  if (pkgStatus.needsAttention) {
    const pkgKind = pkgStatus.isExpired ? 'package-expired' : pkgStatus.isOutOfSessions ? 'package-out' : 'package-soon';
    list.push({ id: 'package-alert', kind: pkgKind });
  }

  const prefs = getNotificationPrefs();
  if (!prefs.enabled) return [];
  const categoryOfKind: Partial<Record<ClientNotification['kind'], keyof NotificationPrefs>> = {
    'session-pending': 'session',
    'session-confirmed': 'session',
    'task-overdue': 'task',
    feedback: 'messages',
  };
  const filtered = list.filter((n) => {
    const cat = categoryOfKind[n.kind];
    return !cat || prefs[cat] !== false;
  });

  return filtered.map((n) => ({ ...n, unread: !readMap[n.id] }));
}

// ---------------------------------------------------------------------------
// Notification preferences (ClientProfile.dc.html) — real, persisted
// toggles, unlike the coach-side Profile.dc.html equivalent, which the
// design itself keeps as pure local component state (ported as such in
// Profile.tsx). This one gates getClientNotifications above, same as
// store.js's own getNotificationPrefs/setNotificationPrefs.
// ---------------------------------------------------------------------------

export interface NotificationPrefs {
  enabled: boolean;
  session: boolean;
  task: boolean;
  messages: boolean;
}

export function getNotificationPrefs(): NotificationPrefs {
  return readLocal('notif_prefs', { enabled: true, session: true, task: true, messages: true });
}

export function setNotificationPrefs(patch: Partial<NotificationPrefs>): NotificationPrefs {
  const prefs = { ...getNotificationPrefs(), ...patch };
  writeLocal('notif_prefs', prefs);
  return prefs;
}

// ---------------------------------------------------------------------------
// Coaching agreement (ClientProfile.dc.html) — the waiver/scope-of-practice
// text a member reviews and signs, chosen by the coach's specialty
// category. This body/title text is never translated in the design either
// (its own AGREEMENT_TEXT sits outside translations(), English-only
// regardless of `lang`), so it's ported the same way here.
// ---------------------------------------------------------------------------

type AgreementCategory = 'physical' | 'emotional' | 'general';

const PHYSICAL_SPECIALTIES = ['Free diving coaching', 'Scuba diving coaching', 'Fitness coaching', 'Yoga coaching'];
const EMOTIONAL_SPECIALTIES = ['Relationship coaching', 'Breakup coaching', 'Parenting coaching', 'Stress & anxiety coaching'];

const AGREEMENT_TEXT: Record<AgreementCategory, { title: string; body: string }> = {
  physical: {
    title: 'Assumption of Risk & Safety Waiver',
    body: 'I confirm I am physically fit to take part in this activity and have disclosed any relevant medical conditions to my pro. I understand it carries inherent physical risk, and I release my pro from liability for injury except in cases of gross negligence. I agree to follow all safety instructions given during sessions.',
  },
  emotional: {
    title: 'Coaching Agreement & Scope of Practice',
    body: 'I understand coaching is not a substitute for therapy, medical care, or mental health treatment, and my pro does not diagnose or treat any condition. Sessions are confidential except where disclosure is required by law. I understand the cancellation policy and agree to communicate openly with my pro about my goals.',
  },
  general: {
    title: 'Coaching Service Agreement',
    body: 'I agree to attend scheduled sessions and give advance notice of any changes. I understand session packages are non-transferable, and my pro will keep our discussions confidential. This agreement can be updated at any time by mutual consent.',
  },
};

function agreementCategory(specialty: string): AgreementCategory {
  if (PHYSICAL_SPECIALTIES.includes(specialty)) return 'physical';
  if (EMOTIONAL_SPECIALTIES.includes(specialty)) return 'emotional';
  return 'general';
}

export interface AgreementInfo {
  category: AgreementCategory;
  title: string;
  body: string;
}

export function getAgreementInfo(specialty: string): AgreementInfo {
  const category = agreementCategory(specialty);
  const info = AGREEMENT_TEXT[category];
  return { category, title: info.title, body: info.body };
}

export type AgreementStatus = 'none' | 'sent' | 'signed';

export interface Agreement {
  status: AgreementStatus;
  at: number | null;
}

export function getAgreement(clientId: string): Agreement {
  return readLocal(`agreement_${clientId}`, { status: 'none', at: null });
}

export function setAgreementStatus(clientId: string, status: AgreementStatus): Agreement {
  const agreement: Agreement = { status, at: Date.now() };
  writeLocal(`agreement_${clientId}`, agreement);
  return agreement;
}

// ---------------------------------------------------------------------------
// Member-side account deletion (ClientProfile.dc.html) — the mirror of the
// coach-side requestProAccountDeletion above. store.js combines obligations
// across every Pro relationship a member has; this app models exactly one,
// so wrapping the existing single-relationship getActiveObligations directly
// keeps the same shape store.js's own getMemberActiveObligations returns.
// ---------------------------------------------------------------------------

export function getMemberActiveObligations(clientId: string): ActiveObligations {
  return getActiveObligations(clientId);
}

// Scrubs the member's own PII but leaves the coach's copies of session/
// payment history untouched — that history belongs to the relationship,
// not to the member alone, same rule the coach-side deletion follows.
function anonymizeMember(clientId: string): void {
  updateClient(clientId, { name: 'Deleted Member', phone: '', countryCode: '', age: null, goal: '', notes: '', active: false });
}

export function requestAccountDeletion(clientId: string): { allowed: boolean; obligations: ActiveObligations } {
  const obligations = getMemberActiveObligations(clientId);
  if (obligations.blocked) return { allowed: false, obligations };
  anonymizeMember(clientId);
  return { allowed: true, obligations };
}

// ---------------------------------------------------------------------------
// Cross-screen link targets
// ---------------------------------------------------------------------------

export interface NavTarget {
  screen: Screen;
  params: ScreenParams;
}

// store.js's equivalents return a `.dc.html` filename. ClientDetail and
// EditClient are ported now, so those two resolve for real; the rest still
// point at 'comingSoon' until SessionRoom/Messages/AddTask exist — each
// still carries the params a real screen would need, so swapping in the
// real destination is a one-line change at the call site once it exists.
export function getClientDetailHref(clientId: string): NavTarget {
  return { screen: 'clientDetail', params: { clientId } };
}
export function getEditClientHref(clientId: string): NavTarget {
  return { screen: 'editClient', params: { clientId } };
}
export function getSessionRoomHref(clientId: string): NavTarget {
  // TODO: route to 'sessionRoom' once SessionRoom.dc.html is ported
  return { screen: 'comingSoon', params: { clientId } };
}
export function getMessagesHref(clientId: string): NavTarget {
  // TODO: route to 'messages' once Messages.dc.html is ported
  return { screen: 'comingSoon', params: { clientId } };
}
export function getAddTaskHref(clientId: string): NavTarget {
  // TODO: route to 'addTask' once AddTask.dc.html is ported
  return { screen: 'comingSoon', params: { clientId } };
}
