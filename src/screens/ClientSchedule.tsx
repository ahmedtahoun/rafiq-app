import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import {
  ArrowForwardIcon, CheckIcon, ScheduleIcon, WarningIcon,
  
} from '../components/icons';
import { MemberTabBar } from '../components/TabBars';
import { LoadState } from '../components/LoadState';
import { NoCoachYet } from '../components/NoCoachYet';
import { useRemoteSession } from '../lib/remoteSession';
import { sendMoveRequest, weekdayOf, withdrawSessionRequest } from '../lib/requestData';
import { fetchMemberSchedule, memberCancelSession, type MemberSchedule } from '../lib/memberScheduleData';
import { wallNowMs, wallTodayMs } from '../lib/wallClock';
import { canOfferJoin } from '../lib/videoData';
import { useMemberSpace, useMemberStore, type MemberRelationshipView } from '../store/memberStore';
import { useRemoteLoad } from '../store/remoteLoad';
import {
  DEMO_MEMBER_CLIENT_ID, TODAY_MS, getMonthAnchorMs,
  getClient, getCoachProfile, getCustomBlocks, getAvailabilityForDayIndex,
  getRescheduleEligibility, getCancellationPolicy, rescheduleBooking, cancelBooking,
  getMemberSessions, getRecapForMember, getRatings, getSessionTypeInfo,
  getActiveSession, isSessionToday, updateClient,
  blockDayIndex, blockStartH, blockEndH,
  type CustomBlock, type SessionType,
} from '../lib/mockStore';
import './ClientSchedule.css';

// Signed out, the demo member's. Signed in, the screen is
// LiveClientSchedule below (SUPABASE-MIGRATION-PLAN.md step 4, part 4).
const CLIENT_ID = DEMO_MEMBER_CLIENT_ID;
// The demo's fixed week (CLAUDE.md), for the signed-out screen: "today" is
// TODAY_MS and its week starts at getMonthAnchorMs(), so the days before it
// have passed. Signed in, LiveClientSchedule is on the real clock.
const DEMO_WEEKDAY = weekdayOf(TODAY_MS);
const demoDayOfMonth = (i: number) => new Date(getMonthAnchorMs() + i * 86400000).getUTCDate();
// Bookable slots are 45 minutes apart — the same step ClientBooking offers,
// reused here rather than re-approximated so the reschedule picker can
// never offer a time the booking screen wouldn't.
const SLOT_STEP = 0.75;


const TYPE_LABEL_KEYS: Record<SessionType, MessageKey> = {
  intro: 'clientBookingTypeLabelIntro',
  short: 'clientBookingTypeLabelShort',
  standard: 'clientBookingTypeLabelStandard',
};

function hourLabel(h: number, am: string, pm: string): string {
  const period = h >= 12 ? pm : am;
  const hh = Math.floor(h) % 12 || 12;
  const mins = Math.round((h % 1) * 60);
  return `${hh}:${String(mins).padStart(2, '0')} ${period}`;
}

/** The title, whose sessions these are, and the language and theme toggles. */
function HeroTop({ coachName }: { coachName: string | null }) {
  const t = useT();
  return (
    <div className="client-schedule-hero-top">
      <div>
        <h1 className="client-schedule-title">{t('clientScheduleTitle')}</h1>
        {coachName && <div className="client-schedule-subtitle">{t('clientScheduleWithCoach', { coach: coachName })}</div>}
      </div>
    </div>
  );
}

export default function ClientSchedule() {
  const remote = useRemoteSession();
  const space = useMemberSpace();
  if (!remote) return <DemoClientSchedule />;
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} />;
  if (!space.remote) return <DemoClientSchedule />;
  // Keyed by relationship, so switching coach in My Pros starts clean.
  return <LiveClientSchedule key={space.current?.clientId ?? 'none'} rel={space.current} />;
}

