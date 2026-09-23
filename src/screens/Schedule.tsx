import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey } from '../lib/i18n';
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
  getRescheduleEligibility,
  getSessionLogs,
  getSessionRoomHref,
  getSessionTypeInfo,
  hourRangeLabel,
  isRelationshipBlocked,
  rescheduleBooking,
  setAttendance,
  updateClient,
  updateCustomBlock,
  type AttendanceOutcome,
  type CustomBlock,
  type NavTarget,
  type SessionType,
  type TimeBlockKind,
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
}

// This app's one fixed fictional week — Wed Oct 22 2025 is "today"
// (dayIndex 2), same anchor mockStore.ts's TODAY_MS/WEEK_START_MS use.
const DATE_NUMS = ['20', '21', '22', '23', '24', '25', '26'];
const TODAY_INDEX = 2;
const START_HOUR = 8;
const END_HOUR = 20;
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

interface MonthCellDef {
  day: number;
  inMonth: boolean;
  dataIdx?: number;
}

// Fixed Oct 2025 grid — same fictional month Schedule.dc.html's own
// monthRaw hardcodes, anchored to the same fixed week (dataIdx 0-6 = Oct
// 20-26, this app's one live week).
const MONTH_RAW: MonthCellDef[] = [
  { day: 29, inMonth: false }, { day: 30, inMonth: false }, { day: 1, inMonth: true }, { day: 2, inMonth: true }, { day: 3, inMonth: true }, { day: 4, inMonth: true }, { day: 5, inMonth: true },
  { day: 6, inMonth: true }, { day: 7, inMonth: true }, { day: 8, inMonth: true }, { day: 9, inMonth: true }, { day: 10, inMonth: true }, { day: 11, inMonth: true }, { day: 12, inMonth: true },
  { day: 13, inMonth: true }, { day: 14, inMonth: true }, { day: 15, inMonth: true }, { day: 16, inMonth: true }, { day: 17, inMonth: true }, { day: 18, inMonth: true }, { day: 19, inMonth: true },
  { day: 20, inMonth: true, dataIdx: 0 }, { day: 21, inMonth: true, dataIdx: 1 }, { day: 22, inMonth: true, dataIdx: 2 }, { day: 23, inMonth: true, dataIdx: 3 }, { day: 24, inMonth: true, dataIdx: 4 }, { day: 25, inMonth: true, dataIdx: 5 }, { day: 26, inMonth: true, dataIdx: 6 },
  { day: 27, inMonth: true }, { day: 28, inMonth: true }, { day: 29, inMonth: true }, { day: 30, inMonth: true }, { day: 31, inMonth: true }, { day: 1, inMonth: false }, { day: 2, inMonth: false },
];

