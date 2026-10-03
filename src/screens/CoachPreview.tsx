import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, dayKey, isolate, type MessageKey } from '../lib/i18n';
import { darken } from '../lib/color';
import { useFormat } from '../lib/format';
import { ChevronIcon, CheckIcon, StarIcon, MessageIcon, ScheduleIcon } from '../components/icons';
import { LoadState } from '../components/LoadState';
import { SPECIALTIES } from '../lib/specialties';
import { MIN_REVIEWS_FOR_RATING, getMonthAnchorMs } from '../lib/mockStore';
import { useRemoteSession } from '../lib/remoteSession';
import { wallNowMs, wallTodayMs } from '../lib/wallClock';
import { useRemoteLoad } from '../store/remoteLoad';
import {
  getDirectoryCoach, getFavouriteCoaches, toggleFavouriteCoach,
  initialsOf, countryFlagOf, requestSession, type DirectoryCoach,
} from '../lib/directory';
import {
  fetchCoachPreview, sendSessionRequest, weekdayOf,
  type CoachOffering, type CoachPreviewData,
} from '../lib/requestData';
import './CoachPreview.css';

// ---------------------------------------------------------------------------
// The demo's calendar (signed out)
// ---------------------------------------------------------------------------

// Four daily slots, matching the design's own booking grid and the hours
// Schedule.tsx already uses for the real Pro.
const TIME_HOURS = [9, 10, 11, 14];
const DAY_MS = 86400000;
const HOUR_MS = 3600000;

/**
 * Three illustrative weeks of openings.
 *
 * The demo's coaches have no real calendar. Rather than show a week of
 * uniformly free slots (which would imply availability nobody has stated),
 * each week carries a plausible, uneven pattern including one fully booked
 * day, so the empty-day state is reachable and the picker behaves like a
 * real one. `openByDay[d]` indexes into TIME_HOURS, Monday to Saturday.
 *
 * The weeks start at the demo week's Monday (Mon 20 Oct 2025, the same
 * week every other signed-out screen shows). They used to be fixed dates
 * from the 11th, whose weekdays were wrong: "WED 13" was a Monday.
 */
const WEEKS = [
  [[0, 1, 2, 3], [0, 1, 3], [1, 2, 3], [0, 2], [], [0, 1, 2]],
  [[0, 2, 3], [1, 2], [0, 1, 2, 3], [], [0, 3], [1, 2]],
  [[1, 2], [0, 1, 3], [2, 3], [0, 1, 2], [], [0, 2, 3]],
];
// Which day of the visible week counts as "today" — the first week starts
// here rather than at its Monday, so the picker never offers a past slot.
const TODAY_INDEX = 2;

/** One slot per day is shown already taken, so a booked slot is visible. */
function bookedPos(open: number[]): number {
  return open.length > 1 ? 1 : -1;
}

/**
 * A stable pseudo-count derived from the coach's id.
 *
 * The demo directory has no review or member counts. Deriving them from the
 * id keeps them from re-rolling on every render — a number that changes
 * while you look at it is worse than an obviously illustrative one.
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

const OFFERING_TYPE_KEY: Record<CoachOffering['type'], MessageKey> = {
  session: 'offeringTypeSession',
  consultation: 'offeringTypeConsultation',
  group: 'offeringTypeGroup',
  workshop: 'offeringTypeWorkshop',
  program: 'offeringTypeProgram',
  event: 'offeringTypeEvent',
};
const FORMAT_KEY: Record<CoachOffering['format'], MessageKey> = {
  online: 'offeringFormatOnline',
  in_person: 'offeringFormatInPerson',
  both: 'offeringFormatBoth',
};

// ---------------------------------------------------------------------------
// What the screen draws, from either source
// ---------------------------------------------------------------------------

interface PickerSlot { wallMs: number; label: string; taken: boolean }
interface PickerDay { wallMs: number; dow: number; date: number; slots: PickerSlot[] }
interface PickerWeek { label: string; days: PickerDay[] }
interface Pos { week: number; day: number; wallMs: number }

interface PreviewOffering {
  id: string;
  typeLabel: string;
  name: string;
  description: string;
  duration: string;
  formatLabel: string;
  price: number;
  /** For the .ics: 20 for the intro call, 50 otherwise (as 0010 books them). */
  minutes: number;
}

