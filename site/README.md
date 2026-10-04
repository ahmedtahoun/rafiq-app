# rafiqpro.com

The public site: privacy policy, terms, support and account deletion, in
English and Arabic. The app stores and Google's sign-in screen need these
at public URLs; inside the app they only exist as screens.

`site/public/` is the whole site — plain HTML and one stylesheet, no
JavaScript, no build step on the host, nothing loaded from other domains.

| Page | English | Arabic |
|---|---|---|
| Home | `/` | `/ar/` |
| Privacy policy (coaches + members) | `/privacy/` | `/ar/privacy/` |
| Terms of service (coaches + members) | `/terms/` | `/ar/terms/` |
| Support | `/support/` | `/ar/support/` |
| Account deletion | `/delete-account/` | `/ar/delete-account/` |

Plus `style.css`, and `_headers` / `_redirects` for the host — see
**Hosting it** below.

## Hosting it

Once rafiqpro.com is registered, point any static host at `site/public/`
with no build command — Cloudflare Pages, Netlify and GitHub Pages all
work. Every internal link is relative, so it also works from a subfolder or
opened straight from disk. Check `https://rafiqpro.com/privacy/` loads
before pasting URLs anywhere.

### Cloudflare Pages, start to finish

`_headers` and `_redirects` are in the built site, so the host needs no
configuration beyond pointing at the directory.

1. **Pages → Create a project → Connect to Git**, pick this repository.
2. **Build command:** leave it *empty*. **Build output directory:**
   `site/public`. There is no build step on the host; `npm run
   build:site` is run here and the output is committed.
3. **Custom domains → add `rafiqpro.com` AND `www.rafiqpro.com`.** Both,
   even though www only redirects: a redirect cannot run for a hostname
   the project does not serve.
4. Deploy, then check **https://rafiqpro.com/privacy/** loads,
   **https://www.rafiqpro.com/privacy/** lands on the bare domain, and
   the headers are live at
   [securityheaders.com](https://securityheaders.com/?q=rafiqpro.com).

**If the www redirect does not take effect**, do it in the dashboard
instead: **Rules → Redirect Rules → Create**, matching hostname equals
`www.rafiqpro.com`, dynamic redirect to
`concat("https://rafiqpro.com", http.request.uri.path)`, status 301.
Cloudflare's own docs could not be reached from the sandbox where
`_redirects` was written, so the file's cross-hostname form is the
commonly cited one rather than one that was verified — the Redirect Rule
is the reliable fallback.

### What the headers do

The site is ten HTML pages and one stylesheet: no JavaScript, no images,
no forms, nothing from another domain. So the policy is
`default-src 'none'` with only `style-src 'self'`, and any future
addition breaks the page loudly rather than quietly widening what is
allowed. That is the point — an analytics snippet should stop the site
working, not start tracking people reading a privacy policy.

`Strict-Transport-Security` deliberately omits `preload`: preloading is
submitted to a browser-maintained list, is slow and awkward to undo, and
would commit every future `*.rafiqpro.com` to HTTPS before we know what
they are. Add it later if you want it.

### Both files are build outputs

They live in `site/`, not `site/public/`, because `npm run build:site`
**deletes `site/public` and rewrites it** — exactly as `style.css` does,
and for the same reason. A file dropped straight into `site/public/`
survives until the next build and then disappears without a word, which
for a host config means a site that silently deploys with no security
headers. `scripts/build-site.mjs` copies all three in, and
`tests/public-site.spec.js` fails if any of them stops arriving.

## Where each URL goes

- **App Store Connect** (per localization, English and Arabic):
  Privacy Policy URL → `https://rafiqpro.com/privacy/` (`/ar/privacy/` for
  Arabic); Support URL → `https://rafiqpro.com/support/`
  (`/ar/support/`); Marketing URL (optional) → `https://rafiqpro.com/`.
- **Google Play Console:** Store settings → Privacy policy →
  `https://rafiqpro.com/privacy/`; Data safety → "Delete account URL" →
  `https://rafiqpro.com/delete-account/`.
- **Google Cloud → OAuth consent screen:** authorized domain `rafiqpro.com`;
  home page `https://rafiqpro.com/`, privacy policy
  `https://rafiqpro.com/privacy/`, terms `https://rafiqpro.com/terms/`.
  Google may ask you to verify the domain in Search Console first.

## Changing the text

Policy and terms text comes from `src/lib/i18n.ts` — the same copy the
app's policy screens show — so edit it there, never in `site/public/`.
Copy that exists only on the site (the deletion and support pages, section
labels) is in `site/copy.mjs`, English and Arabic side by side.

Then regenerate and commit the result:

```sh
npm run build:site
```

`tests/public-site.spec.js` fails CI if the published pages have fallen
behind the app's copy, if an Arabic page has English in it, or if a link
goes nowhere.

The deletion page describes what deleting an account does. It mirrors the
app's own delete confirmation and the rule that blocks deletion while
sessions, credits or disputes are outstanding — change both together.
