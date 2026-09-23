import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { COUNTRIES, DEFAULT_COUNTRY } from '../lib/countries';
import { SPECIALTIES, SPECIALTY_CATEGORIES } from '../lib/specialties';
import { CountryPicker } from '../components/CountryPicker';
import { SpecialtyIcon } from '../components/specialtyIcons';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import './Onboarding.css';

const EXPERIENCE_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: '<1 year', labelKey: 'expLt1' },
  { value: '1-2 years', labelKey: 'exp1to2' },
  { value: '3-5 years', labelKey: 'exp3to5' },
  { value: '5+ years', labelKey: 'exp5plus' },
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function Onboarding() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const completeCoachSignup = useAppStore((s) => s.completeCoachSignup);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dialCode, setDialCode] = useState(DEFAULT_COUNTRY.code);
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY.code);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [experience, setExperience] = useState('1-2 years');
  const [showValidation, setShowValidation] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showDialPicker, setShowDialPicker] = useState(false);

  const dialCountry = COUNTRIES.find((c) => c.code === dialCode) ?? DEFAULT_COUNTRY;
  const countryDef = COUNTRIES.find((c) => c.code === country) ?? DEFAULT_COUNTRY;

  function toggleSpecialty(value: string) {
    setSpecialties((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));
  }

  const nameValid = name.trim().length > 0;
  const phoneValid = phone.trim().length >= 7;
  const emailValid = isValidEmail(email);
  const cityValid = city.trim().length > 0;
  const specialtiesValid = specialties.length > 0;
  const canFinish = nameValid && phoneValid && emailValid && cityValid && specialtiesValid;

  const missing: string[] = [];
  if (!nameValid) missing.push(t('missingName'));
  if (!phoneValid) missing.push(t('missingPhone'));
  if (!emailValid) missing.push(t('missingEmail'));
  if (!cityValid) missing.push(t('missingCity'));
  if (!specialtiesValid) missing.push(t('missingSpecialties'));
  const validationMessage = missing.length
    ? `${t('validationPrefix')}${missing.join(t('listSeparator'))}${t('validationSuffix')}`
    : '';

  function finish() {
    if (!canFinish) return;
    completeCoachSignup({
      name: name.trim(),
      phone: phone.trim(),
      countryDial: dialCountry.dial,
      email: email.trim(),
      city: city.trim(),
      country: countryDef.name,
      specialties,
      experience,
    });
  }

  return (
    <div className="phone-frame">
      <div className="onboarding-header">
        <div className="onboarding-progress-dot" />
        <button className="onboarding-lang-toggle" aria-label="Toggle language" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>
          {lang === 'en' ? 'ع' : 'EN'}
        </button>
      </div>

      <div className="onboarding-body">
        <div>
          <div className="onboarding-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.2-4.4 4.2-6.6 8-6.6s6.8 2.2 8 6.6" />
            </svg>
          </div>
          <h1 className="onboarding-title">{t('welcomePrefix')}{name.trim().split(' ')[0] || ''}</h1>
          <p className="onboarding-subtitle">{t('onboardingSubtitle')}</p>
        </div>

        <TextField id="oname" label={t('fullName')} type="text" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="onboarding-field">
          <label className="onboarding-field-label" htmlFor="ophone">{t('phoneNumber')}</label>
          <div className="onboarding-phone-row">
            <button className="onboarding-dial-btn" onClick={() => setShowDialPicker(true)}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{dialCountry.flag}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{dialCountry.dial}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <div className="onboarding-dial-divider" />
            <input id="ophone" className="onboarding-phone-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 123 4567" />
          </div>
          <div className="onboarding-field-hint">{t('onboardingPhoneHint')}</div>
        </div>

        <TextField id="oemail" label={t('emailAddress')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <TextField id="ocity" label={t('city')} type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Cairo" />

        <div className="onboarding-field">
          <div className="onboarding-field-label">{t('country')}</div>
          <button className="onboarding-country-btn" onClick={() => setShowCountryPicker(true)}>
            <span>{countryDef.flag} {countryDef.name}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="onboarding-section-label">{t('whatDoYouCoach')}</div>
            <div className="onboarding-section-sub">{t('chooseAllThatApply')}</div>
          </div>
          {SPECIALTY_CATEGORIES.map((cat) => (
            <div className="onboarding-category" key={cat.key}>
              <div className="onboarding-category-title">{t(cat.titleKey)}</div>
              <div className="onboarding-chips">
                {SPECIALTIES.filter((s) => s.category === cat.key).map((s) => {
                  const selected = specialties.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      className={`onboarding-chip${selected ? ' is-selected' : ''}`}
                      onClick={() => toggleSpecialty(s.value)}
                    >
                      <SpecialtyIcon specialty={s.icon} color={selected ? '#FFFFFF' : 'var(--ink-soft)'} />
                      <span>{t(s.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="onboarding-section-label">{t('yearsOfExperience')}</div>
          <div className="onboarding-exp-row">
            {EXPERIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`onboarding-chip${experience === opt.value ? ' is-selected' : ''}`}
                onClick={() => setExperience(opt.value)}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="onboarding-footer">
        {canFinish ? (
          <Button onClick={finish}>{t('getStarted')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setShowValidation(true)}>{t('getStarted')}</Button>
            {showValidation && <div className="onboarding-validation">{validationMessage}</div>}
          </>
        )}
      </div>

      <CountryPicker
        open={showCountryPicker}
        onClose={() => setShowCountryPicker(false)}
        title={t('selectCountry')}
        searchPlaceholder={t('searchCountries')}
        noResultsLabel={t('noCountriesMatch')}
        selectedCode={country}
        onSelect={(c) => { setCountry(c.code); setShowCountryPicker(false); }}
      />
      <CountryPicker
        open={showDialPicker}
        onClose={() => setShowDialPicker(false)}
        title={t('selectDialingCode')}
        searchPlaceholder={t('searchCountries')}
        noResultsLabel={t('noCountriesMatch')}
        selectedCode={dialCode}
        showDial
        onSelect={(c) => { setDialCode(c.code); setShowDialPicker(false); }}
      />
    </div>
  );
}
