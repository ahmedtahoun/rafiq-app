import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { isRtl } from './lib/i18n';
import Welcome from './screens/Welcome';
import RoleSelect from './screens/RoleSelect';
import Onboarding from './screens/Onboarding';
import Main from './screens/Main';
import Profile from './screens/Profile';
import EditProfile from './screens/EditProfile';
import AccountDetails from './screens/AccountDetails';
import Clients from './screens/Clients';
import AddClient from './screens/AddClient';
import ClientDetail from './screens/ClientDetail';
import EditClient from './screens/EditClient';
import ComingSoon from './screens/ComingSoon';

export default function App() {
  const { lang, dark, screen } = useAppStore();

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