function DemoClientSchedule() {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  // mockStore is plain functions over localStorage, not reactive state —
  // a counter bump is what makes the screen re-read after a mutation.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false);
  const [rescheduleDay, setRescheduleDay] = useState<number | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<number | null>(null);
  const [rescheduleError, setRescheduleError] = useState(false);

  const client = getClient(CLIENT_ID);
  const coachName = getCoachProfile().name || 'Yasmin El-Sayed';
  const heroGrad = 'var(--hero-grad)';

  const AM = isAr ? 'صباحًا' : 'AM';
  const PM = isAr ? 'مساءً' : 'PM';

  // A confirmed session lives on the client record (the same `nextSession`
  // field ClientHome and the coach's Main already read); a pending one is
  // the real `pending` time block ClientBooking wrote. Matched by clientId
  // rather than by a substring of the label — the block carries the id.
  const myBlocks = getCustomBlocks().filter((b) => b.clientId === CLIENT_ID);
  const pendingBlock = myBlocks.find((b) => b.kind === 'pending') ?? null;
  const bookedBlock = myBlocks.find((b) => b.kind === 'booked') ?? null;

  const nextSessionAtMs = client?.nextSessionAtMs ?? null;
  const hasConfirmedSession = nextSessionAtMs != null;
  const isPending = !!pendingBlock;
  const hasUpcoming = isPending || hasConfirmedSession;

  // Only a real, persisted block can actually be moved or cancelled with a
  // trace. The seeded "Next: Today, 10:00 AM" display has no block behind
  // it, so reschedule reads as unavailable rather than showing a countdown
  // against nothing.
  const activeBlock: CustomBlock | null = pendingBlock ?? bookedBlock;
  const eligibility = activeBlock
    ? getRescheduleEligibility(blockDayIndex(activeBlock), blockStartH(activeBlock))
    : null;
  const canReschedule = hasUpcoming && !!eligibility && eligibility.eligible;
  const rescheduleBlockedReason = eligibility && !eligibility.eligible
    ? t('clientScheduleRescheduleTooLate', { hours: eligibility.graceHours })
    : t('clientScheduleRescheduleUnavailable');

  // A pending request is real block data, so its day name translates and its
  // time range is built from the same localized AM/PM the booking screen
  // uses — `blockRange()` hardcodes English AM/PM for the coach's own
  // screens. Each end of the range is isolated with <bdi> below so Arabic
  // keeps "10:00 صباحًا" in that order without scrambling the pair.
  //
  // A confirmed session is `client.nextSessionAtMs`, a real timestamp as of
  // the fix that replaced the store's old pre-composed English sentence
  // (`Client.nextSession`) — rendered here with the same useFormat().
  // nextSession() every other screen uses now.
  const upcomingDay = isPending && pendingBlock
    ? t(dayKey('dowFull', blockDayIndex(pendingBlock)))
    : hasConfirmedSession ? fmt.nextSession(nextSessionAtMs!) : '';
  const upcomingStart = isPending && pendingBlock ? hourLabel(blockStartH(pendingBlock), AM, PM) : '';
  const upcomingEnd = isPending && pendingBlock ? hourLabel(blockEndH(pendingBlock), AM, PM) : '';

  const sessionTypeKey: SessionType = isPending
    ? (pendingBlock?.sessionType ?? 'standard')
    : (client?.nextSessionType ?? 'standard');
  const sessionTypeLabel = t(TYPE_LABEL_KEYS[getSessionTypeInfo(sessionTypeKey).key]);

  const sessionToday = isSessionToday(nextSessionAtMs);
  const showJoin = hasConfirmedSession && !isPending && sessionToday;
  const sessionIsLive = getActiveSession(CLIENT_ID).active;

  // Cancelling inside the grace window forfeits a package credit —
  // cancelBooking enforces that, so the confirmation has to say it.
  const graceHours = getCancellationPolicy().graceHours;
  const cancelForfeitsCredit = !!activeBlock && !!eligibility && !eligibility.eligible;

  // ---- session history -----------------------------------------------------

  const ratings = getRatings(CLIENT_ID);
  const history = getMemberSessions(CLIENT_ID).map((s) => {
    // Routed through getRecapForMember rather than indexing getRecaps()
    // directly, so a recap the Pro marks private is never shown here.
    const recap = getRecapForMember(CLIENT_ID, s.id).trim();
    const rated = ratings[s.id];
    return {
      id: s.id,
      date: fmt.date(s.atMs),
      note: recap || t('clientScheduleDefaultNote'),
      rated: rated ? rated.rating : null,
    };
  });

  // ---- reschedule picker ---------------------------------------------------

  const pickerDay = rescheduleDay ?? (activeBlock ? blockDayIndex(activeBlock) : DEMO_WEEKDAY);
  const pickerSlots: number[] = [];
  getAvailabilityForDayIndex(pickerDay).forEach((slot) => {
    for (let h = slot.startH; h + SLOT_STEP <= slot.endH + 0.001; h += SLOT_STEP) {
      pickerSlots.push(h);
    }
  });

  function openReschedule() {
    if (!canReschedule || !activeBlock) return;
    setRescheduleDay(blockDayIndex(activeBlock));
    setRescheduleSlot(null);
    setRescheduleError(false);
    setShowRescheduleSheet(true);
  }

  function closeReschedule() {
    setShowRescheduleSheet(false);
    setRescheduleDay(null);
    setRescheduleSlot(null);
    setRescheduleError(false);
  }

  function confirmReschedule() {
    if (rescheduleSlot === null || !activeBlock) return;
    // The session moves, it doesn't resize — its own duration carries over.
    const duration = blockEndH(activeBlock) - blockStartH(activeBlock);
    const result = rescheduleBooking(
      CLIENT_ID, activeBlock.id, pickerDay, rescheduleSlot, rescheduleSlot + duration, 'client',
    );
    if ('error' in result) {
      // Defensive: the eligibility check above should already prevent this,
      // but a stale check between opening the sheet and confirming must
      // explain itself rather than silently doing nothing.
      setRescheduleError(true);
      return;
    }
    closeReschedule();
    refresh();
  }

  function confirmCancel() {
    // Routed through cancelBooking, not a bare removeCustomBlock, so a
    // member-initiated cancellation gets the same timestamped record and
    // grace-period policy the Pro side already applies.
    if (isPending && pendingBlock) {
      cancelBooking(CLIENT_ID, {
        blockId: pendingBlock.id,
        cancelledByRole: 'client',
        dayIndex: blockDayIndex(pendingBlock),
        startH: blockStartH(pendingBlock),
      });
    } else if (bookedBlock) {
      cancelBooking(CLIENT_ID, {
        blockId: bookedBlock.id,
        cancelledByRole: 'client',
        dayIndex: blockDayIndex(bookedBlock),
        startH: blockStartH(bookedBlock),
      });
    } else if (hasConfirmedSession) {
      // Seeded session with no block behind it: still record the
      // cancellation, then clear the display it was shown from.
      cancelBooking(CLIENT_ID, { blockId: null, cancelledByRole: 'client' });
      updateClient(CLIENT_ID, { nextSessionAtMs: null });
    }
    setShowCancelConfirm(false);
    refresh();
  }


  return (
    <div className="phone-frame client-schedule-screen">
      <div className="client-schedule-hero" style={{ background: heroGrad }}>
        <HeroTop coachName={coachName} />

        {hasUpcoming ? (
          <div className="client-schedule-upcoming">
            <button type="button" className="client-schedule-upcoming-card" onClick={() => nav('clientCoach')}>
              <span className="client-schedule-upcoming-icon">
                <ScheduleIcon size={20} color="#FFFFFF" />
              </span>
              <span className="client-schedule-upcoming-body">
                <span className="client-schedule-upcoming-head">
                  <span className="client-schedule-upcoming-label">{t('clientScheduleUpcoming')}</span>
                  <span className={`client-schedule-status client-schedule-status-${isPending ? 'pending' : 'confirmed'}`}>
                    {isPending ? t('clientSchedulePending') : t('clientScheduleConfirmed')}
                  </span>
                </span>
                {/* Each time is its own <bdi> so Arabic keeps "10:00 صباحًا"
                    together and in that order, while the pair itself still
                    lays out right-to-left like the rest of the line. A
                    dir="ltr" span around the whole range scrambles it. */}
                <span className="client-schedule-upcoming-when">
                  <bdi>{upcomingDay}</bdi>
                  {upcomingStart && <>{', '}<bdi>{upcomingStart}</bdi>{' – '}<bdi>{upcomingEnd}</bdi></>}
                </span>
                <span className="client-schedule-upcoming-type">{sessionTypeLabel}</span>
              </span>
              <span className="client-schedule-upcoming-chevron">
                <ArrowForwardIcon size={16} color="#FFFFFF" />
              </span>
            </button>

            {showJoin && (
              <button
                type="button"
                className="client-schedule-join"
                onClick={() => nav({ screen: 'sessionRoom', params: { clientId: CLIENT_ID } })}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="15" height="12" rx="2.5" />
                  <path d="M22 8.5l-5 3.5 5 3.5v-7z" />
                </svg>
                {sessionIsLive ? t('clientScheduleRejoinSession') : t('clientScheduleJoinSession')}
              </button>
            )}

            <div className="client-schedule-actions">
              {canReschedule ? (
                <button type="button" className="client-schedule-action" onClick={openReschedule}>
                  {t('clientScheduleReschedule')}
                </button>
              ) : (
                <div className="client-schedule-action-blocked">{rescheduleBlockedReason}</div>
              )}
              <button type="button" className="client-schedule-action" onClick={() => setShowCancelConfirm(true)}>
                {t('clientScheduleCancelSession')}
              </button>
            </div>
          </div>
        ) : (
          <div className="client-schedule-empty-upcoming">
            <span className="client-schedule-empty-icon">
              <ScheduleIcon size={20} color="#FFFFFF" />
            </span>
            <div className="client-schedule-empty-title">{t('clientScheduleNoUpcomingTitle')}</div>
            <div className="client-schedule-empty-sub">{t('clientScheduleNoUpcomingSub')}</div>
          </div>
        )}
      </div>

      <div className="client-schedule-scroll">
        <div className="client-schedule-section">
          <h2 className="client-schedule-h2">{t('clientScheduleHistory')}</h2>
          {history.length > 0 ? (
            history.map((s) => (
              <div key={s.id} className="client-schedule-history-row">
                <span className="client-schedule-history-icon">
                  <CheckIcon size={16} color="var(--green)" />
                </span>
                <div className="client-schedule-history-body">
                  <div className="client-schedule-history-date"><bdi>{s.date}</bdi></div>
                  <div className="client-schedule-history-note"><bdi>{s.note}</bdi></div>
                </div>
                {s.rated === null ? (
                  <button
                    type="button"
                    className="client-schedule-rate"
                    // Carries which row was tapped — without it RateCoach
                    // would always target the first unrated session, so
                    // rating the second row would rate the first.
                    onClick={() => nav({ screen: 'rateCoach', params: { sessionId: s.id } })}
                  >
                    {t('clientScheduleRate')}
                  </button>
                ) : (
                  <span className="client-schedule-rated" aria-label={t('rateCoachStarLabel', { n: s.rated })}>
                    {'★'.repeat(s.rated)}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="client-schedule-no-history">{t('clientScheduleNoHistory')}</div>
          )}
        </div>

        <button type="button" className="client-schedule-request" onClick={() => nav('clientBooking')}>
          {t('clientScheduleRequestSession')}
        </button>
      </div>

      {showCancelConfirm && (
        <div className="client-schedule-overlay">
          <div className="client-schedule-dialog">
            <span className="client-schedule-dialog-icon">
              <WarningIcon size={20} color="var(--red)" />
            </span>
            <div className="client-schedule-dialog-title">{t('clientScheduleConfirmTitle')}</div>
            <p className="client-schedule-dialog-body">{t('clientScheduleConfirmBody', { coach: coachName })}</p>
            {cancelForfeitsCredit && (
              <p className="client-schedule-dialog-warn">{t('clientScheduleConfirmForfeit', { hours: graceHours })}</p>
            )}
            <div className="client-schedule-dialog-actions">
              <button type="button" className="client-schedule-dialog-keep" onClick={() => setShowCancelConfirm(false)}>
                {t('clientScheduleKeepSession')}
              </button>
              <button type="button" className="client-schedule-dialog-cancel" onClick={confirmCancel}>
                {t('clientScheduleYesCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRescheduleSheet && (
        <div className="client-schedule-overlay client-schedule-overlay-bottom">
          <div className="client-schedule-sheet">
            <div className="client-schedule-sheet-top">
              <div className="client-schedule-sheet-title">{t('clientScheduleRescheduleTitle')}</div>
              <button type="button" className="client-schedule-sheet-close" aria-label={t('clientScheduleCancelReschedule')} onClick={closeReschedule}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="client-schedule-sheet-hint">{t('clientScheduleRescheduleInstructions')}</p>

            <div className="client-schedule-days">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                const past = i < DEMO_WEEKDAY;
                const selected = i === pickerDay;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`client-schedule-day${selected ? ' client-schedule-day-on' : ''}`}
                    disabled={past}
                    aria-pressed={selected}
                    onClick={() => { setRescheduleDay(i); setRescheduleSlot(null); }}
                  >
                    <span className="client-schedule-day-dow">{t(dayKey('dowShort', i))}</span>
                    <span className="client-schedule-day-num">{demoDayOfMonth(i)}</span>
                  </button>
                );
              })}
            </div>

            <div className="client-schedule-slots-wrap">
              {pickerSlots.length > 0 ? (
                <div className="client-schedule-slots">
                  {pickerSlots.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`client-schedule-slot${rescheduleSlot === h ? ' client-schedule-slot-on' : ''}`}
                      aria-pressed={rescheduleSlot === h}
                      onClick={() => setRescheduleSlot(h)}
                    >
                      {hourLabel(h, AM, PM)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="client-schedule-no-slots">{t('clientScheduleRescheduleNoSlots')}</div>
              )}
            </div>

            {rescheduleError && (
              <div className="client-schedule-sheet-error">
                {t('clientScheduleRescheduleTooLate', { hours: graceHours })}
              </div>
            )}

            <div className="client-schedule-sheet-actions">
              <button type="button" className="client-schedule-sheet-cancel" onClick={closeReschedule}>
                {t('clientScheduleCancelReschedule')}
              </button>
              <button
                type="button"
                className="client-schedule-sheet-confirm"
                disabled={rescheduleSlot === null}
                onClick={confirmReschedule}
              >
                {t('clientScheduleConfirmNewTime')}
              </button>
            </div>
          </div>
        </div>
      )}

      <MemberTabBar />
    </div>
  );
}

const ATTENDANCE_NOTE_KEYS: Partial<Record<string, MessageKey>> = {
  no_show: 'clientScheduleMissedNote',
  disputed: 'clientScheduleDisputedNote',
};

/**
 * Signed in: this relationship's real sessions (memberScheduleData.ts).
 * The next booked session, or else the open request to this coach; the
 * sessions that have happened; cancelling a booked one (0016), or
 * withdrawing the request. Moving one, joining the session room and rating
 * a session aren't real yet, so they aren't offered.
 */
function LiveClientSchedule({ rel }: { rel: MemberRelationshipView | null }) {
  const t = useT();
  const fmt = useFormat();
  const nav = useAppStore((s) => s.nav);
  const heroGrad = 'var(--hero-grad)';
  const coachId = rel?.coach.id ?? null;

  const load = useRemoteLoad<MemberSchedule>(`member-schedule:${rel?.clientId ?? ''}`, !!rel && !!coachId, async () => {
    const result = await fetchMemberSchedule(rel!.clientId, coachId!);
    return result.ok ? { ok: true, data: result.data } : { ok: false };
  });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<MessageKey | null>(null);
  // Asking to move the upcoming session (0017): the picker, and the
  // request (or withdrawing it) on its way.
  const [showMove, setShowMove] = useState(false);
  const [moveDay, setMoveDay] = useState(0);
  const [moveSlot, setMoveSlot] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<MessageKey | null>(null);

  if (!rel || !coachId) {
    return (
      <div className="phone-frame client-schedule-screen">
        <div className="client-schedule-hero" style={{ background: heroGrad }}>
          <HeroTop coachName={null} />
        </div>
        <div className="client-schedule-scroll">
          <NoCoachYet />
        </div>
        <MemberTabBar />
      </div>
    );
  }
  if (load.status === 'loading') return <LoadState status="loading" />;
  if (load.status === 'error') return <LoadState status="error" onRetry={load.retry} />;

  const { upcoming, started, move, request, history, hours } = load.data;
  const coachName = rel.coach.name;
  // A booked session first; a request waiting on the coach otherwise.
  const shown = upcoming ?? request;
  const isPending = !upcoming && !!request;
  const sessionTypeLabel = shown ? t(TYPE_LABEL_KEYS[getSessionTypeInfo(shown.sessionType).key]) : '';

  // Cancelling inside the grace window uses a package credit — 0016 does
  // that when one is left and the session isn't a free intro, so the
  // confirmation says so only then.
  const graceHours = getCancellationPolicy().graceHours;
  const hoursUntil = upcoming ? (upcoming.startWallMs - wallNowMs()) / 3600000 : null;
  const cancelForfeitsCredit = !!upcoming && hoursUntil != null && hoursUntil < graceHours
    && upcoming.sessionType !== 'intro' && !!rel.pkg && rel.pkg.remaining > 0;

  // Moving is a request the coach confirms (0017), with the same 12 hours'
  // notice the demo asks for. One at a time: while one waits, the member
  // can withdraw it.
  const canAskToMove = !!upcoming?.blockId && !move && hoursUntil != null && hoursUntil >= graceHours;
  const moveTooLate = !!upcoming && !move && hoursUntil != null && hoursUntil < graceHours;

  // The next two weeks of the coach's hours, on the hour, each slot long
  // enough for this session and still ahead. Members can't see the coach's
  // bookings, so a clash is refused when the coach accepts.
  const todayWallMs = wallTodayMs();
  const nowMs = wallNowMs();
  const lengthH = upcoming ? (upcoming.endWallMs - upcoming.startWallMs) / 3600000 : 50 / 60;
  const moveDays = Array.from({ length: 14 }, (_, i) => {
    const dayMs = todayWallMs + i * 86400000;
    const day = hours[weekdayOf(dayMs)];
    const slots: number[] = [];
    if (day?.enabled) {
      for (let h = day.startH; h + lengthH <= day.endH + 1e-9; h += 1) {
        const ms = dayMs + Math.round(h * 3600000);
        if (ms > nowMs && ms !== upcoming?.startWallMs) slots.push(ms);
      }
    }
    return { dayMs, slots };
  });

  function openMove() {
    const first = moveDays.findIndex((d) => d.slots.length > 0);
    setMoveDay(first >= 0 ? first : 0);
    setMoveSlot(null);
    setMoveError(null);
    setShowMove(true);
  }

  async function confirmMove() {
    if (moving || moveSlot == null || !upcoming?.blockId || load.status !== 'ready') return;
    setMoving(true);
    setMoveError(null);
    const result = await sendMoveRequest({ coachId: coachId!, blockId: upcoming.blockId, startWallMs: moveSlot });
    setMoving(false);
    if (!result.ok) {
      setMoveError(result.code === 'blocked' ? 'clientScheduleMoveRefused' : result.code === 'gone' ? 'clientScheduleMoveAlreadyAsked' : 'requestFailedRetry');
      if (result.code !== 'unknown') void load.reload();
      return;
    }
    setShowMove(false);
    load.set({ ...load.data, move: { id: '', startWallMs: moveSlot } });
    void load.reload();
  }

  async function withdrawMove() {
    if (moving || !move || load.status !== 'ready') return;
    setMoving(true);
    setMoveError(null);
    const result = await withdrawSessionRequest(move.id);
    setMoving(false);
    // Already answered: re-read, so the card shows what the coach did.
    if (!result.ok && result.code !== 'gone') {
      setMoveError('requestFailedRetry');
      return;
    }
    if (result.ok) load.set({ ...load.data, move: null });
    void load.reload();
  }

  function openCancel() {
    setCancelError(null);
    setShowCancelConfirm(true);
  }

  async function confirmCancel() {
    if (cancelling || load.status !== 'ready') return;
    setCancelling(true);
    setCancelError(null);
    let error: MessageKey | null = null;
    if (upcoming) {
      const result = await memberCancelSession(upcoming.sessionId);
      if (!result.ok) error = result.code === 'gone' ? 'scheduleBookingGone' : result.code === 'passed' ? 'scheduleSessionStarted' : 'requestFailedRetry';
    } else if (request) {
      const result = await withdrawSessionRequest(request.id);
      if (!result.ok) error = result.code === 'gone' ? 'notificationsRequestGone' : 'requestFailedRetry';
    }
    setCancelling(false);
    if (error) {
      setCancelError(error);
      // Changed elsewhere: re-read, so what's shown is what's there.
      if (error !== 'requestFailedRetry') void load.reload();
      return;
    }
    setShowCancelConfirm(false);
    load.set(upcoming ? { ...load.data, upcoming: null } : { ...load.data, request: null });
    // The next session, if any, and Home's next session and package.
    void load.reload();
    const member = useMemberStore.getState();
    if (member.userId) void member.refresh(member.userId);
  }

  // The call that is open now: about to start, or under way. `upcoming` is
  // strictly in the future, so once a session begins it is `started` that
  // keeps its Join, until 30 minutes after it ends (videoData.ts).
  const live = [started, upcoming].find((x) => x && canOfferJoin(x.startWallMs, x.endWallMs, wallNowMs())) ?? null;
  const joinButton = live && (
    <button
      type="button"
      className="client-schedule-join"
      onClick={() => nav({ screen: 'sessionRoom', params: { sessionId: live.sessionId, name: coachName } })}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="6" width="15" height="12" rx="2.5" />
        <path d="M22 8.5l-5 3.5 5 3.5v-7z" />
      </svg>
      {t('clientScheduleJoinSession')}
    </button>
  );

  return (
    <div className="phone-frame client-schedule-screen">
      <div className="client-schedule-hero" style={{ background: heroGrad }}>
        <HeroTop coachName={coachName} />

        {shown ? (
          <div className="client-schedule-upcoming">
            <button type="button" className="client-schedule-upcoming-card" onClick={() => nav('clientCoach')}>
              <span className="client-schedule-upcoming-icon">
                <ScheduleIcon size={20} color="#FFFFFF" />
              </span>
              <span className="client-schedule-upcoming-body">
                <span className="client-schedule-upcoming-head">
                  <span className="client-schedule-upcoming-label">{t('clientScheduleUpcoming')}</span>
                  <span className={`client-schedule-status client-schedule-status-${isPending ? 'pending' : 'confirmed'}`}>
                    {isPending ? t('clientSchedulePending') : t('clientScheduleConfirmed')}
                  </span>
                </span>
                <span className="client-schedule-upcoming-when">
                  <bdi>{fmt.slot(shown.startWallMs)}</bdi>
                </span>
                <span className="client-schedule-upcoming-type">{sessionTypeLabel}</span>
              </span>
              <span className="client-schedule-upcoming-chevron">
                <ArrowForwardIcon size={16} color="#FFFFFF" />
              </span>
            </button>

            {joinButton}

            {move && (
              <div className="client-schedule-move-note" role="status">
                {t('clientScheduleMoveWaiting', { when: fmt.slot(move.startWallMs), coach: coachName })}
              </div>
            )}
            {moveError && !showMove && <div className="client-schedule-move-note client-schedule-move-error" role="alert">{t(moveError)}</div>}

            <div className="client-schedule-actions">
              {canAskToMove && (
                <button type="button" className="client-schedule-action" onClick={openMove}>
                  {t('clientScheduleReschedule')}
                </button>
              )}
              {moveTooLate && (
                <div className="client-schedule-action-blocked">{t('clientScheduleRescheduleTooLate', { hours: graceHours })}</div>
              )}
              {move && (
                // Its id arrives with the re-read after asking.
                <button type="button" className="client-schedule-action" disabled={moving || !move.id} onClick={() => void withdrawMove()}>
                  {t('clientScheduleWithdrawMove')}
                </button>
              )}
              <button type="button" className="client-schedule-action" onClick={openCancel}>
                {isPending ? t('clientScheduleWithdrawRequest') : t('clientScheduleCancelSession')}
              </button>
            </div>
          </div>
        ) : (
          <div className="client-schedule-empty-upcoming">
            <span className="client-schedule-empty-icon">
              <ScheduleIcon size={20} color="#FFFFFF" />
            </span>
            <div className="client-schedule-empty-title">{t('clientScheduleNoUpcomingTitle')}</div>
            <div className="client-schedule-empty-sub">{t('clientScheduleNoUpcomingSub')}</div>
            {joinButton}
          </div>
        )}
      </div>

      <div className="client-schedule-scroll">
        <div className="client-schedule-section">
          <h2 className="client-schedule-h2">{t('clientScheduleHistory')}</h2>
          {history.length > 0 ? (
            history.map((s) => {
              const noteKey = s.attendance ? ATTENDANCE_NOTE_KEYS[s.attendance] : undefined;
              return (
                <div key={s.id} className="client-schedule-history-row">
                  <span className={`client-schedule-history-icon${noteKey ? ' client-schedule-history-icon-amber' : ''}`}>
                    {noteKey ? <WarningIcon size={16} color="var(--amber)" /> : <CheckIcon size={16} color="var(--green)" />}
                  </span>
                  <div className="client-schedule-history-body">
                    <div className="client-schedule-history-date"><bdi>{fmt.date(s.atWallMs)}</bdi></div>
                    <div className="client-schedule-history-note">
                      <bdi>{s.recap.trim() || t(noteKey ?? 'clientScheduleDefaultNote')}</bdi>
                    </div>
                  </div>
                  {/* A missed session isn't one to rate (step 6). */}
                  {s.rating !== null ? (
                    <span className="client-schedule-rated" aria-label={t('rateCoachStarLabel', { n: s.rating })}>
                      {'★'.repeat(s.rating)}
                    </span>
                  ) : s.attendance !== 'no_show' && (
                    <button
                      type="button"
                      className="client-schedule-rate"
                      onClick={() => nav({ screen: 'rateCoach', params: { sessionId: s.id } })}
                    >
                      {t('clientScheduleRate')}
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="client-schedule-no-history">{t('clientScheduleNoHistory')}</div>
          )}
        </div>

        {/* The coach's own page books a real request: their hours, their
            offerings, one open request at a time. */}
        <button
          type="button"
          className="client-schedule-request"
          onClick={() => nav({ screen: 'coachPreview', params: { coachId } })}
        >
          {t('clientScheduleRequestSession')}
        </button>
      </div>

      {showCancelConfirm && (
        <div className="client-schedule-overlay">
          <div className="client-schedule-dialog" role="dialog" aria-modal="true">
            <span className="client-schedule-dialog-icon">
              <WarningIcon size={20} color="var(--red)" />
            </span>
            <div className="client-schedule-dialog-title">
              {isPending ? t('clientScheduleWithdrawTitle') : t('clientScheduleConfirmTitle')}
            </div>
            <p className="client-schedule-dialog-body">
              {isPending ? t('clientScheduleWithdrawBody', { coach: coachName }) : t('clientScheduleConfirmBody', { coach: coachName })}
            </p>
            {cancelForfeitsCredit && (
              <p className="client-schedule-dialog-warn">{t('clientScheduleConfirmForfeit', { hours: graceHours })}</p>
            )}
            {cancelError && <p className="client-schedule-dialog-warn" role="alert">{t(cancelError)}</p>}
            <div className="client-schedule-dialog-actions">
              {/* Disabled while the cancel is on its way, so its answer
                  always lands in this dialog. */}
              <button type="button" className="client-schedule-dialog-keep" disabled={cancelling} onClick={() => setShowCancelConfirm(false)}>
                {t('clientScheduleKeepSession')}
              </button>
              <button type="button" className="client-schedule-dialog-cancel" disabled={cancelling} onClick={() => void confirmCancel()}>
                {t('clientScheduleYesCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMove && (
        <div className="client-schedule-overlay client-schedule-overlay-bottom">
          <div className="client-schedule-sheet" role="dialog" aria-modal="true">
            <div className="client-schedule-sheet-top">
              <div className="client-schedule-sheet-title">{t('clientScheduleRescheduleTitle')}</div>
              <button type="button" className="client-schedule-sheet-close" aria-label={t('clientScheduleCancelReschedule')} disabled={moving} onClick={() => setShowMove(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="client-schedule-sheet-hint">{t('clientScheduleMoveInstructions', { coach: coachName })}</p>

            {[0, 1].map((w) => (
              <div key={w} className="client-schedule-days client-schedule-days-week">
                {moveDays.slice(w * 7, w * 7 + 7).map((d, j) => {
                  const i = w * 7 + j;
                  const selected = i === moveDay;
                  return (
                    <button
                      key={d.dayMs}
                      type="button"
                      className={`client-schedule-day${selected ? ' client-schedule-day-on' : ''}`}
                      disabled={d.slots.length === 0}
                      aria-pressed={selected}
                      onClick={() => { setMoveDay(i); setMoveSlot(null); }}
                    >
                      <span className="client-schedule-day-dow">{t(dayKey('dowShort', weekdayOf(d.dayMs)))}</span>
                      <span className="client-schedule-day-num">{new Date(d.dayMs).getUTCDate()}</span>
                    </button>
                  );
                })}
              </div>
            ))}

            <div className="client-schedule-slots-wrap">
              {moveDays[moveDay].slots.length > 0 ? (
                <div className="client-schedule-slots">
                  {moveDays[moveDay].slots.map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      className={`client-schedule-slot${moveSlot === ms ? ' client-schedule-slot-on' : ''}`}
                      aria-pressed={moveSlot === ms}
                      onClick={() => setMoveSlot(ms)}
                    >
                      {fmt.time(ms)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="client-schedule-no-slots">{t('clientScheduleRescheduleNoSlots')}</div>
              )}
            </div>

            {moveError && <div className="client-schedule-sheet-error" role="alert">{t(moveError)}</div>}

            <div className="client-schedule-sheet-actions">
              <button type="button" className="client-schedule-sheet-cancel" disabled={moving} onClick={() => setShowMove(false)}>
                {t('clientScheduleCancelReschedule')}
              </button>
              <button
                type="button"
                className="client-schedule-sheet-confirm"
                disabled={moveSlot === null || moving}
                onClick={() => void confirmMove()}
              >
                {t('clientScheduleSendMove')}
              </button>
            </div>
          </div>
        </div>
      )}

      <MemberTabBar />
    </div>
  );
}
