import { useState, type ChangeEvent } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { darken } from '../lib/color';
import { COUNTRIES, DEFAULT_COUNTRY } from '../lib/countries';
import { SPECIALTIES, SPECIALTY_CATEGORIES } from '../lib/specialties';
import { SpecialtyIcon } from '../components/specialtyIcons';
import { CameraIcon, CloseIcon, PlusIcon } from '../components/icons';
import { CountryPicker } from '../components/CountryPicker';
import { updateCoachProfile, type SessionMode } from '../lib/mockStore';
import { saveOwnCoachProfile, type CoachProfileEdits, type ProfileErrorCode } from '../lib/profileData';
import { useOwnCoachProfile, useOwnProfileStore, type OwnProfileView } from '../store/ownProfileStore';
import { LoadState } from '../components/LoadState';
import { photoProblem } from '../lib/storage';
import './EditProfile.css';

const SESSION_MODES: { key: SessionMode; labelKey: MessageKey }[] = [
  { key: 'online', labelKey: 'editProfileOnline' },
  { key: 'in_person', labelKey: 'editProfileInPerson' },
  { key: 'both', labelKey: 'editProfileBoth' },
];

// Same Arabic/English/French set Discover.dc.html's language filter offers
// members, so a Pro's selection here is always filterable there. Shown as
// literal English words regardless of `lang`, exactly as the design does.
const LANGUAGE_OPTIONS = ['Arabic', 'English', 'French'];

// Matches tokens.css's --accent — darken() needs a literal hex, not the
// CSS custom property, for the avatar-fallback gradient's darker stop.
const ACCENT_HEX = '#B75C3D';

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

// 1:1 port of EditProfile.dc.html. Every field stays in local component
// state until Save writes it all to the store at once — Cancel simply
// navigates away, discarding the draft, same as the design.
export default function EditProfile() {
  const own = useOwnCoachProfile();
  if (own.status === 'loading') return <LoadState status="loading" />;
  if (own.status === 'error') return <LoadState status="error" onRetry={own.retry} showBack />;
  return <EditProfileForm own={own} />;
}

const SAVE_ERROR_KEY: Record<ProfileErrorCode, MessageKey> = {
  photo_too_large: 'photoTooLarge',
  photo_wrong_type: 'photoWrongType',
  photo_failed: 'requestFailedRetry',
  not_configured: 'requestFailedRetry',
  not_signed_in: 'requestFailedRetry',
  unknown: 'requestFailedRetry',
};

