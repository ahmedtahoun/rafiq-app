import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { COUNTRIES, DEFAULT_COUNTRY } from '../lib/countries';
import { SPECIALTIES } from '../lib/specialties';
import { CountryPicker } from '../components/CountryPicker';
import { SpecialtyIcon } from '../components/specialtyIcons';
import { TextField, TextAreaField } from '../components/TextField';
import { WarningIcon } from '../components/icons';
import { darken } from '../lib/color';
import { getClient, getClientDetailHref, updateClient } from '../lib/mockStore';
import './EditClient.css';

const PLANS: { value: string; labelKey: MessageKey }[] = [
  { value: 'Basic', labelKey: 'addClientPlanBasic' },
  { value: 'Full Access', labelKey: 'addClientPlanFullAccess' },
];

export default function EditClient() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const params = useAppStore((s) => s.params);
  const clientId = params.clientId ?? '';
  const client = getClient(clientId);

  const dialDefault = COUNTRIES.find((c) => c.dial === client?.countryCode)?.code ?? DEFAULT_COUNTRY.code;

  const [name, setName] = useState(client?.name ?? '');
  const [age, setAge] = useState(client?.age != null ? String(client.age) : '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [dialCode, setDialCode] = useState(dialDefault);
  const [specialty, setSpecialty] = useState(client?.specialty ?? SPECIALTIES[0].value);
  const [plan, setPlan] = useState(client?.plan ?? 'Basic');
  const [goal, setGoal] = useState(client?.goal ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [showDialPicker, setShowDialPicker] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  if (!client) return null;
  const savedClient = client;

  const dialCountry = COUNTRIES.find((c) => c.code === dialCode) ?? DEFAULT_COUNTRY;
  const detailHref = getClientDetailHref(clientId);
  const avatarInitials = name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || client.initials;

  function save() {
    updateClient(clientId, {
      name: name.trim() || savedClient.name,
      age: age === '' ? savedClient.age : Number(age),
      phone: phone.trim() || savedClient.phone,
      countryCode: dialCountry.dial,
      specialty,
      plan,
      program: `${specialty} · ${plan}`,
      goal,
      notes,
    });
    nav(detailHref);
  }

  function archive() {
    updateClient(clientId, { active: false, needsCheckin: false });
    nav('clients');
  }

  return (
    <div className="phone-frame edit-client-screen">
      <div className="edit-client-header">
        <button type="button" className="edit-client-header-btn" onClick={() => nav(detailHref)}>{t('editClientCancel')}</button>
        <div className="edit-client-header-title">{t('editClientTitle')}</div>
        <button type="button" className="edit-client-header-btn edit-client-save" onClick={save}>{t('editClientSave')}</button>
      </div>

      <div className="edit-client-body">
        <div className="edit-client-avatar-row">
          <div
            className="edit-client-avatar"
            style={{ background: `linear-gradient(135deg, ${client.avatarBg} 0%, ${darken(client.avatarBg, 35)} 100%)` }}
          >
            {avatarInitials}
          </div>
        </div>

        <div className="edit-client-name-age-row">
          <div style={{ flex: 2, minWidth: 0 }}>
            <TextField id="ecname" label={t('fullName')} type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField id="ecage" label={t('addClientAge')} type="number" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
        </div>

        <div className="edit-client-field">
          <label className="edit-client-field-label" htmlFor="ecphone">{t('phoneNumber')}</label>
          <div className="edit-client-phone-row">
            <button type="button" className="edit-client-dial-btn" onClick={() => setShowDialPicker(true)}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{dialCountry.flag}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{dialCountry.dial}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <div className="edit-client-dial-divider" />
            <input id="ecphone" className="edit-client-phone-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="edit-client-field">
          <div className="edit-client-field-label">{t('addClientSpecialty')}</div>
          <div className="edit-client-chip-wrap">
            {SPECIALTIES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`edit-client-chip${specialty === s.value ? ' is-selected' : ''}`}
                onClick={() => setSpecialty(s.value)}
              >
                <SpecialtyIcon specialty={s.icon} color={specialty === s.value ? '#FFFFFF' : 'var(--ink-soft)'} />
                <span>{t(s.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="edit-client-field">
          <div className="edit-client-field-label">{t('addClientPlan')}</div>
          <div className="edit-client-plan-row">
            {PLANS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`edit-client-chip edit-client-chip-flex${plan === p.value ? ' is-selected' : ''}`}
                onClick={() => setPlan(p.value)}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <TextAreaField id="ecgoal" label={t('editClientGoal')} rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />
        <TextAreaField id="ecnotes" label={t('editClientNotes')} rows={2} placeholder={t('addClientNotesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <button type="button" className="edit-client-archive-btn" onClick={() => setShowArchiveConfirm(true)}>
          {t('editClientArchive')}
        </button>
      </div>

      {showArchiveConfirm && (
        <div className="edit-client-modal-backdrop" onClick={() => setShowArchiveConfirm(false)}>
          <div className="edit-client-modal" onClick={(e) => e.stopPropagation()}>
            <div className="edit-client-modal-icon">
              <WarningIcon size={20} color="var(--red)" />
            </div>
            <div className="edit-client-modal-title">{t('editClientArchiveTitle', { name: client.name })}</div>
            <div className="edit-client-modal-body">{t('editClientArchiveBody')}</div>
            <div className="edit-client-modal-actions">
              <button type="button" className="edit-client-modal-btn edit-client-modal-btn-neutral" onClick={() => setShowArchiveConfirm(false)}>
                {t('editClientCancel')}
              </button>
              <button type="button" className="edit-client-modal-btn edit-client-modal-btn-danger" onClick={archive}>
                {t('editClientArchiveConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

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
