import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { CheckIcon, CloseIcon, ScheduleIcon, WarningIcon } from '../components/icons';
import {
  getClient, getCoachProfile, getAvailabilityForDayIndex, getCustomBlocks,
  getPackageStatus, getSessionTypeInfo, getSelectedOfferingId, getOffering,
  addCustomBlock, addPayment, chargeCredit, formatDate, canInteract,
  blockDayIndex, blockStartH, getMonthGrid, type SessionType,
} from '../lib/mockStore';
import './ClientBooking.css';

const CLIENT_ID = 'sara';

// The one fictional week the whole app's calendar lives on: Wednesday is
// "today" and the hour is late afternoon, matching Schedule's own
// TODAY_INDEX so both sides agree on what has already passed.
const TODAY_INDEX = 2;
const CURRENT_HOUR = 17;
// Dates shown on the day strip. Same October week Schedule renders.
const DATE_NUMS = [20, 21, 22, 23, 24, 25, 26];
const ICS_YEAR = 2025;
const ICS_MONTH = 9; // zero-based: October

// Bookable slots are 45 minutes apart; how long the session actually runs
// comes from the type the member picks.
const SLOT_STEP = 0.75;

// A single session, for a member with no package credit left. Follows
// CoachPreview's precedent of a local constant — there is no price field on
// the relationship yet, and this is the same number shown there.
const SESSION_PRICE = 750;

const TYPE_CHIPS: { key: SessionType; chipKey: MessageKey; labelKey: MessageKey }[] = [
  { key: 'intro', chipKey: 'clientBookingTypeIntro', labelKey: 'clientBookingTypeLabelIntro' },
  { key: 'short', chipKey: 'clientBookingTypeShort', labelKey: 'clientBookingTypeLabelShort' },
  { key: 'standard', chipKey: 'clientBookingTypeStandard', labelKey: 'clientBookingTypeLabelStandard' },
];

function hourLabel(h: number, am: string, pm: string): string {
  const period = h >= 12 ? pm : am;
  const hh = Math.floor(h) % 12 || 12;
  const mins = Math.round((h % 1) * 60);
  return `${hh}:${String(mins).padStart(2, '0')} ${period}`;
}

