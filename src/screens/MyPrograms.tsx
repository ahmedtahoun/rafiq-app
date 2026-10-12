import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { useFormat } from '../lib/format';
import {
  ArrowForwardIcon, ProgramsIcon,
  
} from '../components/icons';
import { MemberTabBar } from '../components/TabBars';
import { LoadState } from '../components/LoadState';
import { NoCoachYet } from '../components/NoCoachYet';
import { useRemoteSession } from '../lib/remoteSession';
import { fetchMemberPrograms, type MemberProgram } from '../lib/programData';
import { bookSessionTarget, useMemberSpace, type MemberRelationshipView } from '../store/memberStore';
import { useRemoteLoad } from '../store/remoteLoad';
import {
  DEMO_MEMBER_CLIENT_ID, TODAY_MS,
  getClient, getClientProgramProgressList, getOfferingTypeInfo, setSelectedOfferingId,
  type ProgramProgress,
} from '../lib/mockStore';
import './MyPrograms.css';

// Signed out, the demo member's. Signed in, the member's own enrollments
// with the coach they're viewing (SUPABASE-MIGRATION-PLAN.md step 6).
const CLIENT_ID = DEMO_MEMBER_CLIENT_ID;

export default function MyPrograms() {
  const remote = useRemoteSession();
  const space = useMemberSpace();
  if (!remote) return <DemoMyPrograms />;
  if (space.status === 'loading') return <LoadState status="loading" />;
  if (space.status === 'error') return <LoadState status="error" onRetry={space.retry} />;
  if (!space.remote) return <DemoMyPrograms />;
  // Keyed by relationship, so switching coach in My Pros starts clean.
  return <LiveMyPrograms key={space.current?.clientId ?? 'none'} rel={space.current} todayMs={space.todayMs} />;
}

function DemoMyPrograms() {
  const nav = useAppStore((s) => s.nav);
  // This app models one upcoming session per member, not one per program,
  // so the hint on each row is the member's actual next session rather than
  // a per-program claim the data can't back.
  const client = getClient(CLIENT_ID);
  return (
    <ProgramsView
      programs={getClientProgramProgressList(CLIENT_ID)}
      nextSessionAtMs={client?.nextSessionAtMs ?? null}
      todayMs={TODAY_MS}
      onOpen={(offeringId) => {
        // The same selected-offering handoff Offerings/OfferingDetail and
        // ClientBooking already use — no second mechanism for "which offering".
        setSelectedOfferingId(offeringId);
        nav('programDetail');
      }}
      onBook={() => nav('clientBooking')}
    />
  );
}

function LiveMyPrograms({ rel, todayMs }: { rel: MemberRelationshipView | null; todayMs: number }) {
  const nav = useAppStore((s) => s.nav);
  const load = useRemoteLoad<MemberProgram[]>(`member-programs:${rel?.clientId ?? ''}`, !!rel, () => fetchMemberPrograms(rel!.clientId));

  if (!rel) return <ProgramsView noCoach />;
  if (load.status === 'loading') return <LoadState status="loading" />;
  if (load.status === 'error') return <LoadState status="error" onRetry={load.retry} />;
  return (
    <ProgramsView
      programs={load.data}
      nextSessionAtMs={rel.client.nextSessionAtMs ?? null}
      todayMs={todayMs}
      onOpen={(offeringId) => nav({ screen: 'programDetail', params: { offeringId } })}
      // Never the demo's booking screen: the coach's own page, where a real
      // request is made. A coach no longer listed has no page to go to.
      onBook={rel.coach.id ? () => nav(bookSessionTarget(true, rel)) : undefined}
    />
  );
}

type ViewProps =
  | { noCoach: true }
  | {
      noCoach?: false;
      /** What the member is actually enrolled in — never the Pro's full
          catalogue. An empty list is a real answer, and gets the empty state. */
      programs: ProgramProgress[];
      nextSessionAtMs: number | null;
      todayMs: number;
      onOpen: (offeringId: string) => void;
      /** Omitted when there is nowhere to book. */
      onBook?: () => void;
    };

function ProgramsView(props: ViewProps) {
  const t = useT();
  const fmt = useFormat();

  const heroGrad = 'var(--hero-grad)';

  const programs = props.noCoach ? [] : props.programs;
  // The same session on every row: see DemoMyPrograms.
  const nextSessionAtMs = props.noCoach ? null : props.nextSessionAtMs;
  const hasNextSession = nextSessionAtMs != null;
  const nextSessionDisplay = !props.noCoach && hasNextSession ? fmt.nextSession(nextSessionAtMs, props.todayMs) : '';
  function openProgram(offeringId: string) {
    if (!props.noCoach) props.onOpen(offeringId);
  }

  return (
    <div className="phone-frame my-programs-screen">
      <div className="my-programs-hero" style={{ background: heroGrad }}>
        <div className="my-programs-hero-top">
          <div>
            <h1 className="my-programs-title">{t('myProgramsTitle')}</h1>
            <div className="my-programs-subtitle">{t('myProgramsSubtitle')}</div>
          </div>
        </div>
      </div>

      <div className="my-programs-scroll">
        {props.noCoach ? (
          <NoCoachYet />
        ) : programs.length > 0 ? (
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
            {props.onBook && (
              <button type="button" className="my-programs-empty-cta" onClick={props.onBook}>
                {t('myProgramsBookCta')}
              </button>
            )}
          </div>
        )}
      </div>

      <MemberTabBar />
    </div>
  );
}
