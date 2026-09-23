import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey, type MessageKey } from '../lib/i18n';
import { darken } from '../lib/color';
import {
  MoonIcon, SunIcon, ArrowForwardIcon, CheckIcon, ScheduleIcon, WarningIcon,
  SearchIcon, HomeIcon, ProgramsIcon, TasksIcon, PersonIcon,
} from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import {
  getClient, getCoachProfile, getCustomBlocks, getAvailabilityForDayIndex,
  getRescheduleEligibility, getCancellationPolicy, rescheduleBooking, cancelBooking,
  getMemberSessions, getRecapForMember, getRatings, getSessionTypeInfo,
  getActiveSession, isSessionToday, updateClient,
  blockDayIndex, blockStartH, blockEndH,
  type CustomBlock, type SessionType,
} from '../lib/mockStore';
import './ClientSchedule.css';

const CLIENT_ID = 'sara';
// Same fixed fictional week every other screen's calendar math anchors to:
// Wednesday is "today", so Mon/Tue have already passed.
const TODAY_INDEX = 2;
const DATE_NUMS = [20, 21, 22, 23, 24, 25, 26];
// Bookable slots are 45 minutes apart — the same step ClientBooking offers,
// reused here rather than re-approximated so the reschedule picker can
// never offer a time the booking screen wouldn't.
const SLOT_STEP = 0.75;

const ACCENT_HEX = '#B75C3D';

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

export default function ClientSchedule() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
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
  const heroGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 40)} 100%)`;

  const AM = isAr ? 'صباحًا' : 'AM';
  const PM = isAr ? 'مساءً' : 'PM';

  // A confirmed session lives on the client record (the same `nextSession`
  // field ClientHome and the coach's Main already read); a pending one is
  // the real `pending` time block ClientBooking wrote. Matched by clientId
  // rather than by a substring of the label — the block carries the id.
  const myBlocks = getCustomBlocks().filter((b) => b.clientId === CLIENT_ID);
  const pendingBlock = myBlocks.find((b) => b.kind === 'pending') ?? null;
  const bookedBlock = myBlocks.find((b) => b.kind === 'booked') ?? null;

  const nextSessionRaw = client?.nextSession || '';
  const hasConfirmedSession = !!nextSessionRaw
    && nextSessionRaw !== 'No upcoming session'
    && nextSessionRaw !== 'Program completed';
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
  // A confirmed session is `client.nextSession`, which the store holds as a
  // pre-composed English display string ("Next: Today, 10:00 AM") that
  // ClientHome and the coach's Main render the same way. Localizing that is
  // a data-model change across every screen that reads the field, not
  // something to fake here.
  const upcomingDay = isPending && pendingBlock
    ? t(dayKey('dowFull', blockDayIndex(pendingBlock)))
    : hasConfirmedSession ? nextSessionRaw.replace(/^Next:\s*/, '') : '';
  const upcomingStart = isPending && pendingBlock ? hourLabel(blockStartH(pendingBlock), AM, PM) : '';
  const upcomingEnd = isPending && pendingBlock ? hourLabel(blockEndH(pendingBlock), AM, PM) : '';

  const sessionTypeKey: SessionType = isPending
    ? (pendingBlock?.sessionType ?? 'standard')
    : (client?.nextSessionType ?? 'standard');
  const sessionTypeLabel = t(TYPE_LABEL_KEYS[getSessionTypeInfo(sessionTypeKey).key]);

  const sessionToday = isSessionToday(nextSessionRaw);
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
      date: s.date,
      note: recap || t('clientScheduleDefaultNote'),
      rated: rated ? rated.rating : null,
    };
  });

  // ---- reschedule picker ---------------------------------------------------

  const pickerDay = rescheduleDay ?? (activeBlock ? blockDayIndex(activeBlock) : TODAY_INDEX);
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
      updateClient(CLIENT_ID, { nextSession: 'No upcoming session' });
    }
    setShowCancelConfirm(false);
    refresh();
  }

  const navItems: BottomNavItem[] = [
    { key: 'discover', label: t('discoverNav'), icon: SearchIcon, screen: 'discover' },
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'clientHome' },
    { key: 'programs', label: t('myProgramsNav'), icon: ProgramsIcon, screen: 'myPrograms' },
    { key: 'tasks', label: t('clientTasksNav'), icon: TasksIcon, screen: 'clientTasks' },
    { key: 'schedule', label: t('clientScheduleNav'), icon: ScheduleIcon, screen: 'clientSchedule' },
    { key: 'coach', label: t('clientCoachNav'), icon: PersonIcon, screen: 'clientCoach' },
  ];

  return (
    <div className="phone-frame client-schedule-screen">
      <div className="client-schedule-hero" style={{ background: heroGrad }}>
        <div className="client-schedule-hero-top">
          <div>
            <h1 className="client-schedule-title">{t('clientScheduleTitle')}</h1>
            <div className="client-schedule-subtitle">{t('clientScheduleWithCoach', { coach: coachName })}</div>
          </div>
          <div className="client-schedule-hero-actions">
            <button
              type="button"
              className="client-schedule-hero-btn"
              aria-label={t('switchLanguage')}
              onClick={() => setLang(isAr ? 'en' : 'ar')}
            >
              {isAr ? 'EN' : 'ع'}
            </button>
            <button
              type="button"
              className="client-schedule-hero-btn"
              aria-label={t('toggleDarkMode')}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
          </div>
        </div>

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
                const past = i < TODAY_INDEX;
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
                    <span className="client-schedule-day-num">{DATE_NUMS[i]}</span>
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

      <BottomNav items={navItems} />
    </div>
  );
}
