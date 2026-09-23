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

**Track B — Client side: #1–#9 DONE. The member app is fully ported.**
ClientOnboarding, ClientHome, ClientProfile + EditClientProfile,
Discover + CoachPreview, ClientCoach + ClientBooking, ClientSchedule +
ClientTasks, MyPrograms + ProgramDetail, RateCoach + CoachMessages +
MyCoaches, ClientNotifications + ClientHelpCenter + ClientPrivacyPolicy +
ClientTermsOfService.

**No screen in the member app routes to `comingSoon` any more.** There is
a test that walks all eighteen member screens and asserts each renders its
own component.

Nothing is open on Track B.

**The member's own Pro vs. the browsable directory — two different
things, don't merge them.** `directory.ts` is for *browsing* pros a member
has no relationship with; its `requestSession()` records an ask to a
stranger. ClientCoach/ClientBooking are the opposite: the one real
relationship, so they read `getCoachProfile()` and write real `time_blocks`
via `addCustomBlock({kind:'pending'})` — the same request the coach's
Schedule already confirms or declines. There is no second request
mechanism, and there should not be one.

`getMonthGrid()` derives the October-2025 calendar from the fixed week's
own constants. `Schedule.tsx` still carries a hand-written 35-cell literal
for the same grid — worth moving it onto `getMonthGrid()` so the two cannot
disagree about which dates are live, but that is Reem's file and was left
alone here.

## The WhatsApp claim in the privacy policy — RESOLVED, both sides

The design's Privacy Policy copy said, in both languages, that
conversations happen over WhatsApp and are governed by WhatsApp's own
privacy policy. That stopped being true when in-app messaging shipped:
`sendMessage()` writes into the app's own store and nothing reaches a
third party.

Both policies now describe what the app actually does:

- **Member side** (`clientPrivacySection4Body`) — fixed when it was
  written in #9; it was never ported with the false wording.
- **Coach side** (`privacySection4Body`) — fixed now, at Ahmed's
  instruction, directly in this repo rather than via the design prototype.

The design prototype still has the old wording in both
`PrivacyPolicy.dc.html` and `CoachPrivacyPolicy.dc.html`. **If either is
ever re-ported, do not overwrite these two keys.**

`helpCenterA1` (coach side) still says a member is added by "WhatsApp
number". That one is left alone on purpose — the field genuinely is a
phone number, so it is not a false claim.

**#8 added `setRating` — ratings were readable but unwritable.** Every
screen showing stars (PreviewProfile, CoachPreview, ClientCoach,
ClientSchedule, MyCoaches) read a map nothing populated, so
`getProAggregateRating()` always returned zero. RateCoach is the writer.

Other things worth knowing from #8:

- **`getSessionRequests()` in `directory.ts` finally has a reader.** It has
  recorded a member's requests to Discover pros since #4 and nothing read
  them; MyCoaches' Pending section is the screen it was written for.
- **RateCoach has two modes and they can collide.** ClientHome's milestone
  card hands over an offeringId through the shared selected-offering
  channel; ClientSchedule's per-row Rate button passes a `sessionId` param.
  A named session always wins, and an offeringId is only treated as a
  milestone when it is *currently* an unreviewed milestone — otherwise a
  stale pointer left over from browsing Offerings would rate a program the
  member never finished.
- **A milestone rating is keyed `milestone-<offeringId>`**, not a session
  id, for the same reason program progress is its own counter: nothing
  attributes a session to an offering.
- **RateCoach has a "nothing to rate" state** the design didn't have. The
  prototype assumed there was always a target; with everything rated,
  submitting would have written a rating keyed to nothing.
- **MyCoaches' rating is real.** The design printed a hardcoded `4.9`; this
  reads `getProAggregateRating()` and says "No rating yet" below the
  3-review threshold, matching CoachPreview and PreviewProfile.
- **MyCoaches' "Past" section is permanently empty on purpose** — no UI
  path anywhere ends a member/pro relationship, so there is nothing to
  read. Kept because the design has it and a member should see where ended
  relationships will appear.
- `markMessagesRead` moved into an effect in CoachMessages; the prototype
  called it inline in render, which writes to storage on every re-render.

**#7 added the enrollment model — the piece several features were waiting
on.** `Enrollment` (clientId, offeringId, sessionsCompleted, enrolledAtMs)
plus `getEnrollments`, `enrollClient`, `logProgramSession`,
`getClientProgramProgress(clientId, offeringId)`,
`getClientProgramProgressList(clientId)`, `getOfferingTypeInfo(type)` and
`getMilestoneReviewStatus`. An offering is the Pro's catalogue entry; an
enrollment is one member's relationship to it, and a member only ever sees
what they are enrolled in.

Consequences worth knowing:

- **`getUnreviewedMilestones()` is real now.** It returned a hardcoded `[]`
  with a comment saying it was blocked on exactly this model. ClientHome's
  milestone-review card was therefore dead code since it was written; it
  renders as soon as an enrollment completes.
