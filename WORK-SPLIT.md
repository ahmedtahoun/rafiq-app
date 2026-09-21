# Rafiq build status

This file is the git-readable mirror of the live coordination doc (a Claude
Docs artifact) for sessions that can't reach that link — several parallel
Claude Code sessions building this repo have hit "artifact not found" on it
repeatedly, even after sharing. If you're reading this from a session that
*can* open the doc, prefer it — it's the one that's actually live and
commented on. If you can't reach it, this file is the fallback: check here
before claiming an item, and whoever finishes an item should update this
file in the same PR that lands it (not a separate commit later — it drifts
otherwise).

Doc link, for reference / whoever can reach it:
https://claude.ai/artifact/Cp6dmzaZsmMC6t2YcEnKgR

## Two tracks, not three

Earlier revisions of this file proposed a 3-track split (Coach/Client/Auth).
That's superseded — the coordination doc's own 2-track split (Coach/Client)
is source of truth, with Auth + Supabase infra treated as shared Phase-0
work rather than an ongoing third track. Don't resurrect the 3-track model.

## Status as of 2026-09-21

**Track A — Coach side: done, #1–#10, all merged.**
Onboarding, Main, Profile/EditProfile/AccountDetails, Clients/AddClient/
ClientDetail/EditClient, Schedule/AddTimeBlock/Availability, Offerings/
OfferingDetail/Subscription/Earnings, Templates/TemplateDetail, AddTask/
SessionRoom, Messages/MessagesInbox, Notifications/ShareProfile/
PreviewProfile/HelpCenter/CoachPrivacyPolicy/CoachTermsOfService.

**Track B — Client side: #1–#3 done, #4–#9 open.**
Done: ClientOnboarding, ClientHome, ClientProfile + EditClientProfile.

Open, in order:
- **#4 Finding & choosing a coach** — Discover.dc.html, CoachPreview.dc.html
- **#5 The coach relationship** — ClientCoach.dc.html ("Your Pro"), ClientBooking.dc.html
- **#6 Sessions & tasks** — ClientSchedule.dc.html, ClientTasks.dc.html
- **#7 Programs & progress** — MyPrograms.dc.html, ProgramDetail.dc.html
- **#8 Reviews & messaging** — RateCoach.dc.html, CoachMessages.dc.html, MyCoaches.dc.html
- **#9 Everything else** — ClientNotifications.dc.html, ClientHelpCenter.dc.html, PrivacyPolicy.dc.html, TermsOfService.dc.html

**Auth + Supabase infra: done.** Schema/RLS/storage/CI (PR #1), Auth +
ClientAuth wired to OAuth with session bootstrap (PR #3). Known follow-up:
`profiles.role` syncs from `setProfileRole()` now (fixed in PR #6), but a
second device seeing a stale role before that fix shipped may still have a
mismatched row — not expected to matter for this app's usage pattern, flag
if it does.

**Google/Apple sign-in — web flow done, native still open.** The buttons
exist in Auth.tsx/ClientAuth.tsx (satisfies Apple's App Store 4.8
requirement to offer Sign in with Apple alongside Google). As of
2026-09-21, both providers are fully configured and verified end-to-end in
the browser (real Google + Apple consent screens, correctly scoped to the
Supabase project) — Google Cloud OAuth client, Apple Developer App ID
(`app.rafiqie.coach`) + Services ID (`app.rafiqie.coach.web`) + Sign in
with Apple key, both providers enabled in Supabase Auth → Providers, and
`localhost:5173` added to Redirect URLs. Local dev needs a `.env.local`
(gitignored, copy `.env.local.example`) with the real project's
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` for any of this to work
locally — ask Ahmed for the anon key rather than trying to test against
an unconfigured project. Apple's OAuth secret (a JWT, not the raw `.p8`
file) expires every 6 months — `scripts/generate-apple-oauth-secret.mjs`
regenerates it.

Still open — **a dev: native Capacitor OAuth handling.** Blocked on
nothing now (the web-side config above is what it was waiting on). See
the comment above `signInWithOAuth()` in `src/lib/auth.ts` for the exact
gap: needs `skipBrowserRedirect`, an in-app browser (`@capacitor/browser`),
and a deep link registered in `capacitor.config.ts` to catch the callback.
Also needs a second, native-specific OAuth client in Google Cloud Console
(Apple's Services ID setup is shared with the web flow).

**Not code, needs a human decision, not yet resolved:**
- Privacy Policy / HelpCenter copy (coach-side, already shipped) still says
  member conversations happen over WhatsApp — inaccurate since in-app
  messaging shipped. Needs fixing in the design prototype first, then
  re-ported, not patched directly in this repo.
- **App rename pending: "Rafiq" → "Rafiqie."** Not started — Ahmed asked
  to defer it. Scope once picked up: `capacitor.config.ts`'s `appId`
  (`app.rafiq.coach` → `app.rafiqie.coach`, to match what's now actually
  registered in Apple Developer for Sign in with Apple), `appName`, the
  "Welcome to Rafiq" strings in `i18n.ts`, README, `package.json`'s
  `name`, and `<title>`. Do the bundle ID change carefully — it's already
  live in Apple's system, so code and console need to agree exactly.

## Claim before you start

Say so in the coordination doc if you can reach it; if not, open a draft PR
or push an empty commit to a branch named `<you>/<item>` early, so `git
branch -a` on origin shows your claim to anyone who checks before starting.
Two collisions already happened early in the build from skipping this.

## Working agreement (current — supersedes anything below about pushing to main)

1. **Branch + PR, always.** Direct pushes to `main` are for the rare
   one-line, already-reviewed fix (e.g. a routing bug confirmed across
   multiple PR reviews) — not for new screens.
2. **Rebase onto `main` before opening or updating a PR**, not just before
   your first push. i18n.ts and appStore.ts both append near the same
   lines from every track, so two PRs opened around the same time will
   conflict even though neither is wrong — rebase resolves it, it's not a
   sign anything's broken.
3. **`npm run build && npm run lint` clean before every push.** CI enforces
   this on every branch and PR now (typecheck, build, lint, plus the schema
   test suite for anything touching `supabase/`).
4. **Delete the stub you replace** — its `comingSoon` route and any
   `TODO: route to ...` comment, in the same commit that lands the screen.
5. **Test in-browser before calling anything done** — light/dark, EN/AR
   with RTL, golden path + edge cases. Several real bugs (a raw-English
   string leaking into Arabic UI, a CSS-specificity bug breaking a dark
   screen, dead-end back buttons, a bidi-reordering bug on time ranges)
   were only caught this way, not by typecheck/lint/build.

## Shared files — where tracks touch the same lines

Screens are one `.tsx` + one `.css` each, so those never collide. These
four do, because every new screen touches them — append near the bottom of
your track's existing section rather than re-sorting or reflowing:

| File | What every screen adds |
|---|---|
| `src/lib/i18n.ts` | per-screen `en`/`ar` keys, screen-prefixed |
| `src/store/appStore.ts` | `Screen` union member, `ROOTS`/`PARENT` entry |
| `src/App.tsx` | one `case` in the exhaustive switch |
| `src/lib/mockStore.ts` | data seams — check what already exists (a stub, a related type) before adding a parallel version |
