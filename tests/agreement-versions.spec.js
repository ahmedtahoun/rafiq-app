import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/**
 * The coaching agreement's text is pinned. A signature (0028) stores only
 * the SHA-256 of the title and body the member was shown, so a signature
 * can be proven only against a text we still have. Every version a member
 * can sign is kept, word for word, in store/agreement-versions.md.
 *
 * An edit to the agreement copy in i18n.ts fails here until the new text
 * is archived there, as the next version, with its hash listed in ARCHIVED.
 * The old versions stay: a member may have signed them.
 */

const ARCHIVE = 'store/agreement-versions.md';

// Every version in the archive, by hash. Add to it; never remove from it.
const ARCHIVED = [
  // v1, 2026-10-05
  'f37878aa37dab8549ba58e5f9771ff9eb21d738c10cf9d7ba6b096ccd6be917a', // physical · en
  '099e023b8053a557aa4e29c0ebb863e4e50725e7f84d6eaa7a4243e63898d86b', // physical · ar
  '1e3eed7478b6d5dc26133ae89986602d6c1e61721517725d6e8cb6eac5e81f4a', // emotional · en
  '233ea3f7146984c4b7965fdbf0a51a98a6f705720dd6e10f9455e65f7db2c43a', // emotional · ar
  '70daddaaf2f43f8863f80fbd515bf476ed6d418a4b737a2cafbb3cc9bf7a9320', // general · en
  'a676993a0e905571c173e33a954587180ac37a5120823f184d6fc4354166615e', // general · ar
];

// A specialty for each agreement (mockStore.ts's getAgreementInfo).
const SPECIALTY = { physical: 'Yoga coaching', emotional: 'Breakup coaching', general: 'Career coaching' };

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

async function archive() {
  const md = await readFile(ARCHIVE, 'utf8');
  const entry = /^### (\w+) · (en|ar) · v(\d+)\n\n- \*\*SHA-256:\*\* `([0-9a-f]{64})`\n- \*\*In the app since:\*\* (\d{4}-\d{2}-\d{2})[^\n]*\n\n```text\n([\s\S]*?)\n```/gm;
  return [...md.matchAll(entry)].map(([, category, lang, version, hash, since, text]) => ({ category, lang, version: Number(version), hash, since, text }));
}

for (const lang of ['en', 'ar']) {
  test(`every agreement the app shows in ${lang === 'en' ? 'English' : 'Arabic'} is archived word for word`, async ({ page }) => {
    await page.goto('/');
    // What a signature hashes: the app's own text, through the app's own function.
    const shown = await page.evaluate(async ([lang, specialties]) => {
      const { translate } = await import('/src/lib/i18n.ts');
      const { getAgreementInfo } = await import('/src/lib/mockStore.ts');
      const { agreementTextSha256 } = await import('/src/lib/agreementData.ts');
      const out = [];
      for (const specialty of specialties) {
        const info = getAgreementInfo(specialty);
        const title = translate(lang, info.titleKey);
        const body = translate(lang, info.bodyKey);
        out.push({ category: info.category, text: `${title}\n\n${body}`, hash: await agreementTextSha256(title, body) });
      }
      return out;
    }, [lang, Object.values(SPECIALTY)]);
    expect(shown.map((s) => s.category)).toEqual(Object.keys(SPECIALTY));

    const archived = await archive();
    for (const { category, text, hash } of shown) {
      expect(hash).toBe(sha256(text));
      const found = archived.find((a) => a.category === category && a.lang === lang && a.hash === hash);
      expect(found, `The ${category} agreement the app shows in ${lang} (SHA-256 ${hash}) isn't in ${ARCHIVE}. `
        + 'If you changed its copy: archive the new text as the next version, add the hash to ARCHIVED, and keep the old version. '
        + 'If you didn\'t: a version has gone missing from the archive, so restore it.').toBeTruthy();
      expect(ARCHIVED).toContain(hash);
    }
  });
}

test('every archived version is still there, and still matches its hash', async () => {
  const archived = await archive();
  for (const a of archived) {
    expect(sha256(a.text), `${a.category} · ${a.lang} · v${a.version}`).toBe(a.hash);
    expect(Object.keys(SPECIALTY)).toContain(a.category);
    expect(Number.isNaN(Date.parse(a.since))).toBe(false);
  }
  // Nothing archived goes missing, and nothing is archived without being listed.
  expect(archived.map((a) => a.hash).sort()).toEqual([...ARCHIVED].sort());
  // One numbering per agreement and language: v1, v2, ... with no gaps or repeats.
  for (const category of Object.keys(SPECIALTY)) {
    for (const lang of ['en', 'ar']) {
      const versions = archived.filter((a) => a.category === category && a.lang === lang).map((a) => a.version);
      expect(versions, `${category} · ${lang}`).toEqual(versions.map((_, i) => i + 1));
    }
  }
});
