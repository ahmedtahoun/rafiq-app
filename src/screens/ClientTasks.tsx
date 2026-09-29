import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { isolate, useT, type MessageKey } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import {
  MoonIcon, SunIcon, CheckIcon,
  SearchIcon, HomeIcon, ProgramsIcon, TasksIcon, ScheduleIcon, PersonIcon,
} from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import { LoadState } from '../components/LoadState';
import { NoCoachYet } from '../components/NoCoachYet';
import { useMemberSpace, type MemberSpaceView } from '../store/memberStore';
import { isTaskOverdue, MOOD_KEYS, type MoodKey } from '../lib/mockStore';
import './ClientTasks.css';

const RING_R = 22;
const RING_CIRC = 2 * Math.PI * RING_R;

const ACCENT_HEX = '#B75C3D';

const MOOD_EMOJI: Record<MoodKey, string> = {
  great: '😄', good: '🙂', okay: '😐', low: '😕', hard: '😣',
};
const MOOD_LABEL_KEYS: Record<MoodKey, MessageKey> = {
  great: 'clientTasksMoodGreat',
  good: 'clientTasksMoodGood',
  okay: 'clientTasksMoodOkay',
  low: 'clientTasksMoodLow',
  hard: 'clientTasksMoodHard',
};

type TaskFilter = 'all' | 'pending' | 'overdue' | 'completed';

const FILTERS: { key: TaskFilter; labelKey: MessageKey }[] = [
  { key: 'all', labelKey: 'clientTasksFilterAll' },
  { key: 'pending', labelKey: 'clientTasksFilterPending' },
  { key: 'overdue', labelKey: 'clientTasksFilterOverdue' },
  { key: 'completed', labelKey: 'clientTasksFilterCompleted' },
];

export default function ClientTasks() {
  const space = useMemberSpace();
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} />;
  return <ClientTasksView space={space} />;
}

