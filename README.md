# Rafiq

Coaching management platform and marketplace connecting coaches and clients.

## Stack

Capacitor + Vite + React + TypeScript + Supabase, iOS/Android via Capacitor — same setup as the team's other apps on this stack.

- **React 19** + **TypeScript** (strict, bundler resolution)
- **Vite** for dev/build
- **Zustand** for app-wide state (language, theme, role)
- **Supabase** for auth + data (not yet connected — see below)
- **Capacitor** for iOS/Android native shells

## Design source of truth

The approved UX lives as a Claude Artifact "Design" canvas prototype (~90 screens across coach and client sides). This codebase is a screen-by-screen port of that design into real, working code — not a redesign. Design tokens (`src/theme/tokens.css`), the i18n copy (`src/lib/i18n.ts`), and screen layouts are all ported 1:1 from the prototype's own `.dc.html` source, not redrawn from screenshots.

**Status**: Welcome (3-slide intro) and RoleSelect are built and wired end-to-end (real navigation, EN/AR + RTL, light/dark theme, role persisted via a Supabase-ready local store). Everything past role selection — Auth, Onboarding, and the full coach/client app — is still being ported.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in a Supabase project's URL + anon key
npm run dev
```

## Project structure

```
src/
  components/   shared UI primitives (icons, etc.)
  lib/          i18n, supabase client, color/util helpers
  screens/      one screen per file, colocated .css
  store/        zustand app store (lang, theme, role)
  theme/        design tokens ported from the prototype
```

## Conventions

- Every screen is a `.tsx` + colocated `.css` file under `src/screens/`.
- Use CSS logical properties (`inset-inline-start/end`, not `left/right`) so RTL mirrors automatically — see `tokens.css`'s `.icon-directional` rule for how directional icons (chevrons) flip.
- Copy lives in `src/lib/i18n.ts`, keyed per-screen (`welcome1Eyebrow`, `roleTitle`, etc.), EN + AR side by side — add keys there as each new screen is ported, not ahead of time.
- Persisted app state (language, theme, role) goes through `useAppStore` (`src/store/appStore.ts`), backed by `localStorage` for now — same persistence model the design prototype's own mock data layer used, ready to move to Supabase-backed state once auth lands.
