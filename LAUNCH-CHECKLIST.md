# Launch checklist — App Store & Google Play

Everything between today and a published Rafiq, checked against the repo on
2026-09-30. Tick items off in the PR that does them (`- [x]`), so this file
stays the source of truth the same way `WORK-SPLIT.md` is.

This file says **what** is left. `LAUNCH-RUNBOOK.md` says **in what
order**, and which steps wait on which — start there if you are about to
sit down and do the console work. `RELEASE.md` is **how** a build reaches
TestFlight and Play.

**Tags:** 🔴 **blocker** — the stores reject the app, or it doesn't work for a
real user · 🟡 **required before public launch** · ⚪ recommended.
**Owner:** *Ahmed* = a decision or an account only you hold · *Dev* = code in
this repo · *Design* = assets.

**The long poles** — start these first, they gate everything else or take
calendar time no matter how fast the code moves:
1. Connecting the app to the live database (§2) — the biggest piece of work.
2. The name decision (§1) — icon, screenshots and store listing all wait on it.
3. Google Play closed testing — **12 testers for 14 days** on a new personal
   developer account (§6). **Proposed instead: an organization account**,
   which is exempt — awaiting Ahmed's confirmation. If that is confirmed,
   the long pole becomes the legal entity and its D-U-N-S number instead.
   Either way `LAUNCH-RUNBOOK.md` has the ordering.
4. The payments model (§3) — Apple's rules shape what can even be built.

---

## 1. Decisions (Ahmed)

- [x] 🔴 **Name: Rafiq or Rafiqie.** Decided: **Rafiq Pro** in English,
      **رفيق** in Arabic; the coach subscription is **Rafiq Pro Plus**
      (رفيق برو بلس). Bundle IDs stay `app.rafiqie.coach` — never shown to
      users, and changing them would mean new store listings.
- [x] 🔴 **One domain for the brand: rafiqpro.com** — registered (Ahmed,
      2026-09-28). What it still needs is in §5: the `support@` mailbox,
      hosting `site/public/`, and the OAuth consent screen. The app IDs
      saying `rafiqie` don't matter: they are never shown.
- [ ] 🔴 **Payments model** — see §3 before deciding. Includes whether Rafiq
      takes a commission on sessions and how coaches get paid out.
      **Decided (Ahmed, 2026-10-04): a marketplace.** Members pay for
      sessions inside the app (Paymob checkout), Rafiq pays coaches out,
      and there is **no stored balance or wallet**: a coach's "to be paid
      out" is a record of what Rafiq owes, not money parked in Rafiq.
      Coaches can still be paid to a bank account or a mobile wallet.
      Still open: the commission, and the advisor questions in §3.
- [ ] 🔴 **Company / legal entity** that owns the developer accounts and
      receives store payouts. **Proposed as 🔴 rather than 🟡**: an
      organization Play account (proposed, §5) is verified against this
      entity and its D-U-N-S number, so nothing on the Play side would
      start until it exists. On a personal account it stays 🟡. (The App Store Paid Apps agreement is not
      part of this while v1 sells nothing — `LAUNCH-RUNBOOK.md` §0.)
      Decide at the same time whether the **Apple** enrolment should also
      be the company: team `55BRQ92599` cannot be converted, so an
      organization account there is a new team, new certificates and a new
      Sign in with Apple key — far cheaper before the first submission
      than after. Runbook §3.
- [ ] 🟡 **Launch coaches.** Discover must not open empty or with fake coaches
      (see §2). Recruit a first set of real coaches who finish signup before
      public launch. The invite and a 10-minute setup guide, both languages,
      are drafted in `store/coach-invite.md` — along with why *finish signup*
      is the whole job: `coach_directory` lists a coach the moment
      `signup_completed_at` is set, with no photo, offering or bookable hour
      required, so a half-finished profile is a live card in Discover.

## 2. Connect the app to the database (Dev)

The live Supabase project has the full schema (migrations `0001`–`0017`,
locked down, 488 schema assertions in CI). The app uses it for the screens listed
as done below, when signed in; every other screen still reads and writes
`src/lib/mockStore.ts` / `src/lib/directory.ts` (localStorage on the phone).

