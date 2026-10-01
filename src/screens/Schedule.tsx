import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey, type MessageKey } from '../lib/i18n';
import {
  ArrowForwardIcon,
  ClientsIcon,
  CloseIcon,
  HomeIcon,
  LockIcon,
  MessageIcon,
  MoonIcon,
  PersonIcon,
  ScheduleIcon,
  SunIcon,
  WarningIcon,
} from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import { QuickActions } from '../components/QuickActions';
import { LoadState } from '../components/LoadState';
import { useFormat } from '../lib/format';
import { useRemoteSession } from '../lib/remoteSession';
import { fetchOwnWeeklyAvailability, weekdayOf } from '../lib/requestData';
import { type Attendance, cancelBooking as cancelRemoteBooking, fetchCoachWeek, markAttendance, removeOwnBusyBlock, type CalendarBlock, rescheduleBooking as rescheduleRemoteBooking, type BookingChangeError } from '../lib/scheduleData';
import { wallNowMs, wallTodayMs } from '../lib/wallClock';
import { useRosterStore } from '../store/rosterStore';
import { useRemoteLoad } from '../store/remoteLoad';
import { useRoster } from '../store/rosterStore';
import {
  blockDayIndex,
  blockEndH,
  blockStartH,
  canInteract,
  cancelBooking,
  draftMessage,
  getAvailabilityForDayIndex,
  getCancellationPolicy,
  getClient,
  getClientDetailHref,
  getCustomBlocks,
  getHoursUntilBlock,
  getMemberAccountStatus,
  getMemberReliability,
  getMessagesHref,
  getMonthGrid,
  getRescheduleEligibility,
  getSessionLogs,
  getSessionRoomHref,
  getSessionTypeInfo,
  hourRangeLabel,
  isRelationshipBlocked,
  msFromDayHour,
  rescheduleBooking,
  setAttendance,
  updateClient,
  updateCustomBlock,
  type AttendanceOutcome,
  type CustomBlock,
  type NavTarget,
  type SessionType,
  type TimeBlockKind,
  type WeeklyAvailabilityDay,
} from '../lib/mockStore';
import './Schedule.css';

type UIKind = TimeBlockKind;

interface UIBlock {
  key: string;
  id: string | null;
  clientId: string | null;
  kind: UIKind;
  label: string;
  startH: number;
  endH: number;
  allDay?: boolean;
  sessionType?: SessionType;
  /** Signed in: a booking's session and its recorded attendance. */
  sessionId?: string;
  attendance?: Attendance | null;
  attendanceSetBy?: 'coach' | 'client' | null;
}

interface ActiveBlock {
  key: string;
  id: string | null;
  clientId: string | null;
  dayIndex: number;
  startH: number;
  endH: number;
  kind: UIKind;
  name: string;
  range: string;
  avatarBg: string;
  initials: string;
  detailHref: NavTarget | null;
  messagesHref: NavTarget | null;
  sessionRoomHref: NavTarget | null;
  sessionType: SessionType;
  canRemind: boolean;
  remindMessage: string;
  sessionId?: string;
  attendance?: Attendance | null;
  attendanceSetBy?: 'coach' | 'client' | null;
}

// This app's one fixed fictional week — Wed Oct 22 2025 is "today"
// (dayIndex 2), same anchor mockStore.ts's TODAY_MS/WEEK_START_MS use.
const DATE_NUMS = ['20', '21', '22', '23', '24', '25', '26'];
const TODAY_INDEX = 2;
// The timeline's default span; a real block outside it widens the day.
const START_HOUR = 8;
const END_HOUR = 20;
const DAY_MS = 86400000;
const ROW_H = 52;
const TOP_PAD = 10;
const RESCHED_SLOT_LEN = 0.75;

// Fixed demo bookings/blocks — same per-day layout as Schedule.dc.html's own
// blocksByDayFixed, ported with real seed client ids (sara/omar/mona, see
// mockStore.ts's seed Clients) instead of the design's own label-parsing,
// matching the clientId-based fix already applied to getProNotifications/
// getClientNotifications this round.
const SEED_BLOCKS: Omit<UIBlock, 'key'>[][] = [
  [{ id: null, clientId: null, kind: 'busy', label: 'Unavailable', startH: 9, endH: 17 }],
  [
    { id: null, clientId: 'sara', kind: 'booked', label: 'Session · Sara Ahmed', startH: 10, endH: 10.75 },
    { id: null, clientId: 'omar', kind: 'booked', label: 'Session · Omar Fathy', startH: 13.5, endH: 14.25 },
  ],
  [{ id: null, clientId: null, kind: 'busy', label: 'Unavailable', startH: 9, endH: 13 }],
  [{ id: null, clientId: 'mona', kind: 'booked', label: 'Session · Mona Reda', startH: 10, endH: 10.75 }],
  [{ id: null, clientId: null, kind: 'busy', label: 'Unavailable', startH: 8, endH: 20, allDay: true }],
  [{ id: null, clientId: 'sara', kind: 'pending', label: 'Sara Ahmed · Requested', startH: 11, endH: 11.75 }],
  [{ id: null, clientId: null, kind: 'busy', label: 'Unavailable', startH: 8, endH: 20, allDay: true }],
];

const KIND_STYLE: Record<UIKind, { bar: string; bg: string; color: string }> = {
  busy: { bar: 'var(--red)', bg: 'var(--red-bg)', color: 'var(--red)' },
  available: { bar: 'var(--green)', bg: 'var(--green-bg)', color: 'var(--green)' },
  booked: { bar: 'var(--blue)', bg: 'var(--blue-bg)', color: 'var(--blue)' },
  pending: { bar: 'var(--amber)', bg: 'var(--amber-bg)', color: 'var(--amber)' },
};

const LEGEND_ORDER: UIKind[] = ['available', 'booked', 'pending', 'busy'];
const LEGEND_DASHED: Record<UIKind, boolean> = { available: false, booked: false, pending: true, busy: false };

const ATTENDANCE_STYLE: Record<AttendanceOutcome, { color: string; bg: string }> = {
  completed: { color: 'var(--green)', bg: 'var(--green-bg)' },
  member_no_show: { color: 'var(--amber)', bg: 'var(--amber-bg)' },
  disputed: { color: 'var(--red)', bg: 'var(--red-bg)' },
};

