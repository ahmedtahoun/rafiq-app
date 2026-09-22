import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import {
  MessageIcon, ScheduleIcon, TasksIcon, CheckIcon, StarIcon, WarningIcon,
  SunIcon, MoonIcon, ChevronIcon, ArrowForwardIcon,
  SearchIcon, HomeIcon, ProgramsIcon, PersonIcon,
} from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import {
  getClient, getCoachProfile, getTasks, getSessionLogs, isSessionToday,
  getPackageStatus, getProAggregateRating, isCredentialVerified,
  getAvailabilityForDayIndex, updateClient, addPayment, addCustomBlock,
  formatDate, canInteract, reportPro, setStandingSlot, getStandingSlot,
  getMonthsTogether,
  PACKAGE_DEFAULT_TOTAL, type ProReportReason,
} from '../lib/mockStore';
import './ClientCoach.css';

const CLIENT_ID = 'sara';
const ACCENT_HEX = '#B75C3D';

// What Full Access costs. There is no price field on the relationship yet,
// so this follows CoachPreview's precedent of a local constant rather than
// inventing a pricing model: 12 sessions at the 750 EGP single-session
// price shown elsewhere would be 9,000, and this is that with a package
// discount (600/session).
const FULL_ACCESS_PRICE = 7200;

// A standing weekly slot is 45 minutes, matching the granularity
// ClientBooking's own picker offers against the same availability.
const STANDING_SLOT_LEN = 0.75;

/** "5:00 PM" / "5:45 PM" from a fractional hour. */
function hourLabel(h: number, am: string, pm: string): string {
  const period = h >= 12 ? pm : am;
  const hh = Math.floor(h) % 12 || 12;
  const mins = Math.round((h % 1) * 60);
  return `${hh}:${String(mins).padStart(2, '0')} ${period}`;
}

type TrustStep = 'reason' | 'reported';
type SubscribeStep = 'pick' | 'done';

const REPORT_REASONS: { key: ProReportReason; labelKey: string }[] = [
  { key: 'no_show', labelKey: 'clientCoachReasonNoShow' },
  { key: 'inappropriate', labelKey: 'clientCoachReasonInappropriate' },
  { key: 'payment', labelKey: 'clientCoachReasonPayment' },
  { key: 'other', labelKey: 'clientCoachReasonOther' },
];

