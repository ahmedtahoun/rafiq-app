import type { ReactNode } from 'react';
import { useAppStore } from '../store/appStore';
import { useT, type MessageKey } from '../lib/i18n';
import { ChevronIcon } from '../components/icons';
import './PolicyPage.css';

/** The four policy documents this page renders. Naming them as a union
    rather than taking any `string` lets the compiler expand
    `${prefix}${n}Heading` into real keys and check every one of them. */
type SectionPrefix = 'privacySection' | 'termsSection' | 'clientPrivacySection' | 'clientTermsSection';

const SECTION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
type SectionNumber = (typeof SECTION_NUMBERS)[number];

/** The section counts one document may claim: every number whose heading
    *and* body key exist for that document's own prefix.

    This used to be a single `SectionNumber` shared by all four documents,
    which coupled them — the keys are checked by expanding
    `${prefix}${n}Heading`, so a seventh privacy section demanded a
    seventh terms section too, and the only way round it was to park extra
    copy in `footer`. Keyed on the prefix, the privacy policies can run to
    ten sections while the terms stay at six, and every key is still
    checked at the call site. */
type ValidSectionCount<P extends SectionPrefix> = {
  [N in SectionNumber]: `${P}${N}Heading` extends MessageKey
    ? `${P}${N}Body` extends MessageKey
      ? N
      : never
    : never;
}[SectionNumber];

/** How many numbered sections each document has.

    One source of truth, because this fact was copied five times and a
    four-section change to the privacy policies broke three specs at once:
    the four screens pass it to `PolicyPage`, `tests/copy-and-i18n.spec.js`
    and `tests/misc.spec.js` assert against it, and
    `tests/public-site.spec.js` uses it to check the published pages.
    `scripts/build-site.mjs` keeps its own copy — it runs outside the
    browser — but `public-site.spec.js` compares published text against the
    app's copy, so a generator that fell behind this map fails there.

    `satisfies` checks each count against its own document, so a number
    whose keys do not exist is a compile error here rather than a missing
    heading at runtime. */
export const POLICY_SECTION_COUNT = {
  privacySection: 10,
  clientPrivacySection: 10,
  termsSection: 6,
  clientTermsSection: 6,
} as const satisfies { [P in SectionPrefix]: ValidSectionCount<P> };

interface PolicyPageProps<P extends SectionPrefix> {
  titleKey: MessageKey;
  updatedKey: MessageKey;
  /** Section copy lives at `${sectionPrefix}{n}Heading` / `...Body`, 1-based. */
  sectionPrefix: P;
  sectionCount: ValidSectionCount<P>;
  /** Rendered after the numbered sections. The Terms screens put
      "Coaching is not therapy" and the crisis list here, which is still
      the right home for it: it is one block of prose with its own keys,
      not a numbered section of the document. */
  footer?: ReactNode;
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
export function PolicyPage<P extends SectionPrefix>({ titleKey, updatedKey, sectionPrefix, sectionCount, footer }: PolicyPageProps<P>) {
  const t = useT();
  const back = useAppStore((s) => s.back);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);

  const sections = SECTION_NUMBERS.slice(0, sectionCount);

  /** `ValidSectionCount<P>` already proved at the call site that every
      number up to `sectionCount` has both keys for this prefix, which is
      where getting it wrong would be a real bug. The compiler cannot carry
      that proof through a `P` it has not resolved, so the composed key is
      asserted here and nowhere else. */
  const sectionKey = (n: SectionNumber, part: 'Heading' | 'Body') =>
    `${sectionPrefix}${n}${part}` as MessageKey;

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
            <h2 className="policy-page-heading">{t(sectionKey(n, 'Heading'))}</h2>
            <p className="policy-page-text">{t(sectionKey(n, 'Body'))}</p>
          </section>
        ))}
        {footer}
      </div>
    </div>
  );
}
