import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';
import { SearchIcon } from './icons';
import './NoCoachYet.css';

/**
 * What a signed-in member sees where a coach's plan would be, before any
 * coach has accepted them (a relationship starts when a coach accepts a
 * session request — 0008). Points them at Discover, the only way in.
 */
export function NoCoachYet() {
  const t = useT();
  const nav = useAppStore((s) => s.nav);
  return (
    <div className="no-coach-yet" role="status">
      <div className="no-coach-yet-icon" aria-hidden="true">
        <SearchIcon size={22} color="var(--accent)" />
      </div>
      <div className="no-coach-yet-title">{t('memberNoCoachTitle')}</div>
      <div className="no-coach-yet-body">{t('memberNoCoachBody')}</div>
      <button type="button" className="no-coach-yet-cta" onClick={() => nav('discover')}>
        {t('memberNoCoachCta')}
      </button>
      {/* The other way in: a coach who already works with this member added
          them by hand before they had an account, and sent them a code
          (0013). Without this there is no way to redeem one. */}
      <button type="button" className="no-coach-yet-alt" onClick={() => nav('claimInvite')}>
        {t('memberNoCoachInviteCta')}
      </button>
    </div>
  );
}
