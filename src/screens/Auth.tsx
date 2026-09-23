import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { darken } from '../lib/color';
import { ChevronIcon } from '../components/icons';
import { signInWithOAuth, type OAuthProvider } from '../lib/auth';
import { rememberAuthOrigin } from '../lib/oauthReturn';
import { isSupabaseConfigured } from '../lib/supabase';
import './Auth.css';

// Same accent the design prototype's Auth.dc.html carries as its default
// prop. Kept literal rather than read from tokens.css because darken()
// needs a hex, not a CSS custom property — same reason Profile.tsx does it.
const ACCENT = '#B75C3D';

// Brand marks live here rather than in components/icons.tsx: they are
// third-party logos with fixed colors, used on these two screens only, and
// icons.tsx is a file every track edits.
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

// 1:1 port of Auth.dc.html — the entry sign-in, sitting between Welcome
// and RoleSelect exactly as the prototype links it (its back button goes
// to Welcome1, both provider buttons go to RoleSelect).
//
// The design offers Google and Apple only; there is no email/password
// field anywhere on it, so this screen uses the OAuth half of lib/auth.ts
// and none of the password half.
export default function Auth() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);

  // A failed provider return is reported by lib/session.ts, not by this
  // component: it happens while the app is away, so the attempt outlives
  // the mount that started it. Local state covers failures to *leave* for
  // the provider; the store covers failures to come back.
  const returnErrorKey = useAppStore((s) => s.authErrorKey);
  const returnErrorDetail = useAppStore((s) => s.authErrorDetail);
  const clearAuthError = useAppStore((s) => s.clearAuthError);
  const shownErrorKey: MessageKey | null = errorKey ?? returnErrorKey ?? null;
  const shownDetail = errorKey ? '' : returnErrorDetail;

  async function signIn(provider: OAuthProvider) {
    // With no Supabase project wired up, the prototype's own behaviour is
    // the honest fallback: its buttons are plain links onward to
    // RoleSelect. That keeps every screen past this one reachable in dev
    // (the app still runs entirely on mockStore) instead of this becoming
    // a gate nobody can pass until credentials exist.
    if (!isSupabaseConfigured()) {
      nav('roleSelect');
      return;
    }

    setPending(provider);
    setErrorKey(null);
    clearAuthError();
    rememberAuthOrigin('auth');
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
    // On success the browser has already left for the provider's consent
    // screen; the session lands back through onAuthStateChange, so there
    // is deliberately nothing to navigate to here.
  }

  return (
    <div className="phone-frame auth">
      <div className="auth-blob auth-blob-a" style={{ background: ACCENT }} />
      <div className="auth-blob auth-blob-b" />

      <div className="auth-top">
        <button className="auth-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>

        <div
          className="auth-mark"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${darken(ACCENT, 35)})`, boxShadow: `0 12px 24px -8px ${ACCENT}55` }}
        >
          <span>R</span>
        </div>

        <div className="auth-eyebrow">{t('authEyebrow')}</div>
        <h1 className="auth-headline">{t('authHeadline')}</h1>
        <p className="auth-subtext">{t('authSubtext')}</p>
      </div>

      <div className="auth-sheet">
        {shownErrorKey && (
          <div className="auth-error" role="alert">
            {t(shownErrorKey)}
            {/* The provider's own words, kept verbatim and LTR: it is the
                only part that says which piece of the setup refused, and
                translating or paraphrasing it would lose that. */}
            {shownDetail && <span className="auth-error-detail" dir="ltr">{shownDetail}</span>}
          </div>
        )}

        <button
          className="auth-btn auth-btn-google"
          onClick={() => signIn('google')}
          disabled={pending !== null}
        >
          <GoogleMark />
          {pending === 'google' ? t('authConnecting') : t('authGoogle')}
        </button>

        <button
          className="auth-btn auth-btn-apple"
          onClick={() => signIn('apple')}
          disabled={pending !== null}
        >
          <AppleMark />
          {pending === 'apple' ? t('authConnecting') : t('authApple')}
        </button>

        <p className="auth-terms">{t('authTerms')}</p>
      </div>
    </div>
  );
}
