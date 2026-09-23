import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { COUNTRIES, DEFAULT_COUNTRY } from '../lib/countries';
import { SpecialtyIcon, type SpecialtyIconKey } from '../components/specialtyIcons';
import { CountryPicker } from '../components/CountryPicker';
import { Button } from '../components/Button';
import { TextField, TextAreaField } from '../components/TextField';
import './ClientOnboarding.css';

// Same 12-item focus list as the design's ClientOnboarding.dc.html — a
// single-select "what do you want to work on" field, distinct from the
// coach-side multi-select specialty picker (src/lib/specialties.ts): a
// member picks one focus here, a coach can offer several specialties.
// Icon identity is zipped by position with the label, same as the design's
// own focusIconKeys/focusList arrays kept separate.
const FOCUS_OPTIONS: { labelKey: MessageKey; icon: SpecialtyIconKey }[] = [
  { labelKey: 'clientFocusLife', icon: 'life' },
  { labelKey: 'clientFocusMeditation', icon: 'meditation' },
  { labelKey: 'clientFocusBreathwork', icon: 'breathwork' },
  { labelKey: 'clientFocusFreeDiving', icon: 'freeDiving' },
  { labelKey: 'clientFocusScuba', icon: 'scuba' },
  { labelKey: 'clientFocusYoga', icon: 'yoga' },
  { labelKey: 'clientFocusCalisthenics', icon: 'calisthenics' },
  { labelKey: 'clientFocusCareer', icon: 'career' },
  { labelKey: 'clientFocusRelationships', icon: 'relationship' },
  { labelKey: 'clientFocusStress', icon: 'stress' },
  { labelKey: 'clientFocusSleep', icon: 'sleep' },
  { labelKey: 'clientFocusNutrition', icon: 'nutrition' },
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function ClientOnboarding() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const completeClientSignup = useAppStore((s) => s.completeClientSignup);

  const [focus, setFocus] = useState(FOCUS_OPTIONS[0].labelKey);
  const [goal, setGoal] = useState('');
  const [phone, setPhone] = useState('');
  const [dialCode, setDialCode] = useState(DEFAULT_COUNTRY.code);
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [showDialPicker, setShowDialPicker] = useState(false);

  const dialCountry = COUNTRIES.find((c) => c.code === dialCode) ?? DEFAULT_COUNTRY;

  const goalValid = goal.trim().length > 0;
  const phoneValid = phone.trim().length >= 7;
  const emailValid = isValidEmail(email);
  const cityValid = city.trim().length > 0;
  const canFinish = goalValid && phoneValid && emailValid && cityValid;

  const missing: string[] = [];
  if (!goalValid) missing.push(t('clientOnboardingMissingGoal'));
  if (!phoneValid) missing.push(t('missingPhone'));
  if (!emailValid) missing.push(t('missingEmail'));
  if (!cityValid) missing.push(t('missingCity'));
  const validationMessage = missing.length
    ? `${t('validationPrefix')}${missing.join(t('listSeparator'))}${t('validationSuffix')}`
    : '';

  function finish() {
    if (!canFinish) return;
    completeClientSignup({
      goal: goal.trim(),
      phone: phone.trim(),
      countryCode: dialCountry.dial,
      email: email.trim(),
      city: city.trim(),
      focus: t(focus),
    });
  }

  return (
    <div className="phone-frame">
      <div className="client-onboarding-header">
        <div className="client-onboarding-progress-dot" />
        <button className="client-onboarding-lang-toggle" aria-label="Toggle language" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
          {lang === 'en' ? 'ع' : 'EN'}
        </button>
      </div>

      <div className="client-onboarding-body">
        <div>
          <div className="client-onboarding-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M14.5 9.5L12 15l-2.5-2 2.5-3.5z" />
            </svg>
          </div>
          <h1 className="client-onboarding-title">{t('clientOnboardingHeading')}</h1>
          <p className="client-onboarding-subtitle">{t('clientOnboardingSubheading')}</p>
        </div>

        <div className="client-onboarding-field">
          <div className="client-onboarding-field-label">{t('clientOnboardingFocusLabel')}</div>
          <div className="client-onboarding-chips">
            {FOCUS_OPTIONS.map((f) => {
              const selected = focus === f.labelKey;
              return (
                <button
                  key={f.labelKey}
                  className={`client-onboarding-chip${selected ? ' is-selected' : ''}`}
                  onClick={() => setFocus(f.labelKey)}
                >
                  <SpecialtyIcon specialty={f.icon} color={selected ? '#FFFFFF' : 'var(--ink-soft)'} />
                  <span>{t(f.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <TextAreaField
          id="cgoal"
          label={t('clientOnboardingGoalLabel')}
          rows={3}
          placeholder={t('clientOnboardingGoalPlaceholder')}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />

        <div className="client-onboarding-field">
          <label className="client-onboarding-field-label" htmlFor="cwphone">
            {t('phoneNumber')}
          </label>
          <div className="client-onboarding-phone-row">
            <button className="client-onboarding-dial-btn" onClick={() => setShowDialPicker(true)}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{dialCountry.flag}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{dialCountry.dial}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className="client-onboarding-dial-divider" />
            <input id="cwphone" className="client-onboarding-phone-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 123 4567" />
          </div>
          <div className="client-onboarding-field-hint">{t('clientOnboardingWhatsappNote')}</div>
        </div>

        <TextField id="cemail" label={t('emailAddress')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <TextField
          id="ccity"
          label={t('city')}
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder={t('clientOnboardingCityPlaceholder')}
        />
      </div>

      <div className="client-onboarding-footer">
        {canFinish ? (
          <Button onClick={finish}>{t('getStarted')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setShowValidation(true)}>
              {t('getStarted')}
            </Button>
            {showValidation && <div className="client-onboarding-validation">{validationMessage}</div>}
          </>
        )}
      </div>

      <CountryPicker
        open={showDialPicker}
        onClose={() => setShowDialPicker(false)}
        title={t('selectDialingCode')}
        searchPlaceholder={t('searchCountries')}
        noResultsLabel={t('noCountriesMatch')}
        selectedCode={dialCode}
        showDial
        onSelect={(c) => {
          setDialCode(c.code);
          setShowDialPicker(false);
        }}
      />
    </div>
  );
}
