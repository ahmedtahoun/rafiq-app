/**
 * A coach's public page: rafiqpro.com/c/<code>, and /ar/c/<code>.
 *
 * Unlike the rest of the site this is rendered on request, by a Cloudflare
 * Pages Function (site/functions/c/[code].js), because it shows a coach's
 * own, current profile. It is still the site's kind of page: plain HTML and
 * the one stylesheet, no JavaScript, nothing from another domain, and the
 * same tight Content-Security-Policy as _headers (which a Function's
 * response doesn't get, so it is set here).
 *
 * What it can show is what public_coach_page() returns (0026), and only
 * for a coach who turned their page on in the app. A code that never
 * existed, a page turned off and a coach no longer listed all get the same
 * "not available" page, so the page never says which.
 *
 * Every value from the database is escaped, and a coach's own words are
 * isolated (dir="auto") so an Arabic bio reads right on the English page
 * and the other way round. No photo: the avatars bucket is signed-in only,
 * so the page shows the coach's initials, as the app does without one.
 *
 * "Open in Rafiq Pro" is the app's own link scheme, app.rafiqie.coach://c/<code>:
 * with the app installed it opens there; without it, the store links are
 * the way in. They come from STORE_URLS (the Function's environment) and
 * until the listings exist the page says the app is coming soon.
 */
import { SITE_COPY } from './copy.mjs';
import { MIN_REVIEWS_FOR_RATING, STRINGS } from './coach-page-strings.mjs';

export const APP_SCHEME = 'app.rafiqie.coach';
/** 0026's codes: six characters, no 0/o or 1/l/i. */
const CODE = /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/;
const LOCALE = { en: 'en-US', ar: 'ar-EG-u-nu-latn' };

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // For whoever has the link, not for search results.
  'X-Robots-Tag': 'noindex',
  // A page turned off is gone within a minute.
  'Cache-Control': 'public, max-age=60',
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fill = (s, params) => s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');

function money(lang, value, currency) {
  const n = Number(value);
  const amount = Number.isInteger(n)
    ? n.toLocaleString(LOCALE[lang])
    : n.toLocaleString(LOCALE[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const code = String(currency || 'EGP').trim().toUpperCase();
  return `${amount} ${code === 'EGP' ? STRINGS[lang].currency : code}`;
}

/** Up to two initials, as the app's avatar shows them. */
function initials(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0].toUpperCase()).join('');
}

/** A stored English value in this page's language; an unknown one as stored. */
const label = (map, value) => map[value] ?? value;

