import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { darken } from '../lib/color';
import { COUNTRIES, DEFAULT_COUNTRY } from '../lib/countries';
import { CountryPicker } from '../components/CountryPicker';
import { TextField } from '../components/TextField';
import { getClient, updateClient } from '../lib/mockStore';
import './EditClientProfile.css';

const CLIENT_ID = 'sara';
// Matches tokens.css's --accent — darken() needs a literal hex, not the CSS
// custom property, for the avatar gradient's darker stop.
const ACCENT_HEX = '#B75C3D';

// 1:1 port of EditClientProfile.dc.html — much smaller than the coach-side
// EditProfile.dc.html (no photos, no specialties): just name, age, and
// phone/dial-code, the only fields ClientProfile's own edit pencil needs.
export default function EditClientProfile() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const client = getClient(CLIENT_ID);

  const [name, setName] = useState(client?.name ?? '');
  const [age, setAge] = useState(client?.age != null ? String(client.age) : '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [dialCode, setDialCode] = useState(() => COUNTRIES.find((c) => c.dial === client?.countryCode)?.code ?? DEFAULT_COUNTRY.code);
  const [showDialPicker, setShowDialPicker] = useState(false);

  const dialCountry = COUNTRIES.find((c) => c.code === dialCode) ?? DEFAULT_COUNTRY;
  const avatarInitials = name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || client?.initials || 'SA';
  const avatarGrad = `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)`;

  function save() {
    updateClient(CLIENT_ID, {
      name: name.trim() || client?.name,
      age: age === '' ? (client?.age ?? null) : Number(age),
      phone: phone.trim() || client?.phone,
      countryCode: dialCountry.dial,
    });
    nav('clientProfile');
  }

  return (
    <div className="phone-frame">
      <div className="edit-client-profile-header">
        <button type="button" className="edit-client-profile-cancel" onClick={() => nav('clientProfile')}>
          {t('profileCancel')}
        </button>
        <div className="edit-client-profile-title">{t('editProfileTitle')}</div>
        <button type="button" className="edit-client-profile-save" onClick={save}>
          {t('editProfileSave')}
        </button>
      </div>

      <div className="edit-client-profile-body">
        <div className="edit-client-profile-avatar-block">
          <div className="edit-client-profile-avatar" style={{ background: avatarGrad }}>
            {avatarInitials}
          </div>
        </div>

        <TextField id="cname" label={t('fullName')} type="text" value={name} onChange={(e) => setName(e.target.value)} />

        <TextField id="cage" label={t('editClientProfileAge')} type="number" min={0} value={age} onChange={(e) => setAge(e.target.value)} />

        <div className="edit-client-profile-field">
          <label htmlFor="cphone" className="edit-client-profile-label">
            {t('phoneNumber')}
          </label>
          <div className="edit-client-profile-phone-row">
            <button type="button" className="edit-client-profile-dial-btn" onClick={() => setShowDialPicker(true)}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{dialCountry.flag}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{dialCountry.dial}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className="edit-client-profile-phone-divider" />
            <input id="cphone" className="edit-client-profile-phone-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 123 4567" />
          </div>
        </div>
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
