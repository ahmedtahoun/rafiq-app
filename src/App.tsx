import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { isRtl } from './lib/i18n';
import { initSession } from './lib/session';
import { initOAuthDeepLinks } from './lib/auth';
import Welcome from './screens/Welcome';
import RoleSelect from './screens/RoleSelect';
import Auth from './screens/Auth';
import ClientAuth from './screens/ClientAuth';
import Onboarding from './screens/Onboarding';
import Main from './screens/Main';
import Profile from './screens/Profile';
import EditProfile from './screens/EditProfile';
import AccountDetails from './screens/AccountDetails';
import Clients from './screens/Clients';
import AddClient from './screens/AddClient';
import ClientDetail from './screens/ClientDetail';
import EditClient from './screens/EditClient';
import Offerings from './screens/Offerings';
import OfferingDetail from './screens/OfferingDetail';
import Subscription from './screens/Subscription';
import Earnings from './screens/Earnings';
import ClientOnboarding from './screens/ClientOnboarding';
import ClientHome from './screens/ClientHome';
import ClientProfile from './screens/ClientProfile';
import EditClientProfile from './screens/EditClientProfile';
import AddTask from './screens/AddTask';
import Messages from './screens/Messages';
import MessagesInbox from './screens/MessagesInbox';
import SessionRoom from './screens/SessionRoom';
import Notifications from './screens/Notifications';
import ShareProfile from './screens/ShareProfile';
import PreviewProfile from './screens/PreviewProfile';
import HelpCenter from './screens/HelpCenter';
import CoachPrivacyPolicy from './screens/CoachPrivacyPolicy';
import CoachTermsOfService from './screens/CoachTermsOfService';
import Templates from './screens/Templates';
import TemplateDetail from './screens/TemplateDetail';
import Schedule from './screens/Schedule';
import AddTimeBlock from './screens/AddTimeBlock';
import Availability from './screens/Availability';
import Discover from './screens/Discover';
import CoachPreview from './screens/CoachPreview';
import ClientCoach from './screens/ClientCoach';
import ClientBooking from './screens/ClientBooking';
import ClientSchedule from './screens/ClientSchedule';
import ClientTasks from './screens/ClientTasks';
import MyPrograms from './screens/MyPrograms';
import ProgramDetail from './screens/ProgramDetail';
import ComingSoon from './screens/ComingSoon';

export default function App() {
  const { lang, dark, screen } = useAppStore();

  // Picks up a session left by a provider redirect, and keeps the store in
  // step with it afterwards. Returns its own unsubscribe.
  useEffect(() => initSession(), []);

  // Native only: catches the provider's redirect back into the app after
  // an in-app-browser sign-in. A no-op in a browser, where that redirect
  // is an ordinary page load initSession() already picks up.
  useEffect(() => initOAuthDeepLinks(), []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

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
