/** The two answers onboarding's consent boxes hold (components/SignupConsent). */
export interface SignupConsentValue {
  transfer: boolean;
  adult: boolean;
}

export const NO_SIGNUP_CONSENT: SignupConsentValue = { transfer: false, adult: false };

export function signupConsentGiven(v: SignupConsentValue): boolean {
  return v.transfer && v.adult;
}
