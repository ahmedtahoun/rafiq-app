import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import { SPECIALTIES } from '../lib/specialties';
import {
  ChevronIcon, PersonIcon, ScheduleIcon, TasksIcon, MessageIcon, PlusIcon, StarIcon,
} from '../components/icons';
import {
  getCoachProfile, getClient, getTasks, getProAggregateRating,
} from '../lib/mockStore';
import { getSessionRequests, getDirectoryCoach, initialsOf } from '../lib/directory';
import './MyCoaches.css';

const CLIENT_ID = 'sara';
const ACCENT_HEX = '#B75C3D';

export default function MyCoaches() {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const isAr = lang === 'ar';

  const profile = getCoachProfile();
  const coachName = profile.name || 'Yasmin El-Sayed';
  const coachSpecialty = profile.title || 'Life coaching';
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const coachGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  // The design printed a hardcoded 4.9 here. This reads the real aggregate
  // and says "no rating yet" when there aren't enough reviews to average —
  // the same rule CoachPreview and PreviewProfile already follow.
  const aggregate = getProAggregateRating();

  const client = getClient(CLIENT_ID);
  const nextSessionAtMs = client?.nextSessionAtMs ?? null;
  const nextSessionQuick = nextSessionAtMs != null
    ? fmt.nextSession(nextSessionAtMs)
    : t('myCoachesNoSession');

  const pendingTaskCount = getTasks(CLIENT_ID).filter((tk) => !tk.done).length;
  const tasksQuick = pendingTaskCount > 0
    ? t('myCoachesTasksPending', { n: pendingTaskCount })
    : t('myCoachesTasksDone');

  // Real requests the member sent from CoachPreview to a Discover pro.
  // `directory.ts` has recorded these since Track B #4 and nothing read
  // them until now — this screen is the reader that module was written for.
  const pending = getSessionRequests().map((r) => {
    const coach = getDirectoryCoach(r.coachId);
    const specialtyDef = coach ? SPECIALTIES.find((s) => s.value === coach.specialty) : undefined;
    return {
      id: r.coachId,
      name: r.coachName,
      specialty: specialtyDef ? t(specialtyDef.labelKey) : coach?.specialty ?? r.offeringName,
      initials: initialsOf(r.coachName),
      color: coach?.color ?? ACCENT_HEX,
    };
  });

  return (
    <div className="phone-frame my-coaches-screen">
      <div className="my-coaches-top">
        <button type="button" className="my-coaches-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} color="currentColor" />
        </button>
        <h1 className="my-coaches-title">{t('myCoachesTitle')}</h1>
        <button
          type="button"
          className="my-coaches-lang"
          aria-label={t('switchLanguage')}
          onClick={() => setLang(isAr ? 'en' : 'ar')}
        >
          {isAr ? 'EN' : 'ع'}
        </button>
      </div>

      <div className="my-coaches-scroll">
        <div className="my-coaches-section-label">{t('myCoachesActive')}</div>

        <div className="my-coaches-card">
          <button type="button" className="my-coaches-head" onClick={() => nav('clientCoach')}>
            <span className="my-coaches-avatar" style={{ background: coachGrad }}>{coachInitials}</span>
            <span className="my-coaches-head-body">
              <span className="my-coaches-name"><bdi>{coachName}</bdi></span>
              <span className="my-coaches-specialty"><bdi>{coachSpecialty}</bdi></span>
              <span className="my-coaches-rating">
                {aggregate.hasEnoughReviews ? (
                  <>
                    <StarIcon size={11} color="var(--green)" />
                    <span className="my-coaches-rating-value">{aggregate.average.toFixed(1)}</span>
                  </>
                ) : (
                  <span className="my-coaches-rating-none">{t('myCoachesNoRating')}</span>
                )}
              </span>
            </span>
            <span className="my-coaches-badge">{t('myCoachesActiveBadge')}</span>
          </button>

          <div className="my-coaches-quick">
            <div className="my-coaches-quick-cell">
              <div className="my-coaches-quick-label">{t('myCoachesNextSession')}</div>
              <div className="my-coaches-quick-value"><bdi>{nextSessionQuick}</bdi></div>
            </div>
            <div className="my-coaches-quick-divider" />
            <div className="my-coaches-quick-cell">
              <div className="my-coaches-quick-label">{t('myCoachesTasks')}</div>
              <div className="my-coaches-quick-value">{tasksQuick}</div>
            </div>
          </div>

          <div className="my-coaches-actions">
            <button type="button" className="my-coaches-action" aria-label={t('myCoachesViewProfile')} onClick={() => nav('clientCoach')}>
              <PersonIcon size={17} color="currentColor" />
            </button>
            <div className="my-coaches-action-divider" />
            <button type="button" className="my-coaches-action" aria-label={t('myCoachesSessions')} onClick={() => nav('clientSchedule')}>
              <ScheduleIcon size={17} color="currentColor" />
            </button>
            <div className="my-coaches-action-divider" />
            <button type="button" className="my-coaches-action" aria-label={t('clientTasksNav')} onClick={() => nav('clientTasks')}>
              <TasksIcon size={17} color="currentColor" />
            </button>
            <div className="my-coaches-action-divider" />
            <button type="button" className="my-coaches-action" aria-label={t('myCoachesMessage')} onClick={() => nav('coachMessages')}>
              <MessageIcon size={17} color="currentColor" />
            </button>
          </div>
        </div>

        <div className="my-coaches-section-label my-coaches-section-gap">{t('myCoachesPending')}</div>
        {pending.length > 0 ? (
          pending.map((p) => (
            <div key={p.id} className="my-coaches-pending">
              <span className="my-coaches-pending-avatar" style={{ background: p.color }}>{p.initials}</span>
              <div className="my-coaches-pending-body">
                <div className="my-coaches-pending-name"><bdi>{p.name}</bdi></div>
                <div className="my-coaches-pending-specialty"><bdi>{p.specialty}</bdi></div>
              </div>
              <span className="my-coaches-pending-badge">{t('myCoachesPendingBadge')}</span>
            </div>
          ))
        ) : (
          <div className="my-coaches-empty">{t('myCoachesNoPending')}</div>
        )}

        {/* No "past" relationship exists in this data model on purpose:
            nothing anywhere in the app ends a member/pro relationship, so
            this section has nothing real to read and always shows its
            empty state. Kept because the design has it and a member should
            see where ended relationships will live. */}
        <div className="my-coaches-section-label my-coaches-section-gap">{t('myCoachesPast')}</div>
        <div className="my-coaches-empty">{t('myCoachesNoPast')}</div>

        <button type="button" className="my-coaches-find" onClick={() => nav('discover')}>
          <PlusIcon size={16} color="var(--accent)" />
          {t('myCoachesFindAnother')}
        </button>

        <p className="my-coaches-hint">{t('myCoachesHint')}</p>
      </div>
    </div>
  );
}
