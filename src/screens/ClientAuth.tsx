import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { getCoachProfile } from '../lib/mockStore';
import { signInWithOAuth, type OAuthProvider } from '../lib/auth';
import { rememberAuthOrigin } from '../lib/oauthReturn';
import { isSupabaseConfigured } from '../lib/supabase';
import './ClientAuth.css';

const ACCENT = '#B75C3D';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.2v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.3 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8c.9-2.7 3.3-4.5 6.2-4.5z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="15" height="20" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

// 1:1 port of ClientAuth.dc.html — the member's side of sign-in, reached
// from a coach's invite rather than from RoleSelect's generic path.
//
// Like Auth.dc.html this is provider-only: no email, no password, and no
// sign-up form. The prototype's own note on this screen says signing in
// here "only marks the role" and that every required field is collected
// once afterwards, on ClientOnboarding's gated form — so this screen
// deliberately asks for nothing.
export default function ClientAuth() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const setRole = useAppStore((s) => s.setRole);
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [errorKey, setErrorKey] = useState('');

  // Same split as Auth: local state for failing to leave for the
  // provider, the store for failing to come back. A return that started
  // here is routed back here, so this screen has to be able to show one.
  const returnErrorKey = useAppStore((s) => s.authErrorKey);
  const returnErrorDetail = useAppStore((s) => s.authErrorDetail);
  const clearAuthError = useAppStore((s) => s.clearAuthError);
  const shownErrorKey = errorKey || returnErrorKey || '';
  const shownDetail = errorKey ? '' : returnErrorDetail;

  // The inviting coach. The prototype hardcoded "Yasmin El-Sayed" because
  // its store had exactly one Pro; reading the profile keeps the same
  // result without inventing a name. Once invites are real this becomes
  // the inviting coach's row, looked up from the invite token.
  const coach = getCoachProfile();
  const coachName = coach.name || 'Rafiq';
  const coachFirstName = coachName.split(/\s+/)[0] || coachName;

  function goOnward() {
    setRole('client');
    // The handoff the prototype describes: this screen marks the role, and
    // every required field is collected on ClientOnboarding's gated form.
    nav('clientOnboarding');
  }

  async function signIn(provider: OAuthProvider) {
    // Same fallback as Auth: unconnected Supabase behaves like the
    // prototype, whose buttons link straight on to ClientOnboarding.
    if (!isSupabaseConfigured()) {
      goOnward();
      return;
    }

    setPending(provider);
    setErrorKey('');
    clearAuthError();
    rememberAuthOrigin('clientAuth');
    const result = await signInWithOAuth(provider);
    if (!result.ok) {
      setPending(null);
      setErrorKey(
        result.code === 'network' ? 'authErrorNetwork'
          : result.code === 'not_configured' ? 'authErrorNotConfigured'
            : 'authErrorGeneric',
      );
      return;
    }
    // Success means the browser is already on its way to the provider.
    // The role is marked on return, once there is a profile row to mark.
  }

  return (
    <div className="phone-frame client-auth">
      <div className="client-auth-blob client-auth-blob-a" style={{ background: ACCENT }} />
      <div className="client-auth-blob client-auth-blob-b" />

      <div className="client-auth-topbar">
        <button
          className="client-auth-lang"
          aria-label={t('switchLanguage')}
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        >
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
      </div>

      <div className="client-auth-body">
        <div>
          <div
            className="client-auth-avatar"
            style={{
              background: `linear-gradient(135deg, ${ACCENT} 0%, ${darken(ACCENT, 35)} 100%)`,
              boxShadow: `0 12px 24px -8px ${ACCENT}55`,
            }}
          >
            {initialsOf(coachName)}
          </div>
          <div className="client-auth-eyebrow">{t('clientAuthInvitedBy', { name: coachName })}</div>
          <h1 className="client-auth-heading">{t('clientAuthHeading')}</h1>
          <p className="client-auth-subheading">{t('clientAuthSubheading', { name: coachFirstName })}</p>
        </div>

        <div className="client-auth-actions">
          {shownErrorKey && (
            <div className="client-auth-error" role="alert">
              {t(shownErrorKey)}
              {shownDetail && <span className="client-auth-error-detail" dir="ltr">{shownDetail}</span>}
            </div>
          )}

          <button
            className="client-auth-btn client-auth-btn-google"
            onClick={() => signIn('google')}
            disabled={pending !== null}
          >
            <GoogleMark />
            {pending === 'google' ? t('authConnecting') : t('authGoogle')}
          </button>

          <button
            className="client-auth-btn client-auth-btn-apple"
            onClick={() => signIn('apple')}
            disabled={pending !== null}
          >
            <AppleMark />
            {pending === 'apple' ? t('authConnecting') : t('authApple')}
          </button>

          <p className="client-auth-terms">{t('clientAuthTerms')}</p>
        </div>
      </div>
    </div>
  );
}