- **Progress is its own counter, not derived from session logs**, because
  nothing in this data model attributes a session to an offering (store.js
  says the same). `logProgramSession(clientId, offeringId)` is the seam
  that writes it. Nothing calls it yet — it belongs in the Pro's
  attendance flow, which doesn't know which offering a session was for.
  That gap is real and unresolved, not an oversight.
- **Seeded deliberately incomplete** (`sara`: 5/8 on the 8-week program,
  plus the open-ended 1:1). A completed seed would fire a milestone review
  prompt on ClientHome that nobody earned.
- `getOfferingTypeInfo` returns a **labelKey, not English** — this file
  holds no display copy. `Offerings.tsx` and `PreviewProfile.tsx` still
  carry their own type→labelKey maps (Track A files); worth moving them
  onto this one, not done here.
- An enrollment whose offering the Pro deleted is **skipped**, not rendered
  as a nameless row, and ProgramDetail shows its not-found state.

New in mockStore for #6, both small: `getMemberSessions(clientId)` (real
`getSessionLogs` entries plus the same two demo sessions store.js's own
screens fall back to — ClientHome, ClientSchedule and ClientTasks all read
it now, so the fallback lives in one place instead of three), and
`getMood`/`setMood` + `MOOD_KEYS` for ClientTasks' daily check-in. Mood is
one current value per member, not dated rows, because that is what the
prototype showed; a real `mood_logs` table would be dated, which is why it
is a named seam rather than the screen writing localStorage directly.

**#6 retired every `comingSoon` stub for these two screens** — six files'
worth (ClientHome, ClientCoach, Discover, ClientProfile, SessionRoom, plus
the bottom-nav entries). A member leaving SessionRoom now lands on
ClientSchedule, which is where the design sends them.

**Two pre-existing English strings show through in Arabic**, both older
than #6 and both shared with screens other tracks own, so they were left
alone rather than patched locally:

1. `client.nextSession` is a pre-composed English display string
   ("Next: Today, 10:00 AM"). ClientHome and the coach's Main render it the
   same way. Localizing it is a data-model change across every reader.
2. `formatDate()` formats with `en-US`, so "Oct 18, 2025" stays English in
   Arabic everywhere it appears (session history, payments, expiries).

A member's *own* pending request avoids both: ClientSchedule builds that
line from the block itself, so its day name and AM/PM translate.

**Bidi convention worth copying.** User-typed content (task titles, recaps,
goals, due strings) and time ranges are wrapped in `<bdi>` in #6's two
screens, so "10-minute evening walk" doesn't render as "minute evening
walk-10" in Arabic and "10:00 صباحًا – 10:45 صباحًا" keeps its order. A
`dir="ltr"` span around a whole range scrambles it once the AM/PM word is
Arabic — isolate each end instead. ClientHome and ClientDetail render the
same task titles without this and would benefit from the same treatment.

New in mockStore for #5, all small: `reportPro`/`getProReports` (a member
can report their Pro but not block them — blocking stays a coach-side
tool, matching the design's asymmetry; nothing reads reports yet, there is
no moderation surface), `setStandingSlot`/`getStandingSlot` (the weekly
pattern a Full Access member holds), `getMonthsTogether`, and
`PACKAGE_DEFAULT_TOTAL` is now exported.

**Multi-coach data is mocked, deliberately.** `src/lib/directory.ts`
seeds eight demo coaches for Discover/CoachPreview. Everywhere else the
app models exactly one Pro (`getCoachProfile()`), which is correct — every
coach-side screen is the signed-in Pro looking at their own data. Real
discovery needs a public, RLS-readable projection of `profiles` plus
ratings aggregated across members; neither exists, and guessing at the
shape now would bake a wrong one into two screens. The module is written
as the seam that projection will fill: replace `DIRECTORY_COACHES` with a
query and the screens do not change. Favourites and session requests in
that file are real localStorage, same `rafiq_` prefix as everything else.