interface PreviewCoach {
  id: string;
  name: string;
  color: string;
  verified: boolean;
  specialtyLabel: string;
  country: string;
  years: number;
  languages: string[];
  avatarPhotoUrl: string;
  stats: { value: string; label: string; star?: boolean }[];
  /** null: nothing to say — the About section is left out. */
  bio: string | null;
  /** Messaging a coach you don't work with yet is step 5; the demo pretends. */
  canMessage: boolean;
  review: { rating: string; count: number; quote: string | null } | null;
}

interface PreviewSource {
  coach: PreviewCoach;
  offerings: PreviewOffering[];
  weeks: PickerWeek[];
  initialDay: number;
  nextAvailable: Pos | null;
  /** The coach has set no weekly hours: nothing to pick from. */
  noHours: boolean;
  /** When the member's open request to this coach is for, if they have one. */
  existingRequest: string | null;
  /** true when sent; 'blocked' when the member may not ask this coach (0017). */
  request: (offering: PreviewOffering, slotWallMs: number, whenLabel: string) => Promise<boolean | 'blocked'>;
}

function firstOpen(weeks: PickerWeek[], fromWeek: number, fromDay: number): Pos | null {
  for (let w = fromWeek; w < weeks.length; w++) {
    const days = weeks[w].days;
    for (let d = w === fromWeek ? fromDay : 0; d < days.length; d++) {
      const slot = days[d].slots.find((s) => !s.taken);
      if (slot) return { week: w, day: d, wallMs: slot.wallMs };
    }
  }
  return null;
}

/**
 * Resolves which coach to show, so the body below can take a real one.
 *
 * Signed in, the coach and their calendar come from Supabase (step 4);
 * signed out, from the demo directory. A coachId that names nobody means a
 * stale link or a bad param, not a crash: say so and offer the way back.
 */
export default function CoachPreview() {
  const coachId = useAppStore((s) => s.params).coachId ?? '';
  const remote = useRemoteSession();
  if (remote) return <RemoteCoachPreview key={coachId} coachId={coachId} />;
  const coach = getDirectoryCoach(coachId);
  if (!coach) return <CoachMissing />;
  // Keyed by coach so switching pros resets the booking state rather than
  // carrying one coach's chosen slot over to another's calendar.
  return <DemoCoachPreview key={coach.id} coach={coach} />;
}

function CoachMissing() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  return (
    <div className="phone-frame coach-preview-screen">
      <div className="coach-preview-missing">
        {/* Not a failed search: this id did not resolve, either because it
            was never valid or because the coach is gone from the directory. */}
        <div className="coach-preview-missing-text">{t('coachPreviewMissing')}</div>
        <button type="button" className="coach-preview-primary" onClick={() => nav('discover')}>
          {t('coachPreviewBack')}
        </button>
      </div>
    </div>
  );
}