function ClientTasksView({ space }: { space: Extract<MemberSpaceView, { status: 'ready' }> }) {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const [filter, setFilter] = useState<TaskFilter>('all');
  // A write in flight (a tick or a mood), and whether the last one failed.
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const { todayMs } = space;
  const rel = space.current;
  const client = rel?.client;
  const coachName = rel?.coach.name ?? '';
  const coachInitials = coachName.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const heroGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 40)} 100%)`;
  const coachGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  const mood = rel?.mood ?? null;

  // Same progress-ring math ClientHome uses, so "progress toward goal"
  // reads identically wherever the member app shows it.
  const progress = client?.progress ?? 0;
  const ringOffset = RING_CIRC * (1 - progress / 100);
  const goalDisplay = client?.goal || t('clientTasksGoalFallback');
  const pkg = rel?.pkg ?? null;
  const sessionsCompletedText = pkg ? t('clientHomeSessionsCompleted', { used: pkg.used, total: pkg.total }) : t('clientHomeNoPackage');

  // The most recent session recap the Pro has shared — the same one
  // ClientHome's feedback card shows (memberStore).
  const recentFeedback = rel?.latestRecap ?? null;

  const allTasks = (rel?.tasks ?? []).map((task) => ({ ...task, overdue: isTaskOverdue(task, todayMs) }));
  const counts: Record<TaskFilter, number> = {
    all: allTasks.length,
    pending: allTasks.filter((tk) => !tk.done).length,
    overdue: allTasks.filter((tk) => tk.overdue).length,
    completed: allTasks.filter((tk) => tk.done).length,
  };
  const tasks = allTasks.filter((tk) => {
    if (filter === 'pending') return !tk.done;
    if (filter === 'overdue') return tk.overdue;
    if (filter === 'completed') return tk.done;
    return true;
  });

  async function run(write: () => Promise<boolean>) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const done = await write();
    setBusy(false);
    if (!done) setFailed(true);
  }

  function pickMood(key: MoodKey) {
    void run(() => space.actions.setMood(key));
  }

  function toggle(taskId: string) {
    void run(() => space.actions.toggleTask(taskId));
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
    <div className="phone-frame client-tasks-screen">
      <div className="client-tasks-hero" style={{ background: heroGrad }}>
        <div className="client-tasks-hero-top">
          <div>
            <h1 className="client-tasks-title">{t('clientTasksTitle')}</h1>
            {rel && <div className="client-tasks-subtitle">{t('clientTasksFromCoach', { coach: isolate(coachName) })}</div>}
          </div>
          <div className="client-tasks-hero-actions">
            <button
              type="button"
              className="client-tasks-hero-btn"
              aria-label={t('switchLanguage')}
              onClick={() => setLang(isAr ? 'en' : 'ar')}
            >
              {isAr ? 'EN' : 'ع'}
            </button>
            <button
              type="button"
              className="client-tasks-hero-btn"
              aria-label={t('toggleDarkMode')}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
          </div>
        </div>
      </div>

      {!rel ? (
        <div className="client-tasks-scroll">
          <NoCoachYet />
        </div>
      ) : (
      <>
      <div className="client-tasks-mood">
        <div className="client-tasks-mood-question">{t('clientTasksHowFeeling')}</div>
        <div className="client-tasks-mood-row" role="group" aria-label={t('clientTasksHowFeeling')}>
          {MOOD_KEYS.map((key) => {
            const selected = mood === key;
            return (
              <button
                key={key}
                type="button"
                className="client-tasks-mood-btn"
                aria-pressed={selected}
                disabled={busy}
                onClick={() => pickMood(key)}
              >
                <span className={`client-tasks-mood-emoji${selected ? ' client-tasks-mood-emoji-on' : ''}`}>
                  {MOOD_EMOJI[key]}
                </span>
                <span className={`client-tasks-mood-label${selected ? ' client-tasks-mood-label-on' : ''}`}>
                  {t(MOOD_LABEL_KEYS[key])}
                </span>
              </button>
            );
          })}
        </div>
        {mood && (
          <div className="client-tasks-mood-logged">
            <CheckIcon size={13} color="var(--green)" />
            <span>{t('clientTasksMoodLogged')}</span>
          </div>
        )}
      </div>

      <div className="client-tasks-scroll">
        {failed && (
          <div className="client-tasks-error" role="alert">
            {t('requestFailedRetry')}
          </div>
        )}
        <button type="button" className="client-tasks-progress" onClick={() => nav('clientHome')}>
          <span className="client-tasks-ring">
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="26" cy="26" r={RING_R} fill="none" stroke="var(--line)" strokeWidth={5} />
              <circle
                cx="26" cy="26" r={RING_R} fill="none"
                stroke="var(--accent)" strokeWidth={5} strokeLinecap="round"
                strokeDasharray={RING_CIRC} strokeDashoffset={ringOffset}
              />
            </svg>
            <span className="client-tasks-ring-value">{progress}%</span>
          </span>
          <span className="client-tasks-progress-body">
            <span className="client-tasks-progress-label">{t('clientTasksProgressLabel')}</span>
            <span className="client-tasks-progress-goal"><bdi>{goalDisplay}</bdi></span>
            <span className="client-tasks-progress-sessions">{sessionsCompletedText}</span>
          </span>
        </button>

        {recentFeedback && (
          <button type="button" className="client-tasks-feedback" onClick={() => nav('clientCoach')}>
            <span className="client-tasks-feedback-avatar" style={{ background: coachGrad }}>{coachInitials}</span>
            <span className="client-tasks-feedback-body">
              <span className="client-tasks-feedback-label">{t('clientTasksFeedbackLabel', { coach: isolate(coachName) })}</span>
              <span className="client-tasks-feedback-text"><bdi>{recentFeedback.text}</bdi></span>
              <span className="client-tasks-feedback-date"><bdi>{fmt.date(recentFeedback.atMs)}</bdi></span>
            </span>
          </button>
        )}

        <div className="client-tasks-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`client-tasks-filter${filter === f.key ? ' client-tasks-filter-on' : ''}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {t('clientTasksFilterCount', { label: t(f.labelKey), count: counts[f.key] })}
            </button>
          ))}
        </div>

        {tasks.length > 0 ? (
          tasks.map((task) => (
            <div key={task.id} className="client-tasks-row">
              <button
                type="button"
                className={`client-tasks-box${task.done ? ' client-tasks-box-done' : ''}${task.overdue ? ' client-tasks-box-overdue' : ''}`}
                aria-pressed={task.done}
                aria-label={task.title}
                disabled={busy}
                onClick={() => toggle(task.id)}
              >
                {task.done && <CheckIcon size={13} color="#FFFFFF" />}
              </button>
              <div className="client-tasks-row-body">
                <div className={`client-tasks-row-title${task.done ? ' client-tasks-row-title-done' : ''}${task.overdue ? ' client-tasks-row-title-overdue' : ''}`}>
                  <bdi>{task.title}</bdi>
                </div>
                <div className="client-tasks-row-meta">
                  <span className={`client-tasks-due${task.overdue ? ' client-tasks-due-overdue' : ''}`}><bdi>{fmt.taskDue(task.dueAtMs, task.dueHasTime, todayMs)}</bdi></span>
                  {task.recurring && (
                    <svg
                      width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)"
                      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
                      role="img" aria-label={t('clientTasksRecurring')}
                    >
                      <path d="M17 2.1l4 4-4 4" /><path d="M3 12.7V12a9 9 0 0 1 15-6.7l3 3" />
                      <path d="M7 21.9l-4-4 4-4" /><path d="M21 11.3V12a9 9 0 0 1-15 6.7l-3-3" />
                    </svg>
                  )}
                  {task.overdue && <span className="client-tasks-overdue-chip">{t('clientTasksOverdue')}</span>}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="client-tasks-empty">
            <span className="client-tasks-empty-icon">
              <CheckIcon size={22} color="var(--green)" />
            </span>
            <div className="client-tasks-empty-title">{t('clientTasksAllCaughtUp')}</div>
            <div className="client-tasks-empty-body">{t('clientTasksNoTasksMsg')}</div>
          </div>
        )}
      </div>
      </>
      )}

      <BottomNav items={navItems} />
    </div>
  );
}
