import { useT } from '../lib/i18n';
import { BottomNav, type BottomNavItem } from './BottomNav';
import { useUnread } from '../store/unread';
import { ClientsIcon, HomeIcon, MessageIcon, PersonIcon, ScheduleIcon, TasksIcon } from './icons';

/*
 * The two tab bars, defined once. Each tab-root screen used to build its
 * own list, and the lists had drifted to six slots: the coach's with a "+"
 * in the middle, the member's with Discover and Programs as tabs. Five
 * named tabs a side now (UI/UX review, 1 Oct 2026):
 *
 *   Coach:  Home · Members · Schedule · Messages · Profile
 *   Member: Home · Sessions · Tasks · Your Pro · Profile
 *
 * The coach's quick actions ("+") live on Home's header; Members and
 * Schedule have their own add buttons. A member reaches Discover from
 * Home and Your Pro, and their programmes from Your Pro.
 */

/** Unread messages (store/unread.ts): signed in only; the demo has none to count. */
function useUnreadBadge(label: string) {
  const t = useT();
  const count = useUnread((s) => s.count);
  return { badge: count, badgeLabel: t('tabUnreadLabel', { label, count }) };
}

export function CoachTabBar() {
  const t = useT();
  const messagesBadge = useUnreadBadge(t('mainMessagesNav'));
  const items: BottomNavItem[] = [
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'main' },
    { key: 'clients', label: t('mainClientsNav'), icon: ClientsIcon, screen: 'clients' },
    { key: 'schedule', label: t('scheduleTitle'), icon: ScheduleIcon, screen: 'schedule' },
    { key: 'messages', label: t('mainMessagesNav'), icon: MessageIcon, screen: 'messagesInbox', ...messagesBadge },
    { key: 'profile', label: t('tabProfile'), icon: PersonIcon, screen: 'profile' },
  ];
  return <BottomNav items={items} />;
}

export function MemberTabBar() {
  const t = useT();
  // A member's thread is on Your Pro, so that's where their badge goes.
  const coachBadge = useUnreadBadge(t('clientCoachNav'));
  const items: BottomNavItem[] = [
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'clientHome' },
    { key: 'sessions', label: t('clientScheduleNav'), icon: ScheduleIcon, screen: 'clientSchedule' },
    { key: 'tasks', label: t('clientTasksNav'), icon: TasksIcon, screen: 'clientTasks' },
    { key: 'coach', label: t('clientCoachNav'), icon: ClientsIcon, screen: 'clientCoach', ...coachBadge },
    { key: 'profile', label: t('tabProfile'), icon: PersonIcon, screen: 'clientProfile' },
  ];
  return <BottomNav items={items} />;
}