- [x] 🔴 Replace each `mockStore` / `directory` function body with a Supabase
      query against the matching table — the tables mirror `mockStore`'s
      types, and `supabase/README.md` covers where the model differs.
      Suggested order: reports, verification and deletion requests (the admin
      queues need them) → profile and onboarding → clients, tasks and
      sessions → scheduling → messaging → the rest.
      Done: admin queues, profile and onboarding, and the coach's roster
      (Members, member detail with tasks/sessions/package/payments, add/edit
      member, add task), the member's Home, Tasks, My Pros, coach page
      and profile, and the accept flow (the coach's weekly hours, Discover,
      a coach's page and the request a member sends from it, the coach
      accepting or declining it in Notifications), and the coach's Schedule
      (their real week, busy time, moving and cancelling a booking, and
      recording attendance, which uses a package credit), messaging (both
      threads, the inbox, live updates and blocking, `0014`), and client
      invites (a coach invites a walk-in member by code, `0013`). The coach's Home is real
      too (2026-10-01): their name, counts, today's booked sessions, who
      needs them, and a "Get set up" list for a new coach. Offerings, OfferingDetail
      and Preview Profile's offerings are real too (2026-10-03): a coach
      creates, edits and archives their own `offerings` rows, which is what
      members book from, and "Add what you offer" is a Home setup step.
      The member side is done (#91, #92, #94, #96, #97, #99, #100, #101),
      and so are session templates (#105: Templates and TemplateDetail read
      and write the coach's own `templates` rows; signed out, the demo
      keeps its 14) and a member's saved coaches (#112: their own
      `favourite_coaches` rows, 0005, instead of `localStorage`, so they
      follow the member to another device).

      The three that were left went on 4 October. The coach side now has
      what the member side has (2026-10-05):
      `tests/coach-demo-identity.spec.js` walks all 24 coach screens that
      read the coach's data, signed in, and fails on any demo store read
      or demo name. Its first run found two: Preview Profile and Share
      Profile read the demo roster's ratings and member count. Both read
      the coach's own now (Preview's reviews are `coach_reviews`, as the
      coach page shows them). Subscription imports `mockStore` for its
      signed-out cancel only. Three device keys are read signed in on
      purpose and allowed by name: the notification switches, Home's
      "Reminded" marks and a drafted reminder, all this phone's own.
      Signed out, the demo still runs on `mockStore`, by the 3 Oct
      decision.

      Done on 4 October:

      - ~~**Home's package and follow-up alerts**~~ — done (2026-10-04, #122):
        the coach's `packages` rows (expired, used up, expiring within a
        week) and each member's latest attended session's `followed_up`,
        which Remind sets (`fetchHomeAlerts` in `src/lib/rosterData.ts`).
      - ~~**Profile stats**~~ — done (2026-10-04, #123): reviews and rating
        from the coach's `ratings`, members and completion from the
        roster, the Messages badge from the inbox, and the delete sheet's
        open items from 0012's own list (`src/lib/coachStatsData.ts`).
      - ~~**Earnings' totals**~~ — done (2026-10-04, #121): signed in, the
        coach's own `payments` ledger (`src/lib/earningsData.ts`):
        completed charges less refunds, pending on its own line, paid and
        due over active members, with LoadState and a retry.
- [x] 🔴 **Remove the demo identities.** 14 member screens hardcoded
      `const CLIENT_ID = 'sara'`, and the Pro side is the seeded
      `DEFAULT_PRO_ID = 'pro-yasmin'`. Both must come from the signed-in user.
      Done for the coach's roster and the member's Home, Tasks, My Pros,
      coach page and profile (SUPABASE-MIGRATION-PLAN.md, step 3), and the
      member's Sessions screen (step 4: their real sessions, cancelling one,
      asking to move one, withdrawing a request, and booking from their
      coach's page, which Home and the coach page now open too), and in
      step 6: Discover's goal matching (the member's own focus from
      onboarding), My programs and Program detail (the member's real
      enrollments; their "book a session" opens the coach's page, not the
      demo booking screen), Rate coach (rating a session they had, from
      their Sessions screen, writes `ratings`), the reviews on a coach's
      page and Discover (members' own, from `coach_reviews`, signed with a
      first name and last initial), the member's Notifications and Home's
      bell dot (their own `notifications`, marked read when opened), and
      the demo booking screen (signed in it is never shown — a member who
      lands on it gets their coach's own page, on the real clock; signed
      out it takes the demo week from `TODAY_MS`).
      `grep -rl DEMO_MEMBER_CLIENT_ID src/screens` still lists files, but
      every use is signed-out only now, and Home, Tasks and Profile no
      longer show the demo's sample goal signed in:
      tests/member-demo-identity.spec.js walks the member screens signed in
      and fails on any demo store read or demo name. Done (2026-10-04, #109):
      the walk covers every member screen that reads the member's data —
      Home, My Pro, Profile, Edit profile, Messages, Tasks, My Pros,
      Sessions, Discover, Notifications, My programs, Program detail, Rate
      coach, Booking and the coach page — and waits for each lazily loaded
      screen rather than a fixed delay. Breaking any one of them back to the
      demo fails it. Since #112 it allows no device key that isn't the
      member's own: saved coaches are `favourite_coaches` rows now.
      The coach half is done too (#124's walk, closed by #126): every coach
      screen signed in, no demo read left (`KNOWN_DEMO_READS` is empty).
- [x] 🔴 **Remove the demo data:** `DEFAULT_CLIENTS`, `DEFAULT_TASKS`,
      `DEFAULT_ENROLLMENTS`, `DEFAULT_TEMPLATES`, `FALLBACK_MEMBER_SESSIONS`,
      the 8 fictional `DIRECTORY_COACHES`, and any other `DEFAULT_*` seed.
      Apple rejects placeholder content, and fake coaches in a marketplace
      mislead users. Decided (3 Oct 2026): the signed-out demo stays, and
      only the fictional coaches go. Done for the coaches: the 8
      `DIRECTORY_COACHES`, their sample "Member Stories", and the demo coach
      page with its invented review quote, bio and member count are removed;
      signed out, Discover shows its "No pros yet" state and a coach link is
      "not available" (#101). Everything the decision called for is done.
      The other `DEFAULT_*` seeds stay by that same decision, because the
      signed-out demo runs on them — so there is nothing outstanding here.
      Reopen only if the decision to keep the signed-out demo changes.
- [x] 🔴 **Use the real clock.** Calendar maths runs on a fixed fictional week
      (`TODAY_MS = Date.UTC(2025, 9, 22)`; screens hardcode `TODAY_INDEX = 2`).
      Real users would see October 2025. Replace with the current time, and
      re-check `format.ts`'s UTC wall-clock rule (CLAUDE.md, "Display every
      date and time") once times come from real bookings. Done: signed in,
      every screen is on the real clock. `grep -rl TODAY_INDEX src` now
      returns `Schedule.tsx` alone, and both uses there are the signed-out
      branch of a conditional (`remote ? weekdayOf(realTodayMs) :
      TODAY_INDEX`) — the demo week the 3 Oct decision keeps.
      ClientSchedule, ClientBooking and CoachPreview converted in steps 4
      and 6 (#99).
- [x] 🔴 Loading, empty and error states on every screen. Today every read is
      synchronous localStorage; network reads can be slow or fail.
      Done on every converted screen (38 files use `LoadState` as of 5 Oct,
      up from 26: loading, then an error with a working retry — never the
      demo data as a fallback). §2's last screens went with them: Earnings
      (#121), Home's alerts (#122), Profile (#123), and Preview and Share
      Profile (#126). The two walks (`tests/member-demo-identity.spec.js`,
      `tests/coach-demo-identity.spec.js`) open every screen that reads
      the signed-in user's data and require each to settle on real
      content, not a spinner or an error.
      Discover now distinguishes an empty directory ("No pros yet") from a
      search that matched nothing — it will be empty until real pros sign
      up, and the search-failed wording read like a broken screen.
- [x] 🟡 Discover and coach profiles read the `coach_directory` and
      `coach_reviews` views. The views sign reviews with a **first name and
      last initial**; the app currently shows the reviewer's full name
      publicly — that must go. Done: signed in, Discover and a coach's page
      read `coach_directory`, and their reviews come from `coach_reviews`
      (step 6), selecting the view's `reviewer_name` — never a join back to
      `profiles.full_name`. Discover's hardcoded sample stories went with
      the fictional coaches.
- [x] 🟡 Messaging updates live (Supabase Realtime on `messages`). Done in
      step 5 (`0014`, `src/lib/messageData.ts`): both threads and the
      coach's inbox on Supabase, with real blocking from either side.
- [x] 🟡 Profile and cover photo upload through `src/lib/storage.ts` to the
      private `avatars` / `covers` buckets.
- [ ] 🟡 Run `npx supabase gen types typescript --linked > src/lib/database.types.ts`
      after every migration (`supabase/README.md`).

## 3. Payments

Apple's App Review Guidelines decide what may be paid outside the App Store:

- **Rafiq Pro** (the coach subscription) is a digital subscription →
  **must** use Apple In-App Purchase on iOS (guideline 3.1.1) and Google Play
  Billing on Android.
- **1:1 live coaching sessions** are person-to-person services → may use
  Paymob or another payment method (guideline 3.1.3(d)).
- **Group sessions, workshops and events** (one-to-few, one-to-many live) →
  **online**, guideline 3.1.3(d) says these **must use In-App Purchase** on
  iOS; **in person**, 3.1.3(e) says they **must not**. They go through Paymob.
- **Google Play** agrees on all of it, with one condition: a 1:1 online
  session is exempt from Play Billing only if it is **not recorded or
  replayable**. Video calling must not add recording.

The sources, read on 2026-10-01, and what they mean for the build are in
`research/payments-rules.md`. The ten-coach pricing test is in
`research/interview-guides.md`.

- [ ] 🔴 *Ahmed:* confirm the model above. ~~against the current guidelines and
      Google Play's Payments policy~~ (read 2026-10-01; see
      `research/payments-rules.md`). Still open are the advisor questions there:
      the Central Bank of Egypt, VAT, and getting Apple's answer in writing.
- [ ] 🔴 *Ahmed:* enrol in the App Store Small Business Program before the
      first subscription is sold. The 15% rate is not automatic.
- [x] 🔴 *Dev:* record where each booking came from (marketplace or the
      coach's own client), so that commission can be switched on fairly
      later. `0019`; live once Ahmed pushes it.
      Commission stays off.
- [x] 🟡 *Dev:* prices show the offering's own currency, not always EGP.
- [x] 🔴 *Dev:* a real free plan: **3 active members**, enforced by the
      database (`0020`), read from the coach's `subscriptions` row. Pro has
      no limit and is granted by hand until billing exists
      (`supabase/admin/README.md`, "Coach plans"). Photos are free for
      everyone, and the Pro plan no longer promises a verified badge,
      featured placement or priority support. *Ahmed:* the Pro price on the
      plans screen still says 450 EGP; change it once the pricing test
      settles 300 or 500.
- [x] 🔴 **The plans (decided, Ahmed, 2026-10-05).** Free holds 3 active
      members; **Rafiq Pro Plus** (tier `'pro'`) holds 15, at 450 EGP a month
      or 4,500 a year; **Rafiq Elite Pro** (tier `'elite_pro'`) has no limit,
      at 900 EGP a month or 9,000 a year, plus featured placement in
      Discover and an earnings export (CSV). The paid tiers ship in the
      **first update after launch**, not at launch: until then the
      Subscription screen shows all three with "Coming soon", and a paid
      tier is granted by hand (`supabase/admin/README.md`). `0024` makes the
      database enforce each cap; `29_plan_tiers.sql` proves it.
- [ ] 🟡 *Dev:* Pro Plus and Elite Pro through In-App Purchase + Play
      Billing (RevenueCat handles both stores and receipt validation), in
      the first update. Tier changes arrive from its webhook as
      `service_role` — the app has no write access to `subscriptions`, by
      design. Four products, each a monthly and a yearly: *Ahmed* creates
      them in App Store Connect and Play Console. Featured placement and the
      CSV export are built with it; the Elite Pro card tags both "Coming
      soon" until then.
- [ ] 🔴 *Dev:* Paymob for 1:1 sessions, server-side. The payment result is
      written to `payments` by a webhook / edge function as `service_role`.
      No Paymob secret key in the app, ever.
- [x] 🔴 *Dev:* remove or replace every "demo" payment button (ClientBooking
      "Pay with card", Subscription upgrade, ClientCoach upgrade). Done: booking
      sends the request with no payment step and writes no payment row; both
      upgrades are a "Coming soon" state instead of a button that charged
      nothing and then granted the plan. The card-payment copy is gone from
      both languages, and a test guards it from coming back.
- [ ] 🟡 *Ahmed:* coach payouts and Rafiq's commission, if any.
- [x] 🟡 *Dev:* payouts backend — Paymob Payouts client, admin-only
      `payouts` Edge Function, `coach_payout_accounts` / `payouts` /
      `admin_users` tables (`0007`). See `supabase/functions/payouts/README.md`.
- [ ] 🟡 *Ahmed:* ~~push `0007`~~ (done, with `0008`/`0009`), set the Paymob
      secrets, deploy the function, add yourself to `admin_users`, and run a
      staging payout (README, "Testing on staging"). The staging run also
      settles whether Paymob really needs `national_id` — if it doesn't, stop
      collecting it. `scripts/paymob-national-id-check.ts` is that one
      question on its own: two 1.00 EGP disbursements, identical except the
      first omits the field. Staging credentials only; writes nothing.
- [x] 🟡 *Dev:* the coach's payout-account screen (Profile → Payout account,
      and a link from Earnings). Signed-in only; saved numbers show last 4.
- [ ] 🟡 *Ahmed:* check `src/lib/paymobBanks.ts` against the bank codes table
      in Paymob's Instant Cashin docs — it was written without access to them.
- [x] 🟡 *Dev:* payout history on Earnings (signed-in only; newest first).
- [ ] 🟡 *Dev:* an admin screen to create, send and sync payouts (§9).
- [ ] 🔴 *Ahmed:* production Paymob Payouts credentials — new ones, never the
      staging set, and shared through a password manager, not email.

## 4. Native builds and device testing (Dev)

**`store/device-pass.md` is the script for the rows below that need a
phone.** It is the hardware pass — safe areas, the keyboard, the status
bar in dark mode, orientation, native sign-in, the video call, Arabic
gestures — and it is deliberately not a second copy of
`store/review-notes.md` §2, which is the functional run-through. Do the
hardware pass first; a keyboard that covers the composer blocks the
functional one anyway.

Both apps built and ran on the iPhone simulator and an Android 15 emulator
(2026-09-29), and the safe-area fix was re-checked on both (2026-09-30).
Nothing has run on a real phone yet. Build commands: CLAUDE.md, "Native
builds".

- [ ] 🔴 First iOS build in Xcode, on the simulator and a real iPhone.
      Simulator: done 2026-09-29 (builds, runs, sign-in opens). Real iPhone:
      not yet.
- [ ] 🔴 First Android build, on an emulator and a real phone.
      Emulator: done 2026-09-29 (builds with Java 21, runs, back button
      works). Real phone: not yet.
- [ ] 🔴 Google and Apple sign-in end to end on both platforms. Confirm
      `app.rafiqie.coach://auth-callback` is in Supabase → Auth → URL
      Configuration → Redirect URLs (listed as a to-do in `WORK-SPLIT.md`).
      The in-app browser opens Google's and Apple's pages, and closing it
      without finishing no longer leaves the buttons stuck (#68). Waiting
      on *Ahmed*: the redirect URL, then one real sign-in per platform.
- [ ] 🔴 **1:1 video sessions (Daily), inside the app** (decided, Ahmed,
      2026-10-04). Built: the `session-video` Edge Function gives each of
      the two people in a session a pass to its own private Daily room,
      from 10 minutes before it starts until 30 after it ends; it is never
      recorded (no `enable_recording`, nobody an owner, and a Daily domain
      that records is refused), which is also what keeps 1:1 online
      sessions outside Play Billing. SessionRoom is the real call signed in,
      on the app's own bilingual controls (Daily's ready-made screen has no
      Arabic); Join shows on the coach's Home and Schedule and the member's
      Sessions. Camera and microphone permissions are declared on both
      platforms. Tests: `supabase/functions/_shared/sessionVideo_test.ts`,
      `tests/session-video.spec.js`. Left:
      *Ahmed:* in the Daily dashboard, check recording is off for the
      domain; put the key in `supabase/functions/.env` as `DAILY_API_KEY`
      and run `npx supabase secrets set --env-file supabase/functions/.env`,
      then delete the file (never in chat or git); deploy `session-video`.
      *Dev:* one real call between two phones, both languages — camera and
      microphone prompts on iOS and Android, joining, hanging up, and the
      window closing.
- [x] 🔴 **Android hardware back button.** Nothing listens for it, so it exits
      the app from any screen. Wire `App.addListener('backButton', …)` from
      `@capacitor/app` to `appStore.back()`, exiting only on a tab root.
- [x] 🟡 **Safe areas and notch.** Done: `--safe-top` / `--safe-bottom` in
      `tokens.css`, one `padding-block-start` on `.phone-frame` for the status
      bar (it has to be the frame, not each header — Welcome's Skip and back
      are positioned inside the hero, which is why they were unreachable), and
      the home-indicator inset on every bottom bar rather than the frame, so
      their backgrounds still reach the edge. `viewport-fit=cover` was already
      in `index.html`.
- [ ] 🟡 Keyboard covering inputs, status bar in dark mode, splash screen.
      Status bar: done (#79), its icons follow the app's theme. Splash: done,
      light and dark, with the icon (§7). Keyboard: fine on Android (checked
      on the emulator, Capacitor pads for it); **iOS not checked yet** —
      the simulator uses the Mac's keyboard, so it needs ⌘K with a message
      thread open.
- [x] 🟡 **Large system text sizes.** Every font size is in px and Android
      scales WebView text with the system setting. Checked at 130% and 200% in
      both languages: chips, the Profile actions, the seven-day strip, the
      offering and programme rows and the support rows were all clipped away
      by the frame, and are fixed with logical properties (wrapping rows,
      `max-inline-size`, `min-inline-size: 0`, `overflow-wrap`).
      `tests/large-text.spec.js` walks all 53 screens at both sizes.
- [ ] 🟡 Photo picker from Edit Profile, including the camera option (§6).
- [ ] 🟡 `mailto:` (Contact Us) and store links (Rate Rafiq) hand off to the
      Mail app and store.

## 5. Accounts and console setup (Ahmed)

- [ ] 🔴 **Supabase:** upgrade to a paid plan before launch — free projects
      pause after a week without activity and have no point-in-time backups.
      Turn backups on and set the Site URL.
- [ ] 🔴 **Google Cloud OAuth consent screen:** move from "Testing" to
      **"In production"** (Testing limits sign-in to listed test users and
      expires their sessions after 7 days). Add app name, logo, privacy policy
      URL and the authorized domain; complete brand verification if asked.
- [ ] 🟡 **Apple sign-in secret expires ~6 months after it was made** (made
      around 2026-09-22). Put a reminder in early March 2027 to regenerate it:
      `node scripts/generate-apple-oauth-secret.mjs <path-to-.p8>`, then paste
      the result into Supabase → Auth → Providers → Apple.
- [ ] 🟡 **App Store Connect:** create the app record for `app.rafiqie.coach`;
      sign the Paid Apps agreement and fill in tax and banking (needed for
      In-App Purchase). Then put the app's Apple ID into `APP_STORE_ID` in
      `src/lib/support.ts` — until then, "Rate Rafiq" is hidden on iOS.
- [ ] 🟡 **Google Play Console:** payments profile (for Play Billing); decide
      personal vs organization account (organizations skip the
      12-testers / 14-days rule).
- [ ] 🔴 **Support mailbox** `support@rafiqpro.com` exists and someone reads
      it — the app, both privacy policies and the store listings point there.
      Receiving alone (e.g. Cloudflare Email Routing) is not enough: support
      has to reply *from* it. Add the provider's SPF, DKIM and DMARC records.
- [ ] 🔴 **Host the site:** `site/public/` on rafiqpro.com (e.g. Cloudflare
      Pages, no build step, output `site/public`; `www` redirects to the bare
      domain). Check `/privacy/`, `/terms/`, `/support/`, `/delete-account/`
      and their `/ar/` versions load.
- [ ] 🟡 **Apple private relay:** register `support@rafiqpro.com` under Apple
      Developer → Services → Sign in with Apple for Email Communication.
      Without it, mail to members who chose "Hide My Email" is dropped.

## 6. Store requirements the code must meet (Dev)

### iOS
- [x] 🔴 Add `ios/App/App/PrivacyInfo.xcprivacy` — Apple requires a privacy
      manifest, and there isn't one (Capacitor's docs list the entries).
- [x] 🔴 Add `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription`
      to `Info.plist`, in English and Arabic (`InfoPlist.strings`). Edit
      Profile uploads a photo; choosing the camera without these crashes the app.
- [x] 🟡 `ITSAppUsesNonExemptEncryption = NO` in `Info.plist` (HTTPS only),
      so each build skips the export-compliance question.
- [ ] ⚪ Native Sign in with Apple (capability + entitlement). The current web
      flow in an in-app browser meets guideline 4.8; native is a smoother sign-in.

### Android
- [ ] 🔴 Create the upload keystore, **back it up somewhere safe**, never
      commit it (`android/keystore/` is gitignored), and enroll in Play App
      Signing.
- [ ] 🔴 Web page where users can request account deletion — Google Play
      requires a URL, not only the in-app button. **Page ready**
      (`site/public/delete-account/`, EN + AR); goes live with the site at
      `https://rafiqpro.com/delete-account/` once the site is hosted (§5).
- [ ] 🟡 `versionCode` / `versionName` (`android/app/build.gradle`) and
      `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` (Xcode) raised on every
      upload. `npm run app-version -- <version> <build>` sets all four at
      once and refuses a build number that isn't higher (RELEASE.md §1).
- [x] targetSdk 36 (`android/variables.gradle`).

### Both
- [ ] 🟡 **A public coach page, then Share again.** Profile's Share button
      is hidden (2026-10-01). ShareProfile's link is `rafiq.app/pro/<slug>`, a
      domain Rafiq doesn't own, to a page that doesn't exist; its QR code
      encodes the same link, its channel buttons only show a toast, and its
      member count reads the demo roster even signed in. Build the coach's
      public page with a booking button first (competitor teardown, build
      #1), then rebuild Share around its real address and bring the button
      back (`tests/ux-fixes.spec.js` checks it's gone until then).
- [x] 🔴 **Push notifications, or honest toggles.** Profile screens offer
      "Session reminders", "Task reminders" and "Payment reminders", but the
      app has no push notifications (no `@capacitor/push-notifications`, no
      APNs/FCM). Either build them (plugin + APNs key + Firebase project +
      send from database triggers) or relabel the toggles as in-app only.
      Done the second way: both cards now say they control the in-app feed
      and that no push is sent, and no category calls itself a reminder.
      The coach's three switches were also pure local state that nothing
      read — they persist and really filter `getProNotifications()` now,
      and the "Member check-in alerts" row is gone because no such
      notification exists. Push is built now (2026-10-05, next item): on
      a phone the same cards say they control the feed and the phone's
      notifications, and a browser still says in-app only.
- [ ] 🟡 **Phone notifications (wanted, Ahmed 2026-10-01).** The kind
      ProCoach advertises: a banner on the lock screen, with the app's icon,
      the moment something happens. The ones Rafiq has events for:
      | Banner | Who gets it | Event today |
      |---|---|---|
      | New booking: "Hana asked for Tue 10:00 AM" | coach | `session_requests` insert. **No notification row yet**: 0002's trigger is on the old `time_blocks` request. Needs a trigger. |
      | Booking confirmed / moved / cancelled | member | 0011's trigger on `sessions` (`session-moved`), plus accept and cancel |
      | Task done: "Omar finished Evening walk" | coach | 0002 `task-completed` |
      | New message | both | 0002 `message` |
      | Payment received: "Sara paid 750 EGP" | coach | 0002 `payment-received`. Only means real money once Paymob collects session fees (§3); until then it fires when the coach records a payment, so don't send that one as push. |
      | Session reminder, an hour before | both | Nothing yet: needs a scheduled job. |
      How: every event above already writes a `notifications` row, so push is
      delivery, not new logic. Add `@capacitor/push-notifications`; a
      `device_tokens` table (one row per device; the user writes only their
      own); an APNs key (Apple) and a Firebase project for FCM (Android);
      then a Database Webhook on `notifications` insert → an Edge Function
      that sends to that user's devices. Respect the existing notification
      switches in Profile, and add one per kind. In both languages: the
      banner text is built server-side, so it needs the recipient's
      language stored.
      Before it ships: the Profile cards and the privacy policy currently
      say **no push is sent**. Change that copy in the same PR. Add Firebase
      and device tokens to `store/privacy-inventory.md` and both store forms.
      On iOS, ask for permission at a moment that explains why (after the
      first booking request, for example), not at first launch.
      Reference: ProCoach's ads (payment, booking and "workout crushed"
      banners) and an Arabic coach dashboard Ahmed shared, same date.
      **Server half done (2026-10-05):** `0023` adds `device_tokens`
      (written only through `register_device` / `unregister_device`, as
      the caller; a phone moves to whoever signs in on it; ten per person)
      and the missing "new request" notification (`request-received`).
      The `push-send` Edge Function sends each pushed kind to the
      recipient's phones in the phone's language and time zone, never a
      message's text, and drops phones Apple or Google say are gone
      (`supabase/functions/push-send/README.md`). *Ahmed:* the APNs key,
      the Firebase project, the secrets, `db push`, deploy, and the
      Database Webhook, all in that README.
      **App half done (2026-10-05):** `@capacitor/push-notifications`
      (`src/lib/push.ts`). Signed in with permission given, the phone is
      registered with the app's language, zone and switches, and again
      when any of them changes; the master switch off or signing out
      unregisters it. The app never asks at launch: `PushAsk` explains
      first, on the first message sent or received or the first session
      booked (a member's request, a coach's accept), once per phone, and
      Profile's "Notifications on this phone" row is the way back. No
      system banner while the app is open (`presentationOptions: []`):
      the in-app badge and chime cover it (#128). The coach's card gained "New messages" and "Tasks
      completed" (phone only). A tapped banner opens what it is about.
      Copy, Help Center, both privacy policies (and the site), the privacy
      inventory, the listing and the review notes say so. *Ahmed:* in
      Xcode, the Push Notifications capability; `google-services.json` in
      `android/app/`; then a test on two real phones in both languages.
      Left: the session reminder an hour before (a scheduled job).
- [x] 🔴 **Account deletion must actually happen.** The app files a request
      into `account_deletion_requests`; someone has to process it (§9), within
      a stated time. **Stated: within 30 days**, on the public deletion page.
      Processing a coach must also delete their `coach_payout_accounts` row
      (the page promises the saved national ID and account number go);
      `payouts` rows stay as the financial record.
      Done: `process_account_deletion()` (`0012`) and the admin-only
      `account-deletion` Edge Function, run from `supabase/admin/README.md`.
      It refuses while a session, dispute, credit or payout is still open,
      scrubs the member from every roster, deletes the payout account, and
      deletes the login — or locks it, for a coach whose members and
      payouts must keep a record. Meeting the 30 days is a process (§9).

## 7. Branding and store listing (Design + Ahmed)

Waits on the name decision (§1).

- [x] 🔴 Rename the display name everywhere: `capacitor.config.ts` `appName`,
      `CFBundleDisplayName` in `ios/App/App/Info.plist`, `app_name` in
      `android/app/src/main/res/values/strings.xml`, ~40 "Rafiq"/"رفيق"
      strings in `src/lib/i18n.ts`, `index.html` `<title>`, `package.json`,
      README. Done, including the camera/photo permission text
      (`NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription` in
      `Info.plist` and `en.lproj`/`ar.lproj` `InfoPlist.strings`) and the
      Arabic home-screen names (`ar.lproj/InfoPlist.strings`,
      `values-ar/strings.xml`). `package.json`'s `name` stays `rafiq-app`:
      it is an internal id, never shown.
- [x] 🔴 **App icon** — both platforms still ship Capacitor's placeholder.
      iOS 1024×1024 into `ios/App/App/Assets.xcassets/AppIcon.appiconset/`;
      Android adaptive icon (foreground + background) into
      `android/app/src/main/res/mipmap-*/`.
      Done with the app's R mark (Ahmed's choice, 2026-09-30): drawn from
      `src/lib/logoMark.ts` into `assets/` by `npm run assets`, which also
      generates every iOS and Android size and the light and dark splash
      screens. A designed logo later: replace the files in `assets/` and run
      `npx capacitor-assets generate --ios --android`.
- [x] 🟡 Logo inside the app — Welcome, RoleSelect and Auth show a CSS "R"
      placeholder; plus a splash screen.
      Done: one inline-SVG `<Logo>` on RoleSelect and Auth (Welcome never had
      one), the same glyph as the icon, so it no longer changes font in
      Arabic.
- [x] 🔴 **Screenshots, in English and Arabic:** iPhone 6.9" (1320×2868),
      3–10 per language; Google Play: at least 2 phone screenshots, a 1024×500
      feature graphic and a 512×512 icon. Take them from the connected app, not
      the demo data.
      Done: `npm run screenshots` renders all of it from the signed-in app
      against `tests/fakeSupabase.js`, twelve screens per language, and
      commits the PNGs to `store/screenshots/out/`. Play needed its own
      capture — 2868÷1320 is 2.17:1 and Play caps a screenshot at 2:1 — so
      it gets 1242×2208. Clock pinned and data seeded, so a re-run produces
      the same bytes. Every Arabic image checked by eye. See
      `store/screenshots/README.md` for the sizes, the upload order (01–08
      to Play, 01–10 to Apple) and which screens were chosen. Not in `npm
      test` or CI: deliverables, not assertions.
- [x] 🔴 Store text in English and Arabic: name (iOS: 30 characters),
      subtitle, description, keywords, category, "what's new".
      **Drafted in `store/listing.md`**, both languages, both stores, every
      character count measured against its field's limit (the Arabic
      subtitle needed rewriting — the obvious translation is 31). Written
      for coaches and members, and deliberately claiming nothing the app
      does not do: no push, no in-app payment, no WhatsApp, no full
      Discover. Waiting on Ahmed for the name option, the category, and
      whether the Arabic keywords match how Egyptians search.
- [ ] 🔴 Public URLs: privacy policy, terms, support. **Pages ready** in
      `site/public/`, EN + AR, generated from the app's own copy
      (`npm run build:site`, see `site/README.md` for hosting and which URL
      goes in which console). Waiting on hosting the site (§5).

## 8. Legal and policy (Ahmed)

- [ ] 🔴 Privacy policy and terms reviewed by a lawyer and hosted publicly.
      Cover Egypt's data protection law (Law 151/2020), and GDPR if you accept
      EU users. Mood check-ins and coaching topics (breakups, stress) are
      sensitive — say how they're protected. Hosting is ready (`site/`);
      the text it publishes is the app's current copy, not yet reviewed.
- [ ] 🔴 **App Privacy (Apple) and Data safety (Google) forms** — list what's
      collected: name, email, phone, photos, messages, mood check-ins, ratings,
      payment status, plus crash data once §10 lands. For coaches who set up
      payouts: **national ID and wallet number or bank account** — financial
      info, and it must be in the privacy policy too.
      **The input is ready:** `store/privacy-inventory.md` works every table
      in `0001`–`0017` through to an Apple type and a Google category, with
      what deletion (0012) keeps and removes. **The Google half is now
      drafted:** `store/play-console.md` answers every Play Console
      question in the order Play asks it — App access, Ads, content
      rating, target audience, Data safety row by row, the Health apps
      and Financial features declarations, Advertising ID, and
      countries/pricing — with the open questions listed rather than
      guessed. **Apple's half is drafted too:** `store/app-privacy.md`, with the privacy manifest (`PrivacyInfo.xcprivacy`) filled in to match and `tests/privacy-manifest.spec.js` keeping the two in step. All twelve open questions were answered on 4 Oct; five still need an external fact or a lawyer, and both documents say which. Filling the two forms is still
      Ahmed's, and eleven questions in it need answering first — among them
      where a national ID goes on Apple's form (it has no type for a
      government ID), whether coaching focus counts as health data, and
      what Law 151/2020 asks of hosting in `eu-west-1` (Ireland), where the
      Supabase project is. Two are answered: the region, and the fonts —
      they ship inside the app now (#75), so Google Fonts is off the
      third-party list.
- [ ] 🔴 Apple requires apps where users message each other to have reporting
      (✓ exists), blocking (✓ since step 5 — until then only a status the app
      read and nothing could set) and **timely action on reports** (§9),
      and terms users accept that forbid objectionable content.
- [ ] 🟡 Age rating (Apple) and content rating questionnaire (Google); target
      audience adults, not children. Both are answered:
      `store/age-rating.md` for Apple's (which it replaced in 2026 — the
      bands are now 4+/9+/13+/16+/18+ and answering is mandatory), and
      `store/play-console.md` §3–§4 for Google's. One decision is left in
      each: whether Rafiq declares Apple's **Social Media** capability,
      and the eligibility gap below.
- [ ] 🟡 **The terms set no minimum age.** Play's target audience is
      declared 18 and over, but `i18n.ts` has no eligibility clause in
      either language. Apple requires the rating to be overridden upward
      to match a EULA's minimum age, so the two have to agree before
      submission — see `store/age-rating.md`.
- [x] 🟡 "Coaching is not therapy or medical advice" in the terms and onboarding,
      with crisis resources for the wellness categories. Done: a last
      section on both Terms documents (and on the public terms page, which
      is reachable with no account), and a notice at the foot of member
      onboarding — where the member picks a focus, four of which are
      stress, sleep, relationships and life — with the crisis list one tap
      away. Both languages.
- [ ] 🔴 **Confirm the crisis numbers before submitting.** Every entry in
      `src/lib/crisisResources.ts` has `phone: null` and renders as "number
      not confirmed yet", because a wrong number on that screen is worse
      than none. The organisation names are leads, not verified facts. For
      each: check it still runs a line, dial the number, note the hours
      (several are not 24/7) and whether it answers in Arabic, English or
      both. Delete a row that turns out not to exist — an empty list still
      renders "contact your local emergency services", which is honest.
      **Candidates to dial are in `research/crisis-lines.md`** — a number
      per row with its sources and how much to trust it, what to ask when
      the call connects, and the shape of the edit afterwards. Desk
      research only: three of the five look solid, `befrienders` looks
      dead, and `emergency` needs a decision (112 or 123) before it needs
      a dial.
- [ ] 🟡 Coaching Service Agreement text (`AGREEMENT_TEXT` in `mockStore.ts`)
      reviewed.

## 9. Admin panel (Dev)

Reports, verification requests, deletion requests and suspensions are queues
only Rafiq can resolve (as `service_role`). Nothing works them yet.

- [x] 🔴 For closed testing: Supabase dashboard table editor + saved queries
      ("open reports", "pending verifications", "pending deletions") is enough.
      Done: `supabase/admin/README.md` — open reports (suspend, close),
      pending verifications (approve/reject), pending deletions (through
      the `account-deletion` Edge Function).
- [x] 🟡 Before public launch: a small admin web app (verification review,
      reports with suspend/block, deletion requests, user lookup), behind an
      admin role. The `service_role` key stays server-side, never in a browser.
      Done: `admin/` (its own Vite + React + TS app, port 5175) talking to
      `supabase/functions/admin/`, which verifies the caller's JWT, checks
      `admin_users` and only then acts as service_role — the same check as
      `payouts` and `account-deletion`, and the only place it can live,
      since `admin_users` has RLS on and no grants. The app holds the anon
      key and nothing else. Every action is a named operation with
      validated input; there is no "run this query" path, and an unknown
      operation is a 400. Deletions go through the existing
      `account-deletion` function rather than a second copy of it, and its
      refusals ("an unsettled payout remains") reach the admin unflattened.
      Queue moves are conditional on the row's current state, so two people
      working one queue cannot resolve the same row twice. 31 Deno tests on
      the function (each asserting which tables a given action writes, so a
      stray write fails even when the reply looks right) and 10 Playwright
      tests on the app against a faked function. `admin/README.md` has the
      deploy steps. Two CI gaps are Ahmed's call, both noted in the PR:
      `deno check` names its files explicitly and does not name the new
      function, and `tsconfig.app.json` is `include: ["src"]`, so CI does
      not typecheck `admin/`.
- [ ] 🟡 A written response time for reports and deletions — and meet it.
      Deletions: 30 days (public deletion page). Reports: not stated yet.

## 10. Monitoring and performance (Dev)

- [x] 🟡 **Crash reporting — the code half.** `@sentry/capacitor`, reported
      from `src/components/ErrorBoundary.tsx` through
      `src/lib/crashReporting.ts`. Off unless `VITE_SENTRY_DSN` is set, and
      off means the SDK is never imported: it is a separate 168 KB chunk
      that is not fetched, so nothing is installed and nothing can be sent.
      Breadcrumbs (where a tapped member's name, a console line and a
      request URL would otherwise go), tracing, session replay, failed-
      request capture and session tracking are all off, and every event
      goes through a scrubber that removes emails, phone numbers, national
      IDs, uuids, JWTs and the device's name, and deletes the user, request
      headers, cookies, query string and body. `tests/crash-reporting.spec.js`
      drives a real crash through a real client at a fake DSN on 127.0.0.1
      and reads what it tried to send.
- [ ] 🟡 *Ahmed:* create the Sentry project, put its DSN in the build
      environment, and add the crash-data rows to both store forms (§8).
      Until the DSN is set nothing is collected, so this is what switches it
      on. What it would then collect is listed in the PR that added it and
      in `store/privacy-inventory.md` §10.
- [x] ⚪ Split the JavaScript bundle by screen for a faster start. Done in
      `App.tsx`: the 54 static screen imports are `lazy(() => import(…))`,
      behind one `<Suspense>` showing the app's own loading state. The
      startup path drops from 1,097 kB to 401 kB of JavaScript (285 kB →
      121 kB gzipped) and from 237 kB to 23 kB of render-blocking CSS; the
      rest arrives per screen, and inside the native shell every chunk is
      already on the device. What is left in the entry chunk is mostly
      `i18n.ts`, which is 175 kB of source because it holds every string
      twice, and the Supabase client, which `session.ts` pulls in at
      startup — both splittable later, neither part of this change.
- [ ] ⚪ Analytics, if wanted — disclosed in the privacy forms.

## 11. Before each submission (Dev)

- [ ] `npm run build`, `npm run lint`, `npm test` and the schema suite green in CI.
- [ ] Full pass on real devices: English and Arabic, light and dark, a small
      iPhone and a large Android, slow network, offline.
- [ ] Both roles end to end with two real accounts: coach signs up → adds a
      member → member signs in and links → books → messages → pays → rates →
      reports → deletes account.
- [ ] **App Review notes:** test Google accounts for a coach and a member with
      data in them, and how to reach each role. With sign-in only through
      Google and Apple, reviewers can't get in otherwise. Notes:
      `store/review-notes.md`. Their data: `supabase/admin/review-accounts.sql`
      (run before each submission; it also resets what a reviewer changed).
      Unlist the review coach first (`0022`, step 2 of "Review accounts"
      in `supabase/admin/README.md`), or real members see it in Discover.
- [ ] TestFlight (internal, then external) and Google Play closed testing
      before production; phased release.

---

## Already done — don't redo

- Google + Apple OAuth configured and working in the web app.
- Supabase schema live (`0001`–`0017`), locked down (signed-out access refused
  at the grant; six security holes closed), 488 schema assertions in CI;
  generated types in `src/lib/database.types.ts`.
- Payouts backend (`0007`, `payouts` Edge Function, payout-account screen,
  payout history); the ledger never stores a national ID (`0009`).
- Browser test suite (~370 tests) in CI: Arabic ordering, dark-mode
  contrast, timezone (tests run in Cairo time), money formatting, support
  rows, safe areas, 200% text, and no request to Google's font servers.
- Contact Us opens `support@rafiqpro.com`; Rate Rafiq opens the store; privacy
  policies give the support address.
- iOS target is iPhone-only (no iPad screenshots or iPad review needed).
- Bundle IDs `app.rafiqie.coach` (+ `app.rafiqie.coach.web` for Apple sign-in).
- In-app account-deletion request and reporting exist in the UI; blocking
  works from either side of a thread (step 5, `0014`).
