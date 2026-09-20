import { useEffect, useState } from 'react';
import { useAppStore } from './store/appStore';
import { isRtl } from './lib/i18n';
import Welcome from './screens/Welcome';
import RoleSelect from './screens/RoleSelect';
import ComingSoon from './screens/ComingSoon';

type Flow = 'welcome' | 'roleSelect' | 'app';

export default function App() {
  const { lang, dark, role } = useAppStore();
  const [flow, setFlow] = useState<Flow>('welcome');

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  if (flow === 'welcome') {
    return <Welcome onDone={() => setFlow('roleSelect')} />;
  }
  if (flow === 'roleSelect') {
    return <RoleSelect onContinue={() => setFlow('app')} onBack={() => setFlow('welcome')} />;
  }
  return <ComingSoon role={role} />;
}
