import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The public site (site/public, built by `npm run build:site`, hosted on
 * rafiqpro.com). The stores link to its privacy policy and deletion page,
 * so what it says has to be what the app says.
 *
 * The site is committed rather than built on deploy, so the one way it can
 * go wrong is falling behind: policy copy changed in src/lib/i18n.ts and
 * the pages never regenerated. The first test catches exactly that.
 */

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'public');
const EMAIL = 'support@rafiqpro.com';

const DOCS = {
  privacy: ['privacySection', 'clientPrivacySection'],
  terms: ['termsSection', 'clientTermsSection'],
};
const UPDATED = { privacySection: 'privacyUpdated', clientPrivacySection: 'clientPrivacyUpdated', termsSection: 'termsUpdated', clientTermsSection: 'clientTermsUpdated' };
// How many numbered sections each document has, matching `sectionCount` on
// the four screens and SECTION_COUNT in scripts/build-site.mjs. The privacy
// policies carry four the terms do not: notifications, where the data is
// held, how long it is kept, and backups. Hardcoding six here would have
// published those four without ever checking them.
const SECTION_COUNT = { privacySection: 10, clientPrivacySection: 10, termsSection: 6, clientTermsSection: 6 };
// The block after the numbered sections: "Coaching is not therapy" and the
// crisis lines, on the Terms documents only. It can fall behind the app the
// same way the numbered sections can, so it is checked the same way.
const NOT_THERAPY = { termsSection: 'termsNotTherapyBody', clientTermsSection: 'clientTermsNotTherapyBody' };
const pageFile = (lang, slug) => join(SITE, lang === 'ar' ? 'ar' : '', slug, 'index.html');

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}

async function mainText(browser, file) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(file).href);
  const doc = await page.evaluate(() => ({
    main: document.querySelector('main').innerText,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
  }));
  await ctx.close();
  return doc;
}

test('the published policies say exactly what the app says, in both languages', async ({ browser, page }) => {
  // The app's own copy, straight from i18n.ts through the dev server.
  await page.goto('/');
  const expected = await page.evaluate(async ({ DOCS, UPDATED, NOT_THERAPY, SECTION_COUNT }) => {
    const { translate } = await import('/src/lib/i18n.ts');
    const { CRISIS_RESOURCES } = await import('/src/lib/crisisResources.ts');
    const out = {};
    for (const lang of ['en', 'ar']) {
      for (const [slug, prefixes] of Object.entries(DOCS)) {
        out[`${lang}/${slug}`] = prefixes.flatMap((p) => [
          translate(lang, UPDATED[p]),
          ...Array.from({ length: SECTION_COUNT[p] }, (_, i) => i + 1)
            .flatMap((n) => [translate(lang, `${p}${n}Heading`), translate(lang, `${p}${n}Body`)]),
          ...(NOT_THERAPY[p]
            ? [
                translate(lang, 'notTherapyTitle'),
                translate(lang, NOT_THERAPY[p]),
                translate(lang, 'crisisLead'),
                translate(lang, 'crisisEmergencyLead'),
                translate(lang, 'crisisOutsideEgypt'),
                translate(lang, 'crisisTellSomeone'),
                ...CRISIS_RESOURCES.flatMap((r) => [translate(lang, r.nameKey), translate(lang, r.forKey)]),
              ]
            : []),
        ]);
      }
    }
    return out;
  }, { DOCS, UPDATED, NOT_THERAPY, SECTION_COUNT });

  for (const [key, strings] of Object.entries(expected)) {
    const [lang, slug] = key.split('/');
    const { main } = await mainText(browser, pageFile(lang, slug));
    const flat = main.replace(/\s+/g, ' ');
    for (const s of strings) {
      expect.soft(flat.includes(s.replace(/\s+/g, ' ')), `${key} is missing (re-run npm run build:site): "${s.slice(0, 70)}…"`).toBe(true);
    }
  }
});

test('Arabic pages are right-to-left with no English left in them', async ({ browser }) => {
  for (const file of htmlFiles(join(SITE, 'ar'))) {
    const { main, lang, dir } = await mainText(browser, file);
    const label = file.slice(SITE.length);
    expect.soft(lang, `${label} lang`).toBe('ar');
    expect.soft(dir, `${label} dir`).toBe('rtl');
    const leftover = main.split(EMAIL).join('').match(/[A-Za-z]{3,}/g);
    expect.soft(leftover, `${label} has English: ${leftover}`).toBe(null);
  }
});

