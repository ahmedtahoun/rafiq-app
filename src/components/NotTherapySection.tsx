import { useT, type MessageKey } from '../lib/i18n';
import { CrisisResources } from './CrisisResources';

/**
 * "Coaching is not therapy", plus where to get help — the last block of
 * both Terms documents.
 *
 * It is a footer rather than a seventh numbered section because the
 * numbered ones are checked by expanding `${prefix}${n}Heading` over every
 * document, so a seventh number would require the two privacy policies to
 * grow one too. Here the keys are written out, so they are checked the
 * same way and nothing is invented for a document that does not want it.
 *
 * The heading is the shared `notTherapyTitle`: member onboarding says the
 * same thing, and two wordings of "we are not a therapist" drift.
 */
export function NotTherapySection({ bodyKey }: { bodyKey: MessageKey }) {
  const t = useT();
  return (
    <section className="policy-page-section">
      <h2 className="policy-page-heading">{t('notTherapyTitle')}</h2>
      <p className="policy-page-text">{t(bodyKey)}</p>
      <CrisisResources />
    </section>
  );
}
