/**
 * How many numbered sections each policy document has, and the types that
 * check it.
 *
 * Its own module, not `PolicyPage.tsx`, for two reasons. A file that
 * exports a constant beside a component breaks React Fast Refresh, which
 * `react/only-export-components` exists to catch — and `PolicyPage.tsx`
 * escaped that rule only because `as const satisfies T` happens to be the
 * one shape oxlint does not flag, which is luck, not a design. And the
 * four screens and three specs that read this want the number, not the
 * component: importing it from here costs them nothing.
 */
import type { MessageKey } from '../lib/i18n';

/** The four policy documents `PolicyPage` renders. Naming them as a union
    rather than taking any `string` lets the compiler expand
    `${prefix}${n}Heading` into real keys and check every one of them. */
export type SectionPrefix = 'privacySection' | 'termsSection' | 'clientPrivacySection' | 'clientTermsSection';

/** Every section number a document may have. `PolicyPage` slices it to
    the count it was given and renders one section per entry. */
export const SECTION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type SectionNumber = (typeof SECTION_NUMBERS)[number];

/** The section counts one document may claim: every number whose heading
    *and* body key exist for that document's own prefix.

    This used to be a single `SectionNumber` shared by all four documents,
    which coupled them — the keys are checked by expanding
    `${prefix}${n}Heading`, so a seventh privacy section demanded a
    seventh terms section too, and the only way round it was to park extra
    copy in `footer`. Keyed on the prefix, the privacy policies can run to
    ten sections while the terms stay at six, and every key is still
    checked at the call site. */
export type ValidSectionCount<P extends SectionPrefix> = {
  [N in SectionNumber]: `${P}${N}Heading` extends MessageKey
    ? `${P}${N}Body` extends MessageKey
      ? N
      : never
    : never;
}[SectionNumber];

/** How many numbered sections each document has.

    One place, because this fact was copied five times and a four-section
    change to the privacy policies broke three specs at once: the four
    screens pass it to `PolicyPage`, and `scripts/build-site.mjs` keeps its
    own copy because it runs outside the browser.

    `satisfies` checks each count against its own document, so a number
    whose keys do not exist is a compile error here rather than a missing
    heading at runtime. What it cannot catch is a section deleted from both
    this map and `i18n.ts` — the specs assert the counts they expect
    literally (`POLICY_SECTIONS` in `tests/helpers.js`) and check this map
    against them, rather than reading their expectation out of here. */
export const POLICY_SECTION_COUNT = {
  privacySection: 10,
  clientPrivacySection: 10,
  termsSection: 6,
  clientTermsSection: 6,
} as const satisfies { [P in SectionPrefix]: ValidSectionCount<P> };
