import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey, type MessageKey } from '../lib/i18n';
import { darken } from '../lib/color';
import { ChevronIcon, CheckIcon, StarIcon, MessageIcon, ScheduleIcon } from '../components/icons';
import { SPECIALTIES } from '../lib/specialties';
import {
  getDirectoryCoach, getFavouriteCoaches, toggleFavouriteCoach,
  initialsOf, countryFlagOf, requestSession, type DirectoryCoach,
} from '../lib/directory';
import './CoachPreview.css';

// Four daily slots, matching the design's own booking grid and the hours
// Schedule.tsx already uses for the real Pro.
const TIMES = ['09:00 am', '10:00 am', '11:00 am', '02:00 pm'];
const TIME_HOURS = [9, 10, 11, 14];

/**
 * Three illustrative weeks of openings.
 *
 * These coaches have no real calendar — nothing in the app writes one for
 * anybody but the signed-in Pro. Rather than show a week of uniformly
 * free slots (which would imply availability nobody has stated), each
 * week carries a plausible, uneven pattern including one fully booked
 * day, so the empty-day state is reachable and the picker behaves like a
 * real one. `openByDay[d]` indexes into TIMES.
 */
const WEEKS = [
  { dates: [11, 12, 13, 14, 15, 16], openByDay: [[0, 1, 2, 3], [0, 1, 3], [1, 2, 3], [0, 2], [], [0, 1, 2]] },
  { dates: [18, 19, 20, 21, 22, 23], openByDay: [[0, 2, 3], [1, 2], [0, 1, 2, 3], [], [0, 3], [1, 2]] },
  { dates: [25, 26, 27, 28, 29, 30], openByDay: [[1, 2], [0, 1, 3], [2, 3], [0, 1, 2], [], [0, 2, 3]] },
];
// Which day of the visible week counts as "today" — the first week starts
// here rather than at its Monday, so the picker never offers a past slot.
const TODAY_INDEX = 2;
const MONTH = { en: 'Oct', ar: 'أكتوبر' };
// The calendar month WEEKS sits in, for the .ics export's real dates.
const ICS_YEAR = 2025;
const ICS_MONTH = 9; // zero-based: October

/** One slot per day is shown already taken, so a booked slot is visible. */
function bookedPos(open: number[]): number {
  return open.length > 1 ? 1 : -1;
}

interface Slot { week: number; day: number; time: number }

/** The soonest bookable opening, or null if there is none. */
function findNextAvailable(): Slot | null {
  for (let w = 0; w < WEEKS.length; w++) {
    const startDay = w === 0 ? TODAY_INDEX : 0;
    const { openByDay } = WEEKS[w];
    for (let d = startDay; d < openByDay.length; d++) {
      const open = openByDay[d];
      const taken = bookedPos(open);
      for (let pos = 0; pos < open.length; pos++) {
        if (pos !== taken) return { week: w, day: d, time: open[pos] };
      }
    }
  }
  return null;
}

/**
 * A stable pseudo-count derived from the coach's id.
 *
 * Review and member counts are not in the directory and there is no
 * ratings store spanning coaches. Deriving them from the id keeps them
 * from re-rolling on every render — a number that changes while you look
 * at it is worse than an obviously illustrative one.
 */
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Directory languages reuse Discover's filter labels, so a language
    reads the same wherever a member meets it. */
function languageKey(language: string): MessageKey {
  if (language === 'Arabic') return 'discoverLanguageArabic';
  if (language === 'French') return 'discoverLanguageFrench';
  return 'discoverLanguageEnglish';
}

interface PreviewOffering {
  id: string;
  name: string;
  description: string;
  duration: string;
  price: number;
}

/**
 * Resolves which coach to show, so the body below can take a real one.
 *
 * Splitting it this way keeps the not-found case out of the booking
 * screen's own state: the body's hooks only ever run for a coach that
 * exists, and every closure in it can use `coach` without a guard.
 */
export default function CoachPreview() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const coachId = useAppStore((s) => s.params).coachId ?? '';
  const coach = getDirectoryCoach(coachId);

  // A coachId that names nobody means a stale link or a bad param, not a
  // crash: say so and offer the way back rather than previewing nothing.
  if (!coach) {
    return (
      <div className="phone-frame coach-preview-screen">
        <div className="coach-preview-missing">
          <div className="coach-preview-missing-text">{t('discoverNoResults')}</div>
          <button type="button" className="coach-preview-primary" onClick={() => nav('discover')}>
            {t('coachPreviewBack')}
          </button>
        </div>
      </div>
    );
  }

  // Keyed by coach so switching pros resets the booking state rather than
  // carrying one coach's chosen slot over to another's calendar.
  return <CoachPreviewBody key={coach.id} coach={coach} />;
}

