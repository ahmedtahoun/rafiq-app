import { useState } from 'react';
import { useAppStore, type Role } from '../store/appStore';
import { useT } from '../lib/i18n';
import { ChevronIcon, CheckIcon, CoachIcon, PersonIcon } from '../components/icons';
import './RoleSelect.css';

export default function RoleSelect() {
  const t = useT();
  const setRole = useAppStore((s) => s.setRole);
  const nav = useAppStore((s) => s.nav);
  const back = useAppStore((s) => s.back);
  const [selected, setSelected] = useState<Role>(null);

  function choose(role: Role) {
    setSelected(role);
    setRole(role);
    nav(role === 'coach' ? 'onboarding' : 'clientOnboarding');
  }

  return (
    <div className="phone-frame">
      <div className="role-select-header">
        <button className="role-select-back" aria-label="Back" onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="role-select-mark" style={{ background: 'linear-gradient(135deg, var(--accent), #7A3D26)' }}>
          <span>R</span>
        </div>
      </div>

      <div className="role-select-body">
        <div>
          <h1 className="role-select-title">{t('roleTitle')}</h1>
          <p className="role-select-subtitle">{t('roleSubtitle')}</p>
        </div>

        <div className="role-select-cards">
          <button className={`role-card${selected === 'coach' ? ' is-selected' : ''}`} onClick={() => choose('coach')}>
            <div className="role-card-row">
              <div className="role-card-icon"><CoachIcon /></div>
              <div className="role-card-text">
                <div className="role-card-title">{t('imPro')}</div>
                <div className="role-card-sub">{t('imProSub')}</div>
              </div>
              <div className="role-card-check">{selected === 'coach' && <CheckIcon size={11} color="#FFFFFF" />}</div>
            </div>
          </button>

          <button className={`role-card${selected === 'client' ? ' is-selected' : ''}`} onClick={() => choose('client')}>
            <div className="role-card-row">
              <div className="role-card-icon"><PersonIcon /></div>
              <div className="role-card-text">
                <div className="role-card-title">{t('imMember')}</div>
                <div className="role-card-sub">{t('imMemberSub')}</div>
              </div>
              <div className="role-card-check">{selected === 'client' && <CheckIcon size={11} color="#FFFFFF" />}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