/** Only real https store URLs make it onto the page. */
function storeUrl(raw) {
  try {
    const u = new URL(String(raw ?? ''));
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function shell({ lang, code, title, body }) {
  const c = SITE_COPY[lang];
  const s = STRINGS[lang];
  const other = lang === 'en' ? 'ar' : 'en';
  const home = (l) => (l === 'ar' ? '/ar/' : '/');
  const path = (l, p) => `${l === 'ar' ? '/ar' : ''}${p}`;
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header">
  <a class="brand" href="${home(lang)}">${esc(s.appName)}</a>
  ${code ? `<a class="lang" href="${path(other, `/c/${code}`)}" lang="${other}" hreflang="${other}" aria-label="${esc(c.languageLabel)}">${esc(c.language)}</a>` : ''}
</header>
<main>${body}
</main>
<footer class="site-footer">
  <nav><a href="${path(lang, '/privacy/')}">${esc(s.privacyTitle)}</a><a href="${path(lang, '/terms/')}">${esc(s.termsTitle)}</a><a href="${path(lang, '/support/')}">${esc(c.supportTitle)}</a></nav>
</footer>
</body>
</html>
`;
}

/** The page for one coach (public_coach_page()'s row). */
export function renderCoachPage({ lang, code, coach, storeUrls = {} }) {
  const c = SITE_COPY[lang];
  const s = STRINGS[lang];
  const app = s.appName;
  const rated = Number(coach.rating_count) >= MIN_REVIEWS_FOR_RATING && coach.rating_avg != null;
  const years = Number(coach.experience_years) || 0;
  const specialties = String(coach.title ?? '').split(' · ').map((v) => v.trim()).filter(Boolean).map((v) => label(s.specialties, v));
  const languages = (Array.isArray(coach.languages) ? coach.languages : []).map((v) => label(s.languages, v));
  const credentials = (Array.isArray(coach.certifications) ? coach.certifications : []).map((v) => String(v).trim()).filter(Boolean);
  const format = { online: s.offeringFormatOnline, in_person: s.offeringFormatInPerson, both: s.offeringFormatBoth }[coach.session_mode];
  const bio = String(coach.bio ?? '').trim();
  const price = Number(coach.from_price) > 0 ? fill(c.coachPageFrom, { price: money(lang, coach.from_price, coach.currency) }) : '';
  const appStore = storeUrl(storeUrls.appStore);
  const playStore = storeUrl(storeUrls.playStore);

  const facts = [
    languages.length ? [c.coachPageLanguages, languages.map((l) => `<bdi>${esc(l)}</bdi>`).join(lang === 'ar' ? '، ' : ', ')] : null,
    format ? [c.coachPageFormat, esc(format)] : null,
    credentials.length ? [c.coachPageCredentials, credentials.map((x) => `<bdi>${esc(x)}</bdi>`).join(lang === 'ar' ? '، ' : ', ')] : null,
  ].filter(Boolean);

  const body = `
      <section class="coach-hero">
        <div class="coach-avatar" aria-hidden="true">${esc(initials(coach.full_name))}</div>
        <h1 class="coach-name"><bdi>${esc(coach.full_name)}</bdi>${coach.verified === true ? ` <span class="coach-verified" role="img" aria-label="${esc(s.coachPreviewVerified)}" title="${esc(s.coachPreviewVerified)}">✓</span>` : ''}</h1>
        ${specialties.length ? `<p class="coach-title">${specialties.map((x) => `<bdi>${esc(x)}</bdi>`).join(' · ')}</p>` : ''}
        ${price ? `<p class="coach-price">${esc(price)}</p>` : ''}
      </section>
      <dl class="coach-stats">
        <div><dt>${esc(s.coachPreviewRatingStat)}</dt><dd>${rated ? `★ ${esc(Number(coach.rating_avg).toFixed(1))}` : esc(s.discoverNewCoach)}</dd></div>
        <div><dt>${esc(s.coachPreviewYearsStat)}</dt><dd>${years > 0 ? esc(years) : '—'}</dd></div>
        <div><dt>${esc(s.coachPreviewReviewsStat)}</dt><dd>${esc(Number(coach.rating_count) || 0)}</dd></div>
      </dl>
      ${bio ? `<section>
        <h2>${esc(s.coachPreviewAbout)}</h2>
        ${bio.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p dir="auto">${esc(p)}</p>`).join('\n        ')}
      </section>` : ''}
      ${facts.length ? `<dl class="coach-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
      <section class="coach-book">
        <h2>${esc(c.coachPageBookTitle)}</h2>
        <p>${esc(fill(c.coachPageBookLead, { app }))}</p>
        <p><a class="coach-open" href="${APP_SCHEME}://c/${code}">${esc(fill(c.coachPageOpenApp, { app }))}</a></p>
        ${appStore || playStore
          ? `<p class="coach-stores">${[appStore && `<a href="${esc(appStore)}">${esc(c.coachPageAppStore)}</a>`, playStore && `<a href="${esc(playStore)}">${esc(c.coachPagePlayStore)}</a>`].filter(Boolean).join('')}</p>`
          : `<p class="coach-soon">${esc(c.coachPageSoon)}</p>`}
      </section>`;

  return shell({ lang, code, title: `${coach.full_name} — ${app}`, body });
}

function notice(lang, code, titleKey, bodyKey) {
  const c = SITE_COPY[lang];
  return shell({
    lang,
    code,
    title: `${c[titleKey]} — ${STRINGS[lang].appName}`,
    body: `
      <h1>${esc(c[titleKey])}</h1>
      <p class="lead">${esc(c[bodyKey])}</p>`,
  });
}

/**
 * The whole request: { status, headers, body }. `env` is the Function's:
 * SUPABASE_URL and SUPABASE_ANON_KEY (the public anon key, the same one
 * the app ships), and APP_STORE_URL / PLAY_STORE_URL once the listings
 * exist. `fetchImpl` is the platform's fetch, or a test's.
 */
export async function handleCoachPage({ code: rawCode, lang, env, fetchImpl }) {
  const code = String(rawCode ?? '').trim().toLowerCase();
  const reply = (status, body) => ({ status, headers: { ...HEADERS }, body });
  // Not a code at all: no need to ask.
  if (!CODE.test(code)) return reply(404, notice(lang, null, 'coachPageNotFoundTitle', 'coachPageNotFoundBody'));

  let coach;
  try {
    const res = await fetchImpl(`${String(env.SUPABASE_URL).replace(/\/+$/, '')}/rest/v1/rpc/public_coach_page`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_code: code }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    coach = await res.json();
  } catch {
    const r = reply(503, notice(lang, code, 'coachPageErrorTitle', 'coachPageErrorBody'));
    r.headers['Cache-Control'] = 'no-store';
    return r;
  }
  if (!coach || typeof coach !== 'object' || !coach.full_name) {
    return reply(404, notice(lang, null, 'coachPageNotFoundTitle', 'coachPageNotFoundBody'));
  }
  return reply(200, renderCoachPage({
    lang,
    code,
    coach,
    storeUrls: { appStore: env.APP_STORE_URL, playStore: env.PLAY_STORE_URL },
  }));
}

/** For the Pages Functions: the platform's Response. */
export async function respond(context, lang) {
  const r = await handleCoachPage({ code: context.params.code, lang, env: context.env, fetchImpl: fetch });
  return new Response(r.body, { status: r.status, headers: r.headers });
}