function DemoCoachPreview({ coach }: { coach: DirectoryCoach }) {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const isAr = lang === 'ar';

  const specDef = SPECIALTIES.find((s) => s.value === coach.specialty);
  const specialtyLabel = specDef ? t(specDef.labelKey) : coach.specialty;
  const hash = idHash(coach.id);
  const reviewCount = 20 + (hash % 40);
  const memberCount = reviewCount + 8 + (hash % 15);

  const weekStartMs = getMonthAnchorMs();
  const weeks: PickerWeek[] = WEEKS.map((openByDay, w) => {
    const days: PickerDay[] = openByDay.map((open, d) => {
      const dayMs = weekStartMs + (w * 7 + d) * DAY_MS;
      return {
        wallMs: dayMs,
        dow: d,
        date: new Date(dayMs).getUTCDate(),
        slots: open.map((timeIdx, pos) => {
          const wallMs = dayMs + TIME_HOURS[timeIdx] * HOUR_MS;
          return { wallMs, label: fmt.time(wallMs), taken: pos === bookedPos(open) };
        }),
      };
    });
    return { label: `${fmt.monthDay(days[0].wallMs)} – ${fmt.monthDay(days[days.length - 1].wallMs)}`, days };
  });
  const nextAvailable = firstOpen(weeks, 0, TODAY_INDEX);

  const source: PreviewSource = {
    coach: {
      id: coach.id,
      name: coach.name,
      color: coach.color,
      verified: !!coach.verified,
      specialtyLabel,
      country: coach.country,
      years: coach.years,
      languages: coach.languages,
      avatarPhotoUrl: '',
      stats: [
        { value: coach.rating.toFixed(1), label: t('coachPreviewRatingStat'), star: true },
        { value: String(coach.years), label: t('coachPreviewYearsStat') },
        { value: String(memberCount), label: t('coachPreviewMembersStat') },
      ],
      // A fixed template filled with a bounded specialty name, so it runs to
      // two or three lines for every coach in both languages.
      bio: t('coachPreviewBio', { specialty: specialtyLabel, years: coach.years }),
      canMessage: true,
      review: {
        rating: coach.rating.toFixed(1),
        count: reviewCount,
        quote: t('coachPreviewReviewQuote', { name: coach.name.split(' ')[0], specialty: specialtyLabel }),
      },
    },
    // Two offerings per coach: their own priced session, and a free intro
    // call. Generated from the coach's own card rather than hand-authored,
    // so it can never describe a specialty or price they do not have.
    offerings: [
      {
        id: 'main',
        typeLabel: t('offeringTypeSession'),
        name: t('coachPreviewSessionName', { specialty: specialtyLabel }),
        description: t('coachPreviewSessionDesc', { specialty: specialtyLabel }),
        duration: isAr ? '50 دقيقة' : '50 min',
        formatLabel: t('offeringFormatBoth'),
        price: coach.price,
        minutes: 50,
      },
      {
        id: 'intro',
        typeLabel: t('offeringTypeSession'),
        name: t('coachPreviewIntroCallName'),
        description: t('coachPreviewIntroCallDesc'),
        duration: isAr ? '20 دقيقة' : '20 min',
        formatLabel: t('offeringFormatBoth'),
        price: 0,
        minutes: 20,
      },
    ],
    weeks,
    initialDay: nextAvailable?.day ?? TODAY_INDEX,
    nextAvailable,
    noHours: false,
    existingRequest: null,
    request(offering, _slot, whenLabel) {
      requestSession({
        coachId: coach.id,
        coachName: coach.name,
        offeringId: offering.id,
        offeringName: offering.name,
        when: whenLabel,
        price: offering.price,
      });
      return Promise.resolve(true);
    },
  };
  return <CoachPreviewBody source={source} />;
}

/** How far ahead a member can pick a first session. */
const REMOTE_WEEKS = 3;

function RemoteCoachPreview({ coachId }: { coachId: string }) {
  const load = useRemoteLoad(`coachPreview:${coachId}`, true, () => fetchCoachPreview(coachId, wallNowMs()));
  if (load.status === 'loading') return <LoadState status="loading" />;
  if (load.status === 'error') return <LoadState status="error" onRetry={load.retry} showBack />;
  if (!load.data) return <CoachMissing />;
  return <RemoteCoachPreviewReady data={load.data} />;
}

