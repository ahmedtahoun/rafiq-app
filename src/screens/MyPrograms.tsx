import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import { darken } from '../lib/color';
import {
  MoonIcon, SunIcon, ArrowForwardIcon, ProgramsIcon,
  SearchIcon, HomeIcon, TasksIcon, ScheduleIcon, PersonIcon,
} from '../components/icons';
import { BottomNav, type BottomNavItem } from '../components/BottomNav';
import {
  getClient, getClientProgramProgressList, getOfferingTypeInfo, setSelectedOfferingId,
} from '../lib/mockStore';
import './MyPrograms.css';

const CLIENT_ID = 'sara';
const ACCENT_HEX = '#B75C3D';

export default function MyPrograms() {
  const t = useT();
  const fmt = useFormat();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const dark = useAppStore((s) => s.dark);
  const setDark = useAppStore((s) => s.setDark);
  const nav = useAppStore((s) => s.nav);
  const isAr = lang === 'ar';

  const heroGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 40)} 100%)`;

  // What the member is actually enrolled in — never the Pro's full
  // catalogue. An empty list is a real answer, and gets the empty state.
  const programs = getClientProgramProgressList(CLIENT_ID);

  // This app models one upcoming session per member, not one per program,
  // so the hint on each row is the member's actual next session rather than
  // a per-program claim the data can't back. Shown on every row for the
  // same reason: it is the same session in each case.
  const client = getClient(CLIENT_ID);
  const nextSessionAtMs = client?.nextSessionAtMs ?? null;
  const hasNextSession = nextSessionAtMs != null;
  const nextSessionDisplay = hasNextSession ? fmt.nextSession(nextSessionAtMs) : '';

  function openProgram(offeringId: string) {
    // The same selected-offering handoff Offerings/OfferingDetail and
    // ClientBooking already use — no second mechanism for "which offering".
    setSelectedOfferingId(offeringId);
    nav('programDetail');
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
    <div className="phone-frame my-programs-screen">
      <div className="my-programs-hero" style={{ background: heroGrad }}>
        <div className="my-programs-hero-top">
          <div>
            <h1 className="my-programs-title">{t('myProgramsTitle')}</h1>
            <div className="my-programs-subtitle">{t('myProgramsSubtitle')}</div>
          </div>
          <div className="my-programs-hero-actions">
            <button
              type="button"
              className="my-programs-hero-btn"
              aria-label={t('switchLanguage')}
              onClick={() => setLang(isAr ? 'en' : 'ar')}
            >
              {isAr ? 'EN' : 'ع'}
            </button>
            <button
              type="button"
              className="my-programs-hero-btn"
              aria-label={t('toggleDarkMode')}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon size={16} color="#FFFFFF" /> : <MoonIcon size={16} color="#FFFFFF" />}
            </button>
          </div>
        </div>
      </div>

      <div className="my-programs-scroll">
        {programs.length > 0 ? (
          programs.map((p) => {
            const info = getOfferingTypeInfo(p.offering.type);
            return (
              <button
                key={p.offeringId}
                type="button"
                className="my-programs-row"
                onClick={() => openProgram(p.offeringId)}
              >
                <span className="my-programs-icon" style={{ background: info.color }}>{info.icon}</span>
                <span className="my-programs-body">
                  <span className="my-programs-name"><bdi>{p.offering.name}</bdi></span>
                  <span className="my-programs-type">{t(info.labelKey)}</span>
                  {hasNextSession && (
                    <span className="my-programs-next">
                      {t('myProgramsNextHint', { date: nextSessionDisplay })}
                    </span>
                  )}
                </span>
                <span className="my-programs-progress">
                  {p.pct !== null ? (
                    <>
                      <span className="my-programs-pct">{p.pct}%</span>
                      <span className="my-programs-bar">
                        <span className="my-programs-bar-fill" style={{ width: `${p.pct}%` }} />
                      </span>
                    </>
                  ) : (
                    <span className="my-programs-ongoing">{t('myProgramsOngoing')}</span>
                  )}
                </span>
                <span className="my-programs-chevron">
                  <ArrowForwardIcon size={15} color="var(--ink-soft)" />
                </span>
              </button>
            );
          })
        ) : (
          <div className="my-programs-empty">
            <ProgramsIcon size={26} color="var(--ink-soft)" />
            <div className="my-programs-empty-title">{t('myProgramsEmptyTitle')}</div>
            <div className="my-programs-empty-body">{t('myProgramsEmptyBody')}</div>
            <button type="button" className="my-programs-empty-cta" onClick={() => nav('clientBooking')}>
              {t('myProgramsBookCta')}
            </button>
          </div>
        )}
      </div>

      <BottomNav items={navItems} />
    </div>
  );
}
