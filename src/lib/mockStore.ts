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
  program: string;
  /** 'Basic' | 'Full Access' — not read by Main/QuickActions directly, but
      needed internally by getPackageStatus's default package size, so it
      has to travel with the rest of the seed record. */
  plan: string;
  initials: string;
  avatarBg: string;
  active: boolean;
  progress: number;
  needsCheckin: boolean;
  nextSession: string;
  paymentStatus: PaymentStatus;
}

// Same 6 seed clients as store.js's DEFAULT_CLIENTS, trimmed to the fields
// Main.dc.html/QuickActions.dc.html actually read (store.js's own record
// also carries age/phone/email/city/specialty/goal/notes for other,
// not-yet-ported screens).
const DEFAULT_CLIENTS: Client[] = [
  { id: 'sara', name: 'Sara Ahmed', program: 'Life coaching · Basic', plan: 'Basic', initials: 'SA', avatarBg: '#B75C3D', active: true, progress: 63, needsCheckin: false, nextSession: 'Next: Today, 10:00 AM', paymentStatus: 'overdue' },
  { id: 'omar', name: 'Omar Fathy', program: 'Nutrition · Full Access', plan: 'Full Access', initials: 'OF', avatarBg: '#3E6FB0', active: true, progress: 40, needsCheckin: false, nextSession: 'Next: Today, 1:30 PM', paymentStatus: 'due' },
  { id: 'mona', name: 'Mona Reda', program: 'Yoga coaching · Basic', plan: 'Basic', initials: 'MR', avatarBg: '#3F7D58', active: true, progress: 78, needsCheckin: false, nextSession: 'Next: Thu, 10:00 AM', paymentStatus: 'paid' },
  { id: 'khaled', name: 'Khaled Ibrahim', program: 'Meditation coaching · Basic', plan: 'Basic', initials: 'KI', avatarBg: '#96472D', active: true, progress: 22, needsCheckin: true, nextSession: 'No upcoming session', paymentStatus: 'overdue' },
  { id: 'laila', name: 'Laila Youssef', program: 'Breakup coaching · Basic', plan: 'Basic', initials: 'LY', avatarBg: '#B98900', active: true, progress: 55, needsCheckin: true, nextSession: 'No upcoming session', paymentStatus: 'due' },
  { id: 'nour', name: 'Nour Hassan', program: 'Life coaching · Completed', plan: 'Basic', initials: 'NH', avatarBg: '#7A7166', active: false, progress: 100, needsCheckin: false, nextSession: 'Program completed', paymentStatus: 'paid' },
];

export function getClients(): Client[] {
  return readLocal('clients', DEFAULT_CLIENTS);
}

export function updateClient(clientId: string, patch: Partial<Client>): Client[] {
  const list = getClients().map((c) => (c.id === clientId ? { ...c, ...patch } : c));
  writeLocal('clients', list);
  return list;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  title: string;
  due: string;
  done: boolean;
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

interface Payment {
  id: string;
  amount: number;
  date?: string;
  status?: string;
}

export interface ProNotification {
  id: string;
  kind: 'session-request' | 'payment-received';
  unread: boolean;
}

// Neither store has any seed data — store.js itself defaults both to
// `[]` (scheduling and payments aren't ported yet) — so this reads back
// empty until one of those features starts writing real data, matching a
// fresh install of the prototype exactly.
function getCustomBlocks(): CustomBlock[] {
  return readLocal('custom_blocks', []);
}
function getPaymentHistory(clientId: string): Payment[] {
  return readLocal(`payments_${clientId}`, []);
}
function getReadNotifications(): Record<string, boolean> {
  return readLocal('notif_read', {});
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

interface ActiveObligations {
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
// Cross-screen link targets
// ---------------------------------------------------------------------------

export interface NavTarget {
  screen: Screen;
  params: ScreenParams;
}

// store.js's equivalents return a `.dc.html` filename; none of the real
// screens they'd point to are ported yet, so every one of these resolves
// to the 'comingSoon' placeholder for now. Each still carries the params
// a real screen would need, so swapping in the real destination is a
// one-line change at the call site once it exists.
export function getClientDetailHref(clientId: string): NavTarget {
  // TODO: route to 'clientDetail' once ClientDetail.dc.html is ported
  return { screen: 'comingSoon', params: { clientId } };
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