// The stored outcome (0015) as the demo names it.
const OUTCOME_OF: Partial<Record<Attendance, AttendanceOutcome>> = {
  attended: 'completed',
  no_show: 'member_no_show',
  disputed: 'disputed',
};
const STORED_OUTCOME: Record<AttendanceOutcome, 'attended' | 'no_show' | 'disputed'> = {
  completed: 'attended',
  member_no_show: 'no_show',
  disputed: 'disputed',
};

// Same tiny 12-hour formatter every screen in the design prototype carries
// its own copy of (Schedule.dc.html/Availability.dc.html's local fmtHour) —
// kept local here too rather than shared, matching that established
// per-screen duplication convention. Only used for a single instant (the
// reschedule slot grid); ranges go through mockStore's own hourRangeLabel.
function fmtHour(h: number, amLabel: string, pmLabel: string): string {
  let hh = Math.floor(h) % 12;
  if (hh === 0) hh = 12;
  const mins = Math.round((h % 1) * 60);
  const period = h % 24 >= 12 ? pmLabel : amLabel;
  return `${hh}:${mins.toString().padStart(2, '0')} ${period}`;
}

function dominantKind(dayBlocks: UIBlock[]): UIKind | null {
  if (dayBlocks.some((b) => b.allDay)) return 'busy';
  if (dayBlocks.some((b) => b.kind === 'booked')) return 'booked';
  if (dayBlocks.some((b) => b.kind === 'pending')) return 'pending';
  if (dayBlocks.some((b) => b.kind === 'available')) return 'available';
  return null;
}

