import { useId } from 'react';
import { useT } from '../lib/i18n';
import type { SignupConsentValue } from '../lib/signupConsent';
import './SignupConsent.css';

/**
 * The two boxes every new account answers on the last step of onboarding
 * (LEGAL-DRAFTS.md clause 11, approved by counsel): agreement to the data
 * being held outside Egypt, and 18 or over. Both start unticked, and the
 * signup cannot finish without both — profileData records them (0030).
 */
export function SignupConsent({ value, onChange, disabled }: {
  value: SignupConsentValue;
  onChange: (next: SignupConsentValue) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const id = useId();
  return (
    <section className="signup-consent" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="signup-consent-title">{t('signupConsentTitle')}</h2>
      <p className="signup-consent-body">{t('signupConsentBody')}</p>
      <label className="signup-consent-row">
        <input
          type="checkbox"
          className="signup-consent-transfer"
          checked={value.transfer}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, transfer: e.target.checked })}
        />
        <span>{t('signupConsentTransfer')}</span>
      </label>
      <label className="signup-consent-row">
        <input
          type="checkbox"
          className="signup-consent-age"
          checked={value.adult}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, adult: e.target.checked })}
        />
        <span>{t('signupConsentAge')}</span>
      </label>
    </section>
  );
}