function RemoteCoachPreviewReady({ data }: { data: CoachPreviewData }) {
  const t = useT();
  const fmt = useFormat();
  const { coach } = data;

  const specDef = SPECIALTIES.find((s) => s.value === coach.specialty);
  const specialtyLabel = specDef ? t(specDef.labelKey) : coach.specialty;
  const rated = coach.ratingCount >= MIN_REVIEWS_FOR_RATING;

  // Every slot starts on the coach's hour marks and fits a 50-minute session
  // before their day ends; none is in the past. Members can't see the
  // coach's bookings, so none shows as taken — accepting refuses a clash
  // (0010), and the coach declines it.
  const nowMs = wallNowMs();
  const todayMs = wallTodayMs();
  const weeks: PickerWeek[] = Array.from({ length: REMOTE_WEEKS }, (_, w) => {
    const days: PickerDay[] = Array.from({ length: 7 }, (_, d) => {
      const dayMs = todayMs + (w * 7 + d) * 86400000;
      const dow = weekdayOf(dayMs);
      const hours = coach.week[dow];
      const slots: PickerSlot[] = [];
      if (hours.enabled) {
        for (let h = hours.startH; h + 50 / 60 <= hours.endH + 1e-9; h += 1) {
          const wallMs = dayMs + Math.round(h * 3600000);
          if (wallMs > nowMs) slots.push({ wallMs, label: fmt.time(wallMs), taken: false });
        }
      }
      return { wallMs: dayMs, dow, date: new Date(dayMs).getUTCDate(), slots };
    });
    return { label: `${fmt.monthDay(days[0].wallMs)} – ${fmt.monthDay(days[6].wallMs)}`, days };
  });
  const nextAvailable = firstOpen(weeks, 0, 0);

  const whenOf = (ms: number) => `${t(dayKey('dowShort', weekdayOf(ms)))} ${new Date(ms).getUTCDate()} — ${fmt.time(ms)}`;

  const offerings: PreviewOffering[] = [
    ...data.offerings.map((o) => ({
      id: o.id,
      typeLabel: t(OFFERING_TYPE_KEY[o.type]),
      name: o.name,
      description: o.description,
      duration: o.duration || t('coachPreviewMinutes', { n: 50 }),
      formatLabel: t(FORMAT_KEY[o.format]),
      price: o.price,
      minutes: 50,
    })),
    // The design's free first call, offered by every coach: a request with
    // no offering and no price, which 0010 books as a 20-minute intro.
    {
      id: 'intro',
      typeLabel: t('offeringTypeSession'),
      name: t('coachPreviewIntroCallName'),
      description: t('coachPreviewIntroCallDesc'),
      duration: t('coachPreviewMinutes', { n: 20 }),
      formatLabel: t(FORMAT_KEY[coach.sessionMode]),
      price: 0,
      minutes: 20,
    },
  ];

  const source: PreviewSource = {
    coach: {
      id: coach.id,
      name: coach.name,
      color: coach.color,
      verified: !!coach.verified,
      specialtyLabel,
      country: coach.country,
      years: coach.years,
      languages: coach.languages,
      avatarPhotoUrl: coach.avatarPhotoUrl,
      stats: [
        rated
          ? { value: coach.rating.toFixed(1), label: t('coachPreviewRatingStat'), star: true }
          : { value: t('discoverNewCoach'), label: t('coachPreviewRatingStat') },
        // Years is optional on a coach's profile: unset isn't zero.
        { value: coach.years > 0 ? String(coach.years) : '—', label: t('coachPreviewYearsStat') },
        { value: String(coach.ratingCount), label: t('coachPreviewReviewsStat') },
      ],
      bio: coach.bio.trim() || null,
      canMessage: false,
      review: rated ? { rating: coach.rating.toFixed(1), count: coach.ratingCount, quote: null } : null,
    },
    offerings,
    weeks,
    initialDay: nextAvailable?.day ?? 0,
    nextAvailable,
    noHours: !coach.week.some((d) => d.enabled),
    existingRequest: data.pending ? whenOf(data.pending.startWallMs) : null,
    async request(offering, slotWallMs) {
      const real = data.offerings.find((o) => o.id === offering.id);
      const result = await sendSessionRequest({
        coachId: coach.id,
        offeringId: real ? real.id : null,
        startWallMs: slotWallMs,
        price: offering.price,
        currency: real?.currency ?? 'EGP',
      });
      return result.ok || (result.code === 'blocked' ? 'blocked' : false);
    },
  };
  return <CoachPreviewBody source={source} />;
}

