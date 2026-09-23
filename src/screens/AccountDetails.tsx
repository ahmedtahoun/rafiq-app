import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, ArrowForwardIcon } from '../components/icons';
import { getCoachProfile } from '../lib/mockStore';
import './AccountDetails.css';

// 1:1 port of AccountDetails.dc.html — a small read-mostly screen off
// Profile's "Account" section. The design's sign-in method is a fixed
// "Google · Connected" row (this prototype has no real auth yet), so it's
// ported as static display, not a working OAuth control.
export default function AccountDetails() {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const nav = useAppStore((s) => s.nav);
  const profile = getCoachProfile();
  const profilePhone = `${profile.countryCode} ${profile.phone}`.trim();

  return (
    <div className="phone-frame">
      <div className="account-header">
        <button type="button" className="account-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="account-title">{t('profileAccountDetails')}</div>
      </div>

      <div className="account-body">
        <div className="account-section">
          <div className="account-section-label">{t('accountSignInMethod')}</div>
          <div className="account-row">
            <div className="account-google-icon">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z" />
                <path fill="#34A853" d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.2v2.8A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8z" />
                <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.3 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8c.9-2.7 3.3-4.5 6.2-4.5z" />
              </svg>
            </div>
            <div className="account-row-text">
              <div className="account-row-title">Google</div>
              <div className="account-row-sub">{profile.email}</div>
            </div>
            <div className="account-connected-badge">{t('accountConnected')}</div>
          </div>
        </div>

        <div className="account-section">
          <div className="account-section-label">{t('accountContact')}</div>
          <button type="button" className="account-row account-row-link" onClick={() => nav('editProfile')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.8 2.1z" />
            </svg>
            <div className="account-row-text">
              <div className="account-row-title">{t('phoneNumber')}</div>
              <div className="account-row-sub">{profilePhone}</div>
            </div>
            <ArrowForwardIcon size={15} color="var(--ink-soft)" />
          </button>
        </div>

        <div className="account-hint">{t('accountSwitchHint')}</div>
      </div>
    </div>
  );
}
