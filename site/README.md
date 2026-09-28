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

## Hosting it

Once rafiqpro.com is registered, point any static host at `site/public/`
with no build command — Cloudflare Pages, Netlify and GitHub Pages all
work. Every internal link is relative, so it also works from a subfolder or
opened straight from disk. Check `https://rafiqpro.com/privacy/` loads
before pasting URLs anywhere.

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