function CoachPreviewBody({ source }: { source: PreviewSource }) {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const { money } = useFormat();
  const { coach, offerings, weeks, nextAvailable } = source;

  const [week, setWeek] = useState(nextAvailable?.week ?? 0);
  const [day, setDay] = useState(source.initialDay);
  const [slotMs, setSlotMs] = useState<number | null>(nextAvailable?.wallMs ?? null);
  const [offeringId, setOfferingId] = useState('');
  const [messaged, setMessaged] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<false | 'failed' | 'blocked'>(false);
  const [confirmed, setConfirmed] = useState(false);
  const [favourites, setFavourites] = useState(getFavouriteCoaches);
  const isFav = !!favourites[coach.id];

  const selectedOffering = offerings.find((o) => o.id === offeringId) ?? offerings[0];

  const { days, label: weekLabel } = weeks[week];
  const shownDay = days[day];
  const slot = shownDay.slots.find((s) => s.wallMs === slotMs && !s.taken) ?? null;
  const validSelection = !!slot && !source.noHours;

  const whenAt = (d: PickerDay, s: PickerSlot) => `${t(dayKey('dowShort', d.dow))} ${d.date} — ${s.label}`;
  const whenLabel = slot ? whenAt(shownDay, slot) : '';

  const nextDay = nextAvailable ? weeks[nextAvailable.week].days[nextAvailable.day] : null;
  const nextSlot = nextDay?.slots.find((s) => s.wallMs === nextAvailable?.wallMs) ?? null;
  const nextLabel = nextDay && nextSlot ? whenAt(nextDay, nextSlot) : '';
  const nextIsSelected = !!nextAvailable
    && week === nextAvailable.week && day === nextAvailable.day && slotMs === nextAvailable.wallMs;

  function goToWeek(delta: number) {
    const target = week + delta;
    if (target < 0 || target >= weeks.length) return;
    setWeek(target);
    setSlotMs(null);
  }

  function selectNextAvailable() {
    if (!nextAvailable) return;
    setWeek(nextAvailable.week);
    setDay(nextAvailable.day);
    setSlotMs(nextAvailable.wallMs);
  }

  // A .ics the member can add to their own calendar. Only built for a
  // real selection — a download link to an empty event is worse than no
  // link, so the button is absent until there is something to export.
  // Slots are wall-clock ms, so their UTC fields are the local time: the
  // event is written as floating local time, as the demo's always was.
  function icsHref(): string {
    if (!slot) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = (ms: number) => {
      const d = new Date(ms);
      return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
    };
    const body = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      `SUMMARY:${selectedOffering.name} — ${coach.name}`,
      `DTSTART:${stamp(slot.wallMs)}`, `DTEND:${stamp(slot.wallMs + selectedOffering.minutes * 60000)}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\n');
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
  }

  async function confirm() {
    if (!slot || sending) return;
    setSending(true);
    setFailed(false);
    const sent = await source.request(selectedOffering, slot.wallMs, whenLabel);
    setSending(false);
    if (sent === true) setConfirmed(true);
    else setFailed(sent === 'blocked' ? 'blocked' : 'failed');
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
            {t('coachPreviewWillConfirm', { name: isolate(coach.name) })}
          </p>

          <div className="coach-preview-receipt">
            <div className="coach-preview-receipt-row">
              <span>{t('coachPreviewCoachLabel')}</span>
              <strong><bdi>{coach.name}</bdi></strong>
            </div>
            <div className="coach-preview-receipt-row">
              <span>{t('coachPreviewDateLabel')}</span>
              <strong>{whenLabel}</strong>
            </div>
            <div className="coach-preview-receipt-row">
              <span><bdi>{selectedOffering.name}</bdi></span>
              <strong>
                {selectedOffering.price > 0
                  ? money(selectedOffering.price)
                  : t('offeringsFree')}
              </strong>
            </div>
          </div>

          <p className="coach-preview-note">
            {selectedOffering.price === 0
              ? t('coachPreviewFreeNote')
              : t('coachPreviewPendingNote', { name: isolate(coach.name) })}
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

          <div className="coach-preview-avatar">
            {coach.avatarPhotoUrl
              ? <img className="coach-preview-avatar-photo" src={coach.avatarPhotoUrl} alt="" />
              : initialsOf(coach.name)}
          </div>

          <div className="coach-preview-name-row">
            <h1 className="coach-preview-name"><bdi>{coach.name}</bdi></h1>
            {coach.verified && (
              <span className="coach-preview-verified" aria-label={t('coachPreviewVerified')}>
                <CheckIcon size={11} color={coach.color} />
              </span>
            )}
          </div>
          <div className="coach-preview-specialty">{coach.specialtyLabel}</div>
          <div className="coach-preview-where">
            {coach.country && (
              <>
                <span aria-hidden="true">{countryFlagOf(coach.country)}</span> {coach.country}
              </>
            )}
            {coach.country && coach.years > 0 && <span className="coach-preview-sep">·</span>}
            {coach.years > 0 && t('coachPreviewCertified', { n: coach.years })}
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
          {coach.stats.map((s) => <Stat key={s.label} value={s.value} label={s.label} star={s.star} />)}
        </div>

        <div className="coach-preview-body">
          {coach.bio && (
            <section className="coach-preview-section">
              <h2 className="coach-preview-h2">{t('coachPreviewAbout')}</h2>
              {/* Left to flow rather than clamped: a Read more that never has
                  anything to reveal is worse than none, and an unclamped
                  paragraph stays readable at a larger text size. */}
              <p className="coach-preview-bio"><bdi>{coach.bio}</bdi></p>
            </section>
          )}

          {coach.canMessage && (
            <button
              type="button"
              className={`coach-preview-message${messaged ? ' coach-preview-message-sent' : ''}`}
              onClick={() => setMessaged(true)}
              disabled={messaged}
            >
              {messaged ? <CheckIcon size={15} color="currentColor" /> : <MessageIcon size={15} color="currentColor" />}
              {messaged ? t('coachPreviewMessageSent') : t('coachPreviewMessage')}
            </button>
          )}

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
                    <span className="coach-preview-offering-type">{offering.typeLabel}</span>
                    <span className={`coach-preview-radio${on ? ' coach-preview-radio-on' : ''}`}>
                      {on && <CheckIcon size={11} color="#FFFFFF" />}
                    </span>
                  </div>
                  <div className="coach-preview-offering-name"><bdi>{offering.name}</bdi></div>
                  {offering.description && <div className="coach-preview-offering-desc"><bdi>{offering.description}</bdi></div>}
                  <div className="coach-preview-offering-foot">
                    <span><bdi>{offering.duration}</bdi> · {offering.formatLabel}</span>
                    <strong>
                      {offering.price > 0 ? money(offering.price) : t('offeringsFree')}
                    </strong>
                  </div>
                </button>
              );
            })}
          </section>

          <section className="coach-preview-section">
            <div className="coach-preview-sched-head">
              <h2 className="coach-preview-h2">{t('coachPreviewChooseTime')}</h2>
              {!source.noHours && (
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
                    disabled={week === weeks.length - 1}
                    onClick={() => goToWeek(1)}
                    className="coach-preview-week-next"
                  >
                    <ChevronIcon size={13} color="currentColor" />
                  </button>
                </div>
              )}
            </div>

            {source.noHours ? (
              <div className="coach-preview-no-times">{t('coachPreviewNoHoursYet', { name: isolate(coach.name) })}</div>
            ) : (
              <>
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
                  {days.map((d, i) => (
                    <button
                      key={d.wallMs}
                      type="button"
                      className={`coach-preview-day${i === day ? ' coach-preview-day-on' : ''}`}
                      aria-pressed={i === day}
                      onClick={() => { setDay(i); setSlotMs(null); }}
                    >
                      <span className="coach-preview-dow">{t(dayKey('dowShort', d.dow))}</span>
                      <span className="coach-preview-date">{d.date}</span>
                    </button>
                  ))}
                </div>

                {shownDay.slots.length > 0 ? (
                  <div className="coach-preview-times">
                    {shownDay.slots.map((s) => {
                      const on = !s.taken && slotMs === s.wallMs;
                      return (
                        <button
                          key={s.wallMs}
                          type="button"
                          className={`coach-preview-time${on ? ' coach-preview-time-on' : ''}${s.taken ? ' coach-preview-time-taken' : ''}`}
                          aria-pressed={on}
                          disabled={s.taken}
                          aria-label={s.taken ? `${s.label} — ${t('coachPreviewBooked')}` : s.label}
                          onClick={() => setSlotMs(s.wallMs)}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="coach-preview-no-times">{t('coachPreviewNoAvailability')}</div>
                )}
              </>
            )}
          </section>

          {coach.review && (
            <section className="coach-preview-section">
              <h2 className="coach-preview-h2">{t('coachPreviewReviewsTitle')}</h2>
              <div className="coach-preview-review">
                <div className="coach-preview-review-head">
                  <span className="coach-preview-review-stars">
                    <StarIcon size={11} color="var(--amber)" />
                    {coach.review.rating}
                  </span>
                  <span className="coach-preview-review-count">
                    {t('coachPreviewReviewCount', { n: coach.review.count })}
                  </span>
                </div>
                {coach.review.quote && <p className="coach-preview-review-quote">{coach.review.quote}</p>}
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="coach-preview-bar">
        {failed && <div className="coach-preview-bar-error" role="alert">{t(failed === 'blocked' ? 'coachPreviewRequestBlocked' : 'coachPreviewRequestFailed')}</div>}
        {!failed && source.existingRequest && (
          <div className="coach-preview-bar-note">{t('coachPreviewExistingRequest', { when: source.existingRequest })}</div>
        )}
        <div className="coach-preview-bar-when">
          {validSelection ? whenLabel : t('coachPreviewSelectTime')}
        </div>
        <button
          type="button"
          className="coach-preview-primary"
          disabled={!validSelection || sending}
          onClick={() => void confirm()}
        >
          {validSelection
            ? t('coachPreviewBookOffering', { name: isolate(selectedOffering.name) })
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