function CoachPreviewBody({ coach }: { coach: DirectoryCoach }) {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const isAr = lang === 'ar';

  const nextAvailable = findNextAvailable();
  const [week, setWeek] = useState(nextAvailable?.week ?? 0);
  const [day, setDay] = useState(nextAvailable?.day ?? TODAY_INDEX);
  const [time, setTime] = useState<number | null>(nextAvailable?.time ?? null);
  const [offeringId, setOfferingId] = useState('');
  const [messaged, setMessaged] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [favourites, setFavourites] = useState(getFavouriteCoaches);

  const specDef = SPECIALTIES.find((s) => s.value === coach.specialty);
  const specialtyLabel = specDef ? t(specDef.labelKey) : coach.specialty;
  const currency = isAr ? 'جنيه' : 'EGP';
  const hash = idHash(coach.id);
  const reviewCount = 20 + (hash % 40);
  const memberCount = reviewCount + 8 + (hash % 15);
  const isFav = !!favourites[coach.id];

  // Two offerings per coach: their own priced session, and a free intro
  // call. Generated from the coach's own card rather than hand-authored,
  // so it can never describe a specialty or price they do not have.
  const offerings: PreviewOffering[] = [
    {
      id: 'main',
      name: t('coachPreviewSessionName', { specialty: specialtyLabel }),
      description: t('coachPreviewSessionDesc', { specialty: specialtyLabel }),
      duration: isAr ? '50 دقيقة' : '50 min',
      price: coach.price,
    },
    {
      id: 'intro',
      name: t('coachPreviewIntroCallName'),
      description: t('coachPreviewIntroCallDesc'),
      duration: isAr ? '20 دقيقة' : '20 min',
      price: 0,
    },
  ];
  const selectedOffering = offerings.find((o) => o.id === offeringId) ?? offerings[0];

  const { dates, openByDay } = WEEKS[week];
  const openToday = openByDay[day];
  const taken = bookedPos(openToday);
  const validSelection = time !== null
    && openToday.indexOf(time) !== -1
    && openToday.indexOf(time) !== taken;

  const monthLabel = isAr ? MONTH.ar : MONTH.en;
  const weekLabel = `${monthLabel} ${dates[0]}–${dates[dates.length - 1]}`;
  const whenLabel = validSelection ? `${t(dayKey('dowShort', day))} ${dates[day]} — ${TIMES[time!]}` : '';

  const nextLabel = nextAvailable
    ? `${t(dayKey('dowShort', nextAvailable.day))} ${WEEKS[nextAvailable.week].dates[nextAvailable.day]} — ${TIMES[nextAvailable.time]}`
    : '';
  const nextIsSelected = !!nextAvailable
    && week === nextAvailable.week && day === nextAvailable.day && time === nextAvailable.time;

  function goToWeek(delta: number) {
    const target = week + delta;
    if (target < 0 || target >= WEEKS.length) return;
    setWeek(target);
    setTime(null);
  }

  function selectNextAvailable() {
    if (!nextAvailable) return;
    setWeek(nextAvailable.week);
    setDay(nextAvailable.day);
    setTime(nextAvailable.time);
  }

  // A .ics the member can add to their own calendar. Only built for a
  // real selection — a download link to an empty event is worse than no
  // link, so the button is absent until there is something to export.
  function icsHref(): string {
    if (!validSelection) return '';
    const start = new Date(ICS_YEAR, ICS_MONTH, dates[day], TIME_HOURS[time!], 0);
    const minutes = selectedOffering.id === 'intro' ? 20 : 50;
    const end = new Date(start.getTime() + minutes * 60000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const body = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      `SUMMARY:${selectedOffering.name} — ${coach.name}`,
      `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\n');
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
  }

  function confirm() {
    if (!validSelection) return;
    requestSession({
      coachId: coach.id,
      coachName: coach.name,
      offeringId: selectedOffering.id,
      offeringName: selectedOffering.name,
      when: whenLabel,
      price: selectedOffering.price,
    });
    setConfirmed(true);
  }

  const heroGrad = `linear-gradient(135deg, ${coach.color} 0%, ${darken(coach.color, 40)} 100%)`;

  if (confirmed) {
    const href = icsHref();
    return (
      <div className="phone-frame coach-preview-screen">
        <div className="coach-preview-confirmed">
          <div className="coach-preview-tick" style={{ background: 'var(--green)' }}>
            <CheckIcon size={30} color="#FFFFFF" />
          </div>
          <h1 className="coach-preview-confirmed-title">{t('coachPreviewRequestSent')}</h1>
          <p className="coach-preview-confirmed-sub">
            {t('coachPreviewWillConfirm', { name: coach.name })}
          </p>

          <div className="coach-preview-receipt">
            <div className="coach-preview-receipt-row">
              <span>{t('coachPreviewCoachLabel')}</span>
              <strong>{coach.name}</strong>
            </div>
            <div className="coach-preview-receipt-row">
              <span>{t('coachPreviewDateLabel')}</span>
              <strong>{whenLabel}</strong>
            </div>
            <div className="coach-preview-receipt-row">
              <span>{selectedOffering.name}</span>
              <strong>
                {selectedOffering.price > 0
                  ? `${selectedOffering.price} ${currency}`
                  : t('offeringsFree')}
              </strong>
            </div>
          </div>

          <p className="coach-preview-note">
            {selectedOffering.price === 0
              ? t('coachPreviewFreeNote')
              : t('coachPreviewPendingNote', { name: coach.name })}
          </p>

          {href && (
            <a className="coach-preview-secondary" href={href} download="session.ics">
              <ScheduleIcon size={16} color="currentColor" />
              {t('coachPreviewAddToCalendar')}
            </a>
          )}
          <button type="button" className="coach-preview-primary" onClick={() => nav('discover')}>
            {t('coachPreviewDone')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-frame coach-preview-screen">
      <div className="coach-preview-scroll">
        <div className="coach-preview-hero" style={{ background: heroGrad }}>
          <div className="coach-preview-hero-top">
            <button type="button" className="coach-preview-icon-btn" aria-label={t('coachPreviewBack')} onClick={back}>
              <ChevronIcon size={16} color="#FFFFFF" />
            </button>
            <button
              type="button"
              className={`coach-preview-icon-btn${isFav ? ' coach-preview-fav-on' : ''}`}
              aria-label={isFav
                ? t('discoverFavouriteRemove', { name: coach.name })
                : t('discoverFavouriteAdd', { name: coach.name })}
              aria-pressed={isFav}
              onClick={() => setFavourites(toggleFavouriteCoach(coach.id))}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
            </button>
          </div>

          <div className="coach-preview-avatar">{initialsOf(coach.name)}</div>

          <div className="coach-preview-name-row">
            <h1 className="coach-preview-name">{coach.name}</h1>
            {coach.verified && (
              <span className="coach-preview-verified" aria-label={t('coachPreviewVerified')}>
                <CheckIcon size={11} color={coach.color} />
              </span>
            )}
          </div>
          <div className="coach-preview-specialty">{specialtyLabel}</div>
          <div className="coach-preview-where">
            <span aria-hidden="true">{countryFlagOf(coach.country)}</span> {coach.country}
            <span className="coach-preview-sep">·</span>
            {t('coachPreviewCertified', { n: coach.years })}
          </div>

          {/* Languages, not the specialty: that is already on the line
              above, and which languages a coach works in is the thing a
              member browsing cannot otherwise find out here. */}
          <div className="coach-preview-chips">
            {coach.languages.map((language) => (
              <span key={language} className="coach-preview-skill">{t(languageKey(language))}</span>
            ))}
          </div>
        </div>

        <div className="coach-preview-stats">
          <Stat value={coach.rating.toFixed(1)} label={t('coachPreviewRatingStat')} star />
          <Stat value={String(coach.years)} label={t('coachPreviewYearsStat')} />
          <Stat value={String(memberCount)} label={t('coachPreviewMembersStat')} />
        </div>

        <div className="coach-preview-body">
          <section className="coach-preview-section">
            <h2 className="coach-preview-h2">{t('coachPreviewAbout')}</h2>
            {/* Left to flow rather than clamped: this bio is a fixed
                template filled with a bounded specialty name, so it runs
                to two or three lines for every coach in both languages.
                A Read more that never has anything to reveal is worse
                than none, and an unclamped paragraph also stays readable
                for anyone using a larger text size. */}
            <p className="coach-preview-bio">
              {t('coachPreviewBio', { specialty: specialtyLabel, years: coach.years })}
            </p>
          </section>

          <button
            type="button"
            className={`coach-preview-message${messaged ? ' coach-preview-message-sent' : ''}`}
            onClick={() => setMessaged(true)}
            disabled={messaged}
          >
            {messaged ? <CheckIcon size={15} color="currentColor" /> : <MessageIcon size={15} color="currentColor" />}
            {messaged ? t('coachPreviewMessageSent') : t('coachPreviewMessage')}
          </button>

          <section className="coach-preview-section">
            <h2 className="coach-preview-h2">{t('coachPreviewOfferingsTitle')}</h2>
            {offerings.map((offering) => {
              const on = offering.id === selectedOffering.id;
              return (
                <button
                  key={offering.id}
                  type="button"
                  className={`coach-preview-offering${on ? ' coach-preview-offering-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => setOfferingId(offering.id)}
                >
                  <div className="coach-preview-offering-head">
                    <span className="coach-preview-offering-type">{t('offeringTypeSession')}</span>
                    <span className={`coach-preview-radio${on ? ' coach-preview-radio-on' : ''}`}>
                      {on && <CheckIcon size={11} color="#FFFFFF" />}
                    </span>
                  </div>
                  <div className="coach-preview-offering-name">{offering.name}</div>
                  <div className="coach-preview-offering-desc">{offering.description}</div>
                  <div className="coach-preview-offering-foot">
                    <span>{offering.duration} · {t('offeringFormatBoth')}</span>
                    <strong>
                      {offering.price > 0 ? `${offering.price} ${currency}` : t('offeringsFree')}
                    </strong>
                  </div>
                </button>
              );
            })}
          </section>

          <section className="coach-preview-section">
            <div className="coach-preview-sched-head">
              <h2 className="coach-preview-h2">{t('coachPreviewChooseTime')}</h2>
              <div className="coach-preview-week-nav">
                <button
                  type="button"
                  aria-label={t('coachPreviewPrevWeek')}
                  disabled={week === 0}
                  onClick={() => goToWeek(-1)}
                >
                  <ChevronIcon size={13} color="currentColor" />
                </button>
                <span className="coach-preview-week-label">{weekLabel}</span>
                <button
                  type="button"
                  aria-label={t('coachPreviewNextWeek')}
                  disabled={week === WEEKS.length - 1}
                  onClick={() => goToWeek(1)}
                  className="coach-preview-week-next"
                >
                  <ChevronIcon size={13} color="currentColor" />
                </button>
              </div>
            </div>

            {nextAvailable && (
              <button
                type="button"
                className={`coach-preview-next-available${nextIsSelected ? ' coach-preview-next-on' : ''}`}
                onClick={selectNextAvailable}
              >
                <div>
                  <div className="coach-preview-next-label">{t('coachPreviewNextAvailable')}</div>
                  <div className="coach-preview-next-value">{nextLabel}</div>
                </div>
                <span className="coach-preview-next-cta">
                  {nextIsSelected ? t('coachPreviewSelected') : t('coachPreviewSelect')}
                </span>
              </button>
            )}

            <div className="coach-preview-days">
              {dates.map((date, i) => (
                <button
                  key={date}
                  type="button"
                  className={`coach-preview-day${i === day ? ' coach-preview-day-on' : ''}`}
                  aria-pressed={i === day}
                  onClick={() => { setDay(i); setTime(null); }}
                >
                  <span className="coach-preview-dow">{t(dayKey('dowShort', i))}</span>
                  <span className="coach-preview-date">{date}</span>
                </button>
              ))}
            </div>

            {openToday.length > 0 ? (
              <div className="coach-preview-times">
                {openToday.map((timeIdx, pos) => {
                  const isTaken = pos === taken;
                  const on = !isTaken && time === timeIdx;
                  return (
                    <button
                      key={timeIdx}
                      type="button"
                      className={`coach-preview-time${on ? ' coach-preview-time-on' : ''}${isTaken ? ' coach-preview-time-taken' : ''}`}
                      aria-pressed={on}
                      disabled={isTaken}
                      aria-label={isTaken ? `${TIMES[timeIdx]} — ${t('coachPreviewBooked')}` : TIMES[timeIdx]}
                      onClick={() => setTime(timeIdx)}
                    >
                      {TIMES[timeIdx]}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="coach-preview-no-times">{t('coachPreviewNoAvailability')}</div>
            )}
          </section>

          <section className="coach-preview-section">
            <h2 className="coach-preview-h2">{t('coachPreviewReviewsTitle')}</h2>
            <div className="coach-preview-review">
              <div className="coach-preview-review-head">
                <span className="coach-preview-review-stars">
                  <StarIcon size={11} color="var(--amber)" />
                  {coach.rating.toFixed(1)}
                </span>
                <span className="coach-preview-review-count">
                  {t('coachPreviewReviewCount', { n: reviewCount })}
                </span>
              </div>
              <p className="coach-preview-review-quote">
                {t('coachPreviewReviewQuote', {
                  name: coach.name.split(' ')[0],
                  specialty: specialtyLabel,
                })}
              </p>
            </div>
          </section>
        </div>
      </div>

      <div className="coach-preview-bar">
        <div className="coach-preview-bar-when">
          {validSelection ? whenLabel : t('coachPreviewSelectTime')}
        </div>
        <button
          type="button"
          className="coach-preview-primary"
          disabled={!validSelection}
          onClick={confirm}
        >
          {validSelection
            ? t('coachPreviewBookOffering', { name: selectedOffering.name })
            : t('coachPreviewSelectTime')}
        </button>
      </div>
    </div>
  );
}

function Stat({ value, label, star }: { value: string; label: string; star?: boolean }) {
  return (
    <div className="coach-preview-stat">
      <div className="coach-preview-stat-value">
        {star && <StarIcon size={13} color="var(--amber)" />}
        {value}
      </div>
      <div className="coach-preview-stat-label">{label}</div>
    </div>
  );
}