test('English pages carry the brand name and no Arabic', async ({ browser }) => {
  for (const slug of ['', 'privacy', 'terms', 'support', 'delete-account']) {
    const { main, lang, dir } = await mainText(browser, pageFile('en', slug));
    expect.soft([lang, dir], `/${slug} lang/dir`).toEqual(['en', 'ltr']);
    expect.soft(/[؀-ۿ]/.test(main), `/${slug} has no Arabic`).toBe(false);
  }
  const { main } = await mainText(browser, pageFile('en', 'delete-account'));
  expect.soft(main).toContain('Rafiq Pro');
  expect.soft(main, 'the deletion page gives a way to ask without the app').toContain(EMAIL);
});

test('every link between pages goes somewhere real, and nothing loads from elsewhere', () => {
  for (const file of htmlFiles(SITE)) {
    const html = readFileSync(file, 'utf8');
    const label = file.slice(SITE.length);
    expect.soft(/<script/i.test(html), `${label} has no scripts`).toBe(false);
    expect.soft(/<(img|iframe)\b/i.test(html), `${label} loads no images or frames`).toBe(false);

    for (const [, rel, href] of html.matchAll(/<(?:a|link)\b[^>]*?(?:rel="([^"]*)"[^>]*?)?href="([^"]+)"/g)) {
      if (href.startsWith('mailto:')) {
        expect.soft(href.startsWith(`mailto:${EMAIL}`), `${label}: ${href}`).toBe(true);
        continue;
      }
      if (/^https?:/.test(href)) {
        // Only the site's own canonical/alternate URLs are absolute.
        expect.soft(href.startsWith('https://rafiqpro.com/') && /canonical|alternate/.test(rel ?? ''), `${label}: external ${href}`).toBe(true);
        continue;
      }
      if (href.startsWith('#')) {
        expect.soft(html.includes(`id="${href.slice(1)}"`), `${label}: anchor ${href}`).toBe(true);
        continue;
      }
      const target = resolve(dirname(file), href);
      const exists = href.endsWith('/') || href === './' ? existsSync(join(target, 'index.html')) : existsSync(target);
      expect.soft(exists, `${label}: ${href} resolves`).toBe(true);
    }
  }
});

/**
 * The host config is a build output too.
 *
 * `scripts/build-site.mjs` wipes site/public before it writes, so
 * anything dropped in there by hand survives until the next
 * `npm run build:site` and then vanishes silently. `_headers` and
 * `_redirects` are therefore kept in site/ and copied in beside
 * style.css — and this is the check that they still arrive, because the
 * failure mode otherwise is a site that deploys with no security
 * headers and nobody noticing.
 */
test('the Cloudflare config is copied into the built site', () => {
  for (const name of ['_headers', '_redirects']) {
    expect(existsSync(join(SITE, name)), `${name} is in the built site`).toBe(true);
  }

  const headers = readFileSync(join(SITE, '_headers'), 'utf8');
  // The directive line itself, not the whole file: the comments above it
  // name 'unsafe-inline' to explain why it is not used, and a check over
  // the file would read that as the thing it is warning about.
  const csp = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:')) ?? '';
  // The policy this site can afford: it has no JavaScript, no images and
  // nothing from another domain, so anything beyond its own stylesheet
  // is a mistake. A loosened CSP has to change this line too.
  expect(csp, 'a Content-Security-Policy line exists').not.toBe('');
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp, 'nobody may frame these pages').toContain("frame-ancestors 'none'");
  for (const h of ['X-Content-Type-Options: nosniff', 'Referrer-Policy: no-referrer', 'Strict-Transport-Security', 'X-Frame-Options: DENY']) {
    expect(headers, `_headers carries ${h}`).toContain(h);
  }

  // www goes to the bare domain, which is the host every store console,
  // the OAuth consent screen and the pages' own canonical links name.
  const redirects = readFileSync(join(SITE, '_redirects'), 'utf8');
  expect(redirects).toMatch(/^https:\/\/www\.rafiqpro\.com\/\* +https:\/\/rafiqpro\.com\/:splat +301$/m);
});