function EditProfileForm({ own }: { own: Extract<OwnProfileView, { status: 'ready' }> }) {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  const userId = useAppStore((s) => s.userId);
  const setOwnProfile = useOwnProfileStore((s) => s.setData);
  const profile = own.profile;
  // Still mockStore's tier, signed in or not: the real one arrives with
  // payments (LAUNCH-CHECKLIST.md §3), which hasn't been decided yet.

  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [dialCode, setDialCode] = useState(() => COUNTRIES.find((c) => c.dial === profile.countryCode)?.code ?? DEFAULT_COUNTRY.code);
  const [residencyCode, setResidencyCode] = useState(() => COUNTRIES.find((c) => c.name === profile.country)?.code ?? DEFAULT_COUNTRY.code);
  const [experienceYears, setExperienceYears] = useState(profile.experienceYears === '' ? '' : String(profile.experienceYears));
  const [sessionMode, setSessionMode] = useState<SessionMode>(profile.sessionMode);
  const [languages, setLanguages] = useState<string[]>(profile.languages);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(profile.title ? profile.title.split(' · ') : []);
  const [certifications, setCertifications] = useState<string[]>(profile.certifications);
  const [newCert, setNewCert] = useState('');
  const [bio, setBio] = useState(profile.bio);
  const [avatarPhotoUrl, setAvatarPhotoUrl] = useState(profile.avatarPhotoUrl);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(profile.coverPhotoUrl);
  // The picked files themselves, for the real save to upload. undefined =
  // untouched, null = removed. The *PhotoUrl states above are the previews.
  const [avatarFile, setAvatarFile] = useState<File | null | undefined>(undefined);
  const [coverFile, setCoverFile] = useState<File | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<MessageKey | null>(null);

  const [showDialPicker, setShowDialPicker] = useState(false);
  const [showResidencyPicker, setShowResidencyPicker] = useState(false);

  const dialCountry = COUNTRIES.find((c) => c.code === dialCode) ?? DEFAULT_COUNTRY;
  const residencyCountry = COUNTRIES.find((c) => c.code === residencyCode) ?? DEFAULT_COUNTRY;
  const avatarInitials = name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'YE';
  const hasAvatarPhoto = !!avatarPhotoUrl;
  const hasCoverPhoto = !!coverPhotoUrl;

  function toggleLanguage(label: string) {
    setLanguages((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  }
  function toggleSpecialty(value: string) {
    setSelectedSpecialties((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));
  }
  function addCert() {
    const val = newCert.trim();
    if (!val) return;
    setCertifications((prev) => [...prev, val]);
    setNewCert('');
  }
  function removeCert(i: number) {
    setCertifications((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Refused at pick time, so the current photo stays on screen rather
  // than being replaced by one the save is going to reject.
  function acceptPhoto(e: ChangeEvent<HTMLInputElement>): File | null {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return null;
    const problem = photoProblem(file);
    if (problem) {
      setSaveError(problem === 'too_large' ? 'photoTooLarge' : 'photoWrongType');
      return null;
    }
    setSaveError(null);
    return file;
  }

  async function handleAvatarFile(e: ChangeEvent<HTMLInputElement>) {
    const file = acceptPhoto(e);
    if (!file) return;
    setAvatarFile(file);
    setAvatarPhotoUrl(await readImageFile(file));
  }
  async function handleCoverFile(e: ChangeEvent<HTMLInputElement>) {
    const file = acceptPhoto(e);
    if (!file) return;
    setCoverFile(file);
    setCoverPhotoUrl(await readImageFile(file));
  }
  function removeAvatar() {
    setAvatarFile(null);
    setAvatarPhotoUrl('');
  }
  function removeCover() {
    setCoverFile(null);
    setCoverPhotoUrl('');
  }

  function save() {
    if (saving) return;
    const edits: CoachProfileEdits = {
      name: name.trim() || profile.name,
      phone: phone.trim() || profile.phone,
      countryCode: dialCountry.dial,
      country: residencyCountry.name,
      countryFlag: residencyCountry.flag,
      title: selectedSpecialties.join(' · ') || profile.title,
      certifications,
      // certifications[0] stays the short badge Profile's hero and the
      // completeness check already read as `cert`.
      cert: certifications[0] || profile.cert,
      experienceYears: experienceYears === '' ? profile.experienceYears : Number(experienceYears),
      sessionMode,
      languages,
      bio,
    };

    if (!own.remote) {
      updateCoachProfile({ ...edits, avatarPhotoUrl, coverPhotoUrl });
      nav('profile');
      return;
    }

    setSaving(true);
    setSaveError(null);
    void saveOwnCoachProfile(edits, { avatar: avatarFile, cover: coverFile }).then((result) => {
      setSaving(false);
      if (!result.ok) {
        setSaveError(SAVE_ERROR_KEY[result.code]);
        return;
      }
      if (userId) setOwnProfile(userId, result.data);
      nav('profile');
    });
  }

  return (
    <div className="phone-frame">
      <div className="edit-profile-header">
        <button type="button" className="edit-profile-cancel" onClick={() => nav('profile')}>
          {t('profileCancel')}
        </button>
        <div className="edit-profile-title">{t('editProfileTitle')}</div>
        <button type="button" className="edit-profile-save" onClick={save} disabled={saving}>
          {saving ? t('savingEllipsis') : t('editProfileSave')}
        </button>
      </div>
      {saveError && (
        <div className="edit-profile-error" role="alert">
          {t(saveError)}
        </div>
      )}

      <div className="edit-profile-body">
        <div className="edit-profile-avatar-block">
          <div className="edit-profile-avatar-wrap">
            {hasAvatarPhoto ? (
              <img src={avatarPhotoUrl} alt="" className="edit-profile-avatar-img" />
            ) : (
              <div
                className="edit-profile-avatar-fallback"
                style={{ background: `linear-gradient(135deg, var(--accent) 0%, ${darken(ACCENT_HEX, 35)} 100%)` }}
              >
                {avatarInitials}
              </div>
            )}
            <label htmlFor="avatarFileInput" aria-label={t('editProfileChangePhoto')} className="edit-profile-avatar-edit-btn">
              <CameraIcon size={14} color="var(--accent)" />
            </label>
            <input id="avatarFileInput" type="file" accept="image/*" onChange={handleAvatarFile} style={{ display: 'none' }} />
          </div>
          {hasAvatarPhoto ? (
            <button type="button" className="edit-profile-link" onClick={removeAvatar}>
              {t('editProfileRemovePhoto')}
            </button>
          ) : (
            <label htmlFor="avatarFileInput" className="edit-profile-link">
              {t('editProfileChangePhoto')}
            </label>
          )}
        </div>

        <div className="edit-profile-field">
          <label className="edit-profile-label">{t('editProfileCoverPhoto')}</label>
          <div className="edit-profile-cover-box">
            {hasCoverPhoto ? (
              <img src={coverPhotoUrl} alt="" className="edit-profile-cover-img" />
            ) : (
              <div className="edit-profile-cover-empty">{t('editProfileNoCoverPhoto')}</div>
            )}
          </div>
          <div className="edit-profile-cover-actions">
            <label htmlFor="coverFileInput" className="edit-profile-cover-btn">
              {hasCoverPhoto ? t('editProfileChangeCover') : t('editProfileAddCoverPhoto')}
            </label>
            {hasCoverPhoto && (
              <button type="button" className="edit-profile-cover-btn edit-profile-cover-remove" onClick={removeCover}>
                {t('editProfileRemoveCover')}
              </button>
            )}
            <input id="coverFileInput" type="file" accept="image/*" onChange={handleCoverFile} style={{ display: 'none' }} />
          </div>
        </div>

        <div className="edit-profile-field">
          <label htmlFor="epname" className="edit-profile-label">
            {t('fullName')}
          </label>
          <input id="epname" type="text" className="edit-profile-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="edit-profile-field">
          <label htmlFor="epphone" className="edit-profile-label">
            {t('phoneNumber')}
          </label>
          <div className="edit-profile-phone-row">
            <button type="button" className="edit-profile-dial-btn" onClick={() => setShowDialPicker(true)}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{dialCountry.flag}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{dialCountry.dial}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className="edit-profile-phone-divider" />
            <input id="epphone" type="tel" className="edit-profile-phone-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 123 4567" />
          </div>
        </div>

        <div className="edit-profile-field">
          <label className="edit-profile-label">{t('country')}</label>
          <button type="button" className="edit-profile-country-btn" onClick={() => setShowResidencyPicker(true)}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{residencyCountry.flag}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600 }}>{residencyCountry.name}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <div className="edit-profile-field">
          <label htmlFor="epyears" className="edit-profile-label">
            {t('yearsOfExperience')}
          </label>
          <input
            id="epyears"
            type="number"
            min={0}
            className="edit-profile-input"
            value={experienceYears}
            onChange={(e) => setExperienceYears(e.target.value)}
            placeholder="6"
          />
        </div>

        <div className="edit-profile-field">
          <label className="edit-profile-label">{t('editProfileSessionFormat')}</label>
          <div className="edit-profile-session-row">
            {SESSION_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`edit-profile-session-chip${sessionMode === m.key ? ' is-selected' : ''}`}
                onClick={() => setSessionMode(m.key)}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="edit-profile-field">
          <label className="edit-profile-label">{t('editProfileLanguages')}</label>
          <div className="edit-profile-chip-wrap">
            {LANGUAGE_OPTIONS.map((label) => (
              <button
                key={label}
                type="button"
                className={`edit-profile-chip${languages.includes(label) ? ' is-selected' : ''}`}
                onClick={() => toggleLanguage(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="edit-profile-specialties">
          <div>
            <div className="edit-profile-label">{t('whatDoYouCoach')}</div>
            <div className="edit-profile-label-sub">{t('chooseAllThatApply')}</div>
          </div>
          {SPECIALTY_CATEGORIES.map((cat) => (
            <div className="edit-profile-specialty-group" key={cat.key}>
              <div className="edit-profile-specialty-cat">{t(cat.titleKey)}</div>
              <div className="edit-profile-chip-wrap">
                {SPECIALTIES.filter((s) => s.category === cat.key).map((s) => {
                  const selected = selectedSpecialties.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      className={`edit-profile-chip edit-profile-specialty-chip${selected ? ' is-selected' : ''}`}
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

        <div className="edit-profile-field">
          <div>
            <label className="edit-profile-label">{t('editProfileCredentials')}</label>
            <div className="edit-profile-label-sub">{t('editProfileCredentialsSub')}</div>
          </div>
          {certifications.map((label, i) => (
            <div className="edit-profile-cert-row" key={`${label}-${i}`}>
              <div className="edit-profile-cert-label">{label}</div>
              <button type="button" aria-label={t('editProfileRemoveCert', { name: label })} className="edit-profile-cert-remove" onClick={() => removeCert(i)}>
                <CloseIcon size={13} color="var(--ink-soft)" />
              </button>
            </div>
          ))}
          <div className="edit-profile-cert-add">
            <input
              type="text"
              placeholder={t('editProfileAddCertPlaceholder')}
              value={newCert}
              onChange={(e) => setNewCert(e.target.value)}
              className="edit-profile-cert-input"
            />
            <button type="button" aria-label={t('editProfileAddCert')} className="edit-profile-cert-add-btn" onClick={addCert}>
              <PlusIcon size={14} color="#FFFFFF" />
            </button>
          </div>
        </div>

        <div className="edit-profile-field">
          <label htmlFor="epbio" className="edit-profile-label">
            {t('editProfileBio')}
          </label>
          <textarea
            id="epbio"
            rows={4}
            className="edit-profile-textarea"
            placeholder={t('editProfileBioPlaceholder')}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
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
      <CountryPicker
        open={showResidencyPicker}
        onClose={() => setShowResidencyPicker(false)}
        title={t('selectCountry')}
        searchPlaceholder={t('searchCountries')}
        noResultsLabel={t('noCountriesMatch')}
        selectedCode={residencyCode}
        onSelect={(c) => {
          setResidencyCode(c.code);
          setShowResidencyPicker(false);
        }}
      />

    </div>
  );
}