export default function ClientCoach() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const [trustOpen, setTrustOpen] = useState(false);
  const [trustStep, setTrustStep] = useState<TrustStep>('reason');
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [subscribeStep, setSubscribeStep] = useState<SubscribeStep>('pick');
  const [day, setDay] = useState<number | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [paid, setPaid] = useState(false);
  // mockStore is plain functions over localStorage, not reactive — bumped
  // after a write so the reads below recompute.
  const [, setTick] = useState(0);
  const refresh = () => setTick((v) => v + 1);

  const profile = getCoachProfile();
  const client = getClient(CLIENT_ID);
  const coachName = profile.name || 'Yasmin El-Sayed';
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const nextSessionRaw = client?.nextSession ?? '';
  const hasNextSession = !!nextSessionRaw
    && nextSessionRaw !== 'No upcoming session'
    && nextSessionRaw !== 'Program completed';
  const nextSessionText = hasNextSession
    ? nextSessionRaw.replace(/^Next:\s*/, '')
    : t('clientCoachNoSession');
  const sessionToday = hasNextSession && isSessionToday(nextSessionRaw);

  const pendingTasks = getTasks(CLIENT_ID).filter((task) => !task.done).length;
  const tasksText = pendingTasks > 0
    ? t('clientCoachTasksPending', { n: pendingTasks })
    : t('clientCoachTasksDone');

  // Same baseline ClientHome uses — two seeded sessions before any real log
  // exists — so the count agrees with the history shown there.
  const sessionsTogether = getSessionLogs(CLIENT_ID).length + 2;
  // How long they have been working together, from when the member
  // actually completed signup. The design hardcodes 6 here; a made-up
  // relationship length is the same kind of claim as ShareProfile's
  // invented rating, so this shows a dash until there is a real date to
  // count from — which is also how the Reviews stat beside it behaves.
  const monthsTogether = getMonthsTogether(CLIENT_ID);

  const rating = getProAggregateRating();
  const pkg = getPackageStatus(CLIENT_ID);
  const verified = isCredentialVerified();
  const interactive = canInteract(CLIENT_ID);
  const standing = getStandingSlot(CLIENT_ID);

  const plan = client?.plan || 'Basic';
  const showUpgrade = plan !== 'Full Access';
  const fullAccessTotal = PACKAGE_DEFAULT_TOTAL['Full Access'] ?? 12;
  const currency = isAr ? 'جنيه' : 'EGP';

  const paymentStatus = client?.paymentStatus ?? 'due';
  const paymentLabel = paymentStatus === 'paid'
    ? t('clientCoachPaymentPaid')
    : paymentStatus === 'overdue' ? t('clientCoachPaymentOverdue') : t('clientCoachPaymentDue');
  const paymentDetail = paymentStatus === 'paid'
    ? t('clientCoachPlanLine', { plan })
    : t('clientCoachPlanRenews', { plan, date: formatDate(pkg.expiresAtMs) });

  const AM = isAr ? 'صباحًا' : 'AM';
  const PM = isAr ? 'مساءً' : 'PM';
  const dayNamesShort = [0, 1, 2, 3, 4, 5, 6].map((i) => t(`dowShort${i}`));
  const dayNamesFull = [0, 1, 2, 3, 4, 5, 6].map((i) => t(`dowFull${i}`));

  // Which weekdays the Pro is actually open on, straight from their own
  // weekly availability — so a member can never pick a standing time the
  // Pro isn't open for.
  const openDays = dayNamesShort.map((_, i) => getAvailabilityForDayIndex(i).length > 0);

  const standingSlots: number[] = [];
  if (day !== null) {
    const block = getAvailabilityForDayIndex(day)[0];
    if (block) {
      for (let h = block.startH; h + STANDING_SLOT_LEN <= block.endH + 0.001; h += STANDING_SLOT_LEN) {
        standingSlots.push(h);
      }
    }
  }

  const canConfirm = day !== null && slot !== null && paid;
  const confirmLabel = slot === null
    ? t('clientCoachPickDayTimeBtn')
    : !paid ? t('clientCoachAddPaymentBtn') : t('clientCoachConfirmSubscribeBtn');

  const chosenDayLabel = day !== null ? dayNamesFull[day] : '';
  const chosenTimeLabel = slot !== null
    ? `${hourLabel(slot, AM, PM)} – ${hourLabel(slot + STANDING_SLOT_LEN, AM, PM)}`
    : '';

  function submitReport(reason: ProReportReason) {
    reportPro(CLIENT_ID, reason);
    setTrustStep('reported');
  }

  function confirmSubscribe() {
    if (!canConfirm || day === null || slot === null) return;
    const endH = slot + STANDING_SLOT_LEN;

    updateClient(CLIENT_ID, { plan: 'Full Access' });
    setStandingSlot(CLIENT_ID, { dayIndex: day, startH: slot, endH });

    // The standing pattern alone would be invisible to the Pro — their
    // Schedule reads time blocks, not recurrence. Writing the first
    // occurrence as a pending request is what makes the confirmation's
    // promise ("they will see it on their schedule") true, and it goes
    // through the same confirm/decline flow as any other request.
    addCustomBlock({
      clientId: CLIENT_ID,
      kind: 'pending',
      label: `${client?.name || 'Sara Ahmed'} · Standing`,
      dayIndex: day,
      startH: slot,
      endH,
      sessionType: 'standard',
    });

    // 'pending', not settled: a real card charge confirms asynchronously
    // through Paymob, so claiming it cleared here would be a lie.
    addPayment(CLIENT_ID, {
      id: `pay${Date.now().toString(36)}`,
      amount: FULL_ACCESS_PRICE,
      method: 'Card',
      status: 'pending',
      date: formatDate(Date.now()),
    });

    refresh();
    setSubscribeStep('done');
  }

  function closeSubscribe() {
    setSubscribeOpen(false);
    // Reset only after a completed run, so re-opening mid-flow keeps the
    // day and time the member already picked.
    if (subscribeStep === 'done') {
      setSubscribeStep('pick');
      setDay(null);
      setSlot(null);
      setPaid(false);
    }
  }

  const navItems: BottomNavItem[] = [
    { key: 'discover', label: t('discoverNav'), icon: SearchIcon, screen: 'discover' },
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'clientHome' },
    { key: 'programs', label: t('myProgramsNav'), icon: ProgramsIcon, screen: 'myPrograms' },
    { key: 'tasks', label: t('clientTasksNav'), icon: TasksIcon, screen: 'clientTasks' },
    { key: 'schedule', label: t('clientScheduleNav'), icon: ScheduleIcon, screen: 'clientSchedule' },
    { key: 'coach', label: t('clientCoachNav'), icon: PersonIcon, screen: 'clientCoach' },
  ];

  const heroBackground = profile.coverPhotoUrl
    ? `linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.55) 55%, rgba(0,0,0,.68) 100%), url('${profile.coverPhotoUrl}') center/cover no-repeat`
    : `linear-gradient(135deg, ${ACCENT_HEX} 0%, ${darken(ACCENT_HEX, 40)} 100%)`;

  return (
    <div className="phone-frame client-coach-screen">
      <div className="client-coach-hero" style={{ background: heroBackground }}>
        <div className="client-coach-hero-top">
          <button
            type="button"
            className="client-coach-hero-btn"
            aria-label={t('clientCoachMyPros')}
            onClick={() => nav('myCoaches')}
          >
            <ChevronIcon size={16} color="#FFFFFF" />
          </button>
          <div className="client-coach-hero-actions">
            <button
              type="button"
              className="client-coach-hero-btn"
              aria-label={t('switchLanguage')}
              onClick={() => setLang(isAr ? 'en' : 'ar')}
            >
              {isAr ? 'EN' : 'ع'}
            </button>
            <button
              type="button"
              className="client-coach-hero-btn"
              aria-label={t('discoverToggleTheme')}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
          </div>
        </div>

        <div className="client-coach-identity">
          {profile.avatarPhotoUrl ? (
            <img className="client-coach-avatar-photo" src={profile.avatarPhotoUrl} alt="" />
          ) : (
            <div className="client-coach-avatar">{coachInitials}</div>
          )}

          <div className="client-coach-name-row">
            <h1 className="client-coach-name">{coachName}</h1>
            {verified && (
              <span className="client-coach-verified" aria-label={t('clientCoachVerified')}>
                <CheckIcon size={11} color={ACCENT_HEX} />
              </span>
            )}
          </div>
          <div className="client-coach-title">{profile.title || t('specLife')}</div>
          {profile.cert && <div className="client-coach-cert">{profile.cert}</div>}

          <div className="client-coach-rating">
            {rating.hasEnoughReviews ? (
              <>
                <StarIcon size={12} color="#FFD166" />
                <span>{rating.average.toFixed(1)}</span>
                <span className="client-coach-rating-count">({rating.count})</span>
              </>
            ) : (
              <span className="client-coach-rating-none">{t('clientCoachNotEnoughReviews')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="client-coach-scroll">
        <div className="client-coach-actions">
          <button
            type="button"
            className="client-coach-primary"
            disabled={!interactive}
            onClick={() => nav('coachMessages')}
          >
            <MessageIcon size={15} color="currentColor" />
            {t('clientCoachMessage')}
          </button>
          <button
            type="button"
            className="client-coach-secondary"
            disabled={!interactive}
            onClick={() => nav('clientBooking')}
          >
            <ScheduleIcon size={15} color="currentColor" />
            {t('clientCoachBookSession')}
          </button>
        </div>

        <div className="client-coach-quick">
          <button
            type="button"
            className="client-coach-quick-card"
            onClick={() => nav('clientSchedule')}
          >
            <div className="client-coach-quick-label">{t('clientCoachSessionsQuick')}</div>
            <div className="client-coach-quick-value">
              {sessionToday ? t('clientCoachLiveToday') : nextSessionText}
            </div>
            {!sessionToday && hasNextSession && (
              <div className="client-coach-quick-hint">{t('clientCoachNextLabel')}</div>
            )}
          </button>
          <button
            type="button"
            className="client-coach-quick-card"
            onClick={() => nav('clientTasks')}
          >
            <div className="client-coach-quick-label">{t('clientCoachTasksQuick')}</div>
            <div className="client-coach-quick-value">{tasksText}</div>
          </button>
        </div>

        <div className={`client-coach-payment client-coach-payment-${paymentStatus}`}>
          <div className="client-coach-payment-label">{paymentLabel}</div>
          <div className="client-coach-payment-detail">{paymentDetail}</div>
        </div>

        {standing && (
          <div className="client-coach-standing">
            {t('clientCoachStandingHeld', {
              day: dayNamesFull[standing.dayIndex],
              time: `${hourLabel(standing.startH, AM, PM)} – ${hourLabel(standing.endH, AM, PM)}`,
            })}
          </div>
        )}

        {showUpgrade && (
          <button
            type="button"
            className="client-coach-upgrade"
            disabled={!interactive}
            onClick={() => setSubscribeOpen(true)}
          >
            <div>
              <div className="client-coach-upgrade-title">{t('clientCoachUpgradeTitle')}</div>
              <div className="client-coach-upgrade-sub">
                {t('clientCoachUpgradeSubtitle', { n: fullAccessTotal })}
              </div>
            </div>
            <ArrowForwardIcon size={16} color="currentColor" />
          </button>
        )}

        <section className="client-coach-section">
          <h2 className="client-coach-h2">{t('clientCoachAbout')}</h2>
          <p className="client-coach-bio">{profile.bio || t('clientCoachBioFallback')}</p>
        </section>

        <div className="client-coach-stats">
          <Stat
            value={rating.hasEnoughReviews ? String(rating.count) : '—'}
            label={t('clientCoachStatReviews')}
          />
          <Stat value={String(sessionsTogether)} label={t('clientCoachStatSessions')} />
          <Stat value={monthsTogether === null ? '—' : String(monthsTogether)} label={t('clientCoachStatMonths')} />
        </div>

        <button
          type="button"
          className="client-coach-report"
          onClick={() => { setTrustStep('reason'); setTrustOpen(true); }}
        >
          <WarningIcon size={14} color="currentColor" />
          {t('clientCoachReportAction')}
        </button>
      </div>

      <BottomNav items={navItems} />

      <BottomSheet
        open={trustOpen}
        onClose={() => setTrustOpen(false)}
        title={trustStep === 'reason' ? t('clientCoachReportTitle') : t('clientCoachReportedTitle')}
      >
        {trustStep === 'reason' ? (
          <div className="client-coach-reasons">
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason.key}
                type="button"
                className="client-coach-reason"
                onClick={() => submitReport(reason.key)}
              >
                {t(reason.labelKey)}
              </button>
            ))}
          </div>
        ) : (
          <div className="client-coach-reported">
            <span className="client-coach-reported-tick">
              <CheckIcon size={22} color="#FFFFFF" />
            </span>
            <p className="client-coach-reported-body">{t('clientCoachReportedBody')}</p>
            <button type="button" className="client-coach-sheet-done" onClick={() => setTrustOpen(false)}>
              {t('clientBookingDone')}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={subscribeOpen}
        onClose={closeSubscribe}
        title={subscribeStep === 'pick' ? t('clientCoachUpgradeTitle') : t('clientCoachSubscribedTitle')}
      >
        {subscribeStep === 'pick' ? (
          <div className="client-coach-subscribe">
            <div className="client-coach-plan">
              <div className="client-coach-plan-row">
                <span>{t('clientCoachFullAccessIncludes', { n: fullAccessTotal })}</span>
              </div>
              <div className="client-coach-plan-row">
                <span>{t('clientCoachFullAccessStanding', { coach: coachName })}</span>
              </div>
              <div className="client-coach-plan-row client-coach-plan-price">
                <span>{t('clientCoachPriceLabel')}</span>
                <strong>{FULL_ACCESS_PRICE} {currency}</strong>
              </div>
            </div>

            <div className="client-coach-field-label">{t('clientCoachPickDay')}</div>
            <div className="client-coach-days">
              {dayNamesShort.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  className={`client-coach-day${day === i ? ' client-coach-day-on' : ''}`}
                  disabled={!openDays[i]}
                  aria-pressed={day === i}
                  onClick={() => { setDay(i); setSlot(null); setPaid(false); }}
                >
                  {label}
                </button>
              ))}
            </div>

            {day !== null && (
              <>
                <div className="client-coach-field-label">{t('clientCoachPickTime')}</div>
                {standingSlots.length > 0 ? (
                  <div className="client-coach-slots">
                    {standingSlots.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className={`client-coach-slot${slot === h ? ' client-coach-slot-on' : ''}`}
                        aria-pressed={slot === h}
                        onClick={() => { setSlot(h); setPaid(false); }}
                      >
                        {hourLabel(h, AM, PM)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="client-coach-no-slots">{t('clientBookingNoAvailability')}</div>
                )}
              </>
            )}

            {slot !== null && (
              <div className="client-coach-payment-box">
                <div className="client-coach-field-label">{t('clientCoachPaymentTitle')}</div>
                {paid ? (
                  <div className="client-coach-paid">
                    <CheckIcon size={14} color="var(--green)" />
                    {t('clientCoachPaymentReady')}
                  </div>
                ) : (
                  <button type="button" className="client-coach-pay" onClick={() => setPaid(true)}>
                    {t('clientCoachPayWithCard')}
                  </button>
                )}
                <p className="client-coach-demo-note">{t('clientCoachPaymentDemoNote')}</p>
              </div>
            )}

            <button
              type="button"
              className="client-coach-sheet-primary"
              disabled={!canConfirm}
              onClick={confirmSubscribe}
            >
              {confirmLabel}
            </button>
          </div>
        ) : (
          <div className="client-coach-reported">
            <span className="client-coach-reported-tick client-coach-tick-green">
              <CheckIcon size={22} color="#FFFFFF" />
            </span>
            <p className="client-coach-reported-body">
              {t('clientCoachSubscribedBody', {
                day: chosenDayLabel,
                time: chosenTimeLabel,
                coach: coachName,
              })}
            </p>
            <button type="button" className="client-coach-sheet-done" onClick={closeSubscribe}>
              {t('clientBookingDone')}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="client-coach-stat">
      <div className="client-coach-stat-value">{value}</div>
      <div className="client-coach-stat-label">{label}</div>
    </div>
  );
}
