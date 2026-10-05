import { lazy, Suspense, useEffect } from 'react';
import { useAppStore, type Screen } from './store/appStore';
import { LoadState } from './components/LoadState';
import { isRtl } from './lib/i18n';
import { initSession } from './lib/session';
import { initOAuthDeepLinks } from './lib/auth';
import { initBackButton } from './lib/nativeBack';
import { applySystemBarsStyle } from './lib/nativeSystemBars';
import { isSupabaseConfigured } from './lib/supabase';
import { startUnreadWatch } from './store/unread';

/**
 * Every screen, split into its own chunk.
 *
 * Fifty-four static imports meant the first paint waited for all of
 * them: Welcome, the very first screen, could not render until the
 * coach's Earnings screen had been parsed. Now a screen's code arrives
 * when someone navigates to it.
 *
 * What is left in the entry chunk is not "nothing": i18n.ts alone is
 * 175 KB of source because it holds every string twice, and session.ts
 * pulls in the Supabase client at startup. Both are splittable, and
 * neither is this change.
 *
 * The switch below is unchanged, including its exhaustiveness check:
 * `lazy()` returns a component, so a Screen value with no case here is
 * still a compile error rather than a blank page.
 */
const Welcome = lazy(() => import('./screens/Welcome'));
const RoleSelect = lazy(() => import('./screens/RoleSelect'));
const Auth = lazy(() => import('./screens/Auth'));
const ClientAuth = lazy(() => import('./screens/ClientAuth'));
const Onboarding = lazy(() => import('./screens/Onboarding'));
const Main = lazy(() => import('./screens/Main'));
const Profile = lazy(() => import('./screens/Profile'));
const EditProfile = lazy(() => import('./screens/EditProfile'));
const AccountDetails = lazy(() => import('./screens/AccountDetails'));
const Clients = lazy(() => import('./screens/Clients'));
const AddClient = lazy(() => import('./screens/AddClient'));
const ClientDetail = lazy(() => import('./screens/ClientDetail'));
const EditClient = lazy(() => import('./screens/EditClient'));
const Offerings = lazy(() => import('./screens/Offerings'));
const OfferingDetail = lazy(() => import('./screens/OfferingDetail'));
const Subscription = lazy(() => import('./screens/Subscription'));
const Earnings = lazy(() => import('./screens/Earnings'));
const PayoutAccount = lazy(() => import('./screens/PayoutAccount'));
const ClientOnboarding = lazy(() => import('./screens/ClientOnboarding'));
const ClientHome = lazy(() => import('./screens/ClientHome'));
const ClientProfile = lazy(() => import('./screens/ClientProfile'));
const EditClientProfile = lazy(() => import('./screens/EditClientProfile'));
const AddTask = lazy(() => import('./screens/AddTask'));
const Messages = lazy(() => import('./screens/Messages'));
const MessagesInbox = lazy(() => import('./screens/MessagesInbox'));
const SessionRoom = lazy(() => import('./screens/SessionRoom'));
const Notifications = lazy(() => import('./screens/Notifications'));
const ShareProfile = lazy(() => import('./screens/ShareProfile'));
const PreviewProfile = lazy(() => import('./screens/PreviewProfile'));
const HelpCenter = lazy(() => import('./screens/HelpCenter'));
const CoachPrivacyPolicy = lazy(() => import('./screens/CoachPrivacyPolicy'));
const CoachTermsOfService = lazy(() => import('./screens/CoachTermsOfService'));
const Templates = lazy(() => import('./screens/Templates'));
const TemplateDetail = lazy(() => import('./screens/TemplateDetail'));
const Schedule = lazy(() => import('./screens/Schedule'));
const AddTimeBlock = lazy(() => import('./screens/AddTimeBlock'));
const Availability = lazy(() => import('./screens/Availability'));
const Discover = lazy(() => import('./screens/Discover'));
const CoachPreview = lazy(() => import('./screens/CoachPreview'));
const ClientCoach = lazy(() => import('./screens/ClientCoach'));
const ClientBooking = lazy(() => import('./screens/ClientBooking'));
const ClientSchedule = lazy(() => import('./screens/ClientSchedule'));
const ClientTasks = lazy(() => import('./screens/ClientTasks'));
const MyPrograms = lazy(() => import('./screens/MyPrograms'));
const ProgramDetail = lazy(() => import('./screens/ProgramDetail'));
const RateCoach = lazy(() => import('./screens/RateCoach'));
const CoachMessages = lazy(() => import('./screens/CoachMessages'));
const MyCoaches = lazy(() => import('./screens/MyCoaches'));
const ClaimInvite = lazy(() => import('./screens/ClaimInvite'));
const ClientNotifications = lazy(() => import('./screens/ClientNotifications'));
const ClientHelpCenter = lazy(() => import('./screens/ClientHelpCenter'));
const ClientPrivacyPolicy = lazy(() => import('./screens/ClientPrivacyPolicy'));
const ClientTermsOfService = lazy(() => import('./screens/ClientTermsOfService'));
const ComingSoon = lazy(() => import('./screens/ComingSoon'));