**Auth + Supabase infra: done.** Schema/RLS/storage/CI (PR #1), Auth +
ClientAuth wired to OAuth with session bootstrap (PR #3). Known follow-up:
`profiles.role` syncs from `setProfileRole()` now (fixed in PR #6), but a
second device seeing a stale role before that fix shipped may still have a
mismatched row — not expected to matter for this app's usage pattern, flag
if it does.

**Google/Apple sign-in — web done; native code done, console + device
testing outstanding.** The buttons
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
### Native OAuth (branch `dev3/native-oauth`)

The iOS/Android half is written: `skipBrowserRedirect` + the in-app
browser + a deep-link listener, all in `src/lib/nativeAuth.ts` with the
wiring in `src/lib/auth.ts`. Two things that were not true when the task
was written, and are worth knowing before picking this up:

1. **The native projects did not exist.** No `ios/` or `android/` — `cap
   add` had never been run. Both are now generated and committed, because
   the URL scheme has to live in them (`Info.plist`'s CFBundleURLTypes,
   `AndroidManifest.xml`'s intent-filter); Capacitor has no config key for
   it, despite what you might expect from `capacitor.config.ts`.
2. **The app answers to two URL schemes**, `app.rafiq.coach://` and
   `app.rafiqie.coach://`, both on host `auth-callback`. A URL scheme does
   not have to equal the bundle id, so this makes the pending rename below
   a no-op for sign-in instead of a day when nobody can log in on a phone.

**Still needs Ahmed, in the consoles:**

- **Supabase → Auth → URL Configuration → Redirect URLs:** add
  **`app.rafiqie.coach://auth-callback`** — this is the primary scheme
  since the identifier rename, and is what `NATIVE_REDIRECT_URL` now
  sends. Add `app.rafiq.coach://auth-callback` too if any pre-rename
  build is still installed anywhere. Without the first one Supabase
  refuses the redirect and the app never gets the callback. This is the
  one required step and it is still outstanding.
- **A second Google OAuth client is probably NOT needed**, contrary to the
  original task note. With Supabase brokering, Google only ever sees
  Supabase's own `/auth/v1/callback` as its `redirect_uri` — the custom
  scheme is between Supabase and the app, and Google never sees it. The
  existing web client should cover native. A separate native client *is*
  required if we ever switch to Google's native SDK with
  `signInWithIdToken` (better UX: the system account picker instead of a
  browser sheet), which is a different change. Flagging rather than
  asserting: this sandbox cannot reach `*.supabase.co` or
  `accounts.google.com`, so it is reasoning from how the flow is wired, not
  a verified round trip.
- **Apple** needs nothing new: the browser-brokered flow uses the Services
  ID (`app.rafiqie.coach.web`) already configured, not the bundle id. Worth
  knowing for later that App Store review generally prefers native
  `ASAuthorizationAppleIDProvider` over a browser sheet on iOS.

Native failures now show the same message the web flow does: the deep-link
handler routes them through `oauthReturn.ts`'s classifier rather than
keeping its own slug table, so "you cancelled" and "this isn't set up yet"
read identically on a phone and in a browser, and an invited member retries
on ClientAuth either way.

**Not verified on a device.** This sandbox is Linux with no Android SDK, no
emulator, no Xcode and no simulator, and `dl.google.com` is blocked, so the
Gradle build cannot even resolve. The TypeScript was exercised in a browser
through Capacitor's own `CapacitorCustomPlatform` hook — which is what makes
`isNativePlatform()` true — so the native branch, the deep-link parser and
the callback routing are all covered by tests, but nobody has yet watched a
real consent screen hand a real session back to a real build. That is the
next step and it needs a machine with the SDKs.

- **App rename: identifiers DONE, brand name unchanged.** The bundle id
  is now `app.rafiqie.coach` everywhere — `capacitor.config.ts`, both
  native `capacitor.config.json` copies, Android's `namespace` +
  `applicationId` + `package_name` + `custom_url_scheme`, the Android
  package directory (`android/app/src/main/java/app/rafiqie/coach/`) and
  `MainActivity.java`'s package statement, and iOS's
  `PRODUCT_BUNDLE_IDENTIFIER` (both build configs) +
  `CFBundleURLName`.

  **The primary OAuth URL scheme moved with it**, which changes what has
  to be allowlisted: `NATIVE_REDIRECT_URL` is now
  `app.rafiqie.coach://auth-callback`. See the Supabase step below.
  `app.rafiq.coach` is kept as the *alternate* scheme, still registered
  in both native projects, so a build installed before the rename can
  still complete a sign-in.

  **Deliberately NOT renamed:** `appName` ("Rafiq"), Android's
  `app_name`/`title_activity_main`, `index.html`'s `<title>`,
  `package.json`'s `name`, and every user-facing "Rafiq" / "رفيق" string
  in `i18n.ts` (~40 in each language). Ahmed chose identifiers-only; the
  brand wording is still his call, and the Arabic form in particular is
  not a mechanical transliteration (رفيق means "companion"; رفيقي would
  read as "my companion").

  **The Apple Services ID is unchanged at `app.rafiqie.coach.web`** —
  confirmed by Ahmed against the console. `scripts/generate-apple-oauth-secret.mjs`
  was left as-is.

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
3. **`npm run build && npm run lint && npm test` clean before every push.**
   CI enforces all of it on every branch and PR (typecheck, build, lint,
   the browser suite in `tests/`, and the schema suite). `npm test` is the
   slow one at ~3 minutes and the only check that looks at a rendered
   screen — see `tests/README.md`.
4. **Delete the stub you replace** — its `comingSoon` route and any
   `TODO: route to ...` comment, in the same commit that lands the screen.
5. **Test in-browser before calling anything done** — light/dark, EN/AR
   with RTL, golden path + edge cases. Several real bugs (a raw-English
   string leaking into Arabic UI, a CSS-specificity bug breaking a dark
   screen, dead-end back buttons, a bidi-reordering bug on time ranges)
   were only caught this way, not by typecheck/lint/build. Those checks now
   live in `tests/` and run in CI — add to them rather than only checking by
   hand, so the next person's regression is caught too.

See **[CLAUDE.md](CLAUDE.md)** for the conventions and traps behind these
rules (RTL and bidi, i18n keys, the fixed fictional week, the stale Vite
cache that makes a screen render blank).

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
