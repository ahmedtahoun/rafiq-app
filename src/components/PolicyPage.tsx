import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { ChevronIcon } from '../components/icons';
import './PolicyPage.css';

/** The four policy documents this page renders. Naming them as a union
    rather than taking any `string` lets the compiler expand
    `${prefix}${n}Heading` into real keys and check every one of them. */
type SectionPrefix = 'privacySection' | 'termsSection' | 'clientPrivacySection' | 'clientTermsSection';

const SECTION_NUMBERS = [1, 2, 3, 4, 5, 6] as const;
type SectionNumber = (typeof SECTION_NUMBERS)[number];

interface PolicyPageProps {
  titleKey: MessageKey;
  updatedKey: MessageKey;
  /** Section copy lives at `${sectionPrefix}{n}Heading` / `...Body`, 1-based. */
  sectionPrefix: SectionPrefix;
  sectionCount: SectionNumber;
}

/**
 * The shared body of CoachPrivacyPolicy.dc.html and
 * CoachTermsOfService.dc.html.
 *
 * Those two screens are identical in the design down to the padding —
 * a back button, a title, a language toggle, a "last updated" line, and a
 * list of heading/body pairs. Only the copy differs, so they share this and
 * supply their own i18n keys rather than carrying two copies of the same
 * markup that would drift the first time one is touched.
 */
export function PolicyPage({ titleKey, updatedKey, sectionPrefix, sectionCount }: PolicyPageProps) {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);

  const sections = SECTION_NUMBERS.slice(0, sectionCount);

  return (
    <div className="phone-frame policy-page">
      <div className="policy-page-header">
        <button className="policy-page-back" aria-label={t('back')} onClick={back}>
          <ChevronIcon size={16} />
        </button>
        <div className="policy-page-title">{t(titleKey)}</div>
        <button
          className="policy-page-lang"
          aria-label={t('switchLanguage')}
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        >
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
      </div>

      <div className="policy-page-body">
        <div className="policy-page-updated">{t(updatedKey)}</div>
        {sections.map((n) => (
          <section key={n} className="policy-page-section">
            <h2 className="policy-page-heading">{t(`${sectionPrefix}${n}Heading`)}</h2>
            <p className="policy-page-text">{t(`${sectionPrefix}${n}Body`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
