import { useAppStore } from '../store/appStore';
import './ComingSoon.css';

// Honest placeholder — everything past role selection (Onboarding /
// ClientOnboarding, Auth, and the ~90 in-app screens) is still being
// ported from the design prototype screen by screen. This exists so the
// early flow (theming, i18n, RTL, persistence, routing) is verifiable
// end-to-end before the rest lands.
export default function ComingSoon() {
  const { lang, setLang, dark, setDark, role } = useAppStore();

  return (
    <div className="phone-frame coming-soon">
      <div className="coming-soon-body">
        <div className="coming-soon-badge">{role === 'coach' ? 'Pro' : 'Member'}</div>
        <h1>More on the way</h1>
        <p>You picked <b>{role}</b>. The rest of the app is being built out screen by screen from the approved design.</p>

        <div className="coming-soon-controls">
          <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
            Language: {lang === 'en' ? 'English' : 'العربية'}
          </button>
          <button onClick={() => setDark(!dark)}>
            Theme: {dark ? 'Dark' : 'Light'}
          </button>
        </div>
      </div>
    </div>
  );
}
