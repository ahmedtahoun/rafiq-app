import { useT } from '../lib/i18n';
import { CRISIS_RESOURCES, telHref } from '../lib/crisisResources';
import './CrisisResources.css';

/**
 * The crisis list, rendered the same way wherever it appears: both Terms
 * screens and the sheet a member can open from onboarding.
 *
 * A row whose number is not confirmed yet says so instead of rendering an
 * empty gap or a dead link (`crisisResources.ts` explains why every number
 * starts null). The organisation and what it is for are still worth
 * showing — someone can search for it — but nothing here pretends to be
 * dialable when it is not.
 */
export function CrisisResources() {
  const t = useT();

  return (
    <div className="crisis">
      <p className="crisis-lead">{t('crisisLead')}</p>
      <p className="crisis-emergency">{t('crisisEmergencyLead')}</p>

      <ul className="crisis-list">
        {CRISIS_RESOURCES.map((r) => (
          <li key={r.id} className="crisis-row">
            <div className="crisis-row-text">
              <div className="crisis-name"><bdi>{t(r.nameKey)}</bdi></div>
              <div className="crisis-for">{t(r.forKey)}</div>
              {r.hoursKey && <div className="crisis-hours">{t(r.hoursKey)}</div>}
            </div>
            {r.phone ? (
              // dir="ltr" and its own <bdi>: a phone number is Latin digits
              // inside Arabic text, and bidi reordering moves a leading + to
              // the wrong end of it.
              <a className="crisis-call" href={telHref(r.phone)} dir="ltr">
                <bdi>{r.phone}</bdi>
              </a>
            ) : (
              <span className="crisis-unconfirmed">{t('crisisUnconfirmed')}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="crisis-note">{t('crisisOutsideEgypt')}</p>
      <p className="crisis-note">{t('crisisTellSomeone')}</p>
    </div>
  );
}
