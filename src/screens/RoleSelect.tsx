import { useState } from 'react';
import { useAppStore, type Role } from '../store/appStore';
import { setProfileRole } from '../lib/auth';
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

    // Mirror the choice onto profiles.role. Routing runs off the local copy,
    // so this is a background sync, not a gate — awaiting it would stall
    // navigation on a network round trip for something no screen reads yet.
    // Without it profiles.role keeps handle_new_user()'s 'client' default
    // (OAuth carries no role), and a second device would ask again instead
    // of remembering. No-ops when Supabase is unconfigured.
    if (role) {
      void setProfileRole(role).catch(() => {
        // Deliberately swallowed: a failed background sync must not break
        // the flow. The local role still stands, and the next sign-in
        // retries. Worth revisiting if profiles.role ever gates anything.
      });
    }
    // The member path goes through ClientAuth first: the design's order is
    // ClientAuth -> ClientOnboarding, and signing in is what marks the role
    // that ClientOnboarding's gated form then builds on. (Track B's own
    // routing sent members straight to ClientOnboarding; resolved in favour
    // of the design's order, with ClientAuth handing straight off to it.)
    //
    // In the design ClientAuth is reached from a coach's invite link, which
    // needs deep-link handling the app does not have yet — this is the
    // interim way in, and the screen itself is unchanged by it.
    nav(role === 'coach' ? 'onboarding' : 'clientAuth');
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