export default function App() {
  const { lang, dark, screen } = useAppStore();
  const signedIn = useAppStore((s) => s.authStatus === 'signedIn');
  const role = useAppStore((s) => s.role);

  // Picks up a session left by a provider redirect, and keeps the store in
  // step with it afterwards. Returns its own unsubscribe.
  useEffect(() => initSession(), []);

  // Native only: catches the provider's redirect back into the app after
  // an in-app-browser sign-in. A no-op in a browser, where that redirect
  // is an ordinary page load initSession() already picks up.
  useEffect(() => initOAuthDeepLinks(), []);

  // Android only: routes the hardware back button through the same back()
  // the on-screen arrow uses, instead of Capacitor's default of exiting the
  // app from wherever it's pressed. A no-op on iOS and in a browser.
  useEffect(() => initBackButton(), []);

  // Signed in: the unread badge on the tab bar, and the in-app sound for a
  // new message (store/unread.ts). Restarts if the account or role changes.
  useEffect(() => {
    if (!signedIn || !role || !isSupabaseConfigured()) return;
    return startUnreadWatch(role === 'coach' ? 'pro' : 'client');
  }, [signedIn, role]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    // The status bar's icons follow the app's theme, not the phone's.
    applySystemBarsStyle(dark);
  }, [dark]);

  return (
    // The same spinner every other wait in the app uses, rather than a
    // second kind of loading screen. Only the first visit to a screen
    // suspends: after that its module is cached, and inside the native
    // shell every chunk is already on the device.
    <Suspense fallback={<LoadState status="loading" />}>
      {renderScreen(screen)}
    </Suspense>
  );
}

function renderScreen(screen: Screen) {
  switch (screen) {
    case 'welcome':
      return <Welcome />;
    case 'roleSelect':
      return <RoleSelect />;
    case 'auth':
      return <Auth />;
    case 'discover':
      return <Discover />;
    case 'coachPreview':
      return <CoachPreview />;
    case 'clientCoach':
      return <ClientCoach />;
    case 'clientBooking':
      return <ClientBooking />;
    case 'clientSchedule':
      return <ClientSchedule />;
    case 'clientTasks':
      return <ClientTasks />;
    case 'myPrograms':
      return <MyPrograms />;
    case 'programDetail':
      return <ProgramDetail />;
    case 'rateCoach':
      return <RateCoach />;
    case 'coachMessages':
      return <CoachMessages />;
    case 'myCoaches':
      return <MyCoaches />;
    case 'claimInvite':
      return <ClaimInvite />;
    case 'clientNotifications':
      return <ClientNotifications />;
    case 'clientHelpCenter':
      return <ClientHelpCenter />;
    case 'clientPrivacyPolicy':
      return <ClientPrivacyPolicy />;
    case 'clientTermsOfService':
      return <ClientTermsOfService />;
    case 'clientAuth':
      return <ClientAuth />;
    case 'onboarding':
      return <Onboarding />;
    case 'main':
      return <Main />;
    case 'profile':
      return <Profile />;
    case 'editProfile':
      return <EditProfile />;
    case 'accountDetails':
      return <AccountDetails />;
    case 'clients':
      return <Clients />;
    case 'addClient':
      return <AddClient />;
    case 'clientDetail':
      return <ClientDetail />;
    case 'editClient':
      return <EditClient />;
    case 'offerings':
      return <Offerings />;
    case 'offeringDetail':
      return <OfferingDetail />;
    case 'subscription':
      return <Subscription />;
    case 'earnings':
      return <Earnings />;
    case 'payoutAccount':
      return <PayoutAccount />;
    case 'clientOnboarding':
      return <ClientOnboarding />;
    case 'clientHome':
      return <ClientHome />;
    case 'clientProfile':
      return <ClientProfile />;
    case 'editClientProfile':
      return <EditClientProfile />;
    case 'messages':
      return <Messages />;
    case 'messagesInbox':
      return <MessagesInbox />;
    case 'addTask':
      return <AddTask />;
    case 'sessionRoom':
      return <SessionRoom />;
    case 'notifications':
      return <Notifications />;
    case 'shareProfile':
      return <ShareProfile />;
    case 'previewProfile':
      return <PreviewProfile />;
    case 'helpCenter':
      return <HelpCenter />;
    case 'coachPrivacyPolicy':
      return <CoachPrivacyPolicy />;
    case 'coachTermsOfService':
      return <CoachTermsOfService />;
    case 'templates':
      return <Templates />;
    case 'templateDetail':
      return <TemplateDetail />;
    case 'schedule':
      return <Schedule />;
    case 'addTimeBlock':
      return <AddTimeBlock />;
    case 'availability':
      return <Availability />;
    case 'comingSoon':
      return <ComingSoon />;
    default: {
      // A Screen value with no case here is a compile error (unreachable
      // per the exhaustive union), not a silent blank page at runtime —
      // adding a screen to the Screen union without registering it here
      // used to fail exactly that way.
      const _exhaustive: never = screen;
      return _exhaustive;
    }
  }
}
