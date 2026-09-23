# Rafiq

[![CI](https://github.com/ahmedtahoun/rafiq-app/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ahmedtahoun/rafiq-app/actions/workflows/ci.yml)

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

**Status**: Auth (real Supabase OAuth) and the entire coach ("Pro") track are done and merged — Welcome, RoleSelect, Auth, Onboarding, Main, Profile/EditProfile/AccountDetails, Clients/AddClient/ClientDetail/EditClient, Schedule/AddTimeBlock/Availability, Offerings/OfferingDetail/Subscription/Earnings, Templates/TemplateDetail, AddTask/SessionRoom, Messages/MessagesInbox, Notifications/ShareProfile/PreviewProfile/HelpCenter/CoachPrivacyPolicy/CoachTermsOfService. The client ("Member") track has its first-run flow done — ClientAuth, ClientOnboarding, ClientHome, ClientProfile/EditClientProfile — with Discover, the coach relationship, client-side scheduling/tasks, programs, reviews/messaging, and the client-side legal/help screens still open. Supabase schema/RLS/storage/CI are all live on `main`, not just scaffolded.

Phase 0 shared infra: the router supports per-screen params (`nav({screen, params})`, restored on `back()`), the shared UI kit has `Button`/`Card`/`TextField`/`BottomSheet`/`BottomNav`, and `src/lib/mockStore.ts` holds the full data layer (clients, tasks, packages, scheduling, payments, messages, offerings, subscriptions, notifications, ratings) written as drop-in Supabase seams.

See **[WORK-SPLIT.md](WORK-SPLIT.md)** for exactly what's left, in order, and the current working agreement (branch + PR, not direct pushes), and **[CLAUDE.md](CLAUDE.md)** for the conventions and traps worth knowing before touching a screen.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in a Supabase project's URL + anon key
npm run dev
```

Before pushing, run what CI runs:

```bash
npm run build && npm run lint && npm test
```

`npm test` is the Playwright browser suite in `tests/` — it starts its own dev server and takes ~3 minutes. It is the only check that looks at a rendered screen. See [tests/README.md](tests/README.md).

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