export default function ClientBooking() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const isAr = lang === 'ar';

  const [day, setDay] = useState(TODAY_INDEX);
  const [slot, setSlot] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>('standard');
  const [paid, setPaid] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const profile = getCoachProfile();
  const client = getClient(CLIENT_ID);
  const coachName = profile.name || 'Yasmin El-Sayed';

  const AM = isAr ? 'صباحًا' : 'AM';
  const PM = isAr ? 'مساءً' : 'PM';
  const dayNames = [0, 1, 2, 3, 4, 5, 6].map((i) => t(dayKey('dowShort', i)));
  const monthLabel = isAr ? 'أكتوبر' : 'Oct';
  const { money } = useFormat();

  // Checked before the picker renders, not only at confirm: a blocked
  // relationship or a suspended account on either side must never get as
  // far as choosing a time.
  const allowed = canInteract(CLIENT_ID);

  const pkg = getPackageStatus(CLIENT_ID);
  const hasCredit = pkg.remaining > 0 && !pkg.isExpired;
  const requiresPayment = !hasCredit;

  // Read-only context: which offering the member picked before getting
  // here, via the same handoff PreviewProfile and CoachPreview use.
  const offeringId = getSelectedOfferingId();
  const offering = offeringId ? getOffering(offeringId) : undefined;

  // The Pro's real weekly availability — the same source their own
  // Availability and Schedule screens read, so the times offered here can
  // never be ones they are not open for.
  const openBlocks = getAvailabilityForDayIndex(day);
  const rawSlots: number[] = [];
  openBlocks.forEach((block) => {
    for (let h = block.startH; h + SLOT_STEP <= block.endH + 0.001; h += SLOT_STEP) {
      rawSlots.push(h);
    }
  });

  // Slots already taken. The prototype struck out a fixed index so that a
  // booked slot would always be visible in a mockup; this reads the real
  // blocks instead, using mockStore's own day/hour helpers so it agrees
  // with what the coach's Schedule shows. A member should not be told a
  // free time is taken.
  const takenHours = new Set(
    getCustomBlocks()
      .filter((b) => b.kind === 'pending' || b.kind === 'booked')
      .map((b) => `${blockDayIndex(b)}@${blockStartH(b)}`),
  );

  const sessionMins = getSessionTypeInfo(sessionType).minutes;
  const slotEnd = slot !== null ? slot + sessionMins / 60 : null;
  const slotRange = slot !== null && slotEnd !== null
    ? `${hourLabel(slot, AM, PM)} – ${hourLabel(slotEnd, AM, PM)}`
    : '';

  const canConfirm = slot !== null && (hasCredit || paid);
  const selectedDayLabel = `${dayNames[day]}, ${monthLabel} ${DATE_NUMS[day]}`;

  // The whole month, so a member can see where they are rather than
  // scrolling a seven-day strip. Only the seven days the app actually has
  // data for are bookable — the same limitation the coach's own Schedule
  // month view shows, and the hint under the grid says so rather than
  // leaving dead cells unexplained.
  const monthCells = getMonthGrid();
  // A dot marks a day the Pro is open on at all, so the open days are
  // visible without tapping each one.
  const openByDayIndex = [0, 1, 2, 3, 4, 5, 6].map((i) => getAvailabilityForDayIndex(i).length > 0);

  function icsHref(): string {
    if (slot === null || slotEnd === null) return '';
    const start = new Date(ICS_YEAR, ICS_MONTH, DATE_NUMS[day], Math.floor(slot), Math.round((slot % 1) * 60));
    const end = new Date(start.getTime() + sessionMins * 60000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const typeLabel = t(TYPE_CHIPS.find((c) => c.key === sessionType)?.labelKey ?? 'clientBookingTypeLabelStandard');
    const body = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      `SUMMARY:${typeLabel} — ${coachName}`,
      `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\n');
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
  }

  function confirmBooking() {
    if (!canConfirm || !allowed || slot === null || slotEnd === null) return;

    // A pending block — exactly what the coach's Schedule already knows how
    // to confirm or decline. No second request mechanism.
    addCustomBlock({
      clientId: CLIENT_ID,
      kind: 'pending',
      label: `${client?.name || 'Sara Ahmed'} · Requested`,
      dayIndex: day,
      startH: slot,
      endH: slotEnd,
      sessionType,
    });

    if (requiresPayment) {
      // 'pending', not settled: a real card charge confirms asynchronously
      // through Paymob.
      addPayment(CLIENT_ID, {
        id: `pay${Date.now().toString(36)}`,
        amount: SESSION_PRICE,
        method: 'Card',
        status: 'pending',
        // Stored on the payment row, so it stays language-independent:
      // see formatDate's note in mockStore.
      date: formatDate(Date.now()),
      });
    } else {
      // Spend the credit the confirmation says this session uses. Without
      // this the "N sessions left after this one" line would be a lie the
      // moment the member looked at their package again.
      chargeCredit(CLIENT_ID);
    }

    setConfirmed(true);
  }

  if (!allowed) {
    return (
      <div className="phone-frame client-booking-screen">
        <div className="client-booking-blocked">
          <span className="client-booking-blocked-icon">
            <WarningIcon size={24} color="var(--red)" />
          </span>
          <h1 className="client-booking-blocked-title">{t('clientBookingCannotTitle')}</h1>
          <p className="client-booking-blocked-body">
            {t('clientBookingCannotBody', { coach: coachName })}
          </p>
          <button type="button" className="client-booking-primary" onClick={back}>
            {t('clientBookingDone')}
          </button>
        </div>
      </div>
    );
  }

  if (confirmed) {
    const href = icsHref();
    const typeLabel = t(TYPE_CHIPS.find((c) => c.key === sessionType)?.labelKey ?? 'clientBookingTypeLabelStandard');
    return (
      <div className="phone-frame client-booking-screen">
        <div className="client-booking-confirmed">
          <span className="client-booking-tick">
            <CheckIcon size={28} color="#FFFFFF" />
          </span>
          <h1 className="client-booking-confirmed-title">{t('clientBookingRequestSent')}</h1>
          <p className="client-booking-confirmed-sub">
            {t('clientBookingWillConfirm', { coach: coachName })}
          </p>

          <div className="client-booking-receipt">
            <div className="client-booking-receipt-row">
              <span>{t('clientBookingCoachLabel')}</span><strong>{coachName}</strong>
            </div>
            <div className="client-booking-receipt-row">
              <span>{t('clientBookingDateLabel')}</span><strong>{selectedDayLabel}</strong>
            </div>
            <div className="client-booking-receipt-row">
              <span>{t('clientBookingTimeLabel')}</span><strong>{slotRange}</strong>
            </div>
            <div className="client-booking-receipt-row">
              <span>{t('clientBookingTypeLabel')}</span><strong>{typeLabel}</strong>
            </div>
          </div>

          <p className="client-booking-note">
            {requiresPayment
              ? t('clientBookingPaymentPendingNote', { coach: coachName })
              : t('clientBookingCreditUsedNote')}
          </p>
          <p className="client-booking-note">{t('clientBookingPendingNote', { coach: coachName })}</p>

          {href && (
            <a className="client-booking-secondary" href={href} download="session.ics">
              <ScheduleIcon size={16} color="currentColor" />
              {t('clientBookingAddToCalendar')}
            </a>
          )}
          <button type="button" className="client-booking-primary" onClick={() => nav('clientCoach')}>
            {t('clientBookingDone')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-frame client-booking-screen">
      <div className="client-booking-top">
        <button type="button" className="client-booking-close" aria-label={t('clientBookingCancel')} onClick={back}>
          <CloseIcon size={14} color="currentColor" />
        </button>
        <h1 className="client-booking-title">{t('clientBookingTitle')}</h1>
        <button
          type="button"
          className="client-booking-lang"
          aria-label={t('switchLanguage')}
          onClick={() => setLang(isAr ? 'en' : 'ar')}
        >
          {isAr ? 'EN' : 'ع'}
        </button>
      </div>

      <div className="client-booking-scroll">
        <p className="client-booking-instructions">
          {t('clientBookingInstructions', { coach: coachName })}
        </p>

        {offering && (
          <div className="client-booking-offering">
            {t('clientBookingOffering', { name: offering.name })}
          </div>
        )}

        <div className="client-booking-month">
          <div className="client-booking-month-label">{t('clientBookingMonthLabel')}</div>
          {/* Full short names, not initials. Schedule's month grid uses
              first characters, which works in English but not in Arabic:
              إثنين and أحد reduce to the same letter, so the columns stop
              being distinguishable. These fit at this size in both. */}
          <div className="client-booking-weekdays" aria-hidden="true">
            {dayNames.map((dow) => (
              <div key={dow} className="client-booking-weekday">{dow}</div>
            ))}
          </div>
          <div className="client-booking-grid">
            {monthCells.map((cell, i) => {
              const live = cell.dayIndex !== null;
              const past = live && cell.dayIndex! < TODAY_INDEX;
              const bookable = live && !past;
              const selected = live && cell.dayIndex === day;
              return (
                <button
                  key={i}
                  type="button"
                  className={[
                    'client-booking-cell',
                    selected ? 'client-booking-cell-on' : '',
                    bookable ? 'client-booking-cell-open' : '',
                    cell.inMonth ? '' : 'client-booking-cell-outside',
                  ].filter(Boolean).join(' ')}
                  disabled={!bookable}
                  aria-pressed={selected}
                  aria-label={bookable
                    ? `${t('clientBookingMonthLabel')} ${cell.day}${openByDayIndex[cell.dayIndex!] ? '' : ` — ${t('clientBookingMonthClosed')}`}`
                    : `${cell.day} — ${past ? t('clientBookingLegendPassed') : t('clientBookingMonthClosed')}`}
                  onClick={() => { if (cell.dayIndex !== null) { setDay(cell.dayIndex); setSlot(null); } }}
                >
                  {cell.day}
                  {bookable && openByDayIndex[cell.dayIndex!] && <span className="client-booking-cell-dot" />}
                </button>
              );
            })}
          </div>
          <div className="client-booking-month-hint">{t('clientBookingMonthHint')}</div>
        </div>

        <div className="client-booking-selected">{selectedDayLabel}</div>

        <div className="client-booking-types" role="group" aria-label={t('clientBookingTypeLabel')}>
          {TYPE_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`client-booking-type${sessionType === chip.key ? ' client-booking-type-on' : ''}`}
              aria-pressed={sessionType === chip.key}
              onClick={() => setSessionType(chip.key)}
            >
              {t(chip.chipKey)}
            </button>
          ))}
        </div>

        {rawSlots.length > 0 ? (
          <>
            <div className="client-booking-slots">
              {rawSlots.map((h) => {
                const taken = takenHours.has(`${day}@${h}`);
                const passed = day === TODAY_INDEX && h < CURRENT_HOUR;
                const disabled = taken || passed;
                return (
                  <button
                    key={h}
                    type="button"
                    className={`client-booking-slot${slot === h ? ' client-booking-slot-on' : ''}${disabled ? ' client-booking-slot-off' : ''}${taken ? ' client-booking-slot-taken' : ''}`}
                    disabled={disabled}
                    aria-pressed={slot === h}
                    aria-label={taken
                      ? `${hourLabel(h, AM, PM)} — ${t('clientBookingLegendBooked')}`
                      : passed ? `${hourLabel(h, AM, PM)} — ${t('clientBookingLegendPassed')}` : undefined}
                    onClick={() => setSlot(h)}
                  >
                    {hourLabel(h, AM, PM)}
                  </button>
                );
              })}
            </div>

            <div className="client-booking-legend">
              <span><i className="client-booking-dot client-booking-dot-free" />{t('clientBookingLegendAvailable')}</span>
              <span><i className="client-booking-dot client-booking-dot-taken" />{t('clientBookingLegendBooked')}</span>
              <span><i className="client-booking-dot client-booking-dot-passed" />{t('clientBookingLegendPassed')}</span>
            </div>
          </>
        ) : (
          <div className="client-booking-empty">
            <div className="client-booking-empty-title">{t('clientBookingNoAvailability')}</div>
            <div className="client-booking-empty-body">
              {t('clientBookingTryAnotherDay', { coach: coachName })}
            </div>
          </div>
        )}

        {slot !== null && (
          hasCredit ? (
            <div className="client-booking-credit">
              <div className="client-booking-credit-title">{t('clientBookingUsesCreditTitle')}</div>
              <div className="client-booking-credit-body">
                {t('clientBookingCreditRemaining', { n: Math.max(0, pkg.remaining - 1) })}
              </div>
            </div>
          ) : (
            <div className="client-booking-pay-box">
              <div className="client-booking-pay-title">{t('clientBookingPaymentTitle')}</div>
              {paid ? (
                <div className="client-booking-paid">
                  <CheckIcon size={14} color="var(--green)" />
                  {t('clientBookingPaymentReady')}
                </div>
              ) : (
                <button type="button" className="client-booking-pay" onClick={() => setPaid(true)}>
                  {t('clientBookingPayWithCard')} · {money(SESSION_PRICE)}
                </button>
              )}
              <p className="client-booking-demo-note">{t('clientBookingPaymentDemoNote')}</p>
            </div>
          )
        )}
      </div>

      <div className="client-booking-bar">
        <button
          type="button"
          className="client-booking-primary"
          disabled={!canConfirm}
          onClick={confirmBooking}
        >
          {slot !== null
            ? t('clientBookingRequest', { time: hourLabel(slot, AM, PM) })
            : t('clientBookingSelectTime')}
        </button>
      </div>
    </div>
  );
}
