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

**Status**: 7 of the prototype's ~90 screens are ported. Built and wired end-to-end (real navigation, EN/AR + RTL, light/dark theme, state persisted via a Supabase-ready local store): **Welcome** (3-slide intro), **RoleSelect**, **Onboarding** (coach track), **Main** (coach dashboard), **Profile**, **EditProfile**, **AccountDetails**. Phase 0 shared infra is in place — the router supports per-screen params (`nav({screen, params})`, restored on `back()`), the shared UI kit has `Button`/`Card`/`TextField`/`BottomSheet`/`BottomNav`, and `src/lib/mockStore.ts` holds the coach-side data layer (clients, tasks, packages, session logs, notifications, earnings, ratings, obligations) written as drop-in Supabase seams.

**Not built yet**: Auth — Supabase is scaffolded but not connected, there is no sign-in anywhere; the whole client/member track (ClientOnboarding, ClientHome, Discover, RateCoach — RoleSelect's "I'm a member" path dead-ends at the `ComingSoon` placeholder); and the coach screens the built ones already link to (Schedule, Clients, ClientDetail, AddClient, AddTask, AddTimeBlock, MessagesInbox, Messages, SessionRoom, Notifications, Earnings, Subscription, and the Profile sub-pages). Each of those is a `comingSoon` stub carrying a `TODO: route to ...` comment naming the prototype file to port — `grep -rn "TODO: route to" src` is the live list.

See **[WORK-SPLIT.md](WORK-SPLIT.md)** for how the remaining work divides across the three parallel tracks and which shared files each track owns.

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
