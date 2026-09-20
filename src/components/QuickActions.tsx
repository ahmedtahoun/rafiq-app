import { useState, type ReactNode } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import {
  ArrowForwardIcon,
  CheckCircleIcon,
  MessageIcon,
  PaymentIcon,
  PersonIcon,
  PlusIcon,
  ProfileCircleIcon,
  ScheduleIcon,
  TasksIcon,
} from './icons';
import { BottomSheet } from './BottomSheet';
import {
  getAddTaskHref,
  getClientDetailHref,
  getMessagesHref,
  type NavTarget,
} from '../lib/mockStore';
import './QuickActions.css';

export type QuickActionsContext = 'home' | 'members' | 'schedule' | 'profile' | 'member';
export type QuickActionsVariant = 'nav' | 'compact';

interface QuickActionsProps {
  /** Which screen this FAB lives on — changes the action order below
      (ported 1:1 from QuickActions.dc.html's priorityMap). */
  context?: QuickActionsContext;
  /** A specific member this FAB is scoped to (e.g. embedded on a client
      detail screen) — adds "View profile"/"Message" and points the
      other actions at that member instead of the roster list. */
  memberId?: string;
  /** 'compact' collapses the FAB to a small accent-soft circle for
      embedding next to other content instead of filling a nav tab. */
  variant?: QuickActionsVariant;
}

type ActionIcon = 'member' | 'profile' | 'calendar' | 'task' | 'check' | 'payment' | 'message';

interface ActionDef {
  id: string;
  title: string;
  sub: string;
  icon: ActionIcon;
  href: NavTarget;
}

const ICONS: Record<ActionIcon, ReactNode> = {
  member: <PersonIcon size={19} color="var(--accent)" />,
  profile: <ProfileCircleIcon size={19} color="var(--accent)" />,
  calendar: <ScheduleIcon size={19} color="var(--accent)" />,
  task: <TasksIcon size={19} color="var(--accent)" />,
  check: <CheckCircleIcon size={19} color="var(--accent)" />,
  payment: <PaymentIcon size={19} color="var(--accent)" />,
  message: <MessageIcon size={18} color="var(--accent)" />,
};

// Ported 1:1 from QuickActions.dc.html's renderVals(): priorityMap per
// context, with any actions that exist but aren't named for that context
// appended afterward (deduped) — so nothing built into actionDefs below
// is ever silently dropped.
const PRIORITY: Record<QuickActionsContext, string[]> = {
  home: ['addMember', 'scheduleSession', 'assignTask', 'logSession', 'recordPayment'],
  members: ['addMember', 'assignTask', 'scheduleSession', 'logSession', 'recordPayment'],
  schedule: ['scheduleSession', 'logSession', 'addMember', 'assignTask', 'recordPayment'],
  profile: ['addMember', 'scheduleSession', 'assignTask', 'logSession', 'recordPayment'],
  member: ['viewProfile', 'sendMessage', 'scheduleSession', 'assignTask', 'logSession', 'recordPayment'],
};

function buildActionDefs(memberId: string, t: (key: string) => string): ActionDef[] {
  const rosterFallback: NavTarget = { screen: 'comingSoon', params: { feature: 'clients' } }; // TODO: route to 'clients' once Clients.dc.html is ported
  const defs: ActionDef[] = [];

  if (!memberId) {
    defs.push({
      id: 'addMember',
      title: t('qaAddMember'),
      sub: t('qaAddMemberSub'),
      icon: 'member',
      href: { screen: 'comingSoon', params: { feature: 'addClient' } }, // TODO: route to 'addClient' once AddClient.dc.html is ported
    });
  }
  defs.push(
    {
      id: 'scheduleSession',
      title: t('qaScheduleSession'),
      sub: t('qaScheduleSessionSub'),
      icon: 'calendar',
      href: { screen: 'comingSoon', params: memberId ? { feature: 'addTimeBlock', clientId: memberId } : { feature: 'addTimeBlock' } }, // TODO: route to 'addTimeBlock' once AddTimeBlock.dc.html is ported
    },
    {
      id: 'assignTask',
      title: t('qaAssignTask'),
      sub: t('qaAssignTaskSub'),
      icon: 'task',
      href: memberId ? getAddTaskHref(memberId) : rosterFallback,
    },
    {
      id: 'logSession',
      title: t('qaLogSession'),
      sub: t('qaLogSessionSub'),
      icon: 'check',
      href: memberId ? getClientDetailHref(memberId) : rosterFallback,
    },
    {
      id: 'recordPayment',
      title: t('qaRecordPayment'),
      sub: t('qaRecordPaymentSub'),
      icon: 'payment',
      href: memberId ? getClientDetailHref(memberId) : rosterFallback,
    }
  );
  if (memberId) {
    defs.push(
      { id: 'viewProfile', title: t('qaViewProfile'), sub: t('qaViewProfileSub'), icon: 'profile', href: getClientDetailHref(memberId) },
      { id: 'sendMessage', title: t('qaSendMessage'), sub: t('qaSendMessageSub'), icon: 'message', href: getMessagesHref(memberId) }
    );
  }
  return defs;
}

function orderActions(defs: ActionDef[], context: QuickActionsContext): ActionDef[] {
  const order = PRIORITY[context] ?? PRIORITY.home;
  const byId = new Map(defs.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const orderedIds = [...order, ...defs.map((a) => a.id)].filter((id) => {
    if (!byId.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return orderedIds.map((id) => byId.get(id)!);
}

/** Shared floating-action-button + bottom-sheet-of-actions — ported from
    QuickActions.dc.html. Embedded in Main's bottom nav here
    (context="home"), and reused elsewhere in the coach's app later with
    different context/memberId/variant props. */
export function QuickActions({ context = 'home', memberId = '', variant = 'nav' }: QuickActionsProps) {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const [showSheet, setShowSheet] = useState(false);

  const actions = orderActions(buildActionDefs(memberId, t), context);
  const isCompact = variant === 'compact';

  function go(href: NavTarget) {
    setShowSheet(false);
    nav(href);
  }

  return (
    <div className={`qa-wrapper${isCompact ? ' qa-wrapper-compact' : ''}`}>
      <button
        type="button"
        className={`qa-fab${isCompact ? ' qa-fab-compact' : ''}${showSheet ? ' qa-fab-open' : ''}`}
        aria-label={t('quickActionsTitle')}
        aria-expanded={showSheet}
        onClick={() => setShowSheet((v) => !v)}
      >
        <PlusIcon size={15} color={isCompact ? 'var(--accent)' : '#FFFFFF'} />
      </button>

      <BottomSheet open={showSheet} onClose={() => setShowSheet(false)} title={t('quickActionsTitle')}>
        <div className="qa-actions" role="menu">
          {actions.map((a) => (
            <button key={a.id} type="button" role="menuitem" className="qa-action-row" onClick={() => go(a.href)}>
              <span className="qa-action-icon">{ICONS[a.icon]}</span>
              <span className="qa-action-text">
                <span className="qa-action-title">{a.title}</span>
                <span className="qa-action-sub">{a.sub}</span>
              </span>
              <ArrowForwardIcon size={15} color="var(--ink-soft)" />
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
