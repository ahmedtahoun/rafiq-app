/**
 * Builds the public site for rafiqpro.com into site/public/: a home page,
 * the privacy policy, the terms, a support page and an account-deletion
 * page, in English (/…/) and Arabic (/ar/…/).
 *
 *   npm run build:site
 *
 * Plain static HTML — no JavaScript, no external requests (not even web
 * fonts: a privacy policy shouldn't hand its readers' IPs to a third
 * party) — so any static host serves it as-is. See site/README.md.
 *
 * The policy and terms text is read from src/lib/i18n.ts, the same copy the
 * app's own policy screens render, so the two cannot disagree. Change the
 * copy there, re-run this, and commit site/public; tests/public-site.spec.js
 * fails in CI if the published pages have fallen behind.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { SITE_COPY } from '../site/copy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'public');
const ORIGIN = 'https://rafiqpro.com';

// i18n.ts imports the app store, which touches `window` and `localStorage`
// when it loads. The generator only needs the copy, so empty stand-ins do.
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { translate } = await vite.ssrLoadModule('/src/lib/i18n.ts');
const { SUPPORT_EMAIL } = await vite.ssrLoadModule('/src/lib/support.ts');
const { CRISIS_RESOURCES } = await vite.ssrLoadModule('/src/lib/crisisResources.ts');
await vite.close();

const LANGS = ['en', 'ar'];
const SECTIONS = [1, 2, 3, 4, 5, 6];

/** A policy document is one of the app's four, split by who it's for. */
const DOCS = {
  privacy: {
    titleKey: 'privacyTitle',
    introKey: 'privacyIntro',
    parts: [
      { labelKey: 'forCoaches', updatedKey: 'privacyUpdated', prefix: 'privacySection' },
      { labelKey: 'forMembers', updatedKey: 'clientPrivacyUpdated', prefix: 'clientPrivacySection' },
    ],
  },
  terms: {
    titleKey: 'termsTitle',
    introKey: 'termsIntro',
    parts: [
      // notTherapyKey mirrors <NotTherapySection> in the app: a last block
      // after the numbered sections, carrying "Coaching is not therapy" and
      // the crisis lines. It is the reason this page is worth hosting —
      // someone can reach it with no account and no app installed.
      { labelKey: 'forCoaches', updatedKey: 'termsUpdated', prefix: 'termsSection', notTherapyKey: 'termsNotTherapyBody' },
      { labelKey: 'forMembers', updatedKey: 'clientTermsUpdated', prefix: 'clientTermsSection', notTherapyKey: 'clientTermsNotTherapyBody' },
    ],
  },
};

const PAGES = ['', 'privacy', 'terms', 'support', 'delete-account'];

/** The crisis list, matching src/components/CrisisResources.tsx. A row
    whose number is still null says so rather than rendering a dead link —
    src/lib/crisisResources.ts explains why they all start null. */