// Same tiny 12-hour formatter every screen in the design prototype carries
// its own copy of (Schedule.dc.html/Availability.dc.html's local fmtHour) —
// kept local here too rather than shared, matching that established
// per-screen duplication convention. Only used for a single instant (the
// reschedule slot grid); ranges go through mockStore's own hourRangeLabel.
function fmtHour(h: number, amLabel: string, pmLabel: string): string {
  let hh = Math.floor(h) % 12;
  if (hh === 0) hh = 12;
  const mins = Math.round((h % 1) * 60);
  const period = h >= 12 ? pmLabel : amLabel;
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
  const [selectedDay, setSelectedDay] = useState(TODAY_INDEX);
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
  // Bumped after any mutation to force the derived data below to
  // recompute from localStorage — mockStore is plain functions, not
  // reactive state (same pattern as Main.tsx/Clients.tsx).
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  function blocksForDay(dayIndex: number): UIBlock[] {
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
  const blocks = dayBlocksRaw.map((b) => {
    const client = b.clientId ? getClient(b.clientId) : undefined;
    const name = client?.name ?? null;
    const avatarBg = client?.avatarBg ?? 'var(--accent)';
    const initials = client?.initials ?? '';
    const detailHref = b.clientId ? getClientDetailHref(b.clientId) : null;
    const messagesHref = b.clientId ? getMessagesHref(b.clientId) : null;
    const sessionRoomHref = b.clientId ? getSessionRoomHref(b.clientId) : null;
    const canRemind = b.clientId ? canInteract(b.clientId) : false;
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
      top: (b.startH - START_HOUR) * ROW_H + TOP_PAD + 1,
      height: (Math.min(b.endH, END_HOUR) - b.startH) * ROW_H - 3,
      barColor: style.bar,
      tagBg: style.bg,
      tagColor: style.color,
      rowOpacity: activeKinds[b.kind] ? 1 : 0.25,
      isBooked: b.kind === 'booked',
      isOpen: b.kind === 'available',
      isBusy: b.kind === 'busy',
      isPending: b.kind === 'pending',
      showAvatar: b.kind === 'booked' || b.kind === 'pending',
      canManage: b.kind === 'booked' || b.kind === 'pending',
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
      name: b.name ?? '',
      range: b.range,
      avatarBg: b.avatarBg,
      initials: b.initials,
      detailHref: b.detailHref,
      messagesHref: b.messagesHref,
      sessionRoomHref: b.sessionRoomHref,
      sessionType: b.sessionType ?? 'standard',
      canRemind: b.canRemind,
      remindMessage: b.remindMessage,
    });
    setShowBlockSheet(true);
  }

  const timelineHeight = (END_HOUR - START_HOUR) * ROW_H + TOP_PAD * 2;
  const hourMarks: { top: number; labelTop: number; label: string }[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const period = h >= 12 ? 'PM' : 'AM';
    let hh = h % 12;
    if (hh === 0) hh = 12;
    hourMarks.push({ top: (h - START_HOUR) * ROW_H + TOP_PAD, labelTop: (h - START_HOUR) * ROW_H + TOP_PAD - 6, label: `${hh} ${period}` });
  }

  // ---- Block detail sheet (derived fresh from activeBlock each render) ----
  const hasProfileLink = !!activeBlock?.detailHref;
  const hasReminderLink = !!activeBlock?.messagesHref && activeBlock.canRemind;
  const hasJoinLink = !!activeBlock?.sessionRoomHref && activeBlock.kind !== 'pending' && activeBlock.dayIndex === TODAY_INDEX;

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

  const canTrackAttendance = !!(activeBlock?.id && activeBlock.clientId) && activeBlock?.kind === 'booked';
  const hoursUntilActive = canTrackAttendance && activeBlock ? getHoursUntilBlock(activeBlock.dayIndex, activeBlock.startH) : null;
  const sessionHasPassed = hoursUntilActive != null && hoursUntilActive < 0;
  const canMarkAttendance = canTrackAttendance && sessionHasPassed;
  const existingLog = canMarkAttendance && activeBlock ? getSessionLogs(activeBlock.clientId!).find((s) => s.id === activeBlock.id) : undefined;
  const currentAttendance = existingLog?.attendance as AttendanceOutcome | undefined;
  const showAttendancePrompt = canMarkAttendance && !currentAttendance;
  const showAttendanceMarked = canMarkAttendance && !!currentAttendance;
  const attendanceMarkedLabel = currentAttendance
    ? currentAttendance === 'completed'
      ? t('scheduleAttendanceMarkedCompleted')
      : currentAttendance === 'member_no_show'
        ? t('scheduleAttendanceMarkedNoShow')
        : t('scheduleAttendanceMarkedDisputed')
    : '';
  const attendanceMarkedStyle = ATTENDANCE_STYLE[currentAttendance ?? 'completed'];

  const canRescheduleOrCancel = !sessionHasPassed;
  const canManageReschedule = !!(activeBlock?.id && activeBlock.clientId);
  const rescheduleElig = canManageReschedule && activeBlock ? getRescheduleEligibility(activeBlock.dayIndex, activeBlock.startH) : null;
  const rescheduleEligible = canRescheduleOrCancel && !!rescheduleElig?.eligible;
  const rescheduleBlockedReason = rescheduleElig && !rescheduleElig.eligible
    ? t('scheduleRescheduleTooLate', { hours: rescheduleElig.graceHours })
    : t('scheduleRescheduleUnavailable');
  const showRescheduleBlockedMsg = canRescheduleOrCancel && !rescheduleEligible;

  // ---- Reschedule sheet ----
  const rescheduleDaySel = rescheduleDay ?? activeBlock?.dayIndex ?? TODAY_INDEX;
  const rescheduleRawSlots: number[] = [];
  getAvailabilityForDayIndex(rescheduleDaySel).forEach((b) => {
    let hCur = b.startH;
    while (hCur + RESCHED_SLOT_LEN <= b.endH + 0.001) {
      rescheduleRawSlots.push(hCur);
      hCur += RESCHED_SLOT_LEN;
    }
  });
  const rescheduleConfirmErrorText = t('scheduleRescheduleTooLate', { hours: getCancellationPolicy().graceHours });

  function openReschedulePicker() {
    if (!rescheduleEligible || !activeBlock) return;
    setShowBlockSheet(false);
    setShowRescheduleSheet(true);
    setRescheduleDay(activeBlock.dayIndex);
    setRescheduleSlot(null);
    setRescheduleConfirmError(false);
  }
  function closeRescheduleSheet() {
    setShowRescheduleSheet(false);
    setActiveBlock(null);
    setRescheduleDay(null);
    setRescheduleSlot(null);
    setRescheduleConfirmError(false);
  }
  function confirmReschedule() {
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
    setShowBlockSheet(false);
    setActiveBlock(null);
  }
  function openCancelSheet() {
    setShowBlockSheet(false);
    setShowCancelConfirm(true);
  }
  function closeCancelConfirm() {
    setShowCancelConfirm(false);
    setActiveBlock(null);
  }
  function confirmCancelBlock() {
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
        const dowNamesEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dowLabel = activeBlock.dayIndex === TODAY_INDEX ? 'Today' : dowNamesEn[activeBlock.dayIndex];
        // Always English regardless of UI language — nextSession is a
        // shared cross-screen data format (ClientHome etc. match against
        // 'No upcoming session'/'Program completed' literally), not
        // display text, so it must not follow the Pro's own lang toggle.
        const startLabel = fmtHour(activeBlock.startH, 'AM', 'PM');
        updateClient(activeBlock.clientId, { nextSession: `Next: ${dowLabel}, ${startLabel}`, nextSessionType: activeBlock.sessionType });
      }
    }
    setConfirmedKeys((k) => ({ ...k, [activeBlock.key]: true }));
    setShowBlockSheet(false);
    setActiveBlock(null);
    refresh();
  }
  function setAttendanceOutcome(outcome: AttendanceOutcome) {
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
      date: DATE_NUMS[i],
      summary,
      dots: kindsPresent.map((k) => KIND_STYLE[k].bar),
      isSel: i === selectedDay,
    };
  });

  // ---- Month view ----
  const monthCells = MONTH_RAW.map((c, idx) => {
    const isSelCell = c.dataIdx !== undefined && c.dataIdx === selectedDay && view === 'month';
    const kind = c.dataIdx !== undefined ? dominantKind(blocksForDay(c.dataIdx)) : null;
    return { key: idx, day: c.day, inMonth: c.inMonth, dataIdx: c.dataIdx, isSelCell, dotColor: kind ? KIND_STYLE[kind].bar : null };
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
            <button type="button" className="schedule-hero-icon-btn" aria-label="Edit availability" onClick={() => nav('availability')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3.5 2" />
              </svg>
            </button>
            <button type="button" className="schedule-hero-icon-btn" aria-label="Switch language" onClick={() => setLang(isAr ? 'en' : 'ar')}>
              <span className="schedule-lang-label">{isAr ? 'EN' : 'ع'}</span>
            </button>
            <button type="button" className="schedule-hero-icon-btn" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>
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
              {DATE_NUMS.map((date, i) => (
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
              {t(dayKey('dowFull', selectedDay))}, {t('scheduleMonthName')} {DATE_NUMS[selectedDay]}
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
                      <div className="schedule-block-range" dir="ltr" style={{ color: b.tagColor }}>{b.range}</div>
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
            <div className="schedule-section-label">{t('scheduleThisWeek')} · {t('scheduleMonthName')} 20 – 26</div>
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
            <div className="schedule-section-label">{t('scheduleMonthName')} 2025</div>
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
                      fontWeight: c.dataIdx !== undefined ? 700 : 500,
                    }}
                    onClick={c.dataIdx !== undefined ? () => { setSelectedDay(c.dataIdx!); setView('day'); } : undefined}
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
              <div className="schedule-sheet-avatar" style={{ background: activeBlock.avatarBg }}>{activeBlock.initials}</div>
              <div className="schedule-sheet-header-text">
                <div className="schedule-sheet-name">{activeBlock.name}</div>
                <div className="schedule-sheet-range" dir="ltr">{activeBlock.range}</div>
              </div>
              <button type="button" className="schedule-sheet-close" aria-label="Close" onClick={closeBlockSheet}>
                <CloseIcon size={14} />
              </button>
            </div>

            {hasReminderLink && (
              <button type="button" className="schedule-sheet-btn schedule-sheet-btn-accent" onClick={() => { draftRemind(); nav(activeBlock.messagesHref!); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                {t('scheduleRemindAboutSession')}
              </button>
            )}

            {activeBlock.kind === 'pending' && (
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

            {hasProfileLink && (
              <button type="button" className="schedule-sheet-btn schedule-sheet-btn-line" onClick={() => nav(activeBlock.detailHref!)}>{t('scheduleViewFullProfile')}</button>
            )}

            {showAttendancePrompt && (
              <div className="schedule-attendance-prompt">
                <div className="schedule-attendance-title">{t('scheduleAttendanceTitle')}</div>
                <div className="schedule-attendance-actions">
                  <button type="button" className="schedule-attendance-btn" style={{ background: 'var(--green-bg)', color: 'var(--green)' }} onClick={() => setAttendanceOutcome('completed')}>{t('scheduleMarkCompleted')}</button>
                  <button type="button" className="schedule-attendance-btn" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }} onClick={() => setAttendanceOutcome('member_no_show')}>{t('scheduleMarkNoShow')}</button>
                  <button type="button" className="schedule-attendance-btn" style={{ background: 'var(--red-bg)', color: 'var(--red)' }} onClick={() => setAttendanceOutcome('disputed')}>{t('scheduleMarkDispute')}</button>
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
          <button type="button" className="schedule-sheet-close" aria-label="Close" onClick={closeRescheduleSheet}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="schedule-reschedule-instructions">{t('scheduleRescheduleInstructions')}</div>
        <div className="schedule-day-strip">
          {DATE_NUMS.map((date, i) => {
            const isSel = i === rescheduleDaySel;
            const isPast = i < TODAY_INDEX;
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
        <div className="schedule-reschedule-actions">
          <button type="button" className="schedule-sheet-btn schedule-sheet-btn-line" onClick={closeRescheduleSheet}>{t('scheduleCancelReschedule')}</button>
          <button
            type="button"
            className="schedule-sheet-btn schedule-sheet-btn-accent"
            style={rescheduleSlot == null ? { background: 'var(--line)', color: 'var(--ink-soft)' } : undefined}
            disabled={rescheduleSlot == null}
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
            <div className="schedule-modal-actions">
              <button type="button" className="schedule-modal-btn schedule-modal-btn-neutral" onClick={closeCancelConfirm}>{t('scheduleKeepIt')}</button>
              <button type="button" className="schedule-modal-btn schedule-modal-btn-danger" onClick={confirmCancelBlock}>{t('scheduleYesCancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
