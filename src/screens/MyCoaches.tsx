import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import { SPECIALTIES } from '../lib/specialties';
import {
  ChevronIcon, PersonIcon, ScheduleIcon, TasksIcon, MessageIcon, PlusIcon, StarIcon,
} from '../components/icons';
import { LoadState } from '../components/LoadState';
import { NoCoachYet } from '../components/NoCoachYet';
import { useMemberSpace, type MemberRelationshipView, type MemberSpaceView } from '../store/memberStore';
import type { Screen } from '../store/appStore';
import { getSessionRequests, getDirectoryCoach, initialsOf } from '../lib/directory';
import { fetchOwnRequests } from '../lib/requestData';
import { useRemoteLoad } from '../store/remoteLoad';
import './MyCoaches.css';

const ACCENT_HEX = '#B75C3D';

export default function MyCoaches() {
  const space = useMemberSpace();
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} showBack />;
  return <MyCoachesView space={space} />;
}

function MyCoachesView({ space }: { space: Extract<MemberSpaceView, { status: 'ready' }> }) {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const isAr = lang === 'ar';
  const fmt = useFormat();
  const ownRequests = useRemoteLoad('own_requests', space.remote, fetchOwnRequests);

  const active = space.relationships.filter((r) => r.client.active);
  const past = space.relationships.filter((r) => !r.client.active);

  // Every action on a card is about that coach: make them the one the
  // member app shows, then go.
  const openWith = (rel: MemberRelationshipView, screen: Screen) => {
    space.select(rel.clientId);
    nav(screen);
  };

  // Requests the member sent from CoachPreview that no coach has answered
  // yet: session_requests signed in, directory.ts's local copy in the demo.
  // Tapping one opens that coach again, to pick a different time.
  const pending = space.remote
    ? ownRequests.status === 'ready'
      ? ownRequests.data.map((r) => ({
          id: r.id,
          coachId: r.coachId,
          name: r.coachName,
          specialty: t('myCoachesRequestedFor', { when: fmt.slot(r.startWallMs) }),
          initials: initialsOf(r.coachName || '?'),
          color: ACCENT_HEX,
        }))
      : []
    : getSessionRequests().map((r) => {
        const coach = getDirectoryCoach(r.coachId);
        const specialtyDef = coach ? SPECIALTIES.find((sp) => sp.value === coach.specialty) : undefined;
        return {
          id: r.coachId,
          coachId: r.coachId,
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
        {active.length > 0 ? (
          active.map((rel) => <CoachCard key={rel.clientId} rel={rel} todayMs={space.todayMs} current={space.current?.clientId === rel.clientId && active.length > 1} onOpen={openWith} />)
        ) : (
          <NoCoachYet />
        )}

        <div className="my-coaches-section-label my-coaches-section-gap">{t('myCoachesPending')}</div>
        {space.remote && ownRequests.status === 'error' ? (
          <div className="my-coaches-empty" role="alert">
            {t('loadFailedTitle')}{' '}
            <button type="button" className="my-coaches-retry" onClick={ownRequests.retry}>{t('retry')}</button>
          </div>
        ) : space.remote && ownRequests.status === 'loading' ? (
          <div className="my-coaches-empty">{t('loadingEllipsis')}</div>
        ) : pending.length > 0 ? (
          pending.map((p) => (
            <button
              key={p.id}
              type="button"
              className="my-coaches-pending my-coaches-past"
              onClick={() => nav({ screen: 'coachPreview', params: { coachId: p.coachId } })}
            >
              <span className="my-coaches-pending-avatar" style={{ background: p.color }}>{p.initials}</span>
              <span className="my-coaches-pending-body">
                <span className="my-coaches-pending-name"><bdi>{p.name}</bdi></span>
                <span className="my-coaches-pending-specialty"><bdi>{p.specialty}</bdi></span>
              </span>
              <span className="my-coaches-pending-badge">{t('myCoachesPendingBadge')}</span>
            </button>
          ))
        ) : (
          <div className="my-coaches-empty">{t('myCoachesNoPending')}</div>
        )}

        {/* A relationship ends when the coach archives the member's roster
            row (EditClient's Archive sets clients.active = false); the
            history stays, so it lives here. The demo has none. */}
        <div className="my-coaches-section-label my-coaches-section-gap">{t('myCoachesPast')}</div>
        {past.length > 0 ? (
          past.map((rel) => (
            <button key={rel.clientId} type="button" className="my-coaches-pending my-coaches-past" onClick={() => openWith(rel, 'clientCoach')}>
              <span className="my-coaches-pending-avatar" style={{ background: ACCENT_HEX }}>{initialsOf(rel.coach.name || '?')}</span>
              <span className="my-coaches-pending-body">
                <span className="my-coaches-pending-name"><bdi>{rel.coach.name}</bdi></span>
                <span className="my-coaches-pending-specialty"><bdi>{rel.coach.title}</bdi></span>
              </span>
            </button>
          ))
        ) : (
          <div className="my-coaches-empty">{t('myCoachesNoPast')}</div>
        )}

        <button type="button" className="my-coaches-find" onClick={() => nav('discover')}>
          <PlusIcon size={16} color="var(--accent)" />
          {t('myCoachesFindAnother')}
        </button>

        <p className="my-coaches-hint">{t('myCoachesHint')}</p>
      </div>
    </div>
  );
}

function CoachCard({ rel, todayMs, current, onOpen }: {
  rel: MemberRelationshipView;
  todayMs: number;
  /** Marked when the member has more than one coach and this is the one the app is showing. */
  current: boolean;
  onOpen: (rel: MemberRelationshipView, screen: Screen) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const coachName = rel.coach.name;
  const coachSpecialty = rel.coach.title;
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
  const coachGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  // The design printed a hardcoded 4.9 here. This reads the real aggregate
  // and says "no rating yet" when there aren't enough reviews to average —
  // the same rule CoachPreview and PreviewProfile already follow.
  const aggregate = rel.coach.rating;

  const nextSessionAtMs = rel.client.nextSessionAtMs;
  const nextSessionQuick = nextSessionAtMs != null ? fmt.nextSession(nextSessionAtMs, todayMs) : t('myCoachesNoSession');

  const pendingTaskCount = rel.tasks.filter((tk) => !tk.done).length;
  const tasksQuick = pendingTaskCount > 0 ? t('myCoachesTasksPending', { n: pendingTaskCount }) : t('myCoachesTasksDone');

  return (
    <div className={`my-coaches-card${current ? ' is-current' : ''}`} data-testid="my-coaches-card">
      <button type="button" className="my-coaches-head" onClick={() => onOpen(rel, 'clientCoach')}>
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
        <span className="my-coaches-badge">{current ? t('myCoachesViewingBadge') : t('myCoachesActiveBadge')}</span>
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
        <button type="button" className="my-coaches-action" aria-label={t('myCoachesViewProfile')} onClick={() => onOpen(rel, 'clientCoach')}>
          <PersonIcon size={17} color="currentColor" />
        </button>
        <div className="my-coaches-action-divider" />
        <button type="button" className="my-coaches-action" aria-label={t('myCoachesSessions')} onClick={() => onOpen(rel, 'clientSchedule')}>
          <ScheduleIcon size={17} color="currentColor" />
        </button>
        <div className="my-coaches-action-divider" />
        <button type="button" className="my-coaches-action" aria-label={t('clientTasksNav')} onClick={() => onOpen(rel, 'clientTasks')}>
          <TasksIcon size={17} color="currentColor" />
        </button>
        <div className="my-coaches-action-divider" />
        <button type="button" className="my-coaches-action" aria-label={t('myCoachesMessage')} onClick={() => onOpen(rel, 'coachMessages')}>
          <MessageIcon size={17} color="currentColor" />
        </button>
      </div>
    </div>
  );
}