function crisisBlock(t) {
  const rows = CRISIS_RESOURCES.map((r) => `
        <li>
          <strong><bdi>${esc(t(r.nameKey))}</bdi></strong>
          <span>${esc(t(r.forKey))}</span>
          ${r.phone
            ? `<a class="crisis-call" href="tel:${esc(r.phone.replace(/[^\d+]/g, ''))}" dir="ltr"><bdi>${esc(r.phone)}</bdi></a>`
            : `<em class="crisis-unconfirmed">${esc(t('crisisUnconfirmed'))}</em>`}
        </li>`).join('');
  return `
        <p>${esc(t('crisisLead'))}</p>
        <p class="crisis-emergency">${esc(t('crisisEmergencyLead'))}</p>
        <ul class="crisis-list">${rows}
        </ul>
        <p>${esc(t('crisisOutsideEgypt'))}</p>
        <p>${esc(t('crisisTellSomeone'))}</p>`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escapes, then turns the support address into a mail link. <bdi> keeps
    the Latin address from being reordered inside Arabic text. */
function text(s, subject) {
  const href = `mailto:${SUPPORT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
  return esc(s).split(SUPPORT_EMAIL).join(`<a href="${esc(href)}"><bdi>${SUPPORT_EMAIL}</bdi></a>`);
}

function pagePath(lang, slug) {
  return [lang === 'ar' ? 'ar' : '', slug].filter(Boolean).join('/');
}

function render(lang, slug) {
  const t = (key, params) => translate(lang, key, params);
  const c = SITE_COPY[lang];
  const other = lang === 'en' ? 'ar' : 'en';
  const here = pagePath(lang, slug);
  const depth = here ? here.split('/').length : 0;
  const up = '../'.repeat(depth);
  const link = (l, s) => `${up}${pagePath(l, s)}${pagePath(l, s) ? '/' : ''}` || './';
  const url = (l, s) => `${ORIGIN}/${pagePath(l, s)}${pagePath(l, s) ? '/' : ''}`;
  const appName = t('appName');

  let title;
  let body;
  if (slug === '') {
    title = appName;
    body = `
      <h1>${esc(t('authHeadline'))}</h1>
      <p class="lead">${text(t('authSubtext'))}</p>
      <nav aria-label="${esc(c.homeLinksLabel)}" class="cards">
        <a href="${link(lang, 'privacy')}">${esc(t('privacyTitle'))}</a>
        <a href="${link(lang, 'terms')}">${esc(t('termsTitle'))}</a>
        <a href="${link(lang, 'support')}">${esc(c.supportTitle)}</a>
        <a href="${link(lang, 'delete-account')}">${esc(c.deleteTitle)}</a>
      </nav>`;
  } else if (DOCS[slug]) {
    const doc = DOCS[slug];
    title = t(doc.titleKey);
    body = `
      <h1>${esc(title)}</h1>
      <p class="lead">${esc(c[doc.introKey])}</p>
      <nav class="toc">${doc.parts.map((p) => `<a href="#${p.prefix}">${esc(c[p.labelKey])}</a>`).join('')}</nav>
      ${doc.parts.map((p) => `
      <section id="${p.prefix}" class="doc-part">
        <h2>${esc(c[p.labelKey])}</h2>
        <p class="updated">${esc(t(p.updatedKey))}</p>
        ${SECTIONS.map((n) => `
        <h3>${esc(t(`${p.prefix}${n}Heading`))}</h3>
        <p>${text(t(`${p.prefix}${n}Body`))}</p>`).join('')}${p.notTherapyKey ? `
        <h3>${esc(t('notTherapyTitle'))}</h3>
        <p>${text(t(p.notTherapyKey))}</p>${crisisBlock(t)}` : ''}
      </section>`).join('')}`;
  } else if (slug === 'support') {
    title = c.supportTitle;
    body = `
      <h1>${esc(title)}</h1>
      <p class="lead">${esc(c.supportLead)}</p>
      <p class="email-cta">${text(SUPPORT_EMAIL, `${appName} — ${c.supportTitle}`)}</p>
      <p>${esc(c.supportInApp)}</p>
      <p><a href="${link(lang, 'delete-account')}">${esc(c.supportDeletion)}</a></p>`;
  } else {
    title = c.deleteTitle;
    const deleteSubject = lang === 'en' ? 'Delete my account' : 'احذف حسابي';
    body = `
      <h1>${esc(title)}</h1>
      <p class="lead">${esc(c.deleteLead)}</p>
      <h2>${esc(c.deleteInAppHeading)}</h2>
      <p>${esc(c.deleteInAppBody)}</p>
      <h2>${esc(c.deleteEmailHeading)}</h2>
      <p>${esc(c.deleteEmailBody)}</p>
      <p class="email-cta">${text(SUPPORT_EMAIL, deleteSubject)}</p>
      <h2>${esc(c.deleteTimeHeading)}</h2>
      <p>${esc(c.deleteTimeBody)}</p>
      <h2>${esc(c.deleteRemovedHeading)}</h2>
      <p>${esc(c.deleteRemovedBody)}</p>
      <h2>${esc(c.deleteKeptHeading)}</h2>
      <p>${esc(c.deleteKeptBody)}</p>
      <p>${esc(c.deleteKeptPayoutsBody)}</p>
      <h2>${esc(c.deleteBlockedHeading)}</h2>
      <p>${esc(c.deleteBlockedBody)}</p>`;
  }

  const footerLinks = [
    [link(lang, 'privacy'), t('privacyTitle')],
    [link(lang, 'terms'), t('termsTitle')],
    [link(lang, 'support'), c.supportTitle],
    [link(lang, 'delete-account'), c.deleteTitle],
  ];

  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(!slug || title.includes(appName) ? title : `${title} — ${appName}`)}</title>
<link rel="canonical" href="${url(lang, slug)}">
<link rel="alternate" hreflang="en" href="${url('en', slug)}">
<link rel="alternate" hreflang="ar" href="${url('ar', slug)}">
<link rel="stylesheet" href="${up}style.css">
</head>
<body>
<header class="site-header">
  <a class="brand" href="${link(lang, '')}">${esc(appName)}</a>
  <a class="lang" href="${link(other, slug)}" lang="${other}" hreflang="${other}" aria-label="${esc(c.languageLabel)}">${esc(c.language)}</a>
</header>
<main>${body}
</main>
<footer class="site-footer">
  <nav>${footerLinks.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('')}</nav>
</footer>
</body>
</html>
`;
}

rmSync(OUT, { recursive: true, force: true });
for (const lang of LANGS) {
  for (const slug of PAGES) {
    const dir = join(OUT, pagePath(lang, slug));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), render(lang, slug));
  }
}
// Everything that is not generated is copied in from site/, because the
// line above wipes OUT. A file dropped straight into site/public/
// survives exactly until the next `npm run build:site` and then
// disappears without a word — which is how a host config would be lost.
// tests/public-site.spec.js checks all three arrive.
for (const name of ['style.css', '_headers', '_redirects']) {
  cpSync(join(ROOT, 'site', name), join(OUT, name));
}
console.log(`site/public: ${LANGS.length * PAGES.length} pages, plus style.css, _headers and _redirects`);
