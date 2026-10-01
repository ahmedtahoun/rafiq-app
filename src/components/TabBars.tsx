import { useT } from '../lib/i18n';
import { BottomNav, type BottomNavItem } from './BottomNav';
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

export function CoachTabBar() {
  const t = useT();
  const items: BottomNavItem[] = [
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'main' },
    { key: 'clients', label: t('mainClientsNav'), icon: ClientsIcon, screen: 'clients' },
    { key: 'schedule', label: t('scheduleTitle'), icon: ScheduleIcon, screen: 'schedule' },
    { key: 'messages', label: t('mainMessagesNav'), icon: MessageIcon, screen: 'messagesInbox' },
    { key: 'profile', label: t('tabProfile'), icon: PersonIcon, screen: 'profile' },
  ];
  return <BottomNav items={items} />;
}

export function MemberTabBar() {
  const t = useT();
  const items: BottomNavItem[] = [
    { key: 'home', label: t('mainHome'), icon: HomeIcon, screen: 'clientHome' },
    { key: 'sessions', label: t('clientScheduleNav'), icon: ScheduleIcon, screen: 'clientSchedule' },
    { key: 'tasks', label: t('clientTasksNav'), icon: TasksIcon, screen: 'clientTasks' },
    { key: 'coach', label: t('clientCoachNav'), icon: ClientsIcon, screen: 'clientCoach' },
    { key: 'profile', label: t('tabProfile'), icon: PersonIcon, screen: 'clientProfile' },
  ];
  return <BottomNav items={items} />;
}