// 1:1 port of Schedule.dc.html — the coach's day/week/month calendar, block
// detail sheet (confirm/cancel/reschedule/join/attendance), reused across
// all three views.
export default function Schedule() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  // Signed in, the week is the real one (Monday first) with the coach's own
  // blocks and weekly hours; signed out, the demo's fixed week.
  const remote = useRemoteSession();
  const roster = useRoster();
  const fmt = useFormat();
  const realTodayMs = wallTodayMs();
  const weekStartMs = realTodayMs - weekdayOf(realTodayMs) * DAY_MS;
  const week = useRemoteLoad<{ blocks: CalendarBlock[]; hours: WeeklyAvailabilityDay[] }>(`coach_week:${weekStartMs}`, remote, async () => {
    const [blocks, hours] = await Promise.all([fetchCoachWeek(weekStartMs), fetchOwnWeeklyAvailability()]);
    return blocks.ok && hours.ok ? { ok: true as const, data: { blocks: blocks.data, hours: hours.data } } : { ok: false as const };
  });
  const [selectedDay, setSelectedDay] = useState(() => (remote ? weekdayOf(realTodayMs) : TODAY_INDEX));
  const [activeKinds, setActiveKinds] = useState<Record<UIKind, boolean>>({ available: true, booked: true, pending: true, busy: true });
  const [cancelledKeys, setCancelledKeys] = useState<Record<string, boolean>>({});
  const [confirmedKeys, setConfirmedKeys] = useState<Record<string, boolean>>({});
  const [showBlockSheet, setShowBlockSheet] = useState(false);
  const [activeBlock, setActiveBlock] = useState<ActiveBlock | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false);
  const [rescheduleDay, setRescheduleDay] = useState<number | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<number | null>(null);
  const [rescheduleConfirmError, setRescheduleConfirmError] = useState(false);
  // Signed in: what went wrong moving or cancelling a real booking, and
  // whether one of those writes is on its way.
  const [changeError, setChangeError] = useState<MessageKey | null>(null);
  const [changing, setChanging] = useState(false);
  // Bumped after any mutation to force the derived data below to
  // recompute from localStorage — mockStore is plain functions, not
  // reactive state (same pattern as Main.tsx/Clients.tsx).
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  if (remote && (week.status === 'loading' || roster.status === 'loading')) return <LoadState status="loading" />;
  if (remote && week.status === 'error') return <LoadState status="error" onRetry={week.retry} />;
  if (remote && roster.status === 'error') return <LoadState status="error" onRetry={roster.retry} />;
  const live = remote && week.status === 'ready' ? week.data : null;
  const todayIndex = live ? weekdayOf(realTodayMs) : TODAY_INDEX;
  const dateNums = live
    ? Array.from({ length: 7 }, (_, i) => String(new Date(weekStartMs + i * DAY_MS).getUTCDate()))
    : DATE_NUMS;
  const clientOf = (id: string) => (live ? (roster.status === 'ready' ? roster.client(id) : undefined) : getClient(id));

  // A real day: the coach's weekly hours as an open block, then their
  // blocks that start that day (a booked session, a request, busy time).
  function liveBlocksForDay(dayIndex: number): UIBlock[] {
    if (!live) return [];
    const dayStart = weekStartMs + dayIndex * DAY_MS;
    const hours = live.hours[dayIndex];
    const open: UIBlock[] = hours.enabled
      ? [{ key: `avail-${dayIndex}`, id: null, clientId: null, kind: 'available', label: t('schedulePreferredHours'), startH: hours.startH, endH: hours.endH }]
      : [];
    // Open time is the weekly hours alone: that's what members book from.
    const real: UIBlock[] = live.blocks
      .filter((b) => b.kind !== 'available' && b.startWallMs >= dayStart && b.startWallMs < dayStart + DAY_MS)
      .map((b) => ({
        key: `real-${b.id}`,
        id: b.id,
        clientId: b.clientId,
        kind: b.kind,
        label: b.label || (b.kind === 'busy' ? t('scheduleLegendUnavailable') : t('schedulePreferredHours')),
        startH: (b.startWallMs - dayStart) / 3600000,
        endH: Math.min(24, (b.endWallMs - dayStart) / 3600000),
        sessionType: b.sessionType,
        sessionId: b.sessionId,
        attendance: b.attendance,
        attendanceSetBy: b.attendanceSetBy,
      }));
    return [...open, ...real];
  }

  function blocksForDay(dayIndex: number): UIBlock[] {
    if (live) {
      return liveBlocksForDay(dayIndex)
        .filter((b) => !cancelledKeys[b.key]);
    }
    const seed: UIBlock[] = SEED_BLOCKS[dayIndex].map((b, i) => ({ ...b, key: `seed-${dayIndex}-${i}` }));
    const avail: UIBlock[] = getAvailabilityForDayIndex(dayIndex).map((b, i) => ({
      key: `avail-${dayIndex}-${i}`,
      id: null,
      clientId: null,
      kind: 'available',
      label: t('schedulePreferredHours'),
      startH: b.startH,
      endH: b.endH,
    }));
    const real: UIBlock[] = getCustomBlocks()
      .filter((b) => blockDayIndex(b) === dayIndex)
      .map((b) => ({
        key: `real-${b.id}`,
        id: b.id,
        clientId: b.clientId,
        kind: b.kind,
        label: b.label,
        startH: blockStartH(b),
        endH: blockEndH(b),
        sessionType: b.sessionType,
      }));
    return [...seed, ...avail, ...real]
      .filter((b) => !cancelledKeys[b.key])
      .map((b) => (confirmedKeys[b.key] ? { ...b, kind: 'booked' as UIKind } : b));
  }

  const dayBlocksRaw = blocksForDay(selectedDay);
  // Widen the timeline for a real block before 8 AM or after 8 PM.
  const startHour = Math.min(START_HOUR, ...dayBlocksRaw.map((b) => Math.floor(b.startH)));
  const endHour = Math.max(END_HOUR, ...dayBlocksRaw.map((b) => Math.ceil(b.endH)));
  const blocks = dayBlocksRaw.map((b) => {
    const client = b.clientId ? clientOf(b.clientId) : undefined;
    const name = client?.name ?? null;
    const avatarBg = client?.avatarBg ?? 'var(--accent)';
    const initials = client?.initials ?? '';
    const detailHref = b.clientId ? getClientDetailHref(b.clientId) : null;
    // Messages (step 5) and the session room aren't real yet: signed in, the
    // sheet offers neither.
    const messagesHref = b.clientId && !live ? getMessagesHref(b.clientId) : null;
    const sessionRoomHref = b.clientId && !live ? getSessionRoomHref(b.clientId) : null;
    const canRemind = b.clientId && !live ? canInteract(b.clientId) : false;
    const range = hourRangeLabel(b.startH, b.endH);
    const durationSuffix = b.sessionType ? t('scheduleMinutesSuffix', { n: getSessionTypeInfo(b.sessionType).minutes }) : '';
    const style = KIND_STYLE[b.kind];
    const remindMessage = name ? `Hi ${name.split(' ')[0]}, just a reminder about your session (${range}) — see you then!` : '';
    return {
      ...b,
      name,
      range,
      displayLabel: b.label + durationSuffix,
      avatarBg,
      initials,
      detailHref,
      messagesHref,
      sessionRoomHref,
      canRemind,
      remindMessage,
      top: (b.startH - startHour) * ROW_H + TOP_PAD + 1,
      height: (Math.min(b.endH, endHour) - b.startH) * ROW_H - 3,
      barColor: style.bar,
      tagBg: style.bg,
      tagColor: style.color,
      rowOpacity: activeKinds[b.kind] ? 1 : 0.25,
      isBooked: b.kind === 'booked',
      isOpen: b.kind === 'available',
      isBusy: b.kind === 'busy',
      isPending: b.kind === 'pending',
      showAvatar: b.kind === 'booked' || b.kind === 'pending',
      // Signed in, the coach's own busy time opens too, to be removed.
      canManage: b.kind === 'booked' || b.kind === 'pending' || (!!live && b.kind === 'busy' && !!b.id),
    };
  });

  function openBlockSheet(b: (typeof blocks)[number]) {
    setActiveBlock({
      key: b.key,
      id: b.id,
      clientId: b.clientId,
      dayIndex: selectedDay,
      startH: b.startH,
      endH: b.endH,
      kind: b.kind,
      name: b.name ?? (b.kind === 'busy' ? b.label : ''),
      range: b.range,
      avatarBg: b.avatarBg,
      initials: b.initials,
      detailHref: b.detailHref,
      messagesHref: b.messagesHref,
      sessionRoomHref: b.sessionRoomHref,
      sessionType: b.sessionType ?? 'standard',
      canRemind: b.canRemind,
      remindMessage: b.remindMessage,
      sessionId: b.sessionId,
      attendance: b.attendance,
      attendanceSetBy: b.attendanceSetBy,
    });
    setChangeError(null);
    setShowBlockSheet(true);
  }

  // A block's time range, in the app's language. Each end is its own <bdi>
  // (CLAUDE.md, "Isolate each end of a range separately"): this was one
  // English string under a single dir="ltr", "9:00 AM – 1:00 PM" in Arabic.
  // `range` still carries the English for the reminder message, which is
  // English throughout.
  const hourAt = (h: number) => fmt.time(Date.UTC(1970, 0, 1) + Math.round(h * 60) * 60000);
  const rangeView = (startH: number, endH: number) => <><bdi>{hourAt(startH)}</bdi> – <bdi>{hourAt(endH)}</bdi></>;

  const timelineHeight = (endHour - startHour) * ROW_H + TOP_PAD * 2;
  const hourMarks: { top: number; labelTop: number; label: string }[] = [];
  for (let h = startHour; h <= endHour; h++) {
    hourMarks.push({ top: (h - startHour) * ROW_H + TOP_PAD, labelTop: (h - startHour) * ROW_H + TOP_PAD - 6, label: fmt.hour(Date.UTC(1970, 0, 1, h % 24)) });
  }

  // ---- Block detail sheet (derived fresh from activeBlock each render) ----
  const hasProfileLink = !!activeBlock?.detailHref;
  const hasReminderLink = !!activeBlock?.messagesHref && activeBlock.canRemind;
  const hasJoinLink = !!activeBlock?.sessionRoomHref && activeBlock.kind !== 'pending' && activeBlock.dayIndex === todayIndex;

  const memberBlocked = activeBlock?.clientId ? isRelationshipBlocked(activeBlock.clientId) : false;
  const memberInactive = activeBlock?.clientId ? getMemberAccountStatus(activeBlock.clientId) !== 'active' : false;
  const confirmBlocked = memberBlocked || memberInactive;
  const confirmBlockedReason = activeBlock
    ? memberInactive
      ? t('scheduleAccountInactiveReason', { name: activeBlock.name || t('scheduleThisMember') })
      : t('scheduleBlockedReason', { name: activeBlock.name || t('scheduleThisMember').toLowerCase() })
    : '';
  const reliability = activeBlock?.clientId
    ? getMemberReliability(activeBlock.clientId)
    : { flag: 'ok' as const, lateCancellations: 0, noShows: 0, incidentCount: 0 };
  const showReliabilityWarning = !!activeBlock?.clientId && !confirmBlocked && reliability.flag !== 'ok';
  const reliabilityParts: string[] = [];
  if (reliability.lateCancellations > 0) {
    reliabilityParts.push(`${reliability.lateCancellations} ${reliability.lateCancellations === 1 ? t('scheduleLateCancellationOne') : t('scheduleLateCancellationMany')}`);
  }
  if (reliability.noShows > 0) {
    reliabilityParts.push(`${reliability.noShows} ${reliability.noShows === 1 ? t('scheduleNoShowOne') : t('scheduleNoShowMany')}`);
  }
  const reliabilityWarningText = reliabilityParts.join(isAr ? '، ' : ', ');

  const activeStartMs = activeBlock ? weekStartMs + activeBlock.dayIndex * DAY_MS + Math.round(activeBlock.startH * 3600000) : 0;
  const liveHoursUntil = live && activeBlock ? (activeStartMs - wallNowMs()) / 3600000 : null;

  // Signed in, attendance is the booking's session's (0015), once it has
  // started; the demo keeps its session logs.
  const canTrackAttendance = live
    ? activeBlock?.kind === 'booked' && !!activeBlock.sessionId
    : !!(activeBlock?.id && activeBlock.clientId) && activeBlock?.kind === 'booked';
  const hoursUntilActive = canTrackAttendance && activeBlock
    ? live ? liveHoursUntil : getHoursUntilBlock(activeBlock.dayIndex, activeBlock.startH)
    : null;
  const sessionHasPassed = hoursUntilActive != null && (live ? hoursUntilActive <= 0 : hoursUntilActive < 0);
  const canMarkAttendance = canTrackAttendance && sessionHasPassed;
  const existingLog = canMarkAttendance && !live && activeBlock ? getSessionLogs(activeBlock.clientId!).find((s) => s.id === activeBlock.id) : undefined;
  const currentAttendance = live
    ? (activeBlock?.attendance ? OUTCOME_OF[activeBlock.attendance] : undefined)
    : (existingLog?.attendance as AttendanceOutcome | undefined);
  const showAttendancePrompt = canMarkAttendance && !currentAttendance;
  const showAttendanceMarked = canMarkAttendance && !!currentAttendance;
  // Signed in, whether a credit was used depends on the package, so the
  // no-show label doesn't claim one; a member's own dispute says so.
  const attendanceMarkedLabel = currentAttendance
    ? currentAttendance === 'completed'
      ? t('scheduleAttendanceMarkedCompleted')
      : currentAttendance === 'member_no_show'
        ? t(live ? 'scheduleAttendanceMarkedNoShowPlain' : 'scheduleAttendanceMarkedNoShow')
        : live && activeBlock?.attendanceSetBy === 'client'
          ? t('scheduleAttendanceDisputedByMember')
          : t('scheduleAttendanceMarkedDisputed')
    : '';
  const attendanceMarkedStyle = ATTENDANCE_STYLE[currentAttendance ?? 'completed'];

  // Signed in, a booked session can be moved or cancelled until it starts
  // (0011); the demo's rule, 12 hours' notice to move, applies to both.
  const canRescheduleOrCancel = live
    ? activeBlock?.kind === 'booked' && !!activeBlock.id && liveHoursUntil != null && liveHoursUntil > 0
    : !sessionHasPassed;
  const canManageReschedule = !!(activeBlock?.id && activeBlock.clientId);
  const graceHours = getCancellationPolicy().graceHours;
  const rescheduleElig = canManageReschedule && activeBlock
    ? live
      ? { eligible: (liveHoursUntil ?? 0) >= graceHours, hoursUntilSession: Math.round(liveHoursUntil ?? 0), graceHours }
      : getRescheduleEligibility(activeBlock.dayIndex, activeBlock.startH)
    : null;
  const rescheduleEligible = canRescheduleOrCancel && !!rescheduleElig?.eligible;
  const rescheduleBlockedReason = rescheduleElig && !rescheduleElig.eligible
    ? t('scheduleRescheduleTooLate', { hours: rescheduleElig.graceHours })
    : t('scheduleRescheduleUnavailable');
  const showRescheduleBlockedMsg = canRescheduleOrCancel && !rescheduleEligible;

  // ---- Reschedule sheet ----
  const rescheduleDaySel = rescheduleDay ?? activeBlock?.dayIndex ?? todayIndex;
  const rescheduleRawSlots: number[] = [];
  const rescheduleHours = live
    ? (live.hours[rescheduleDaySel].enabled ? [live.hours[rescheduleDaySel]] : [])
    : getAvailabilityForDayIndex(rescheduleDaySel);
  const nowMs = wallNowMs();
  rescheduleHours.forEach((b) => {
    let hCur = b.startH;
    while (hCur + RESCHED_SLOT_LEN <= b.endH + 0.001) {
      // A real slot that has already gone by today isn't offered.
      if (!live || weekStartMs + rescheduleDaySel * DAY_MS + hCur * 3600000 > nowMs) rescheduleRawSlots.push(hCur);
      hCur += RESCHED_SLOT_LEN;
    }
  });
  const rescheduleConfirmErrorText = t('scheduleRescheduleTooLate', { hours: getCancellationPolicy().graceHours });

  function openReschedulePicker() {
    if (!rescheduleEligible || !activeBlock) return;
    setChangeError(null);
    setShowBlockSheet(false);
    setShowRescheduleSheet(true);
    setRescheduleDay(activeBlock.dayIndex);
    setRescheduleSlot(null);
    setRescheduleConfirmError(false);
  }
  function closeRescheduleSheet() {
    setChangeError(null);
    setShowRescheduleSheet(false);
    setActiveBlock(null);
    setRescheduleDay(null);
    setRescheduleSlot(null);
    setRescheduleConfirmError(false);
  }
  /**
   * After a real change: show it at once, then re-read quietly. The change
   * went through, so a failed re-read keeps the local update on screen
   * rather than the old block (or an error), and the roster refreshes in
   * the background without taking the screen back to a spinner.
   */
  async function afterLiveChange(update: (blocks: CalendarBlock[]) => CalendarBlock[]) {
    if (week.status === 'ready') {
      week.set({ ...week.data, blocks: update(week.data.blocks) });
      void week.reload();
    }
    const r = useRosterStore.getState();
    if (r.userId) void r.refresh(r.userId);
  }

  function liveErrorKey(code: BookingChangeError | 'not_configured'): MessageKey {
    if (code === 'slot_taken') return 'notificationsSlotTaken';
    if (code === 'passed') return 'scheduleSessionStarted';
    if (code === 'gone') return 'scheduleBookingGone';
    return 'requestFailedRetry';
  }

  async function confirmLiveReschedule() {
    if (rescheduleSlot == null || !activeBlock?.id || changing) return;
    setChanging(true);
    setChangeError(null);
    const newStartMs = weekStartMs + rescheduleDaySel * DAY_MS + Math.round(rescheduleSlot * 3600000);
    const result = await rescheduleRemoteBooking(activeBlock.id, newStartMs);
    setChanging(false);
    if (!result.ok) {
      setChangeError(liveErrorKey(result.code));
      return;
    }
    const day = rescheduleDaySel;
    const blockId = activeBlock.id;
    closeRescheduleSheet();
    setSelectedDay(day);
    setView('day');
    await afterLiveChange((blocks) => blocks.map((b) =>
      (b.id === blockId ? { ...b, startWallMs: newStartMs, endWallMs: newStartMs + (b.endWallMs - b.startWallMs) } : b)));
  }

  async function confirmLiveCancel() {
    if (!activeBlock?.id || changing) return;
    setChanging(true);
    setChangeError(null);
    const blockId = activeBlock.id;
    const result = await cancelRemoteBooking(blockId);
    setChanging(false);
    if (!result.ok) {
      setChangeError(liveErrorKey(result.code));
      return;
    }
    setShowCancelConfirm(false);
    setActiveBlock(null);
    await afterLiveChange((blocks) => blocks.filter((b) => b.id !== blockId));
  }

  async function removeBusyBlock() {
    if (!activeBlock?.id || changing) return;
    setChanging(true);
    setChangeError(null);
    const blockId = activeBlock.id;
    const result = await removeOwnBusyBlock(blockId);
    setChanging(false);
    if (!result.ok) {
      setChangeError('requestFailedRetry');
      return;
    }
    setShowBlockSheet(false);
    setActiveBlock(null);
    await afterLiveChange((blocks) => blocks.filter((b) => b.id !== blockId));
  }

  function confirmReschedule() {
    if (live) {
      void confirmLiveReschedule();
      return;
    }
    if (rescheduleSlot == null || !activeBlock?.id || !activeBlock.clientId) return;
    const duration = activeBlock.endH - activeBlock.startH;
    const newEndH = rescheduleSlot + duration;
    const result = rescheduleBooking(activeBlock.clientId, activeBlock.id, rescheduleDaySel, rescheduleSlot, newEndH, 'pro');
    if (!result || 'error' in result) {
      setRescheduleConfirmError(true);
      refresh();
      return;
    }
    setShowRescheduleSheet(false);
    setActiveBlock(null);
    setRescheduleDay(null);
    setRescheduleSlot(null);
    setRescheduleConfirmError(false);
    setSelectedDay(rescheduleDaySel);
    setView('day');
    refresh();
  }

  function closeBlockSheet() {
    setChangeError(null);
    setShowBlockSheet(false);
    setActiveBlock(null);
  }
  function openCancelSheet() {
    setChangeError(null);
    setShowBlockSheet(false);
    setShowCancelConfirm(true);
  }
  function closeCancelConfirm() {
    setChangeError(null);
    setShowCancelConfirm(false);
    setActiveBlock(null);
  }
  function confirmCancelBlock() {
    if (live) {
      void confirmLiveCancel();
      return;
    }
    if (!activeBlock) return;
    // Real bookings persist the cancellation so the member's own Sessions
    // screen agrees it's actually gone; the seed demo blocks have no real
    // id to persist against and fall back to the local-only hide below.
    if (activeBlock.id && activeBlock.clientId) {
      cancelBooking(activeBlock.clientId, {
        blockId: activeBlock.id,
        cancelledByRole: 'pro',
        dayIndex: activeBlock.dayIndex,
        startH: activeBlock.startH,
      });
    }
    setCancelledKeys((k) => ({ ...k, [activeBlock.key]: true }));
    setShowCancelConfirm(false);
    setActiveBlock(null);
    refresh();
  }
  function confirmBlock() {
    if (!activeBlock || confirmBlocked) return;
    if (activeBlock.id) {
      const patch: Partial<CustomBlock> = { kind: 'booked' };
      if (activeBlock.name) patch.label = `Session · ${activeBlock.name}`;
      updateCustomBlock(activeBlock.id, patch);
      if (activeBlock.clientId) {
        // A real epoch ms now, not a pre-composed English sentence — the
        // exact bug format.ts's formatNextSession/isSessionToday exist to
        // fix. Every consuming screen renders it in its own language.
        updateClient(activeBlock.clientId, { nextSessionAtMs: msFromDayHour(activeBlock.dayIndex, activeBlock.startH), nextSessionType: activeBlock.sessionType });
      }
    }
    setConfirmedKeys((k) => ({ ...k, [activeBlock.key]: true }));
    setShowBlockSheet(false);
    setActiveBlock(null);
    refresh();
  }
  async function setLiveAttendance(outcome: AttendanceOutcome) {
    if (!activeBlock?.sessionId || !activeBlock.id || changing) return;
    setChanging(true);
    setChangeError(null);
    const stored = STORED_OUTCOME[outcome];
    const blockId = activeBlock.id;
    const result = await markAttendance(activeBlock.sessionId, stored);
    setChanging(false);
    if (!result.ok) {
      // Already recorded elsewhere (another device, a member's dispute):
      // re-read so the sheet shows what was recorded.
      if (result.code === 'recorded' && week.status === 'ready') void week.reload();
      setChangeError(result.code === 'recorded' ? 'scheduleAttendanceRecorded' : result.code === 'gone' ? 'scheduleBookingGone' : 'requestFailedRetry');
      return;
    }
    setActiveBlock((a) => (a && a.id === blockId ? { ...a, attendance: stored, attendanceSetBy: 'coach' } : a));
    await afterLiveChange((blocks) => blocks.map((b) => (b.id === blockId ? { ...b, attendance: stored, attendanceSetBy: 'coach' } : b)));
  }
  function setAttendanceOutcome(outcome: AttendanceOutcome) {
    if (live) {
      if (canMarkAttendance) void setLiveAttendance(outcome);
      return;
    }
    if (!canMarkAttendance || !activeBlock?.clientId || !activeBlock.id) return;
    setAttendance(activeBlock.clientId, activeBlock.id, outcome, 'pro');
    refresh();
  }
  function draftRemind() {
    if (activeBlock?.clientId) draftMessage(activeBlock.clientId, activeBlock.remindMessage);
  }

  // ---- Week view ----
  const weekRows = Array.from({ length: 7 }, (_, i) => {
    const dayBlocks = blocksForDay(i);
    const bookedCount = dayBlocks.filter((b) => b.kind === 'booked').length;
    const pendingCount = dayBlocks.filter((b) => b.kind === 'pending').length;
    const allDay = dayBlocks.some((b) => b.allDay);
    const hasOpen = dayBlocks.some((b) => b.kind === 'available');
    let summary: string;
    if (allDay) summary = t('scheduleUnavailableAllDay');
    else if (bookedCount > 0) {
      summary = `${bookedCount} ${bookedCount > 1 ? t('scheduleSessionBookedMany') : t('scheduleSessionBookedOne')}${pendingCount ? ` · ${t('schedulePendingSuffix', { n: pendingCount })}` : ''}`;
    } else if (pendingCount > 0) {
      summary = `${pendingCount} ${pendingCount > 1 ? t('scheduleRequestMany') : t('scheduleRequestOne')}`;
    } else if (hasOpen) summary = t('scheduleOpenForBooking');
    else summary = t('scheduleNoAvailabilitySet');

    const kindsPresent = [...new Set(dayBlocks.map((b) => b.kind))].slice(0, 3);
    return {
      i,
      dow: t(dayKey('dowShort', i)),
      dowFull: t(dayKey('dowFull', i)),
      date: dateNums[i],
      summary,
      dots: kindsPresent.map((k) => KIND_STYLE[k].bar),
      isSel: i === selectedDay,
    };
  });

  // ---- Month view ----
  // Both branches are mockStore's getMonthGrid: signed out it draws the
  // fixed week's month from its own defaults, signed in the real month
  // around today with this week marked live.
  const grid = live ? getMonthGrid(realTodayMs, weekStartMs) : getMonthGrid();
  const monthCells = grid.map((c, idx) => {
    const isSelCell = c.dayIndex !== null && c.dayIndex === selectedDay && view === 'month';
    const kind = c.dayIndex !== null ? dominantKind(blocksForDay(c.dayIndex)) : null;
    return { key: idx, day: c.day, inMonth: c.inMonth, dataIdx: c.dayIndex, isSelCell, dotColor: kind ? KIND_STYLE[kind].bar : null };
  });

  const bookedToday = blocks.filter((b) => b.kind === 'booked').length;
  const pendingToday = blocks.filter((b) => b.kind === 'pending').length;
  const scheduleSummary = `${t(dayKey('dowFull', selectedDay))} · ${bookedToday} ${bookedToday === 1 ? t('scheduleSessionBookedOne').split(' ')[0] : t('scheduleSessionBookedMany').split(' ')[0]}${pendingToday ? ` · ${t('schedulePendingSuffix', { n: pendingToday })}` : ''}`;
  const cancelConfirmBody = t('scheduleCancelConfirmBody', { name: activeBlock?.name || t('scheduleThisMember') });

  const navItems: BottomNavItem[] = [
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'main' },
    { key: 'clients', label: t('mainClientsNav'), icon: ClientsIcon, screen: 'clients' },
    { key: 'messages', label: t('mainMessagesNav'), icon: MessageIcon, screen: 'messagesInbox' },
    { key: 'quickActions', label: t('quickActionsTitle'), render: () => <QuickActions context="schedule" /> },
    { key: 'schedule', label: t('mainSchedule'), icon: ScheduleIcon, screen: 'schedule' },
    { key: 'profile', label: t('mainProfileNav'), icon: PersonIcon, screen: 'profile' },
  ];

  return (
    <div className="phone-frame schedule-screen">
      <div className="schedule-hero">
        <div className="schedule-hero-top">
          <div>
            <div className="schedule-summary-label">{scheduleSummary}</div>
            <div className="schedule-title">{t('scheduleTitle')}</div>
          </div>
          <div className="schedule-hero-actions">
            <button type="button" className="schedule-hero-icon-btn" aria-label={t('scheduleEditAvailability')} onClick={() => nav('availability')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3.5 2" />
              </svg>
            </button>
            <button type="button" className="schedule-hero-icon-btn" aria-label={t('switchLanguage')} onClick={() => setLang(isAr ? 'en' : 'ar')}>
              <span className="schedule-lang-label">{isAr ? 'EN' : 'ع'}</span>
            </button>
            <button type="button" className="schedule-hero-icon-btn" aria-label={t('toggleDarkMode')} onClick={() => setDark(!dark)}>
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
          </div>
        </div>
      </div>

      <div className="schedule-view-tabs">
        <button type="button" className={`schedule-view-tab${view === 'day' ? ' is-active' : ''}`} onClick={() => setView('day')}>{t('scheduleDay')}</button>
        <button type="button" className={`schedule-view-tab${view === 'week' ? ' is-active' : ''}`} onClick={() => setView('week')}>{t('scheduleWeek')}</button>
        <button type="button" className={`schedule-view-tab${view === 'month' ? ' is-active' : ''}`} onClick={() => setView('month')}>{t('scheduleMonth')}</button>
      </div>

      <div className="schedule-body">
        {view === 'day' && (
          <div className="schedule-day-view">
            <div className="schedule-day-strip">
              {dateNums.map((date, i) => (
                <button
                  key={i}
                  type="button"
                  className={`schedule-day-chip${i === selectedDay ? ' is-selected' : ''}`}
                  onClick={() => setSelectedDay(i)}
                >
                  <span className="schedule-day-chip-dow">{t(dayKey('dowShort', i))}</span>
                  <span className="schedule-day-chip-date">{date}</span>
                </button>
              ))}
            </div>

            <div className="schedule-legend">
              {LEGEND_ORDER.map((k) => {
                const on = activeKinds[k];
                const style = KIND_STYLE[k];
                return (
                  <button
                    key={k}
                    type="button"
                    className="schedule-legend-chip"
                    style={{ background: on ? style.bg : 'var(--surface)', boxShadow: on ? 'none' : 'var(--shadow-soft)' }}
                    onClick={() => setActiveKinds({ ...activeKinds, [k]: !on })}
                  >
                    <span
                      className="schedule-legend-dot"
                      style={LEGEND_DASHED[k]
                        ? { border: `1.5px dashed ${style.bar}`, background: 'transparent', opacity: on ? 1 : 0.4 }
                        : { background: style.bar, opacity: on ? 1 : 0.4 }}
                    />
                    <span className="schedule-legend-label" style={{ color: on ? style.color : 'var(--ink-soft)', opacity: on ? 1 : 0.5 }}>
                      {k === 'available' ? t('scheduleLegendPreferred') : k === 'booked' ? t('scheduleLegendBooked') : k === 'pending' ? t('scheduleLegendPending') : t('scheduleLegendUnavailable')}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="schedule-selected-label">
              {t(dayKey('dowFull', selectedDay))}{isAr ? '، ' : ', '}{live ? fmt.monthDayLong(weekStartMs + selectedDay * DAY_MS) : `${t('scheduleMonthName')} ${DATE_NUMS[selectedDay]}`}
            </div>

            <div className="schedule-timeline" style={{ height: timelineHeight }}>
              {hourMarks.map((h, i) => (
                <div key={i}>
                  <div className="schedule-hour-line" style={{ top: h.top }} />
                  <div className="schedule-hour-label" style={{ top: h.labelTop }}>{h.label}</div>
                </div>
              ))}
              {blocks.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className="schedule-block"
                  style={{
                    top: b.top,
                    height: b.height,
                    background: b.tagBg,
                    borderInlineStart: `3px solid ${b.barColor}`,
                    justifyContent: b.allDay ? 'center' : 'flex-start',
                    opacity: b.rowOpacity,
                    // A session or request sits above busy or open time it
                    // overlaps, so it can still be tapped.
                    zIndex: b.isBooked || b.isPending ? 2 : 1,
                  }}
                  onClick={b.canManage ? () => openBlockSheet(b) : undefined}
                >
                  <div className="schedule-block-row">
                    {b.showAvatar && (
                      <div className="schedule-block-avatar-wrap">
                        <div className="schedule-block-avatar" style={{ background: b.avatarBg }}>{b.initials}</div>
                        {b.isPending && <div className="schedule-block-pending-ring" style={{ borderColor: 'var(--amber)' }} />}
                      </div>
                    )}
                    {b.isOpen && (
                      <div className="schedule-block-icon-circle">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={b.barColor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </div>
                    )}
                    {b.isBusy && (
                      <div className="schedule-block-icon-circle">
                        <LockIcon size={10} color={b.barColor} />
                      </div>
                    )}
                    <div className="schedule-block-text">
                      <div className="schedule-block-range" style={{ color: b.tagColor }}>{rangeView(b.startH, b.endH)}</div>
                      <div className="schedule-block-label">{b.displayLabel}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button type="button" className="schedule-add-block" onClick={() => nav('addTimeBlock')}>
              {t('scheduleAddTimeBlock')}
            </button>
          </div>
        )}

        {view === 'week' && (
          <div className="schedule-week-view">
            <div className="schedule-section-label">
              {t('scheduleThisWeek')} · {live
                ? `${fmt.monthDayLong(weekStartMs)} – ${fmt.monthDayLong(weekStartMs + 6 * DAY_MS)}`
                : `${t('scheduleMonthName')} 20 – 26`}
            </div>
            {weekRows.map((w) => (
              <button
                key={w.i}
                type="button"
                className="schedule-week-row"
                onClick={() => { setSelectedDay(w.i); setView('day'); }}
              >
                <div className="schedule-week-badge" style={{ background: w.isSel ? 'var(--accent)' : 'var(--accent-soft)', color: w.isSel ? '#FFFFFF' : 'var(--accent)' }}>
                  <span className="schedule-week-badge-dow">{w.dow}</span>
                  <span className="schedule-week-badge-date">{w.date}</span>
                </div>
                <div className="schedule-week-text">
                  <div className="schedule-week-dow-full">{w.dowFull}</div>
                  <div className="schedule-week-summary">{w.summary}</div>
                </div>
                <div className="schedule-week-dots">
                  {w.dots.map((color, i) => (
                    <span key={i} className="schedule-week-dot" style={{ background: color }} />
                  ))}
                </div>
                <ArrowForwardIcon size={15} color="var(--ink-soft)" />
              </button>
            ))}
          </div>
        )}

        {view === 'month' && (
          <div className="schedule-month-view">
            <div className="schedule-section-label">{live ? fmt.monthYear(realTodayMs) : `${t('scheduleMonthName')} 2025`}</div>
            <div className="schedule-month-card">
              <div className="schedule-month-weekdays">
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className="schedule-month-weekday">{t(dayKey('dowShort', i)).charAt(0)}</div>
                ))}
              </div>
              <div className="schedule-month-grid">
                {monthCells.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="schedule-month-cell"
                    style={{
                      background: c.isSelCell ? 'var(--accent)' : 'transparent',
                      color: c.isSelCell ? '#FFFFFF' : c.inMonth ? 'var(--ink)' : 'var(--ink-soft)',
                      opacity: c.inMonth ? 1 : 0.35,
                      fontWeight: c.dataIdx !== null ? 700 : 500,
                    }}
                    onClick={c.dataIdx !== null ? () => { setSelectedDay(c.dataIdx!); setView('day'); } : undefined}
                  >
                    <span>{c.day}</span>
                    {c.dotColor && <span className="schedule-month-dot" style={{ background: c.dotColor }} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="schedule-month-hint">{t('scheduleMonthHint')}</div>
          </div>
        )}
      </div>

      <BottomNav items={navItems} />

      <BottomSheet open={showBlockSheet} onClose={closeBlockSheet}>
        {activeBlock && (
          <>
            <div className="schedule-sheet-header">
              <div className="schedule-sheet-avatar" style={{ background: activeBlock.kind === 'busy' ? 'var(--red)' : activeBlock.avatarBg }}>
                {activeBlock.kind === 'busy' ? <LockIcon size={14} color="#FFFFFF" /> : activeBlock.initials}
              </div>
              <div className="schedule-sheet-header-text">
                <div className="schedule-sheet-name">{activeBlock.name}</div>
                <div className="schedule-sheet-range">{rangeView(activeBlock.startH, activeBlock.endH)}</div>
              </div>
              <button type="button" className="schedule-sheet-close" aria-label={t('close')} onClick={closeBlockSheet}>
                <CloseIcon size={14} />
              </button>
            </div>

            {hasReminderLink && (
              <button type="button" className="schedule-sheet-btn schedule-sheet-btn-accent" onClick={() => { draftRemind(); nav(activeBlock.messagesHref!); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                {t('scheduleRemindAboutSession')}
              </button>
            )}

            {/* Signed in, a request is answered from Notifications (0010);
                moving, cancelling and attendance come with the booking PR. */}
            {activeBlock.kind === 'pending' && !live && (
              confirmBlocked ? (
                <div className="schedule-sheet-notice schedule-sheet-notice-red">{confirmBlockedReason}</div>
              ) : (
                <>
                  {showReliabilityWarning && <div className="schedule-sheet-notice schedule-sheet-notice-amber">{reliabilityWarningText}</div>}
                  <button type="button" className="schedule-sheet-btn schedule-sheet-btn-green" onClick={confirmBlock}>{t('scheduleConfirmSession')}</button>
                </>
              )
            )}

            {hasJoinLink && (
              <button type="button" className="schedule-sheet-btn schedule-sheet-btn-green" onClick={() => nav(activeBlock.sessionRoomHref!)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="15" height="12" rx="2.5" /><path d="M22 8.5l-5 3.5 5 3.5v-7z" /></svg>
                {t('scheduleJoinSession')}
              </button>
            )}

            {live && activeBlock.kind === 'busy' && (
              <>
                {changeError && <div className="schedule-sheet-notice schedule-sheet-notice-red" role="alert">{t(changeError)}</div>}
                <button type="button" className="schedule-sheet-btn schedule-sheet-btn-red" disabled={changing} onClick={() => void removeBusyBlock()}>
                  {t('scheduleRemoveBlock')}
                </button>
              </>
            )}

            {hasProfileLink && (
              <button type="button" className="schedule-sheet-btn schedule-sheet-btn-line" onClick={() => nav(activeBlock.detailHref!)}>{t('scheduleViewFullProfile')}</button>
            )}

            {showAttendancePrompt && (
              <div className="schedule-attendance-prompt">
                <div className="schedule-attendance-title">{t('scheduleAttendanceTitle')}</div>
                {changeError && <div className="schedule-sheet-notice schedule-sheet-notice-red" role="alert">{t(changeError)}</div>}
                <div className="schedule-attendance-actions">
                  <button type="button" className="schedule-attendance-btn" style={{ background: 'var(--green-bg)', color: 'var(--green)' }} disabled={changing} onClick={() => setAttendanceOutcome('completed')}>{t('scheduleMarkCompleted')}</button>
                  <button type="button" className="schedule-attendance-btn" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }} disabled={changing} onClick={() => setAttendanceOutcome('member_no_show')}>{t('scheduleMarkNoShow')}</button>
                  <button type="button" className="schedule-attendance-btn" style={{ background: 'var(--red-bg)', color: 'var(--red)' }} disabled={changing} onClick={() => setAttendanceOutcome('disputed')}>{t('scheduleMarkDispute')}</button>
                </div>
              </div>
            )}

            {showAttendanceMarked && (
              <div className="schedule-sheet-notice" style={{ background: attendanceMarkedStyle.bg, color: attendanceMarkedStyle.color }}>{attendanceMarkedLabel}</div>
            )}

            {canRescheduleOrCancel && (
              <>
                {rescheduleEligible && (
                  <button type="button" className="schedule-sheet-btn schedule-sheet-btn-accent-soft" onClick={openReschedulePicker}>{t('scheduleReschedule')}</button>
                )}
                {showRescheduleBlockedMsg && (
                  <div className="schedule-sheet-notice schedule-sheet-notice-amber">{rescheduleBlockedReason}</div>
                )}
                <button type="button" className="schedule-sheet-btn schedule-sheet-btn-red" onClick={openCancelSheet}>{t('scheduleCancelSession')}</button>
              </>
            )}
          </>
        )}
      </BottomSheet>

      <BottomSheet open={showRescheduleSheet} onClose={closeRescheduleSheet}>
        <div className="schedule-reschedule-header">
          <div className="schedule-reschedule-title">{t('scheduleRescheduleTitle')}</div>
          <button type="button" className="schedule-sheet-close" aria-label={t('close')} onClick={closeRescheduleSheet}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="schedule-reschedule-instructions">{t('scheduleRescheduleInstructions')}</div>
        <div className="schedule-day-strip">
          {dateNums.map((date, i) => {
            const isSel = i === rescheduleDaySel;
            const isPast = i < todayIndex;
            return (
              <button
                key={i}
                type="button"
                className={`schedule-day-chip${isSel ? ' is-selected' : ''}${isPast ? ' is-past' : ''}`}
                disabled={isPast}
                onClick={() => { setRescheduleDay(i); setRescheduleSlot(null); }}
              >
                <span className="schedule-day-chip-dow">{t(dayKey('dowShort', i))}</span>
                <span className="schedule-day-chip-date">{date}</span>
              </button>
            );
          })}
        </div>
        <div className="schedule-reschedule-slots">
          {rescheduleRawSlots.length > 0 ? (
            <div className="schedule-slot-grid">
              {rescheduleRawSlots.map((hCur) => {
                const isSel = rescheduleSlot === hCur;
                return (
                  <button
                    key={hCur}
                    type="button"
                    className={`schedule-slot-chip${isSel ? ' is-selected' : ''}`}
                    onClick={() => setRescheduleSlot(hCur)}
                  >
                    {fmtHour(hCur, t('scheduleAm'), t('schedulePm'))}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="schedule-slot-empty">{t('scheduleRescheduleNoSlots')}</div>
          )}
        </div>
        {rescheduleConfirmError && <div className="schedule-sheet-notice schedule-sheet-notice-amber">{rescheduleConfirmErrorText}</div>}
        {changeError && <div className="schedule-sheet-notice schedule-sheet-notice-red" role="alert">{t(changeError)}</div>}
        <div className="schedule-reschedule-actions">
          <button type="button" className="schedule-sheet-btn schedule-sheet-btn-line" onClick={closeRescheduleSheet}>{t('scheduleCancelReschedule')}</button>
          <button
            type="button"
            className="schedule-sheet-btn schedule-sheet-btn-accent"
            style={rescheduleSlot == null ? { background: 'var(--line)', color: 'var(--ink-soft)' } : undefined}
            disabled={rescheduleSlot == null || changing}
            onClick={confirmReschedule}
          >
            {t('scheduleConfirmNewTime')}
          </button>
        </div>
      </BottomSheet>

      {showCancelConfirm && (
        <div className="schedule-modal-backdrop">
          <div className="schedule-modal-card">
            <div className="schedule-modal-icon">
              <WarningIcon size={20} color="var(--red)" />
            </div>
            <div className="schedule-modal-title">{t('scheduleCancelConfirmTitle')}</div>
            <div className="schedule-modal-body">{cancelConfirmBody}</div>
            {changeError && <div className="schedule-sheet-notice schedule-sheet-notice-red" role="alert">{t(changeError)}</div>}
            <div className="schedule-modal-actions">
              <button type="button" className="schedule-modal-btn schedule-modal-btn-neutral" onClick={closeCancelConfirm}>{t('scheduleKeepIt')}</button>
              <button type="button" className="schedule-modal-btn schedule-modal-btn-danger" disabled={changing} onClick={confirmCancelBlock}>{t('scheduleYesCancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
