import { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { isRtl } from './lib/i18n';
import Welcome from './screens/Welcome';
import RoleSelect from './screens/RoleSelect';
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
    case 'comingSoon':
      return <ComingSoon />;
  }
}
