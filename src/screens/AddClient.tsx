import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { COUNTRIES, DEFAULT_COUNTRY } from '../lib/countries';
import { SPECIALTIES, SPECIALTY_CATEGORIES } from '../lib/specialties';
import { CountryPicker } from '../components/CountryPicker';
import { SpecialtyIcon } from '../components/specialtyIcons';
import { TextField, TextAreaField } from '../components/TextField';
import { PersonIcon } from '../components/icons';
import { addClient } from '../lib/mockStore';
import './AddClient.css';

const PLANS: { value: string; labelKey: string }[] = [
  { value: 'Basic', labelKey: 'addClientPlanBasic' },
  { value: 'Full Access', labelKey: 'addClientPlanFullAccess' },
];

export default function AddClient() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [dialCode, setDialCode] = useState(DEFAULT_COUNTRY.code);
  const [specialty, setSpecialty] = useState(SPECIALTIES[0].value);
  const [plan, setPlan] = useState('Basic');
  const [goal, setGoal] = useState('');
  const [notes, setNotes] = useState('');
  const [showDialPicker, setShowDialPicker] = useState(false);

  const dialCountry = COUNTRIES.find((c) => c.code === dialCode) ?? DEFAULT_COUNTRY;
  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    addClient({
      name,
      age: age === '' ? null : Number(age),
      phone,
      countryCode: dialCountry.dial,
      specialty,
      plan,
      goal,
      notes,
    });
    nav('clients');
  }

  return (
    <div className="phone-frame add-client-screen">
      <div className="add-client-header">
        <button type="button" className="add-client-header-btn" onClick={() => nav('clients')}>{t('addClientCancel')}</button>
        <div className="add-client-header-title">{t('addClientTitle')}</div>
        <button
          type="button"
          className={`add-client-header-btn add-client-save${canSave ? '' : ' is-disabled'}`}
          onClick={save}
        >
          {t('addClientSave')}
        </button>
      </div>

      <div className="add-client-body">
        <div className="add-client-avatar-row">
          <div className="add-client-avatar-placeholder">
            <PersonIcon size={30} color="var(--ink-soft)" />
          </div>
          <div className="add-client-avatar-hint">{t('addClientAddPhoto')}</div>
        </div>

        <div className="add-client-name-age-row">
          <div style={{ flex: 2, minWidth: 0 }}>
            <TextField id="acname" label={t('fullName')} type="text" placeholder={t('addClientNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField id="acage" label={t('addClientAge')} type="number" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
        </div>

        <div className="add-client-field">
          <label className="add-client-field-label" htmlFor="acphone">{t('phoneNumber')}</label>
          <div className="add-client-phone-row">
            <button type="button" className="add-client-dial-btn" onClick={() => setShowDialPicker(true)}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{dialCountry.flag}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{dialCountry.dial}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <div className="add-client-dial-divider" />
            <input id="acphone" className="add-client-phone-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 123 4567" />
          </div>
        </div>

        <div className="add-client-field">
          <div className="add-client-field-label">{t('addClientSpecialty')}</div>
          {SPECIALTY_CATEGORIES.map((cat) => (
            <div className="add-client-category" key={cat.key}>
              <div className="add-client-category-title">{t(cat.titleKey)}</div>
              <div className="add-client-chip-wrap">
                {SPECIALTIES.filter((s) => s.category === cat.key).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`add-client-chip${specialty === s.value ? ' is-selected' : ''}`}
                    onClick={() => setSpecialty(s.value)}
                  >
                    <SpecialtyIcon specialty={s.icon} color={specialty === s.value ? '#FFFFFF' : 'var(--ink-soft)'} />
                    <span>{t(s.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="add-client-field">
          <div className="add-client-field-label">{t('addClientPlan')}</div>
          <div className="add-client-plan-row">
            {PLANS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`add-client-chip add-client-chip-flex${plan === p.value ? ' is-selected' : ''}`}
                onClick={() => setPlan(p.value)}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <TextAreaField id="acgoal" label={t('addClientGoal')} rows={3} placeholder={t('addClientGoalPlaceholder')} value={goal} onChange={(e) => setGoal(e.target.value)} />
        <TextAreaField id="acnotes" label={t('addClientNotes')} rows={2} placeholder={t('addClientNotesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="add-client-footer">
        <button type="button" className={`add-client-submit${canSave ? '' : ' is-disabled'}`} onClick={save}>
          {t('addClientSubmit')}
        </button>
      </div>

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
