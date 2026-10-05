import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { COUNTRIES, DEFAULT_COUNTRY } from '../lib/countries';
import { SPECIALTIES, SPECIALTY_CATEGORIES } from '../lib/specialties';
import { CountryPicker } from '../components/CountryPicker';
import { SpecialtyIcon } from '../components/specialtyIcons';
import { TextField, TextAreaField } from '../components/TextField';
import { PersonIcon } from '../components/icons';
import { LoadState } from '../components/LoadState';
import { useRoster, type RosterView } from '../store/rosterStore';
import { MEMBER_CAP, atMemberCap, usePlan, type Plan } from '../lib/planData';
import './AddClient.css';

const PLANS: { value: string; labelKey: MessageKey }[] = [
  { value: 'Basic', labelKey: 'addClientPlanBasic' },
  { value: 'Full Access', labelKey: 'addClientPlanFullAccess' },
];

export default function AddClient() {
  const roster = useRoster();
  const plan = usePlan();
  if (roster.status === 'loading' || plan.status === 'loading') return <LoadState status="loading" />;
  if (roster.status === 'error') return <LoadState status="error" onRetry={roster.retry} showBack />;
  if (plan.status === 'error') return <LoadState status="error" onRetry={plan.retry} showBack />;
  // The database refuses the member past the plan's cap (0024), so
  // say so before the coach fills in a form that can't be saved.
  if (atMemberCap(plan.plan, roster.clients.filter((c) => c.active).length)) return <AddClientCap plan={plan.plan} />;
  return <AddClientView roster={roster} />;
}

function AddClientCap({ plan }: { plan: Plan }) {
  const t = useT();
  const onPro = plan.tier === 'pro';
  const nav = useAppStore((s) => s.nav);
  return (
    <div className="phone-frame add-client-screen">
      <div className="add-client-header">
        <button type="button" className="add-client-header-btn" onClick={() => nav('clients')}>{t('addClientCancel')}</button>
        <div className="add-client-header-title">{t('addClientTitle')}</div>
        {/* Holds the Save button's place, so the title stays centred. */}
        <span className="add-client-header-btn" aria-hidden="true" style={{ visibility: 'hidden' }}>{t('addClientSave')}</span>
      </div>
      <div className="add-client-cap" role="status">
        <div className="add-client-cap-title">{t(onPro ? 'addClientCapTitlePro' : 'addClientCapTitle')}</div>
        <p className="add-client-cap-body">
          {onPro
            ? t('addClientCapBodyPro', { cap: MEMBER_CAP.pro ?? 0 })
            : t('addClientCapBody', { cap: MEMBER_CAP.free ?? 0, proCap: MEMBER_CAP.pro ?? 0 })}
        </p>
        <button type="button" className="add-client-cap-btn" onClick={() => nav('subscription')}>{t('addClientCapSeePlans')}</button>
      </div>
    </div>
  );
}

function AddClientView({ roster }: { roster: Extract<RosterView, { status: 'ready' }> }) {
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
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const dialCountry = COUNTRIES.find((c) => c.code === dialCode) ?? DEFAULT_COUNTRY;
  const canSave = name.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setSaveFailed(false);
    const added = await roster.actions.addClient({
      name,
      age: age === '' ? null : Number(age),
      phone,
      countryCode: dialCountry.dial,
      specialty,
      plan,
      goal,
      notes,
    });
    setSaving(false);
    if (added) nav('clients');
    else setSaveFailed(true);
  }

  return (
    <div className="phone-frame add-client-screen">
      <div className="add-client-header">
        <button type="button" className="add-client-header-btn" onClick={() => nav('clients')}>{t('addClientCancel')}</button>
        <div className="add-client-header-title">{t('addClientTitle')}</div>
        <button
          type="button"
          className={`add-client-header-btn add-client-save${canSave ? '' : ' is-disabled'}`}
          disabled={!canSave}
          onClick={() => void save()}
        >
          {t('addClientSave')}
        </button>
      </div>

      {saveFailed && (
        <div className="add-client-error" role="alert">
          {t('requestFailedRetry')}
        </div>
      )}

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
        <TextAreaField id="acnotes" label={t('addClientNotes')} hint={t('notesMemberCanAsk')} rows={2} placeholder={t('addClientNotesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="add-client-footer">
        <button type="button" className={`add-client-submit${canSave ? '' : ' is-disabled'}`} disabled={!canSave} onClick={() => void save()}>
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
